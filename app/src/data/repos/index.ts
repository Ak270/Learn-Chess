// Intent-named repository functions. Callers never touch Dexie directly (docs/backend/02 §4).
import { db as defaultDb, type MentorDB } from '../db';
import { emit } from '../bus';
import { ulid } from '../ulid';
import type { Attempt, Card, Game, Mistake, PlyRecord, SkillEvidence } from '../../types/model';

export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function repos(db: MentorDB = defaultDb) {
  return {
    async addGame(
      g: Omit<Game, 'id' | 'importedAt'> & { id?: string; importedAt?: number },
    ): Promise<{ game: Game; duplicate: boolean }> {
      if (g.sourceId) {
        const existing = await db.games.where('[source+sourceId]').equals([g.source, g.sourceId]).first();
        if (existing) return { game: existing, duplicate: true };
      }
      const game: Game = { ...g, id: g.id ?? ulid(), importedAt: g.importedAt ?? Date.now() };
      await db.games.add(game);
      emit('game:added', game.id);
      return { game, duplicate: false };
    },
    getGame: (id: string) => db.games.get(id),
    gamesNewestFirst: (limit = 50) => db.games.orderBy('startedAt').reverse().limit(limit).toArray(),
    async savePlies(plies: PlyRecord[]) {
      await db.plies.bulkPut(plies);
    },
    pliesForGame: (gameId: string) => db.plies.where('gameId').equals(gameId).sortBy('ply'),
    async addMistake(m: Omit<Mistake, 'id'> & { id?: string }) {
      const mistake: Mistake = { ...m, id: m.id ?? ulid() };
      await db.mistakes.put(mistake);
      emit('mistake:added', mistake.id);
      return mistake;
    },
    mistakesForGame: (gameId: string) => db.mistakes.where('gameId').equals(gameId).sortBy('ply'),
    mistakeAt: (gameId: string, ply: number) => db.mistakes.where('[gameId+ply]').equals([gameId, ply]).first(),
    async addCard(c: Omit<Card, 'id' | 'createdAt'> & { id?: string }) {
      const card: Card = { ...c, id: c.id ?? ulid(), createdAt: Date.now() };
      await db.cards.put(card);
      return card;
    },
    dueCards: (now: number, limit = 50) =>
      db.cards
        .where('srs.dueAt')
        .belowOrEqual(now)
        .filter((c) => c.state !== 'suspended' && c.state !== 'cleared')
        .limit(limit)
        .toArray(),
    cardsBySkill: (skill: string) => db.cards.where('skillTags').equals(skill).toArray(),
    /** One transaction: attempt + its evidence + optional updated card (docs/backend/02 §4). */
    async recordAttempt(
      a: Omit<Attempt, 'id'> & { id?: string },
      evidence: Omit<SkillEvidence, 'id' | 'sourceRef'>[],
      card?: Card,
    ) {
      const attempt: Attempt = { ...a, id: a.id ?? ulid() };
      await db.transaction('rw', db.attempts, db.evidence, db.cards, async () => {
        await db.attempts.add(attempt);
        await db.evidence.bulkAdd(evidence.map((e) => ({ ...e, id: ulid(), sourceRef: { attemptId: attempt.id } })));
        if (card) await db.cards.put(card);
      });
      emit('attempt:added', attempt.id);
      return attempt;
    },
    attemptsSince: (at: number) => db.attempts.where('at').aboveOrEqual(at).toArray(),
    attemptsForSkill: (skill: string) => db.attempts.where('skillTags').equals(skill).toArray(),
  };
}
