// Attempts -> evidence -> SkillState. This is the minimal mapping needed for rebuildDerived();
// Phase 5 §3 refines weights and layers (all weights become config with sources).
import type { SkillId } from '../../types/ids';
import type { Attempt, AttemptContext, Layer, SkillEvidence, SkillState } from '../../types/model';
import { LAYERS } from '../../types/model';

const CONTEXT_LAYER: Record<AttemptContext, Layer> = {
  drill: 'recognition',
  puzzle: 'calculation',
  test: 'decision',
  recall: 'retention',
  weekly_exam: 'transfer',
  game_prompt: 'decision',
  review: 'knowledge',
};

export function evidenceFromAttempt(a: Attempt): Omit<SkillEvidence, 'id' | 'sourceRef'>[] {
  const assisted = a.hints > 0;
  return a.skillTags.map((skill) => ({
    at: a.at,
    skill,
    layer: CONTEXT_LAYER[a.context],
    outcome: (a.correct ? 1 : 0) as 0 | 1,
    weight: assisted ? 0.5 : 1,
    assisted,
  }));
}

export function skillStatesFromEvidence(ev: SkillEvidence[]): SkillState[] {
  const bySkill = new Map<SkillId, SkillEvidence[]>();
  for (const e of [...ev].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)))
    (bySkill.get(e.skill) ?? bySkill.set(e.skill, []).get(e.skill)!).push(e);
  return [...bySkill].map(([skill, list]) => {
    const layers = Object.fromEntries(LAYERS.map((l) => [l, { mean: 0, n: 0 }])) as SkillState['layers'];
    const wsum: Record<string, number> = {};
    for (const e of list) {
      const L = layers[e.layer];
      wsum[e.layer] = (wsum[e.layer] ?? 0) + e.weight;
      L.mean += e.outcome * e.weight;
      L.n += 1;
    }
    for (const l of LAYERS) if (wsum[l]) layers[l].mean /= wsum[l];
    const unassisted = list.filter((e) => !e.assisted).length;
    const half = Math.floor(list.length / 2);
    const avg = (xs: SkillEvidence[]) => (xs.length ? xs.reduce((s, e) => s + e.outcome, 0) / xs.length : 0);
    return {
      skill,
      updatedAt: list[list.length - 1].at,
      layers,
      independence: unassisted / list.length,
      lastSeen: list[list.length - 1].at,
      trend: list.length >= 4 ? avg(list.slice(half)) - avg(list.slice(0, half)) : 0,
    };
  });
}
