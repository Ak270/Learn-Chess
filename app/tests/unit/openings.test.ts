import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { cardsFor, leftBook, REPERTOIRES, steps } from '../../src/core/openings/repertoire';
import { words } from '../../src/core/content/validate';
import { cfg } from '../../src/config';

describe('repertoires (docs/backend/06 §3)', () => {
  it('every line is legal, alternates sides, and every learner move has a "why" of at most 25 words', () => {
    expect(REPERTOIRES).toHaveLength(3);
    for (const r of REPERTOIRES) {
      const st = steps(r);
      st.forEach((s, i) => {
        expect(s.node.byLearner, `${r.id} move ${i}`).toBe((i % 2 === 0) === (r.side === 'w'));
        expect(s.node.why.length).toBeGreaterThan(5);
        expect(words(s.node.why).length).toBeLessThanOrEqual(25);
      });
      expect(st.length).toBeGreaterThanOrEqual(8);
      expect(r.ideas.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('banned copy lint and legal reply notes', () => {
    const t = JSON.stringify(REPERTOIRES).toLowerCase();
    for (const w of cfg.get<string[]>('copy.bannedWords')) expect(new RegExp(`\\b${w}\\b`).test(t), w).toBe(false);
  });
  it('cards exist only for the learner moves, with solution UCI, FSRS scheduler and a why', () => {
    const r = REPERTOIRES[0];
    const cards = cardsFor(r, 1000);
    expect(cards).toHaveLength(steps(r).filter((s) => s.node.byLearner).length);
    for (const c of cards) {
      expect(c.kind).toBe('opening');
      expect(c.why.length).toBeGreaterThan(5);
      expect(c.srs.scheduler).toBe('fsrs');
      expect(new Chess(c.fen!).moves({ verbose: true }).some((m) => m.lan === c.solution[0])).toBe(true);
    }
  });
  it('left-book detection on fixture games (docs/backend/06 §10)', () => {
    const g = (s: string) => s.split(' ');
    expect(leftBook(g('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O'), 'w')).toBeUndefined(); // stayed in book
    expect(leftBook(g('e4 e5 Nf3 Nc6 h3 Bc5'), 'w')).toMatchObject({
      repertoireId: 'w-italian',
      leftAt: 4,
      expected: 'Bc4',
      played: 'h3',
    });
    expect(leftBook(g('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 h6'), 'b')).toMatchObject({
      repertoireId: 'b-e5',
      leftAt: 9,
      expected: 'd6',
    });
    expect(leftBook(g('d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O'), 'b')).toBeUndefined();
    expect(leftBook(g('d4 d5 c4 c6'), 'b')).toMatchObject({ repertoireId: 'b-qgd', leftAt: 3, expected: 'e6' });
    expect(leftBook(g('e4 e5 Nf3 Nc6 Bb5'), 'b')).toBeUndefined(); // a listed common reply is not a deviation
    expect(leftBook(g('e4 e5 Nf3 Nc6 Bc4 Bc5 b4'), 'b')).toMatchObject({ oppDeviationAt: 6 });
    expect(leftBook(g('c4 e5'), 'b')).toBeUndefined(); // no repertoire for 1.c4
    expect(leftBook(g('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O'), 'w')).toBeUndefined();
  });
});
