import { mineMemories, type Memory, type MemoryData } from '../core/memory/miners';
import type { MentorDB } from '../data/db';
import type { GameReview } from '../types/model';

export function createCoachMemoryService(db: MentorDB) {
  async function dataset(limit = 20): Promise<MemoryData[]> {
    const games = (await db.games.filter((g) => !!g.reviewedAt).toArray())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
    const out: MemoryData[] = [];
    for (const game of games) {
      const review = (await db.kv.get(`review.v1:${game.id}`))?.value as GameReview | undefined;
      if (!review) continue;
      const plies = (await db.plies.where('gameId').equals(game.id).sortBy('ply')).filter(
        (p) => p.color === game.playerColor,
      );
      out.push({ game, review, plies, mistakes: await db.mistakes.where('gameId').equals(game.id).toArray() });
    }
    return out;
  }
  const dismissedKey = (k: string) => `memory.dismissed:${k}`;
  async function list(): Promise<(Memory & { firstSeen: number })[]> {
    const mined = mineMemories(await dataset());
    const out: (Memory & { firstSeen: number })[] = [];
    for (const m of mined) {
      if (await db.kv.get(dismissedKey(m.key))) continue;
      const seen = (await db.kv.get(`memory.seen:${m.key}`))?.value as number | undefined;
      const firstSeen = seen ?? Date.now();
      if (!seen) await db.kv.put({ key: `memory.seen:${m.key}`, value: firstSeen });
      out.push({ ...m, firstSeen });
    }
    return out;
  }
  const dismiss = (key: string) => db.kv.put({ key: dismissedKey(key), value: Date.now() });
  /** only active (undismissed) memories may be used by the teacher note or chat */
  const active = async () => (await list()).map((m) => m.text);
  return { list, dismiss, active, dataset };
}
export type CoachMemoryService = ReturnType<typeof createCoachMemoryService>;
