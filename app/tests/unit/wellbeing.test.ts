import { describe, expect, it } from 'vitest';
import { assessAfterGame, fatigued } from '../../src/core/play/wellbeing';
import { cfg } from '../../src/config';

describe('wellbeing rules (docs/backend/10 §5.4)', () => {
  it('two losses offer a break with review highlighted; a win or draw breaks the run', () => {
    const a = assessAfterGame([{ score: 1 }, { score: 0 }, { score: 0 }]);
    expect(a.kind).toBe('break');
    if (a.kind === 'break') {
      expect(a.highlighted).toBe('review');
      expect(a.options).toEqual(['break', 'review', 'lower']);
    }
    expect(assessAfterGame([{ score: 0 }, { score: 0 }, { score: 0.5 }]).kind).toBe('none');
    expect(assessAfterGame([{ score: 0 }]).kind).toBe('none');
  });
  it('three losses with move times collapsing flags tilt and stops pushing new games', () => {
    const a = assessAfterGame([
      { score: 0, medianMoveMs: 9000 },
      { score: 0, medianMoveMs: 6000 },
      { score: 0, medianMoveMs: 4000 },
    ]);
    expect(a.kind).toBe('tilt');
    expect(
      assessAfterGame([
        { score: 0, medianMoveMs: 9000 },
        { score: 0, medianMoveMs: 9000 },
        { score: 0, medianMoveMs: 9500 },
      ]).kind,
    ).toBe('break');
  });
  it('copy is kind: no banned words', () => {
    const t = JSON.stringify([
      assessAfterGame([{ score: 0 }, { score: 0 }]),
      assessAfterGame([
        { score: 0, medianMoveMs: 9 },
        { score: 0, medianMoveMs: 6 },
        { score: 0, medianMoveMs: 3 },
      ]),
    ]).toLowerCase();
    for (const w of cfg.get<string[]>('copy.bannedWords')) expect(new RegExp(`\\b${w}\\b`).test(t), w).toBe(false);
  });
  it('fatigue needs a >= 30% accuracy drop with shorter times', () => {
    const ok = [true, true, true, true, true, false, false, false, false];
    expect(fatigued(ok, [9, 9, 9, 8, 8, 8, 3, 3, 3])).toBe(true);
    expect(fatigued(ok, [3, 3, 3, 4, 4, 4, 9, 9, 9])).toBe(false);
    expect(fatigued([true, false], [1, 1])).toBe(false);
  });
});
