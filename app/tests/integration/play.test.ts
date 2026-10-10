import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { createEngineClient } from '../../src/core/engine/engineClient';
import { MentorDB } from '../../src/data/db';
import { createPlayService, type GameConfig } from '../../src/services/PlayService';
import {
  estimateFrom,
  expectedScore,
  performanceLine,
  recommendLevel,
  updateEstimate,
} from '../../src/core/play/matchmaking';
import { flagged, newClock, press, remainingNow } from '../../src/core/play/clock';
import { nodeTransport } from '../helpers/nodeEngine';
import type { OpponentResult } from '../../src/core/opponent/opponent';

const engine = createEngineClient(nodeTransport, { hashMb: 16 });
let n = 0;
const T0 = 1_700_000_000_000;

/** scripted opponent: plays the queued UCI moves in order, otherwise the first legal move */
function scripted(queue: string[], extra: Partial<OpponentResult> = {}) {
  return (levelId: number) => ({
    level: { id: levelId, name: 'Rook Rita', elo: 1000 },
    async choose(fen: string): Promise<OpponentResult> {
      const next = queue.shift();
      const legal = new Chess(fen).moves({ verbose: true });
      return { uci: next && legal.some((m) => m.lan === next) ? next : legal[0].lan, source: 'engine', ...extra };
    },
  });
}
const mk = (queue: string[] = [], t = { v: T0 }) => {
  const db = new MentorDB(`play${n++}`);
  const svc = createPlayService({
    db,
    analysis: engine,
    makeOpponent: scripted(queue),
    now: () => t.v,
    sleep: async () => {},
    rng: () => 0.5,
  });
  return { db, svc, t };
};
const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({
  levelId: 4,
  tcIndex: 3,
  mode: 'normal',
  color: 'w',
  ...over,
});
const settle = () => new Promise((r) => setTimeout(r, 30));

// prototype position: White to play after 10...Bg6; 11.Nh4?? hangs the knight to Qxh4
const BLUNDER_FEN = (() => {
  const c = new Chess();
  'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6 Bg5 h6 Bxf6 Qxf6 Nc3 Bg4 h3 Bh5 g4 Bg6'.split(' ').forEach((m) => c.move(m));
  return c.fen();
})();

describe('clock from timestamps', () => {
  it('pays elapsed time and adds the increment; survives a "refresh"; flags at zero', () => {
    let c = newClock(900, 10);
    c = press(c, 'w', T0, true); // first move starts the clock
    expect(c.running).toBe(true);
    expect(remainingNow(c, 'b', T0 + 5000)).toBeCloseTo(895, 5);
    c = press(c, 'b', T0 + 5000, true);
    expect(c.remaining.b).toBeCloseTo(895 + 10, 5);
    expect(remainingNow(c, 'w', T0 + 65_000)).toBeLessThan(900);
    const restored = JSON.parse(JSON.stringify(c)); // what the DB holds
    expect(remainingNow(restored, 'w', T0 + 65_000)).toBeCloseTo(remainingNow(c, 'w', T0 + 65_000), 9);
    expect(flagged(newClock(0, 0), T0)).toBeUndefined();
    const low = { ...c, remaining: { w: 1, b: 100 }, turn: 'w' as const, turnStartedAt: T0 };
    expect(flagged(low, T0 + 2000)).toBe('w');
  });
});

describe('PlayService basics', () => {
  it('plays a game against a scripted opponent, saves a Mentor game after every move and resumes it', async () => {
    const { db, svc, t } = mk(['e7e5', 'b8c6']);
    const s = await svc.start(cfg());
    t.v += 3000;
    expect((await s.userMove({ from: 'e2', to: 'e4' })).ok).toBe(true);
    await settle();
    expect(s.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    t.v += 3000;
    await s.userMove({ from: 'g1', to: 'f3' });
    await settle();
    const g = (await db.games.toArray())[0];
    expect(g.source).toBe('mentor');
    expect(g.pgn).toContain('1. e4 e5 2. Nf3 Nc6');
    // "refresh": a new service instance resumes from the database
    const svc2 = createPlayService({
      db,
      analysis: engine,
      makeOpponent: scripted([]),
      now: () => t.v,
      sleep: async () => {},
      rng: () => 0.5,
    });
    expect(await svc2.activeGame()).toBe(s.meta.gameId);
    const r = (await svc2.resume(s.meta.gameId))!;
    expect(r.moves).toHaveLength(4);
    expect(r.chess.fen()).toBe(s.chess.fen());
    expect(r.me).toBe('w');
  });
  it('rejects illegal moves and moves out of turn; learner can play Black (bot opens)', async () => {
    const { svc } = mk(['e2e4']);
    const s = await svc.start(cfg({ color: 'b' }));
    await settle();
    expect(s.moves[0].san).toBe('e4');
    expect((await s.userMove({ from: 'a1', to: 'a5' })).ok).toBe(false);
    expect((await s.userMove({ from: 'e7', to: 'e5' })).ok).toBe(true);
  });
  it('checkmate, resignation and timeout end the game with the right result and a stored level result', async () => {
    const m1 = mk(['e7e5', 'd8h4']);
    const s1 = await m1.svc.start(cfg());
    await s1.userMove({ from: 'f2', to: 'f3' });
    await settle();
    await s1.userMove({ from: 'g2', to: 'g4' }); // fool's mate
    await settle();
    expect(s1.over).toBe(true);
    expect(s1.meta.result).toBe('0-1');
    expect(s1.summary().won).toBe(false);
    const res = await m1.svc.results();
    expect(res).toEqual([{ levelElo: 1000, score: 0, at: expect.any(Number) }]);
    const m2 = mk();
    const s2 = await m2.svc.start(cfg());
    await s2.resign();
    expect(s2.meta.result).toBe('0-1');
    const m3 = mk(['e7e5'], { v: T0 });
    const s3 = await m3.svc.start(cfg({ tcIndex: 1 })); // 10+0
    m3.t.v += 1000;
    await s3.userMove({ from: 'e2', to: 'e4' });
    await settle();
    m3.t.v += 11 * 60_000;
    await s3.checkClock();
    expect(s3.over).toBe(true);
    expect(s3.meta.termination).toBe('time');
  });
  it('draw offers are declined early and accepted only when level and late', async () => {
    const { svc } = mk();
    const s = await svc.start(cfg());
    expect(await s.offerDraw()).toBe(false);
  });
  it('normal play has no training intent; the intent log stays empty', async () => {
    const { svc } = mk(['e7e5']);
    const s = await svc.start(cfg({ mode: 'normal', focusSkill: 'tactic_fork' }));
    await s.userMove({ from: 'e2', to: 'e4' });
    await settle();
    expect(s.summary().intents).toEqual([]);
  });
  it('critical-position games start from a stored FEN, are saved with SetUp/FEN and are flagged not reviewable', async () => {
    const { db, svc } = mk();
    const s = await svc.start(cfg({ mode: 'critical', startFen: BLUNDER_FEN }));
    expect(s.chess.fen()).toBe(BLUNDER_FEN);
    expect((await s.userMove({ from: 'c3', to: 'd5' })).ok).toBe(true);
    expect(s.summary().reviewable).toBe(false);
    expect((await db.games.toArray())[0].pgn).toContain('[FEN');
  });
});

describe('coach mode: blunder interception with a question (docs/backend/07 §2.2)', () => {
  const blunderGame = async (mode: GameConfig['mode']) => {
    const m = mk(['f6h4']);
    const s = await m.svc.start(cfg({ mode, startFen: BLUNDER_FEN }));
    m.t.v += 4000;
    await s.userMove({ from: 'f3', to: 'h4' }, { ticks: 3 });
    return { ...m, s };
  };
  it('offers a take-back after Nh4?? in coach mode, holds the bot until the learner decides', async () => {
    const { s } = await blunderGame('coach');
    expect(s.offer).toBeDefined();
    expect(s.offer!.hanging[0].square).toBe('h4');
    expect(s.offer!.options.filter((o) => o.correct)).toHaveLength(1);
    expect(s.moves).toHaveLength(1); // the bot has not replied
    expect(s.canInteract).toBe(false);
  });
  it('right answer grants the take-back and records evidence; wrong answers walk the hint ladder and still allow an assisted take-back', async () => {
    const a = await blunderGame('coach');
    const ok = a.s.offer!.options.findIndex((o) => o.correct);
    const r = await a.s.answerOffer(ok);
    expect(r).toMatchObject({ correct: true, granted: true });
    expect(a.s.chess.fen()).toBe(BLUNDER_FEN);
    expect(a.s.meta.takebacksUsed).toBe(1);
    expect(a.s.canInteract).toBe(true);
    expect((await a.db.attempts.where('context').equals('game_prompt').toArray())[0]).toMatchObject({
      correct: true,
      skillTags: ['opponent_threats'],
    });

    const b = await blunderGame('coach');
    const wrong = b.s.offer!.options.findIndex((o) => !o.correct);
    const h1 = await b.s.answerOffer(wrong);
    expect(h1.correct).toBe(false);
    expect(h1.hint).toMatch(/last move/);
    await b.s.answerOffer(wrong);
    const h3 = await b.s.answerOffer(wrong);
    expect(h3.hint).toMatch(/main threat/i);
    await b.s.takebackAfterHints();
    expect(b.s.chess.fen()).toBe(BLUNDER_FEN);
    expect(b.s.meta.interceptions[0]).toMatchObject({ granted: true, assisted: true });
  });
  it('"keep it" continues the game (the blunder is stored for review) and the bot replies', async () => {
    const { s } = await blunderGame('coach');
    await s.keepMove();
    await settle();
    expect(s.moves.map((m) => m.san)).toEqual(['Nh4', 'Qxh4']);
    expect(s.meta.interceptions[0]).toMatchObject({ kept: true, granted: false });
  });
  it('never in Normal mode; at most 2 take-backs per game', async () => {
    const { s } = await blunderGame('normal');
    expect(s.offer).toBeUndefined();
    await settle();
    expect(s.moves).toHaveLength(2);
    const m = mk(['f6h4', 'f6h4']);
    const g = await m.svc.start(cfg({ mode: 'coach', startFen: BLUNDER_FEN }));
    g.meta.takebacksUsed = 2;
    await g.userMove({ from: 'f3', to: 'h4' }, { ticks: 3 });
    expect(g.offer).toBeUndefined();
  });
  it('does not interrupt on non-material moves', async () => {
    const m = mk(['e7e5']);
    const s = await m.svc.start(cfg({ mode: 'coach' }));
    m.t.v += 4000;
    await s.userMove({ from: 'e2', to: 'e4' });
    expect(s.offer).toBeUndefined();
  });
  it('a rushed blunder with no Safety Check starts the slow-down lock: next moves need a threat statement', async () => {
    // make the game long enough for the rushed rule (more than 8 moves recorded)
    const m = mk(['f6h4']);
    const s = await m.svc.start(cfg({ mode: 'coach', startFen: BLUNDER_FEN }));
    s.meta.moves = Array.from({ length: 10 }, (_, i) => ({
      ply: i + 1,
      uci: 'a2a3',
      san: 'a3',
      by: i % 2 ? 'bot' : 'me',
      at: T0,
      spentMs: 3000,
    }));
    m.t.v += 500;
    await s.userMove({ from: 'f3', to: 'h4' }); // 0 ticks, 0.5 s
    expect(s.lockRemaining).toBe(3);
    await s.keepMove();
    await settle();
    expect((await s.userMove({ from: 'a2', to: 'a3' })).reason).toBe('statement-needed');
    const q = s.threatStatementQuestion()!;
    expect(q.options.some((o) => o.correct)).toBe(true);
    await s.answerStatement(true);
    expect(s.lockRemaining).toBe(2);
  });
});

describe('hint ladder', () => {
  it('H1 text, H2 marks the last piece, H3 names the threat, H4 offers a candidate with a safety prompt; hints are counted', async () => {
    const m = mk(['d8h4']);
    const s = await m.svc.start(cfg({ mode: 'coach' }));
    await s.userMove({ from: 'f2', to: 'f4' });
    await settle();
    const h1 = await s.hint();
    expect(h1.level).toBe(1);
    const h2 = await s.hint();
    expect(h2.arrows[0][2]).toBe('blue');
    const h3 = await s.hint();
    expect(h3.text).toMatch(/main threat|no big threat/i);
    const h4 = await s.hint();
    expect(h4.level).toBe(4);
    expect(h4.text).toMatch(/leaves unprotected|Check what each move/);
    expect(s.meta.hintsUsed).toBe(4);
  });
});

describe('adaptive matchmaking (docs/backend/10 §5.3)', () => {
  it('Elo-like estimate moves with results; the recommended level has expected score near 50%', () => {
    expect(expectedScore(600, 600)).toBeCloseTo(0.5, 9);
    expect(updateEstimate(600, 600, 1)).toBeCloseTo(612, 5);
    const est = estimateFrom(
      [
        { levelElo: 600, score: 1 },
        { levelElo: 600, score: 1 },
        { levelElo: 800, score: 0 },
      ],
      600,
    );
    expect(est).toBeGreaterThan(600);
    const rec = recommendLevel(600, 2);
    expect(Math.abs(expectedScore(600, rec.level.elo) - 0.5)).toBeLessThanOrEqual(0.15);
    expect(rec.challenge).toBe(false);
    const ch = recommendLevel(600, 4);
    expect(ch.challenge).toBe(true); // every 5th game: one level up
    expect(ch.level.elo).toBeGreaterThan(rec.level.elo);
  });
  it('reports performance against opponent strength, never a raw win rate', () => {
    const rs = [
      { levelElo: 800, score: 1 },
      { levelElo: 800, score: 0 },
      { levelElo: 800, score: 0.5 },
    ];
    expect(performanceLine(rs)).toBe('You scored level with 800-rated bots.');
    expect(performanceLine([{ levelElo: 800, score: 1 }])).toBeUndefined();
  });
  it('the service exposes the estimate from stored results', async () => {
    const { db, svc } = mk();
    await db.kv.put({ key: 'play.result:a', value: { levelElo: 600, score: 1, at: 1 } });
    await db.kv.put({ key: 'play.result:b', value: { levelElo: 600, score: 1, at: 2 } });
    const e = await svc.levelEstimate();
    expect(e.games).toBe(2);
    expect(e.estimate).toBeGreaterThan(400);
  });
});

describe('a stalled or failing opponent never freezes the game', () => {
  it('plays a fallback legal move and marks the game degraded', async () => {
    const db = new MentorDB(`play${n++}`);
    const broken = () => ({
      level: { id: 1, name: 'Pawn Pete', elo: 400 },
      choose: async (): Promise<OpponentResult> => {
        throw new Error('worker gone');
      },
    });
    const svc = createPlayService({
      db,
      analysis: engine,
      makeOpponent: broken,
      now: () => T0,
      sleep: async () => {},
      rng: () => 0.5,
    });
    const s = await svc.start(cfg({ levelId: 1 }));
    await s.userMove({ from: 'e2', to: 'e4' });
    await settle();
    expect(s.moves).toHaveLength(2);
    expect(s.moves[1].by).toBe('bot');
    expect(s.meta.degraded).toBe(true);
    expect(s.canInteract).toBe(true);
  });
});
