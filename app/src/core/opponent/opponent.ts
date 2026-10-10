// StockfishOpponent (docs/backend/07 §1.2, §1.4): shallow MultiPV analysis + human-like sampling, mini opening book,
// training intent. Uses its OWN engine instance (separate worker) so a background review never delays the reply.
import { Chess, type Color } from 'chess.js';
import { cfg } from '../../config';
import { scoreToCp } from '../chess/eval';
import { forkMoves } from '../chess/motifs';
import { loosePieces, see } from '../chess/see';
import type { EngineClient, Opponent } from '../../types/services';
import { bookMove } from './book';
import { levelById, type Level } from './levels';
import { sampleMove, seededRng, type Candidate, type Rng } from './sampler';

export interface OpponentCtx {
  /** focus skill when the game is a training game; intents are OFF otherwise (honesty rule) */
  intent?: { skill: string };
  /** how many fork intents were used so far, and the ply of the last threat intent */
  state?: { forkUsed: number; lastThreatPly: number; log: { ply: number; skill: string; kind: string }[] };
  ply: number;
}

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export interface OpponentResult {
  uci: string;
  evalCp?: number;
  source: 'book' | 'engine' | 'intent';
  intent?: { kind: 'fork' | 'threat'; skill: string };
}

/** Moves that leave the mover's queen capturable for free are implausible for levels above the configured maximum. */
export function plausibleFor(fen: string, level: Level) {
  return (uci: string) => {
    if (level.id <= cfg.get<number>('plausible.queenHangMaxLevel')) return true;
    const c = new Chess(fen);
    const mover = c.turn();
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    return !loosePieces(c.fen(), mover).hanging.some((h) => h.type === 'q');
  };
}

/** Training intent (docs/backend/07 §1.4): prefer near-equal moves that create a situation the learner is practising. */
export function intentMove(
  fen: string,
  cands: Candidate[],
  ctx: OpponentCtx,
): { cand: Candidate; kind: 'fork' | 'threat' } | undefined {
  if (!ctx.intent || !ctx.state) return undefined;
  const best = Math.max(...cands.map((c) => c.cp));
  const near = cands.filter((c) => best - c.cp <= cfg.get<number>('intent.maxLossCp'));
  const c0 = new Chess(fen);
  const bot = c0.turn();
  const learner = opp(bot);
  const skill = ctx.intent.skill;
  for (const cand of near) {
    const c = new Chess(fen);
    try {
      c.move({ from: cand.uci.slice(0, 2), to: cand.uci.slice(2, 4), promotion: cand.uci[4] });
    } catch {
      continue;
    }
    const after = c.fen();
    if (skill === 'tactic_fork' && ctx.state.forkUsed < cfg.get<number>('intent.forkPerGame')) {
      // leave a fork FOR the learner (they must find it)
      if (forkMoves(after, learner).length) return { cand, kind: 'fork' };
    }
    if (
      (skill === 'piece_safety' || skill === 'opponent_threats') &&
      ctx.ply - ctx.state.lastThreatPly >= cfg.get<number>('intent.threatEveryMoves') * 2
    ) {
      // a real but answerable threat: after this move the bot threatens to win material, and the learner has a safe answer
      const nf = after.split(' ');
      nf[1] = bot;
      nf[3] = '-';
      let threat: boolean;
      try {
        threat = new Chess(nf.join(' '))
          .moves({ verbose: true })
          .some((m) => m.captured && see(nf.join(' '), m.to, bot) > 0);
      } catch {
        threat = false;
      }
      if (threat) {
        const answerable = c.moves({ verbose: true }).some((m) => {
          const d = new Chess(after);
          d.move(m);
          return !loosePieces(d.fen(), learner).hanging.length;
        });
        if (answerable) return { cand, kind: 'threat' };
      }
    }
  }
  return undefined;
}

export function createOpponent(
  engine: EngineClient,
  levelId: number,
  opts: { rng?: Rng; useBook?: boolean } = {},
): Opponent & { level: Level; choose(fen: string, history: string[], ctx: OpponentCtx): Promise<OpponentResult> } {
  const level = levelById(levelId);
  const rng = opts.rng ?? seededRng(Date.now() & 0xffffffff);
  async function choose(fen: string, history: string[], ctx: OpponentCtx): Promise<OpponentResult> {
    const legal = new Chess(fen).moves({ verbose: true });
    if (legal.length === 1) return { uci: legal[0].lan, source: 'engine' };
    if (opts.useBook !== false) {
      const b = bookMove(history, rng, level.bookPlies);
      if (b && legal.some((m) => m.lan === b)) return { uci: b, source: 'book' };
    }
    const r = await engine.analyse(fen, { depth: level.depth, multiPv: level.multiPv });
    const cands: Candidate[] = r.lines.filter((l) => l.pv.length).map((l) => ({ uci: l.pv[0], cp: scoreToCp(l) }));
    if (!cands.length) return { uci: legal[Math.floor(rng() * legal.length)].lan, source: 'engine' };
    const it = intentMove(fen, cands, ctx);
    if (it) {
      if (it.kind === 'fork' && ctx.state) ctx.state.forkUsed++;
      if (it.kind === 'threat' && ctx.state) ctx.state.lastThreatPly = ctx.ply;
      ctx.state?.log.push({ ply: ctx.ply, skill: ctx.intent!.skill, kind: it.kind });
      return {
        uci: it.cand.uci,
        evalCp: it.cand.cp,
        source: 'intent',
        intent: { kind: it.kind, skill: ctx.intent!.skill },
      };
    }
    const pick = sampleMove(cands, level, rng, { plausible: plausibleFor(fen, level) })!;
    return { uci: pick.uci, evalCp: Math.max(...cands.map((c) => c.cp)), source: 'engine' };
  }
  return {
    name: level.name,
    elo: level.elo,
    level,
    choose,
    chooseMove: async (fen, history, ctx) =>
      (await choose(fen, history, (ctx as OpponentCtx) ?? { ply: history.length })).uci,
  };
}
