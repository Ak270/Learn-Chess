// Lessons + puzzle shards + progress (docs/backend/06). Shards load lazily from /content/puzzles and are cached by the browser.
import { cfg } from '../config';
import { LESSONS } from '../core/content/lessons';
import {
  BANDS,
  bandFor,
  eloUpdate,
  pickNearest,
  toPuzzleView,
  type PuzzleView,
  type RawPuzzle,
} from '../core/content/puzzles';
import type { MentorDB } from '../data/db';
import type { SkillId } from '../types/ids';
import type { ContentIndex } from '../core/planner/plan';

interface Shard {
  provenance: { source: string; license: string };
  puzzles: RawPuzzle[];
}
const base = () => `${import.meta.env.BASE_URL}content/puzzles`;

export function createContentService(
  db: MentorDB,
  now: () => number = Date.now,
  fetchFn: typeof fetch = (...a) => fetch(...a),
) {
  const shards = new Map<string, Promise<Shard | undefined>>();
  let counts: Record<string, Record<string, number>> | undefined;

  async function loadCounts() {
    if (counts) return counts;
    try {
      const r = await fetchFn(`${base()}/index.json`);
      counts = r.ok ? ((await r.json()) as { counts: Record<string, Record<string, number>> }).counts : {};
    } catch {
      counts = {};
    }
    return counts;
  }
  const loadShard = (skill: string, band: string) => {
    const key = `${skill}/${band}`;
    if (!shards.has(key))
      shards.set(
        key,
        fetchFn(`${base()}/${skill}/${band}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<Shard>) : undefined))
          .catch(() => undefined),
      );
    return shards.get(key)!;
  };

  async function index(): Promise<ContentIndex> {
    const seen = new Set(
      (
        await db.progress
          .where('kind')
          .equals('lesson')
          .filter((p) => p.state === 'done')
          .toArray()
      ).map((p) => p.id),
    );
    const c = await loadCounts();
    return {
      lessons: LESSONS.map((l) => ({
        id: l.id,
        skill: l.skills[0] as SkillId,
        minutes: l.minutes,
        seen: seen.has(l.id),
        phase: l.phase,
      })),
      puzzleCounts: Object.fromEntries(
        Object.entries(c).map(([s, bands]) => [s, Object.values(bands).reduce((a, b) => a + b, 0)]),
      ),
    };
  }

  const puzzleElo = async () =>
    ((await db.kv.get('puzzle.elo'))?.value as number | undefined) ?? cfg.get<number>('puzzle.startElo');

  /** Next puzzle for a skill near the learner's puzzle rating, avoiding recently seen ones (docs/backend/06 §2.3). */
  async function nextPuzzle(o: {
    skill: SkillId;
    targetRating?: number;
    excludeIds?: string[];
  }): Promise<PuzzleView | undefined> {
    const target = o.targetRating ?? (await puzzleElo());
    const band = bandFor(target);
    const order = [
      band,
      ...BANDS.filter((b) => b !== band).sort(
        (a, b) => Math.abs(BANDS.indexOf(a) - BANDS.indexOf(band)) - Math.abs(BANDS.indexOf(b) - BANDS.indexOf(band)),
      ),
    ];
    const recent = new Set([
      ...(o.excludeIds ?? []),
      ...(((await db.kv.get(`puzzle.seen:${o.skill}`))?.value as string[]) ?? []),
    ]);
    for (const b of order) {
      const sh = await loadShard(o.skill, b);
      const p = sh && pickNearest(sh.puzzles, target, recent);
      if (p) {
        const seen = [...recent, p.id].slice(-200);
        await db.kv.put({ key: `puzzle.seen:${o.skill}`, value: seen });
        return toPuzzleView(p, o.skill);
      }
    }
    return undefined;
  }

  async function recordPuzzleResult(rating: number, solved: boolean) {
    const r = eloUpdate(await puzzleElo(), rating, solved, cfg.get<number>('session.eloK'));
    await db.kv.put({ key: 'puzzle.elo', value: r });
    return r;
  }

  async function markLesson(id: string, state: 'seen' | 'done', score?: number) {
    await db.progress.put({ id, kind: 'lesson', state, at: now(), score });
  }
  const lessonState = async (id: string) => (await db.progress.get(id))?.state ?? 'new';

  return { index, nextPuzzle, recordPuzzleResult, puzzleElo, markLesson, lessonState, loadCounts };
}
export type ContentService = ReturnType<typeof createContentService>;
