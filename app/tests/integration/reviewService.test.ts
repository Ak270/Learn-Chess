import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEngineClient } from '../../src/core/engine/engineClient';
import { MentorDB } from '../../src/data/db';
import { repos } from '../../src/data/repos';
import { createReviewService } from '../../src/services/ReviewService';
import { pgnImporter } from '../../src/core/importers/pgn';
import type { EngineClient, RawGame } from '../../src/types/services';
import { nodeTransport } from '../helpers/nodeEngine';

const SAMPLE = `[Event "sample"]\n[White "You"]\n[Black "Rita"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 6. Bg5 h6 7. Bxf6 Qxf6 8. Nc3 Bg4 9. h3 Bh5 10. g4 Bg6 11. Nh4 Qxh4 12. Nd5 Qd8 13. Nxc7+ Qxc7 14. Bb5 a6 0-1`;
const engine = createEngineClient(nodeTransport, { hashMb: 16 });
const counting = (e: EngineClient) => {
  let n = 0;
  return {
    n: () => n,
    client: {
      ...e,
      init: e.init.bind(e),
      stop: e.stop.bind(e),
      dispose: e.dispose.bind(e),
      analyse: async (...a: Parameters<EngineClient['analyse']>) => {
        n++;
        return e.analyse(...a);
      },
    } as EngineClient,
  };
};
async function load(db: MentorDB, pgn: string, user: string) {
  const out: RawGame[] = [];
  for await (const g of pgnImporter(pgn).fetchGames({ username: user })) out.push(g);
  const ids: string[] = [];
  for (const g of out) ids.push((await repos(db).addGame(g)).game.id);
  return ids;
}
const drain = async (it: AsyncIterable<unknown>) => {
  for await (const x of it) void x;
};

describe('ReviewService on the prototype sample game', () => {
  it('produces first meaningful mistake at ply 21, a Blunder Box card, evidence, diagnosis and a summary', async () => {
    const db = new MentorDB('rs1');
    const [id] = await load(db, SAMPLE, 'You');
    const svc = createReviewService({ db, engine });
    const stages: string[] = [];
    for await (const p of svc.reviewGame(id, { depth: 12 })) stages.push(p.stage);
    expect(stages[0]).toBe('queued');
    expect(stages.at(-1)).toBe('done');
    expect(new Set(stages)).toEqual(new Set(['queued', 'engine', 'select', 'save', 'done']));

    const review = (await svc.getReview(id))!;
    expect(review.firstMeaningfulPly).toBe(21);
    expect(review.mistakeIds.length).toBeLessThanOrEqual(3);
    const ms = await repos(db).mistakesForGame(id);
    const first = ms.find((m) => m.isFirstMeaningful)!;
    expect(first.ply).toBe(21);
    expect(first.refutationUci).toBe('f6h4');
    expect(first.skillTags).toContain('piece_safety');
    expect(first.diagnosis.length).toBeGreaterThan(0);
    expect(first.diagnosis.every((h) => h.signals.length > 0)).toBe(true);
    // ≤ 1 identical skill tag unless expanded
    const tags = ms.map((m) => m.skillTags[0]);
    expect(new Set(tags).size).toBe(tags.length);

    const card = await db.cards.get(first.cardId!);
    expect(card?.kind).toBe('blunder');
    expect(card?.fen).toBe(first.fen);
    expect(card?.solution).toEqual([first.bestUci]);
    expect(card?.solution[0]).not.toBe('h2h4'); // not the blunder itself
    expect(
      (await db.evidence.toArray()).some(
        (e) => e.skill === 'piece_safety' && e.layer === 'transfer' && e.outcome === 0,
      ),
    ).toBe(true);
    expect(review.accuracy).toBeGreaterThan(0);
    expect(review.phaseGrades.middlegame).toBe('Costly');
    expect(review.whiteWinPct.length).toBe(29);
    expect((await db.games.get(id))?.reviewedAt).toBeTruthy();
  }, 120000);

  it('resumes without re-running the engine for finished positions, and re-review does not duplicate cards', async () => {
    const db = new MentorDB('rs2');
    const [id] = await load(db, SAMPLE, 'You');
    const c1 = counting(engine);
    const svc1 = createReviewService({ db, engine: c1.client });
    await drain(svc1.reviewGame(id, { depth: 12 }));
    const firstRunCalls = c1.n();
    expect(firstRunCalls).toBeGreaterThan(20);
    const cards = await db.cards.count();
    // "kill the tab": new service instance, same database
    const c2 = counting(engine);
    const svc2 = createReviewService({ db, engine: c2.client });
    await drain(svc2.reviewGame(id, { depth: 12 }));
    expect(c2.n()).toBe(0); // every position was served from the persisted cache: no engine work repeated
    expect(await db.cards.count()).toBe(cards); // and nothing duplicates
    expect(await db.kv.where('key').startsWith('eval:').count()).toBeGreaterThan(20);
  }, 120000);

  it('cancel leaves nothing half-written', async () => {
    const db = new MentorDB('rs3');
    const [id] = await load(db, SAMPLE, 'You');
    const svc = createReviewService({ db, engine });
    const signal = { cancelled: true };
    await drain(svc.reviewGame(id, { depth: 8, signal }));
    expect(await svc.isReviewed(id)).toBe(false);
    expect(await db.plies.count()).toBe(0);
  }, 60000);

  it('reviews every importable owner game without errors and respects the <=3 mistakes / distinct-tag rule', async () => {
    const db = new MentorDB('rs4');
    const ids = (await load(db, readFileSync('../chess_com_games_2026-10-10.pgn', 'utf8'), 'amarkelotra')).slice(0, 8);
    const svc = createReviewService({ db, engine });
    for (const id of ids) {
      await drain(svc.reviewGame(id, { depth: 10 }));
      const ms = await repos(db).mistakesForGame(id);
      expect(ms.length).toBeLessThanOrEqual(3);
      const tags = ms.map((m) => m.skillTags[0]);
      expect(new Set(tags).size).toBe(tags.length);
      expect(ms.filter((m) => m.isFirstMeaningful).length).toBeLessThanOrEqual(1);
    }
  }, 300000);
});
