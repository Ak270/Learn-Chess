// Misconception states from real-game hits (docs/backend/10 §1.3). Active when minOccurrences hits fall within
// windowGames; resolved after RESOLVE_GAMES games without recurrence. Learner-facing copy is never accusatory.
import { cfg } from '../config';
import catalogue from '../content/misconceptions.json';
import type { MentorDB } from '../data/db';
import type { SkillId } from '../types/ids';

export interface MisconceptionDef {
  id: string;
  title: string;
  belief: string;
  truth: string;
  detectors: string[];
  minOccurrences: number;
  windowGames: number;
  skill: SkillId;
  lessonId: string;
  learnerPhrase: string;
}
export interface MisconceptionState {
  id: string;
  status: 'watching' | 'active' | 'resolved';
  hits: { gameId: string; ply: number }[];
  activatedAt?: number;
  resolvedAt?: number;
}
export const DEFS = catalogue.misconceptions as unknown as MisconceptionDef[];
export const RESOLVE_GAMES = 10; // docs/backend/10 §1.3 "resolved after 10 games without recurrence"
void cfg;

export function createMisconceptionService(db: MentorDB, now: () => number = Date.now) {
  const key = (id: string) => `misconception:${id}`;
  const get = async (id: string) =>
    ((await db.kv.get(key(id)))?.value as MisconceptionState | undefined) ?? {
      id,
      status: 'watching' as const,
      hits: [],
    };

  /** Recompute every state from the stored plies of the most recent reviewed games (newest first). */
  async function evaluate(): Promise<MisconceptionState[]> {
    const games = (await db.games.filter((g) => !!g.reviewedAt).toArray()).sort((a, b) => b.startedAt - a.startedAt);
    const out: MisconceptionState[] = [];
    for (const d of DEFS) {
      const prev = await get(d.id);
      const hits: MisconceptionState['hits'] = [];
      const hitGames: number[] = [];
      for (let gi = 0; gi < games.length; gi++) {
        const g = games[gi];
        const plies = await db.plies.where('gameId').equals(g.id).toArray();
        for (const p of plies)
          if (p.color === g.playerColor && p.motifs?.some((m) => d.detectors.includes(m.id))) {
            hits.push({ gameId: g.id, ply: p.ply });
            if (!hitGames.includes(gi)) hitGames.push(gi);
          }
      }
      const inWindow = hits.filter((h) => games.findIndex((g) => g.id === h.gameId) < d.windowGames);
      const lastHitGame = hitGames.length ? Math.min(...hitGames) : Infinity;
      let status: MisconceptionState['status'] = 'watching';
      if (inWindow.length >= d.minOccurrences) status = 'active';
      else if (prev.status !== 'watching' && lastHitGame >= RESOLVE_GAMES) status = 'resolved';
      else if (prev.status === 'active' && lastHitGame < RESOLVE_GAMES) status = 'active';
      const st: MisconceptionState = {
        id: d.id,
        status,
        hits,
        activatedAt: status === 'active' ? (prev.activatedAt ?? now()) : prev.activatedAt,
        resolvedAt: status === 'resolved' ? (prev.resolvedAt ?? now()) : undefined,
      };
      await db.kv.put({ key: key(d.id), value: st });
      out.push(st);
    }
    return out;
  }

  const states = async () => Promise.all(DEFS.map((d) => get(d.id)));
  const activeSkills = async (): Promise<SkillId[]> => {
    const st = await states();
    return DEFS.filter((d) => st.find((s) => s.id === d.id)?.status === 'active').map((d) => d.skill);
  };
  return { evaluate, states, activeSkills, defs: DEFS };
}
export type MisconceptionService = ReturnType<typeof createMisconceptionService>;
