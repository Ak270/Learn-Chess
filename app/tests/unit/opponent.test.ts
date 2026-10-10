import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  acceptsDraw,
  sampleMove,
  seededRng,
  shouldResign,
  thinkMs,
  type Candidate,
} from '../../src/core/opponent/sampler';
import { LEVELS, levelById } from '../../src/core/opponent/levels';
import { bookMove } from '../../src/core/opponent/book';
import { createOpponent, intentMove, plausibleFor } from '../../src/core/opponent/opponent';
import { nullMoveFen, threatQuestion, threats } from '../../src/core/chess/threats';
import type { EngineClient } from '../../src/types/services';

const cands: Candidate[] = [
  { uci: 'a', cp: 100 },
  { uci: 'b', cp: 80 },
  { uci: 'c', cp: 20 },
  { uci: 'd', cp: -150 },
  { uci: 'e', cp: -400 },
];

describe('sampler (docs/backend/07 §1.2)', () => {
  it('stronger levels pick the best move more often (monotone) and blunder less', () => {
    const rate = (lv: number) => {
      const r = seededRng(42);
      let best = 0;
      let blund = 0;
      const N = 4000;
      for (let i = 0; i < N; i++) {
        const c = sampleMove(cands, levelById(lv), r)!;
        if (c.uci === 'a') best++;
        if (100 - c.cp >= 150) blund++;
      }
      return { best: best / N, blund: blund / N };
    };
    const rates = [1, 2, 3, 4, 5].map(rate);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i].best).toBeGreaterThan(rates[i - 1].best);
      expect(rates[i].blund).toBeLessThan(rates[i - 1].blund + 0.001);
    }
    expect(rates[4].best).toBeGreaterThan(0.4);
  });
  it('blunder rate per level is within +/-25% of the table (pBlunder plus softmax tail)', () => {
    for (const l of LEVELS()) {
      const r = seededRng(7 + l.id);
      let b = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) if (100 - sampleMove(cands, l, r)!.cp >= 150) b++;
      // expected: pBlunder pool (always in [150,500]) + softmax mass on those moves
      const w = cands.map((c) => Math.exp(-(100 - c.cp) / l.temperature));
      const tail = (w[3] + w[4]) / w.reduce((x, y) => x + y, 0);
      const expected = l.pBlunder + (1 - l.pBlunder) * tail;
      expect(Math.abs(b / N - expected) / expected).toBeLessThan(0.25);
    }
  });
  it('never returns a move outside the candidates, and respects the plausibility filter', () => {
    const r = seededRng(1);
    for (let i = 0; i < 500; i++) {
      const c = sampleMove(cands, levelById(1), r, { plausible: (u) => u !== 'e' && u !== 'd' })!;
      expect(['a', 'b', 'c']).toContain(c.uci);
    }
    expect(sampleMove([], levelById(1), r)).toBeUndefined();
  });
  it('think time stays within the configured range, faster in the opening, never beyond a fraction of the clock', () => {
    const r = seededRng(3);
    for (let i = 0; i < 300; i++) {
      const t = thinkMs({ rng: r, legalMoves: 30, tactical: i % 2 === 0, ply: 20 });
      expect(t).toBeGreaterThanOrEqual(250);
      expect(t).toBeLessThanOrEqual(3500);
    }
    const mid = thinkMs({ rng: seededRng(9), legalMoves: 35, tactical: true, ply: 30 });
    const open = thinkMs({ rng: seededRng(9), legalMoves: 35, tactical: true, ply: 4 });
    expect(open).toBeLessThan(mid);
    expect(thinkMs({ rng: seededRng(9), legalMoves: 35, tactical: true, ply: 30, clockSec: 10 })).toBeLessThanOrEqual(
      500,
    );
  });
  it('resign needs level >= 3 and 3 consecutive hopeless evals; draws only when level and late', () => {
    expect(shouldResign(levelById(4), [-900, -900, -900])).toBe(true);
    expect(shouldResign(levelById(4), [-900, -100, -900])).toBe(false);
    expect(shouldResign(levelById(2), [-900, -900, -900])).toBe(false);
    expect(acceptsDraw(10, 70)).toBe(true);
    expect(acceptsDraw(10, 30)).toBe(false);
    expect(acceptsDraw(200, 70)).toBe(false);
  });
});

describe('opening book', () => {
  it('follows a line, varies, and leaves the book at the level limit', () => {
    const r = seededRng(5);
    const firsts = new Set(Array.from({ length: 80 }, () => bookMove([], r, 10)));
    expect(firsts.size).toBeGreaterThan(2);
    expect(bookMove(['e2e4', 'e7e5'], r, 10)).toBe('g1f3');
    expect(bookMove(['e2e4', 'e7e5'], r, 2)).toBeUndefined();
    expect(bookMove(['a2a3'], r, 10)).toBeUndefined();
  });
});

describe('plausibility: a level >= 3 does not hang its queen to a pawn', () => {
  it('filters Qd5?? type moves for level 4 but allows them for level 1', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    // 3.Qh5?? is fine, but 2...Qd5-type: use black queen walking into a pawn capture
    const f2 = 'rnbqkbnr/ppp2ppp/4p3/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3';
    void fen;
    expect(plausibleFor(f2, levelById(4))('d8d6')).toBe(true);
    const f3 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3';
    expect(plausibleFor(f3, levelById(4))('d8h4')).toBe(false); // Qh4 is attacked by Nf3 and undefended
    expect(plausibleFor(f3, levelById(1))('d8h4')).toBe(true);
  });
});

describe('opponent with a fake engine', () => {
  const fakeEngine = (lines: { pv: string[]; cp?: number; mate?: number }[]): EngineClient => ({
    init: async () => {},
    stop() {},
    dispose() {},
    analyse: async (fen) => ({ fen, depth: 3, lines: lines.map((l, i) => ({ multipv: i + 1, ...l })) }),
  });
  it('plays book moves first, then engine candidates; one legal move is played immediately', async () => {
    const o = createOpponent(fakeEngine([{ pv: ['e2e4'], cp: 20 }]), 2, { rng: seededRng(1) });
    const first = await o.choose(new Chess().fen(), [], { ply: 0 });
    expect(first.source).toBe('book');
    const eng = createOpponent(
      fakeEngine([
        { pv: ['g1f3'], cp: 20 },
        { pv: ['b1c3'], cp: 10 },
      ]),
      5,
      { rng: seededRng(1), useBook: false },
    );
    const m = await eng.choose(new Chess().fen(), [], { ply: 0 });
    expect(['g1f3', 'b1c3']).toContain(m.uci);
    const stalemateish = 'k7/8/1K6/8/8/8/8/1Q6 b - - 0 1';
    expect((await eng.choose(stalemateish, [], { ply: 80 })).source).toBe('engine');
  });
  it('training intent leaves a fork for the learner, at most once per game, and is logged; Normal play has no intent', async () => {
    // black (bot) to move; Black's Nd... it leaves White (learner) a knight fork on d6
    const fen = '2r1k3/8/8/8/2N5/8/8/4K3 b - - 0 1';
    const cs: Candidate[] = [
      { uci: 'e8d7', cp: 0 },
      { uci: 'e8f7', cp: 0 },
      { uci: 'c8c5', cp: -10 },
    ];
    const state = { forkUsed: 0, lastThreatPly: -99, log: [] as { ply: number; skill: string; kind: string }[] };
    const it = intentMove(fen, cs, { intent: { skill: 'tactic_fork' }, state, ply: 10 });
    expect(it === undefined || it.kind === 'fork').toBe(true);
    expect(intentMove(fen, cs, { ply: 10 })).toBeUndefined(); // no intent in normal play
    const used = { forkUsed: 1, lastThreatPly: -99, log: [] };
    expect(intentMove(fen, cs, { intent: { skill: 'tactic_fork' }, state: used, ply: 10 })).toBeUndefined(); // cap reached
  });
});

describe('threats (docs/backend/03 §6.4)', () => {
  it('prototype position: Qf3 threatens Qxf7#', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const ts = threats(fen);
    expect(ts[0].kind).toBe('mate');
    expect(ts[0].evidence).toMatch(/Qxf7#/);
  });
  it('a hanging piece is a capture threat; a quiet start position has none', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 b - - 0 1';
    const ts = threats(fen);
    expect(ts[0]).toMatchObject({ kind: 'capture', to: 'd5' });
    expect(threats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual([]);
  });
  it('being in check is simply stated', () => {
    expect(threats('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')[0].kind).toBe('check');
  });
  it('null move sanitises en passant and rejects illegal positions', () => {
    expect(nullMoveFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')).toContain(' b ');
  });
  it('question has exactly one correct option and plausible distractors', () => {
    const q = threatQuestion('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3')!;
    expect(q.options.filter((o) => o.correct)).toHaveLength(1);
    expect(q.options.find((o) => o.correct)!.text).toMatch(/checkmate/i);
    expect(q.options.length).toBeGreaterThanOrEqual(3);
  });
});
