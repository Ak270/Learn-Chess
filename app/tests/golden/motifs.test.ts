import { describe, expect, it } from 'vitest';
import motifs from './motifs.json';
import {
  backRankThreat,
  discoveredMotifs,
  forkMoves,
  hangingMotifs,
  missedMotifs,
  rayMotifs,
} from '../../src/core/chess/motifs';
import type { Color } from 'chess.js';

type Case = {
  name: string;
  fn: string;
  fen: string;
  owner?: Color;
  color?: Color;
  attacker?: Color;
  victim?: Color;
  played?: string;
  best?: string;
  expect?: string[];
  absent?: string[];
  expectMove?: string;
  noMove?: string;
  noMoves?: boolean;
};

function run(c: Case): string[] {
  switch (c.fn) {
    case 'hanging':
      return hangingMotifs(c.fen, c.owner!, 'allowed').map((h) => h.id);
    case 'rays':
      return rayMotifs(c.fen, c.attacker!, 'allowed').map((h) => h.id);
    case 'backRank':
      return backRankThreat(c.fen, c.victim!).map((h) => h.id);
    case 'missed':
      return missedMotifs(c.fen, c.played!, c.best!).map((h) => h.id);
    case 'discovered':
      return discoveredMotifs(c.fen, c.played!).map((h) => h.id);
    default:
      throw new Error(`unknown detector ${c.fn}`);
  }
}

describe('golden motif suite', () => {
  for (const c of motifs.cases as Case[]) {
    it(c.name, () => {
      if (c.fn === 'forkMoves') {
        const forks = forkMoves(c.fen, c.color!);
        if (c.noMoves) return expect(forks).toEqual([]);
        if (c.noMove) return expect(forks.map((f) => f.uci)).not.toContain(c.noMove);
        const f = forks.find((x) => x.uci === c.expectMove);
        expect(f, `no fork found for ${c.expectMove}`).toBeDefined();
        for (const id of c.expect ?? []) expect(f!.hits.map((h) => h.id)).toContain(id);
        return;
      }
      const ids = run(c);
      for (const id of c.expect ?? []) expect(ids).toContain(id);
      for (const id of c.absent ?? []) expect(ids).not.toContain(id);
    });
  }
  it('every hit carries evidence text and squares', () => {
    const hits = hangingMotifs('4k3/8/8/3q4/8/8/8/3RK3 b - - 0 1', 'b', 'allowed');
    expect(hits[0].evidence).toMatch(/queen on d5/);
    expect(hits[0].squares).toEqual(['d5', 'd1']);
  });
});
