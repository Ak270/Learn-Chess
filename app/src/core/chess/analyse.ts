// Per-ply analysis of one game: engine evals -> win% -> classification -> motifs (docs/backend/03 §2-§6).
// Every position is analysed once (fenBefore of ply i+1 == fenAfter of ply i), MultiPV 2.
import { Chess } from 'chess.js';
import { cfg } from '../../config';
import type { EvalPoint, MotifHit, PlyRecord } from '../../types/model';
import type { EngineClient } from '../../types/services';
import { classifyMove, type LearnerPly } from './classify';
import { flipWinPct, moveAccuracy, winPctLoss, winPctOf } from './eval';
import { gamePhase, materialFor } from './material';
import { motifsForPly } from './motifs';
import { habitMotifs, protectedButHanging } from './habits';
import { see } from './see';

export interface AnalyseOptions {
  depth?: number;
  isBook?: (fenAfter: string, ply: number) => boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}
export interface GameAnalysis {
  plies: PlyRecord[];
  learner: LearnerPly[];
  /** opponent's best reply to each learner ply (uci), where known */
  refutations: Record<number, string>;
  /** eval score (win%) per position, White POV, index 0 = start; for charts */
  whiteWinPct: number[];
}

const opp = (c: 'w' | 'b') => (c === 'w' ? 'b' : 'w');

interface Pos {
  fen: string;
  bestUci?: string;
  secondWin?: number;
  /** win% for side to move */
  stmWin: number;
  stmEval: EvalPoint;
  pv0?: string;
  mateForStm?: number;
  over?: 'mate' | 'draw';
}

async function evalPosition(engine: EngineClient, fen: string, depth: number): Promise<Pos> {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { fen, stmWin: 0, stmEval: { mate: 0, depth: 0 }, over: 'mate' };
  if (c.isGameOver()) return { fen, stmWin: 50, stmEval: { cp: 0, depth: 0 }, over: 'draw' };
  const r = await engine.analyse(fen, { depth, multiPv: cfg.get('engine.review.multiPv') });
  const top = r.lines[0];
  const second = r.lines[1];
  return {
    fen,
    bestUci: top.pv[0],
    pv0: top.pv[0],
    stmWin: winPctOf(top),
    stmEval: { cp: top.cp, mate: top.mate, depth: r.depth },
    secondWin: second ? winPctOf(second) : undefined,
    mateForStm: top.mate,
  };
}

export async function analyseGame(
  pgn: string,
  learnerColor: 'w' | 'b',
  engine: EngineClient,
  o: AnalyseOptions = {},
): Promise<GameAnalysis> {
  const depth = o.depth ?? cfg.get<number>('engine.review.depth');
  const game = new Chess();
  game.loadPgn(pgn);
  const verbose = game.history({ verbose: true });
  const startFen = (game.header() as Record<string, string | null>).FEN ?? undefined;
  const replay = startFen ? new Chess(startFen) : new Chess();
  const fens: string[] = [replay.fen()];
  for (const m of verbose) {
    replay.move(m.san);
    fens.push(replay.fen());
  }
  const positions: Pos[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (o.signal?.cancelled) break;
    positions.push(await evalPosition(engine, fens[i], depth));
    o.onProgress?.(i + 1, fens.length);
  }

  const plies: PlyRecord[] = [];
  const learner: LearnerPly[] = [];
  const refutations: Record<number, string> = {};
  const lossByPly: number[] = [];
  const whiteWinPct = positions.map((p, i) => (new Chess(fens[i]).turn() === 'w' ? p.stmWin : flipWinPct(p.stmWin)));

  for (let i = 0; i < verbose.length && i + 1 < positions.length; i++) {
    const m = verbose[i];
    const before = positions[i];
    const after = positions[i + 1];
    const ply = i + 1;
    const mover = m.color;
    const playedIsBest = m.lan === before.bestUci;
    const winBefore = before.stmWin;
    const winPlayed = playedIsBest ? winBefore : flipWinPct(after.stmWin);
    const loss = winPctLoss(winBefore, winPlayed);
    lossByPly[ply] = loss;

    const rec: PlyRecord = {
      gameId: '',
      ply,
      fenBefore: fens[i],
      san: m.san,
      uci: m.lan,
      color: mover,
      evalBefore: before.stmEval,
      evalAfter: after.over
        ? after.stmEval
        : {
            cp: after.stmEval.cp === undefined ? undefined : -after.stmEval.cp,
            mate: after.stmEval.mate === undefined ? undefined : -after.stmEval.mate,
            depth: after.stmEval.depth,
          },
      bestUci: before.bestUci,
      winPctBefore: winBefore,
      winPctAfter: winPlayed,
      winPctLoss: loss,
      accuracy: moveAccuracy(loss),
      phase: gamePhase(fens[i], ply),
    };

    if (mover === learnerColor) {
      const isBook = o.isBook?.(fens[i + 1], ply) ?? false;
      const prev = plies[plies.length - 1];
      const prevOppLoss = prev && prev.color !== learnerColor ? (prev.winPctLoss ?? 0) : undefined;
      const learnerWinBeforeOppMove =
        prev && prev.color !== learnerColor ? flipWinPct(prev.winPctBefore ?? 50) : undefined;
      rec.isBook = isBook;
      const sacrifice = playedIsBest && !after.over && see(fens[i + 1], m.to, opp(mover)) > 0;
      rec.cls = classifyMove({
        isBook,
        playedIsBest,
        winPctBefore: winBefore,
        winPctSecond: before.secondWin,
        winPctPlayed: winPlayed,
        sacrifice,
        prevOppLoss,
        missGain: learnerWinBeforeOppMove === undefined ? undefined : winBefore - learnerWinBeforeOppMove,
      });

      const refute = after.over ? undefined : after.pv0;
      if (refute) refutations[ply] = refute;
      let dropAfter = 0;
      if (refute) {
        const c = new Chess(fens[i + 1]);
        try {
          c.move({ from: refute.slice(0, 2), to: refute.slice(2, 4), promotion: refute[4] });
          dropAfter = materialFor(fens[i], mover) - materialFor(c.fen(), mover);
        } catch {
          /* engine move illegal in this position: leave 0 */
        }
      }
      const mateAllowed = !after.over && after.mateForStm !== undefined && after.mateForStm > 0;
      learner.push({
        ply,
        isBook,
        winPctBefore: winBefore,
        winPctPlayed: winPlayed,
        materialDropAfterBestReply: dropAfter,
        mateAllowed,
      });

      // Motifs are kept only if the engine's refutation realises them (§6.10), except "missed" ones on real mistakes.
      const afterHabits = isBook
        ? []
        : [...habitMotifs(fens[i], m.lan, mover, refute), ...protectedButHanging(fens[i + 1], mover)];
      const raw: MotifHit[] = isBook ? [] : [...motifsForPly(fens[i], m.lan, before.bestUci), ...afterHabits];
      const realised = dropAfter >= cfg.get('motif.refutationMinGainPawns') || mateAllowed;
      rec.motifs = raw.filter((h) =>
        h.role === 'allowed'
          ? realised && loss >= cfg.get('classification.inaccuracyWinPct')
          : loss >= cfg.get('classification.inaccuracyWinPct'),
      );
    }
    plies.push(rec);
  }
  return { plies, learner, refutations, whiteWinPct };
}
