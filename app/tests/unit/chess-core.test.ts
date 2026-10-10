import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import fc from 'fast-check';
import { Chess, type Square } from 'chess.js';
import { parseBestmove, parseInfo, SearchCollector } from '../../src/core/engine/uci';
import { createEngineClient, AppError, type UciTransport } from '../../src/core/engine/engineClient';
import { gameAccuracy, moveAccuracy, scoreToCp, winPct, winPctLoss } from '../../src/core/chess/eval';
import {
  classifyMove,
  firstMeaningfulMistake,
  pickMistakesToShow,
  type LearnerPly,
} from '../../src/core/chess/classify';
import { gamePhase, material, pieceValue } from '../../src/core/chess/material';
import { see } from '../../src/core/chess/see';

describe('UCI parsing', () => {
  const dir = 'tests/fixtures/uci';
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  it('has >= 29 recorded real transcripts plus the hand-written bound/mate cases below (30 total)', () => {
    expect(files.length).toBeGreaterThanOrEqual(29);
  });
  for (const f of files) {
    it(`transcript ${f}: collector returns the last info per multipv at the final depth, ends with bestmove`, () => {
      const t = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { fen: string; lines: string[] };
      const col = new SearchCollector();
      t.lines.forEach((l) => col.push(l));
      const r = col.result(t.fen);
      expect(r.lines.length).toBeGreaterThan(0);
      expect(r.depth).toBe(8);
      const best = parseBestmove(t.lines[t.lines.length - 1]);
      expect(best?.best).toBe(r.lines[0].pv[0]);
      // each multipv entry equals the last non-bound info line for that multipv
      for (const l of r.lines) {
        const last = [...t.lines]
          .reverse()
          .map(parseInfo)
          .find((x) => x && x.multipv === l.multipv && !x.bound)!;
        expect(l.cp).toBe(last.cp);
        expect(l.mate).toBe(last.mate);
      }
    });
  }
  it('parses cp, mate, bounds and multipv; ignores bound lines in the collector', () => {
    expect(parseInfo('info depth 5 multipv 2 score cp -37 nodes 1 pv a7a6 b2b3')).toMatchObject({
      depth: 5,
      multipv: 2,
      cp: -37,
      pv: ['a7a6', 'b2b3'],
    });
    expect(parseInfo('info depth 9 score mate -3 pv e1e2')).toMatchObject({ mate: -3, multipv: 1 });
    expect(parseInfo('info depth 9 score cp 50 lowerbound pv e2e4')?.bound).toBe('lower');
    expect(parseInfo('info string NNUE evaluation using nn.bin')).toBeNull();
    const c = new SearchCollector();
    c.push('info depth 10 multipv 1 score cp 20 pv e2e4');
    c.push('info depth 11 multipv 1 score cp 900 upperbound pv e2e4');
    expect(c.result('x').lines[0].cp).toBe(20);
    expect(parseBestmove('bestmove (none)')?.best).toBeNull();
    expect(parseBestmove('bestmove e2e4 ponder e7e5')).toEqual({ best: 'e2e4', ponder: 'e7e5' });
  });
});

describe('win percentage maths', () => {
  it('winPct(0)=50, monotonic, symmetric, saturating', () => {
    expect(winPct(0)).toBeCloseTo(50, 10);
    fc.assert(
      fc.property(fc.integer({ min: -3000, max: 3000 }), (x) => Math.abs(winPct(-x) - (100 - winPct(x))) < 1e-9),
    );
    fc.assert(fc.property(fc.integer({ min: -3000, max: 2999 }), (x) => winPct(x + 1) > winPct(x)));
    expect(winPct(scoreToCp({ mate: 3 }))).toBeGreaterThan(99.9);
    expect(winPct(scoreToCp({ mate: -2 }))).toBeLessThan(0.1);
  });
  it('matches known Lichess values (+100cp ~ 59.1%, +300cp ~ 75%)', () => {
    expect(winPct(100)).toBeCloseTo(59.1, 0);
    expect(winPct(300)).toBeCloseTo(75.1, 0);
  });
  it('accuracy is 100 at zero loss, decreasing, within 0..100', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 3);
    expect(moveAccuracy(10)).toBeLessThan(moveAccuracy(5));
    expect(moveAccuracy(100)).toBeGreaterThanOrEqual(0);
    expect(gameAccuracy([100, 50])).toBe(75);
    expect(winPctLoss(60, 70)).toBe(0);
  });
});

describe('move classification (docs/backend/03 §3)', () => {
  const base = { isBook: false, playedIsBest: false, winPctBefore: 55, winPctPlayed: 55 };
  it('thresholds', () => {
    expect(classifyMove({ ...base, isBook: true })).toBe('book');
    expect(classifyMove({ ...base, winPctPlayed: 55 - 16 })).toBe('blunder');
    expect(classifyMove({ ...base, winPctPlayed: 55 - 11 })).toBe('mistake');
    expect(classifyMove({ ...base, winPctPlayed: 55 - 6 })).toBe('inaccuracy');
    expect(classifyMove({ ...base, winPctPlayed: 55 - 3 })).toBe('good');
    expect(classifyMove({ ...base, winPctPlayed: 55 - 1 })).toBe('excellent');
    expect(classifyMove({ ...base, playedIsBest: true })).toBe('best');
  });
  it('great = only move, or flips the game', () => {
    expect(classifyMove({ ...base, playedIsBest: true, winPctSecond: 30 })).toBe('great');
    expect(classifyMove({ ...base, playedIsBest: true, winPctBefore: 35, winPctPlayed: 52 })).toBe('great');
  });
  it('brilliant requires a sound sacrifice and not already lost', () => {
    expect(classifyMove({ ...base, playedIsBest: true, sacrifice: true })).toBe('brilliant');
    expect(classifyMove({ ...base, playedIsBest: true, sacrifice: true, winPctBefore: 20, winPctPlayed: 20 })).toBe(
      'best',
    );
  });
  it('miss = failing to punish the opponent error, not a plain blunder', () => {
    expect(classifyMove({ ...base, winPctBefore: 80, winPctPlayed: 68, prevOppLoss: 25, missGain: 30 })).toBe('miss');
    expect(classifyMove({ ...base, winPctBefore: 80, winPctPlayed: 68 })).toBe('mistake');
  });
});

describe('first meaningful mistake (docs/backend/03 §4)', () => {
  const p = (ply: number, before: number, played: number, drop = 0, mate = false): LearnerPly => ({
    ply,
    isBook: false,
    winPctBefore: before,
    winPctPlayed: played,
    materialDropAfterBestReply: drop,
    mateAllowed: mate,
  });
  it('skips book, lost positions, and positional drops with no material consequence', () => {
    const plies = [{ ...p(1, 50, 20, 3), isBook: true }, p(3, 52, 40, 0), p(5, 5, 0, 5), p(7, 50, 30, 3)];
    expect(firstMeaningfulMistake(plies)).toEqual({ ply: 7, isFirstMeaningful: true });
  });
  it('a huge drop counts even without a material drop; mate allowed counts', () => {
    expect(firstMeaningfulMistake([p(3, 60, 35)])?.ply).toBe(3);
    expect(firstMeaningfulMistake([p(3, 60, 48, 0, true)])?.ply).toBe(3);
  });
  it('falls back to the largest drop, flagged', () => {
    expect(firstMeaningfulMistake([p(3, 60, 49), p(5, 60, 51)])).toEqual({ ply: 3, isFirstMeaningful: false });
    expect(firstMeaningfulMistake([])).toBeNull();
  });
  it('a winning position that stays winning is never the *first meaningful* mistake (only the flagged fallback)', () => {
    expect(firstMeaningfulMistake([p(3, 97, 80, 3)])?.isFirstMeaningful).toBe(false);
  });
  it('shows the first + 2 more (<= 3 per game, DECISIONS T9), preferring different skill tags', () => {
    const all = [
      { ply: 5, winPctLoss: 30, skillTag: 'a' },
      { ply: 9, winPctLoss: 25, skillTag: 'a' },
      { ply: 13, winPctLoss: 20, skillTag: 'b' },
      { ply: 17, winPctLoss: 15, skillTag: 'c' },
      { ply: 21, winPctLoss: 12, skillTag: 'd' },
    ];
    const out = pickMistakesToShow(all, 5);
    expect(out.map((m) => m.ply)).toEqual([5, 13, 17]);
  });
});

describe('phase + material', () => {
  it('start position is opening; bare kings and rooks are endgame; mid positions are middlegame', () => {
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1)).toBe('opening');
    expect(gamePhase('4k3/8/8/8/8/8/8/4K2R w - - 0 1', 60)).toBe('endgame');
    expect(gamePhase('r1bq1rk1/ppp2ppp/2n2n2/3pp3/1b2P3/2NP1N2/PPP1BPPP/R1BQ1RK1 w - - 0 8', 30)).toBe('middlegame');
    expect(material('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').w).toBe(39);
    expect(pieceValue('q')).toBe(9);
  });
});

// ---- SEE vs brute force (docs/backend/03 §8 property test) ----
function brute(c: Chess, sq: Square, side: 'w' | 'b'): number {
  // value for `side` who must capture on sq now (forced first capture), either side may stop afterwards
  const caps = c.moves({ verbose: true }).filter((m) => m.to === sq && m.color === side && m.captured);
  if (!caps.length) return 0;
  let best = -Infinity;
  for (const m of caps) {
    const v = pieceValue(m.captured!);
    c.move(m);
    const reply = Math.max(0, brute(c, sq, side === 'w' ? 'b' : 'w'));
    c.undo();
    best = Math.max(best, v - reply);
  }
  return best;
}
describe('SEE equals brute-force minimax on random small positions', () => {
  const squares = [
    'c3',
    'd3',
    'e3',
    'f3',
    'c4',
    'd4',
    'e4',
    'f4',
    'c5',
    'd5',
    'e5',
    'f5',
    'c6',
    'd6',
    'e6',
    'f6',
  ] as Square[];
  const aligned = (a: Square, b: Square) =>
    a[0] === b[0] || a[1] === b[1] || Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) === Math.abs(+a[1] - +b[1]);
  it('agrees on 300 random positions (kings away from all lines, no promotions, no ep)', () => {
    const arb = fc.record({
      pieces: fc.array(
        fc.record({
          sq: fc.constantFrom(...squares),
          t: fc.constantFrom('p', 'n', 'b', 'r', 'q'),
          color: fc.constantFrom('w', 'b'),
        }),
        { minLength: 3, maxLength: 6 },
      ),
      target: fc.constantFrom(...squares),
    });
    let checked = 0;
    fc.assert(
      fc.property(arb, ({ pieces, target }) => {
        const c = new Chess();
        c.clear();
        // kings on a1/h1 would line up with the region; use h8/a8 edge squares far from lines is impossible, so filter instead
        c.put({ type: 'k', color: 'w' }, 'a1');
        c.put({ type: 'k', color: 'b' }, 'h8');
        const used = new Set<string>();
        for (const p of pieces)
          if (!used.has(p.sq)) {
            used.add(p.sq);
            c.put({ type: p.t as 'p', color: p.color as 'w' }, p.sq);
          }
        const t = c.get(target);
        if (!t) return true;
        if ([...used].some((s) => aligned(s as Square, 'a1') || aligned(s as Square, 'h8'))) return true; // pins/king lines: out of scope for SEE
        const fen = c.fen().replace(/ [wb] - - 0 1$/, ' w - - 0 1');
        const side: 'w' | 'b' = t.color === 'w' ? 'b' : 'w';
        const g = new Chess(fen.replace(' w ', ` ${side} `));
        if (g.inCheck()) return true;
        checked++;
        const expected = brute(g, target, side);
        const got = see(g.fen(), target, side);
        return got === expected || (expected === 0 && got === 0);
      }),
      { numRuns: 1500 },
    );
    expect(checked).toBeGreaterThan(50);
  });
  it('simple cases', () => {
    // pawn defended by pawn, attacked by queen: QxP loses the queen
    expect(see('4k3/8/8/3p4/4p3/8/8/3QK3 w - - 0 1', 'd5', 'w')).toBe(1);
    expect(see('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'd5', 'w')).toBe(-8);
    expect(see('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e8', 'w')).toBe(0);
  });
});

// ---- EngineClient: serialization, crash recovery ----
function fakeTransport(script: (cmd: string, emit: (l: string) => void) => void): () => Promise<UciTransport> {
  return async () => {
    let cb: (l: string) => void = () => {};
    return { send: (c) => queueMicrotask(() => script(c, (l) => cb(l))), onLine: (f) => (cb = f), dispose() {} };
  };
}
const okScript = (c: string, emit: (l: string) => void) => {
  if (c === 'uci') emit('uciok');
  if (c === 'isready') emit('readyok');
  if (c.startsWith('go')) {
    emit('info depth 3 multipv 1 score cp 10 pv e2e4 e7e5');
    emit('bestmove e2e4');
  }
};
describe('EngineClient (fake transport)', () => {
  it('serialises concurrent requests and returns results', async () => {
    const order: string[] = [];
    const e = createEngineClient(
      fakeTransport((c, emit) => {
        if (c.startsWith('position')) order.push(c);
        okScript(c, emit);
      }),
    );
    const [a, b] = await Promise.all([e.analyse('a b c d 0 1', { depth: 3 }), e.analyse('e f g h 0 1', { depth: 3 })]);
    expect(a.lines[0].cp).toBe(10);
    expect(b.lines[0].pv[0]).toBe('e2e4');
    expect(order).toHaveLength(2);
  });
  it('recreates the worker once on crash, then surfaces ENGINE_DOWN', async () => {
    let made = 0;
    const e = createEngineClient(async () => {
      made++;
      return {
        send() {
          throw new Error('crash');
        },
        onLine() {},
        dispose() {},
      };
    });
    await expect(e.analyse('x y z w 0 1', { depth: 3 })).rejects.toBeInstanceOf(AppError);
    expect(made).toBe(2);
  });
  it('LRU cache evicts the oldest entry beyond maxCache', async () => {
    const e = createEngineClient(fakeTransport(okScript), { maxCache: 2 });
    for (const f of ['a', 'b', 'c']) await e.analyse(`${f} w - - 0 1`, { depth: 3 });
    expect(e.cacheSize()).toBe(2);
  });
});
