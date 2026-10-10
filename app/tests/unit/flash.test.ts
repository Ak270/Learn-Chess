import { describe, expect, it } from 'vitest';
import { nextSeconds, pieceCount, placementOf, scoreFlash } from '../../src/core/visual/flash';

describe('flash position (docs/backend/10 §4)', () => {
  const fen = '4k3/8/3n4/8/2B5/8/4P3/4K3 w - - 0 1';
  it('reads the placement and counts pieces', () => {
    const p = placementOf(fen);
    expect(p).toMatchObject({ e8: 'bk', d6: 'bn', c4: 'wb', e2: 'wp', e1: 'wk' });
    expect(pieceCount(fen)).toBe(5);
  });
  it('scores correct squares and penalises wrong ones, never below 0', () => {
    const t = placementOf(fen);
    expect(scoreFlash(t, t).score).toBe(1);
    expect(scoreFlash(t, { e8: 'bk', e1: 'wk' }).score).toBeCloseTo(0.4, 9);
    expect(scoreFlash(t, { e8: 'bk', a1: 'wq', a2: 'wq', a3: 'wq' })).toMatchObject({ correct: 1, extra: 3 });
    expect(scoreFlash(t, { a1: 'wq', a2: 'wq', a3: 'wq', a4: 'wq' }).score).toBe(0);
  });
  it('the exposure time shrinks at >= 80% and grows when it goes badly, within bounds', () => {
    expect(nextSeconds(8, 0.9)).toBe(7);
    expect(nextSeconds(8, 0.6)).toBe(8);
    expect(nextSeconds(8, 0.3)).toBe(10);
    expect(nextSeconds(3, 1)).toBe(3);
    expect(nextSeconds(12, 0)).toBe(12);
  });
});
