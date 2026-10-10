import { cfg } from '../../config';
import type { PlyRecord } from '../../types/model';

export type PhaseGrade = 'Solid' | 'Fine' | 'Costly';
/** Phase grades (docs/backend/04 §3.1): never number-only. */
export function phaseGrades(
  plies: PlyRecord[],
  learner: 'w' | 'b',
): Partial<Record<'opening' | 'middlegame' | 'endgame', PhaseGrade>> {
  const out: Partial<Record<'opening' | 'middlegame' | 'endgame', PhaseGrade>> = {};
  for (const phase of ['opening', 'middlegame', 'endgame'] as const) {
    const ps = plies.filter((p) => p.color === learner && p.phase === phase);
    if (!ps.length) continue;
    const mean = ps.reduce((s, p) => s + (p.winPctLoss ?? 0), 0) / ps.length;
    const blunders = ps.filter((p) => p.cls === 'blunder').length;
    out[phase] =
      blunders >= 1 || mean > cfg.get('phaseGrade.fineBelow')
        ? 'Costly'
        : mean < cfg.get('phaseGrade.solidBelow')
          ? 'Solid'
          : 'Fine';
  }
  return out;
}
