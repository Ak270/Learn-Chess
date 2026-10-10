// Single local database (docs/backend/02 §3). Only code in data/ may touch Dexie.
import Dexie, { type Table } from 'dexie';

export interface KV {
  key: string;
  value: unknown;
}

export class MentorDB extends Dexie {
  kv!: Table<KV, string>;
  constructor(name = 'mentor') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      games: 'id, [source+sourceId], startedAt, reviewedAt',
      plies: '[gameId+ply], gameId, cls, phase',
      mistakes: 'id, gameId, [gameId+ply], isFirstMeaningful, *skillTags',
      cards: 'id, kind, state, srs.dueAt, *skillTags',
      attempts: 'id, at, context, cardId, puzzleId, *skillTags',
      evidence: 'id, at, skill, layer',
      skills: 'skill',
      plans: 'id, date',
      streak: 'id',
      journal: 'id, at, kind',
      progress: 'id, kind',
      kv: 'key',
    });
  }
}
export const db = new MentorDB();
