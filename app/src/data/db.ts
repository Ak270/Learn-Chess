// Single local database (docs/backend/02 §3). Only code in data/ may touch Dexie.
import Dexie, { type Table } from 'dexie';
import type {
  Attempt,
  Card,
  ContentProgress,
  Game,
  Journal,
  KV,
  Mistake,
  PlyRecord,
  Profile,
  SessionPlan,
  SkillEvidence,
  SkillState,
  Streak,
} from '../types/model';

export const SCHEMA_VERSION = 1;
export const TABLES = [
  'profile',
  'games',
  'plies',
  'mistakes',
  'cards',
  'attempts',
  'evidence',
  'skills',
  'plans',
  'streak',
  'journal',
  'progress',
  'kv',
] as const;
export type TableName = (typeof TABLES)[number];

export class MentorDB extends Dexie {
  profile!: Table<Profile, string>;
  games!: Table<Game, string>;
  plies!: Table<PlyRecord, [string, number]>;
  mistakes!: Table<Mistake, string>;
  cards!: Table<Card, string>;
  attempts!: Table<Attempt, string>;
  evidence!: Table<SkillEvidence, string>;
  skills!: Table<SkillState, string>;
  plans!: Table<SessionPlan, string>;
  streak!: Table<Streak, string>;
  journal!: Table<Journal, string>;
  progress!: Table<ContentProgress, string>;
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
