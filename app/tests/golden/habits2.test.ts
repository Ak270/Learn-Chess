import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { gameHabits, type HabitPly } from '../../src/core/chess/habits';

const ply = (history: string[], i: number, over: Partial<HabitPly> = {}): HabitPly => {
  const c = new Chess();
  let before = c.fen();
  let m;
  for (let k = 0; k <= i; k++) {
    before = c.fen();
    m = c.move(history[k]);
  }
  return {
    ply: i + 1,
    color: m!.color,
    san: m!.san,
    uci: m!.lan,
    fenBefore: before,
    fenAfter: c.fen(),
    winPctBefore: 50,
    winPctLoss: 8,
    materialDropAfterBestReply: 0,
    ...over,
  };
};
const learnerHist = (moves: string[], upTo: number, over: Partial<HabitPly> = {}) => {
  const h: HabitPly[] = [];
  for (let i = 0; i <= upTo; i += 2) h.push(ply(moves, i, i === upTo ? over : {}));
  return h;
};

describe('game-level habits (M06-M08, M10, M11)', () => {
  it('M06 hits when the second queen move lost ground and misses when it did not', () => {
    const g = 'e4 e5 Qh5 Nc6 Qf3'.split(' ');
    const hits = gameHabits(learnerHist(g, 4, { winPctLoss: 9 }), 5, 10, 15);
    expect(hits.map((h) => h.id)).toEqual(['early.queen']);
    expect(gameHabits(learnerHist(g, 4, { winPctLoss: 1 }), 5, 10, 15)).toEqual([]);
    expect(
      gameHabits(learnerHist('e4 e5 Qh5 Nc6 Nf3'.split(' '), 4, { winPctLoss: 9 }), 5, 10, 15).map((h) => h.id),
    ).not.toContain('early.queen');
  });
  it('M07 opening.repeat_piece: the same knight returns to the square it came from in the first moves, with a loss', () => {
    const hist = learnerHist('Nf3 e5 Ng1 d5 Nf3'.split(' '), 4, { winPctLoss: 7 });
    expect(gameHabits(hist, 5, 10, 15).map((x) => x.id)).toContain('opening.repeat_piece');
    expect(gameHabits(learnerHist('Nf3 e5 Ng1 d5 Nf3'.split(' '), 4, { winPctLoss: 1 }), 5, 10, 15)).toEqual([]);
    expect(gameHabits(learnerHist('Nf3 e5 e4 d5 Nc3'.split(' '), 4, { winPctLoss: 7 }), 5, 10, 15)).toEqual([]);
  });
  it('M10 stalemate.risk: a winning side stalemates the opponent', () => {
    const c = new Chess('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1');
    const m = c.move('Qg6');
    const h: HabitPly = {
      ply: 1,
      color: 'w',
      san: m.san,
      uci: m.lan,
      fenBefore: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
      fenAfter: c.fen(),
      winPctBefore: 99,
      winPctLoss: 49,
      materialDropAfterBestReply: 0,
    };
    expect(gameHabits([h], 5, 10, 15).map((x) => x.id)).toContain('stalemate.risk');
    expect(gameHabits([{ ...h, winPctBefore: 50 }], 5, 10, 15).map((x) => x.id)).not.toContain('stalemate.risk');
  });
  it('M11 unsound.sacrifice: a capture that gives up 3+ points for nothing', () => {
    const h: HabitPly = {
      ply: 1,
      color: 'w',
      san: 'Bxf7+',
      uci: 'c4f7',
      fenBefore: '',
      fenAfter: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
      winPctBefore: 50,
      winPctLoss: 30,
      materialDropAfterBestReply: 3,
    };
    expect(gameHabits([h], 5, 10, 15).map((x) => x.id)).toEqual(['unsound.sacrifice']);
    expect(gameHabits([{ ...h, materialDropAfterBestReply: 1 }], 5, 10, 15)).toEqual([]);
  });
  it('M08 king.center: uncastled on the home rank after move 10 with a mistake; castled or earlier is fine', () => {
    const moves = 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 d6 Nc3 Nf6 Be3 Bxe3 fxe3 a6 Qd2 h6 Nd5 Nxd5 exd5 Ne7 Qe2 Ng6'.split(' ');
    const hist: HabitPly[] = [];
    for (let i = 0; i <= 20; i += 2) hist.push(ply(moves, i, i === 20 ? { winPctLoss: 12 } : {}));
    expect(hist).toHaveLength(11);
    expect(gameHabits(hist, 5, 10, 15).map((x) => x.id)).toContain('king.center');
    expect(
      gameHabits(
        hist.slice(0, 10).map((h, i) => (i === 9 ? { ...h, winPctLoss: 12 } : h)),
        5,
        10,
        15,
      ).map((x) => x.id),
    ).not.toContain('king.center'); // only 10 moves
    expect(
      gameHabits(
        hist.map((h, i) => (i === 3 ? { ...h, san: 'O-O' } : h)),
        5,
        10,
        15,
      ).map((x) => x.id),
    ).not.toContain('king.center'); // castled earlier
  });
});
