import { describe, expect, it } from 'vitest';
import {
  checkWaste,
  greedyCapture,
  ignoredThreat,
  protectedButHanging,
  unfavorableTrade,
} from '../../src/core/chess/habits';

describe('habit detectors (misconceptions M01-M05)', () => {
  it('M01 protected-but-hanging: defended knight attacked by a pawn', () => {
    const hits = protectedButHanging('4k3/8/8/3p4/4N3/3P4/8/4K3 w - - 0 1', 'w');
    expect(hits.map((h) => h.id)).toContain('hanging.protected');
    expect(hits[0].evidence).toMatch(/was defended/);
  });
  it('M01 negatives: undefended piece is plain hanging (not "protected"); start position is clean', () => {
    expect(protectedButHanging('4k3/8/8/8/1b6/R7/8/4K3 w - - 0 1', 'w')).toEqual([]);
    expect(protectedButHanging('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w')).toEqual([]);
    expect(protectedButHanging('4k3/8/1p6/2n5/4N3/5P2/8/4K3 w - - 0 1', 'w')).toEqual([]);
  });
  it('M02 check.waste: the checking queen is simply captured', () => {
    expect(checkWaste('4k3/3n4/8/7Q/8/8/8/4K3 w - - 0 1', 'h5e5', 'd7e5').map((h) => h.id)).toEqual(['check.waste']);
    expect(checkWaste('4k3/3n4/8/7Q/8/8/8/4K3 w - - 0 1', 'h5e5', 'e8d8')).toEqual([]); // check not captured
    expect(checkWaste('4k3/3n4/8/7Q/8/8/8/4K3 w - - 0 1', 'h5h4', 'e8d8')).toEqual([]); // not a check
  });
  it('M03 greedy.capture: queen takes a defended pawn', () => {
    expect(greedyCapture('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5').map((h) => h.id)).toEqual(['greedy.capture']);
    expect(greedyCapture('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5')).toEqual([]);
    expect(greedyCapture('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd1d2')).toEqual([]);
  });
  it('M05 unfavorable.trade: an even trade that is recaptured', () => {
    expect(unfavorableTrade('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1', 'c3d5', 'e6d5').map((h) => h.id)).toEqual([
      'unfavorable.trade',
    ]);
    expect(unfavorableTrade('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1', 'c3d5', 'e8d8')).toEqual([]); // no recapture
    expect(unfavorableTrade('4k3/8/8/3n4/8/2N5/8/4K3 w - - 0 1', 'c3d5', 'e8d8')).toEqual([]); // free piece, not a trade
  });
  it('M04 ignored.threat: a piece was attacked and the move made a check instead', () => {
    expect(ignoredThreat('4k3/8/8/3q4/8/2b5/8/3RK3 b - - 0 1', 'c3b4', 'b').map((h) => h.id)).toEqual([
      'ignored.threat',
    ]);
  });
  it('M04 negative: moving the attacked piece away with check resolves the threat', () => {
    expect(ignoredThreat('4k3/8/8/3q4/8/8/8/3RK3 b - - 0 1', 'd5a5', 'b')).toEqual([]);
  });
});
