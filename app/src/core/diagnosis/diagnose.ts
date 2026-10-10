// Diagnosis hypotheses (docs/backend/04 §4). Never a single verdict: every hypothesis lists its signals.
import { Chess } from 'chess.js';
import { cfg } from '../../config';
import type { Cause, DiagnosisHypothesis, MotifHit } from '../../types/model';
import { forksFrom } from '../chess/motifs';
import { loosePieces } from '../chess/see';

export interface DiagnoseCtx {
  /** the learner's ply */
  fenBefore: string;
  playedUci: string;
  color: 'w' | 'b';
  motifs: MotifHit[];
  winPctLoss: number;
  materialDropAfterBestReply: number;
  timeSpentMs?: number;
  /** median time per learner move in this game (ms), if clocks were imported */
  medianMoveMs?: number;
  /** data only available for Mentor games */
  coach?: { safetyCheckSkipped?: boolean; threatStated?: boolean; statedThreatCorrect?: boolean };
  selfExplanation?: { chip?: 'attack' | 'defend' | 'develop' | 'unsure'; text?: string };
  /** past evidence for the motif's skill */
  history?: {
    drillAttempts: number;
    drillUnaidedAccuracy: number;
    wrongInLessonsOrTests: number;
    gameHitsLast10: number;
  };
  /** the learner's previous plies in this game: loss in win%, oldest first (for tilt) */
  recentLosses?: { materialLost: boolean; blunder: boolean; ms?: number }[];
  imported: boolean;
}

const ONE_MOVE_THREATS = new Set(['hanging.piece', 'missed.capture', 'missed.check']);

export function rushedThresholdMs(median?: number) {
  return Math.max(cfg.get('diagnosis.rushedMinMs'), (median ?? 0) * cfg.get('diagnosis.rushedMedianFrac'));
}

function ownThreatPlayed(fenBefore: string, uci: string): boolean {
  const c = new Chess(fenBefore);
  try {
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m.san.includes('+') || !!m.captured || forksFrom(c.fen(), m.to).length > 0;
  } catch {
    return false;
  }
}
function opponentThreatBefore(fenBefore: string, color: 'w' | 'b'): boolean {
  // a threat that existed before the move: a piece of ours already hanging
  return (
    new Chess(fenBefore).turn() === color && ONE_MOVE_THREATS.has('hanging.piece') && hangingBefore(fenBefore, color)
  );
}
const hangingBefore = (fen: string, color: 'w' | 'b') => loosePieces(fen, color).hanging.length > 0;

export function diagnose(ctx: DiagnoseCtx): DiagnosisHypothesis[] {
  const out: DiagnosisHypothesis[] = [];
  const rushedMs = rushedThresholdMs(ctx.medianMoveMs);
  const hasTime = ctx.timeSpentMs !== undefined;
  const rushed = hasTime && ctx.timeSpentMs! < rushedMs;
  const slow =
    hasTime &&
    ctx.medianMoveMs !== undefined &&
    ctx.timeSpentMs! > ctx.medianMoveMs * cfg.get('diagnosis.slowMedianFactor');
  const oneMove = ctx.motifs.some((m) => ONE_MOVE_THREATS.has(m.id));
  const add = (cause: Cause, confidence: DiagnosisHypothesis['confidence'], signals: string[]) =>
    out.push({ cause, confidence, signals });

  // perception
  {
    const sig: string[] = [];
    if (ctx.coach?.safetyCheckSkipped) sig.push('Safety Check was skipped on this move.');
    if (ctx.coach && ctx.coach.threatStated === false) sig.push('No threat statement was recorded.');
    if (rushed)
      sig.push(`Moved in ${Math.round(ctx.timeSpentMs! / 1000)} s (quicker than ${Math.round(rushedMs / 1000)} s).`);
    if (oneMove) sig.push('The problem was a one-move threat (a capture or check).');
    if (sig.length && oneMove) add('perception', sig.length >= 2 ? 'high' : 'medium', sig);
  }
  // calculation
  {
    const sig: string[] = [];
    let conf: DiagnosisHypothesis['confidence'] = 'medium';
    if (ctx.coach?.threatStated && ctx.coach.statedThreatCorrect === false) {
      sig.push('You stated the threat, but the move was refuted two plies deep.');
      conf = 'high';
    }
    if (slow && ctx.materialDropAfterBestReply >= 1)
      sig.push('You spent much longer than usual and still lost material.');
    if (sig.length) add('calculation', conf, sig);
  }
  // over-focus on own plan
  {
    const own = ownThreatPlayed(ctx.fenBefore, ctx.playedUci);
    const ignored = opponentThreatBefore(ctx.fenBefore, ctx.color);
    const sig: string[] = [];
    if (own && ignored) sig.push('Your move made a threat of its own, while a piece of yours was already attacked.');
    if (ctx.selfExplanation?.chip === 'attack' && (own || ignored))
      sig.push('You said you were aiming to attack something.');
    if (own && ignored) add('over_focus_own_plan', 'medium', sig);
  }
  // rushed
  if (rushed && ctx.winPctLoss >= cfg.get('diagnosis.criticalSwingWinPct'))
    add('rushed', 'medium', [
      `Moved in ${Math.round(ctx.timeSpentMs! / 1000)} s on a critical position (the best move was ${Math.round(ctx.winPctLoss)} win-points better).`,
    ]);
  // knowledge gap
  if (ctx.history && ctx.history.wrongInLessonsOrTests >= cfg.get('diagnosis.knowledgeGapMisses'))
    add('knowledge_gap', 'medium', [
      `The same idea was missed ${ctx.history.wrongInLessonsOrTests} times in lessons, drills or tests.`,
    ]);
  // transfer failure
  if (
    ctx.history &&
    ctx.history.drillAttempts >= cfg.get('diagnosis.transferMinDrillAttempts') &&
    ctx.history.drillUnaidedAccuracy >= cfg.get('diagnosis.transferMinDrillAccuracy') &&
    ctx.history.gameHitsLast10 >= cfg.get('diagnosis.transferMinGameHits')
  )
    add('transfer_failure', 'high', [
      `You solve this in drills ${Math.round(ctx.history.drillUnaidedAccuracy * 100)}% unaided, yet it appeared ${ctx.history.gameHitsLast10} times in your last 10 games.`,
    ]);
  // tilt
  if (ctx.recentLosses) {
    const w = ctx.recentLosses.slice(-cfg.get('diagnosis.tiltWindowPlies'));
    const lostMaterial = w.some((p) => p.materialLost);
    const blunders = w.filter((p) => p.blunder).length;
    const times = w.map((p) => p.ms).filter((x): x is number => x !== undefined);
    const collapsing = times.length >= 3 && times[times.length - 1] < times[0] * 0.6;
    if (lostMaterial && blunders >= cfg.get('diagnosis.tiltBlundersInWindow') && collapsing)
      add('tilt', 'low', ['Several blunders in a row after losing material, with moves getting faster.']);
  }
  if (!out.length) add('unknown', 'low', ['No clear pattern in the data we have.']);
  if (ctx.imported)
    out.forEach((h) => {
      if (h.cause === 'perception' || h.cause === 'calculation')
        h.signals.push(
          'This game was imported, so we cannot tell "did not see it" from "saw it and misjudged"; your own words below help.',
        );
    });
  return out;
}
