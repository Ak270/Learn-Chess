import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import games from '../../src/content/modelGames.json';
import { words } from '../../src/core/content/validate';
import { SKILL_IDS } from '../../src/types/ids';

describe('model games (docs/backend/06 §7)', () => {
  it('are legal, end as stated, and every pause sits inside the game with a short reveal', () => {
    expect(games.games.length).toBeGreaterThanOrEqual(3);
    for (const g of games.games) {
      const c = new Chess();
      c.loadPgn(g.pgn);
      expect(c.isCheckmate(), g.id).toBe(true);
      expect(SKILL_IDS as readonly string[]).toContain(g.skill);
      const n = c.history().length;
      for (const p of g.pauses) {
        expect(p.ply).toBeGreaterThan(0);
        expect(p.ply).toBeLessThan(n);
        expect(p.ply % 2, `${g.id} ply ${p.ply}: a pause must come before a White move`).toBe(0);
        expect(words(p.reveal).length).toBeLessThanOrEqual(60);
        expect(p.ideas.length).toBeGreaterThan(0);
      }
    }
  });
});
