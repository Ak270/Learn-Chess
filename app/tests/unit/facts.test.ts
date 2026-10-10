import { describe, expect, it } from 'vitest';
import { mistakeFacts, moveLabel, withSuffix } from '../../src/core/chess/facts';
import type { Mistake, PlyRecord } from '../../src/types/model';

describe('mistake facts (template wording)', () => {
  const fen = 'r1bqk2r/ppp2pp1/2np1b1p/2b1p1B1/2B1P3/2NP1N1P/PPP2PP1/R2Q1RK1 w kq - 0 11';
  it('labels moves for white and black', () => {
    expect(moveLabel(21, 'Nh4')).toBe('11. Nh4');
    expect(moveLabel(22, 'Qxh4')).toBe('11... Qxh4');
    expect(withSuffix('11. Nh4', 'blunder')).toBe('11. Nh4??');
    expect(withSuffix('11. Nh4', 'good')).toBe('11. Nh4');
  });
  it('states what the refutation wins, using only verified squares', () => {
    const m = {
      fen: 'r1b1kbnr/pppp1ppp/2n5/4p3/4P1q1/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
      playedUci: 'f3e5',
      refutationUci: 'g4e4',
      motifs: [],
      bestUci: 'd2d3',
    } as unknown as Mistake;
    const p = { ply: 7, san: 'Nxe5', color: 'w', cls: 'blunder', winPctBefore: 50, winPctAfter: 10 } as PlyRecord;
    void fen;
    const f = mistakeFacts(m, p);
    expect(f.headline).toBe('4. Nxe5??');
    expect(f.reply?.san).toContain('Qxe4');
    expect(f.reply?.sentence).toMatch(/wins a pawn \(1 point\)/);
    expect(f.turn).toMatch(/from about 50% to 10%/);
  });
});
