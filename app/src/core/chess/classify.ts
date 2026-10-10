// Move classification and first-meaningful-mistake (docs/backend/03 §3, §4). Pure functions of numbers.
import { cfg } from '../../config';
import type { MoveClass } from '../../types/model';

export interface ClassifyInput {
  isBook: boolean;
  playedIsBest: boolean;
  winPctBefore: number; // mover's win% with best play (engine best line, mover POV)
  winPctSecond?: number; // mover's win% after the engine's second-best move
  winPctPlayed: number; // mover's win% after the played move
  sacrifice?: boolean; // the move gives up material soundly (SEE < 0 / net material down)
  prevOppLoss?: number; // opponent's previous ply loss (win% points), if known
  missGain?: number; // winPctBefore minus the learner's win% before the opponent's error
}

export function classifyMove(i: ClassifyInput): MoveClass {
  const c = (k: string) => cfg.get(`classification.${k}`);
  if (i.isBook) return 'book';
  const loss = Math.max(0, i.winPctBefore - i.winPctPlayed);
  if (
    i.playedIsBest &&
    i.sacrifice &&
    i.winPctBefore >= c('brilliantMinBefore') &&
    i.winPctPlayed >= i.winPctBefore - c('brilliantMaxDrop')
  )
    return 'brilliant';
  if (i.playedIsBest || loss <= c('bestEpsilon')) {
    const only = i.winPctSecond !== undefined && i.winPctBefore - i.winPctSecond >= c('greatGapWinPct');
    const flip = i.winPctBefore < c('greatFlipFrom') && i.winPctPlayed >= c('greatFlipTo');
    return i.playedIsBest && (only || flip) ? 'great' : 'best';
  }
  if (
    loss >= c('inaccuracyWinPct') &&
    (i.prevOppLoss ?? 0) >= c('missOppLossWinPct') &&
    (i.missGain ?? 0) >= c('missPunishGainWinPct')
  )
    return 'miss';
  if (loss >= c('blunderWinPct')) return 'blunder';
  if (loss >= c('mistakeWinPct')) return 'mistake';
  if (loss >= c('inaccuracyWinPct')) return 'inaccuracy';
  if (loss <= c('excellentWinPct')) return 'excellent';
  return 'good';
}

export interface LearnerPly {
  ply: number;
  isBook: boolean;
  winPctBefore: number;
  winPctPlayed: number;
  /** material the learner loses after the opponent's best reply (pawns); mateAllowed if a forced mate follows */
  materialDropAfterBestReply: number;
  mateAllowed: boolean;
}

/** Returns the ply index (ply number) of the first meaningful mistake, or the biggest drop as a flagged fallback. */
export function firstMeaningfulMistake(plies: LearnerPly[]): { ply: number; isFirstMeaningful: boolean } | null {
  const c = (k: string) => cfg.get(`classification.${k}`);
  for (const p of plies) {
    if (p.isBook) continue;
    if (p.winPctBefore < c('alreadyLostBelow')) continue;
    if (p.winPctBefore > c('alreadyWonAbove') && p.winPctPlayed >= c('alreadyWonStillWinning')) continue;
    const loss = Math.max(0, p.winPctBefore - p.winPctPlayed);
    if (loss >= c('meaningfulWinPct')) {
      if (
        p.materialDropAfterBestReply >= cfg.get('firstMeaningful.materialDropMin') ||
        p.mateAllowed ||
        loss >= cfg.get('firstMeaningful.hugeLossFactor') * c('meaningfulWinPct')
      )
        return { ply: p.ply, isFirstMeaningful: true };
    }
  }
  let best: LearnerPly | null = null;
  let bestLoss = 0;
  for (const p of plies) {
    const loss = Math.max(0, p.winPctBefore - p.winPctPlayed);
    if (!p.isBook && loss > bestLoss) {
      bestLoss = loss;
      best = p;
    }
  }
  return best ? { ply: best.ply, isFirstMeaningful: false } : null;
}

/** First meaningful + at most N further by damage, preferring different skill tags (docs/backend/03 §4). */
export function pickMistakesToShow<T extends { ply: number; winPctLoss: number; skillTag?: string }>(
  all: T[],
  firstPly: number | null,
): T[] {
  const max = cfg.get('classification.maxMistakesShown');
  const first = all.find((m) => m.ply === firstPly);
  const out: T[] = first ? [first] : [];
  const tags = new Set(first?.skillTag ? [first.skillTag] : []);
  for (const m of [...all].sort((a, b) => b.winPctLoss - a.winPctLoss)) {
    if (out.length >= max + (first ? 1 : 0)) break;
    if (m === first) continue;
    if (m.skillTag && tags.has(m.skillTag)) continue;
    out.push(m);
    if (m.skillTag) tags.add(m.skillTag);
  }
  return out;
}
