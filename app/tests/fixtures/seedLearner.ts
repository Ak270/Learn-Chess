// Deterministic 30-day synthetic learner for planner/derived tests (docs/backend/02 §8).
import type { SkillId } from '../../src/types/ids';
import type { Attempt, AttemptContext } from '../../src/types/model';

const SKILLS: SkillId[] = ['piece_safety', 'tactic_fork', 'tactic_pin', 'tactic_backrank'];
const CONTEXTS: AttemptContext[] = ['drill', 'puzzle', 'test', 'recall'];
const DAY = 86_400_000;
export const SEED_START = Date.UTC(2026, 8, 1);

/** tiny LCG so the fixture never changes between runs */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

export function seedAttempts(days = 30): Attempt[] {
  const r = rng(42);
  const out: Attempt[] = [];
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 8; k++) {
      const skill = SKILLS[Math.floor(r() * SKILLS.length)];
      const p = 0.4 + 0.4 * (d / days);
      out.push({
        id: `seed-${String(d).padStart(2, '0')}-${k}`,
        at: SEED_START + d * DAY + k * 60_000,
        context: CONTEXTS[Math.floor(r() * CONTEXTS.length)],
        correct: r() < p,
        hints: r() < 0.2 ? 1 : 0,
        ms: 3000 + Math.floor(r() * 9000),
        skillTags: [skill],
      });
    }
  }
  return out;
}
