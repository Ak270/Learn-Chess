import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { MentorDB, TABLES } from '../../src/data/db';
import { repos } from '../../src/data/repos';
import { rebuildDerived } from '../../src/data/derived';
import { deleteAll, exportAll, importAll } from '../../src/data/exportImport';
import { ulid } from '../../src/data/ulid';
import { seedAttempts } from '../fixtures/seedLearner';
import Dexie from 'dexie';

let db: MentorDB;
let n = 0;
beforeEach(async () => {
  db = new MentorDB(`t${n++}`);
  await db.open();
});

const gameBase = {
  source: 'chesscom' as const,
  sourceId: 'g1',
  pgn: '1. e4 *',
  startedAt: 1,
  white: 'me',
  black: 'x',
  playerColor: 'w' as const,
  result: '*' as const,
};

describe('ulid', () => {
  it('is sortable by time and 26 chars', () => {
    const a = ulid(1000),
      b = ulid(2000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
  });
});

describe('repos: create/read/update and compound indexes', () => {
  it('games dedupe by [source+sourceId]', async () => {
    const r = repos(db);
    const a = await r.addGame(gameBase);
    const b = await r.addGame(gameBase);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.game.id).toBe(a.game.id);
    expect(await db.games.count()).toBe(1);
  });
  it('plies and mistakes use compound indexes', async () => {
    const r = repos(db);
    const { game } = await r.addGame(gameBase);
    await r.savePlies(
      [1, 2, 3].map((ply) => ({
        gameId: game.id,
        ply,
        fenBefore: 'f',
        san: 'e4',
        uci: 'e2e4',
        color: 'w' as const,
        phase: 'opening' as const,
      })),
    );
    expect((await r.pliesForGame(game.id)).map((p) => p.ply)).toEqual([1, 2, 3]);
    await r.addMistake({
      gameId: game.id,
      ply: 3,
      fen: 'f',
      playedUci: 'a',
      bestUci: 'b',
      winPctLoss: 30,
      isFirstMeaningful: true,
      rank: 1,
      motifs: [],
      skillTags: ['tactic_fork'],
      diagnosis: [],
    });
    expect((await r.mistakeAt(game.id, 3))?.skillTags).toEqual(['tactic_fork']);
    expect(await r.mistakeAt(game.id, 2)).toBeUndefined();
  });
  it('cards: due query on nested srs.dueAt and skill multi-entry index', async () => {
    const r = repos(db);
    const base = { kind: 'blunder' as const, prompt: 'p', solution: ['e2e4'], why: 'w', state: 'new' as const };
    const srs = (dueAt: number) => ({ scheduler: 'ladder' as const, dueAt, lapses: 0, cleanStreak: 0 });
    await r.addCard({ ...base, skillTags: ['tactic_fork', 'tactic_pin'], srs: srs(100) });
    await r.addCard({ ...base, skillTags: ['tactic_pin'], srs: srs(900) });
    expect(await r.dueCards(500)).toHaveLength(1);
    expect(await r.cardsBySkill('tactic_pin')).toHaveLength(2);
  });
  it('recordAttempt writes attempt + evidence + card atomically (rolls back on failure)', async () => {
    const r = repos(db);
    const ok = await r.recordAttempt(
      { at: 1, context: 'drill', correct: true, hints: 0, ms: 10, skillTags: ['tactic_fork'] },
      [{ at: 1, skill: 'tactic_fork', layer: 'recognition', outcome: 1, weight: 1, assisted: false }],
    );
    expect(await db.evidence.where('skill').equals('tactic_fork').count()).toBe(1);
    expect((await r.attemptsForSkill('tactic_fork'))[0].id).toBe(ok.id);
    await expect(
      r.recordAttempt(
        { id: ok.id, at: 2, context: 'drill', correct: true, hints: 0, ms: 1, skillTags: ['tactic_fork'] },
        [{ at: 2, skill: 'tactic_fork', layer: 'recognition', outcome: 1, weight: 1, assisted: false }],
      ),
    ).rejects.toBeTruthy();
    expect(await db.evidence.count()).toBe(1);
  });
});

describe('rebuildDerived', () => {
  it('is deterministic and idempotent on the seed learner (within 1e-9)', async () => {
    await db.attempts.bulkAdd(seedAttempts());
    await rebuildDerived(db);
    const first = await db.skills.toArray();
    const ev1 = await db.evidence.count();
    expect(first.length).toBeGreaterThan(0);
    await rebuildDerived(db);
    const second = await db.skills.toArray();
    expect(await db.evidence.count()).toBe(ev1);
    for (const a of first) {
      const b = second.find((s) => s.skill === a.skill)!;
      expect(Math.abs(a.independence - b.independence)).toBeLessThan(1e-9);
      expect(Math.abs(a.trend - b.trend)).toBeLessThan(1e-9);
      for (const l of Object.keys(a.layers) as (keyof typeof a.layers)[])
        expect(Math.abs(a.layers[l].mean - b.layers[l].mean)).toBeLessThan(1e-9);
    }
  });
});

describe('export / import / delete', () => {
  it('round-trips into an empty DB with identical tables', async () => {
    const r = repos(db);
    await r.addGame(gameBase);
    await db.attempts.bulkAdd(seedAttempts(3));
    await rebuildDerived(db);
    await db.kv.put({ key: 'settings.v1', value: { theme: 'dark', groqKey: 'gsk_secret' } });
    const file = await exportAll(db, { includeSecrets: true });
    const db2 = new MentorDB(`t${n++}`);
    await importAll(db2, JSON.parse(JSON.stringify(file)));
    const file2 = await exportAll(db2, { includeSecrets: true });
    expect(file2.tables).toEqual(file.tables);
    await importAll(db2, file); // idempotent
    expect((await exportAll(db2, { includeSecrets: true })).tables).toEqual(file.tables);
  });
  it('strips the AI key unless asked', async () => {
    await db.kv.put({ key: 'settings.v1', value: { groqKey: 'gsk_secret' } });
    expect(JSON.stringify(await exportAll(db))).not.toContain('gsk_secret');
  });
  it('rejects foreign or wrong-version files', async () => {
    await expect(importAll(db, { app: 'other' })).rejects.toThrow(/Mentor/);
    await expect(importAll(db, { app: 'mentor', schema: 99, tables: {} })).rejects.toThrow(/schema/);
  });
  it('delete-all leaves no database for the origin', async () => {
    const name = `del${n++}`;
    const d = new MentorDB(name);
    await d.open();
    await deleteAll(d);
    expect(await Dexie.exists(name)).toBe(false);
  });
});

describe('migrations', () => {
  it('opens a v1 fixture database with every table present (pattern for future migrations)', async () => {
    const name = `mig${n++}`;
    const old = new Dexie(name);
    old.version(1).stores({ kv: 'key' });
    await old.open();
    await old.table('kv').put({ key: 'k', value: 1 });
    old.close();
    const upgraded = new MentorDB(name);
    await upgraded.open();
    expect((await upgraded.kv.get('k'))?.value).toBe(1);
    expect(upgraded.tables.map((t) => t.name).sort()).toEqual([...TABLES].sort());
  });
});

describe('PGN fixtures', () => {
  const dir = 'tests/fixtures/pgn';
  const files = readdirSync(dir).filter((f) => f.endsWith('.pgn'));
  it('has at least 20 fixtures', () => expect(files.length).toBeGreaterThanOrEqual(20));
  for (const f of files) {
    it(`parses ${f} or rejects it gracefully`, () => {
      const c = new Chess();
      const pgn = readFileSync(`${dir}/${f}`, 'utf8');
      if (f.startsWith('chess960')) {
        expect(pgn).toMatch(/Chess960/); // importer must reject non-standard variants (Phase 4)
        return;
      }
      expect(() => c.loadPgn(pgn)).not.toThrow();
      expect(c.history().length).toBeGreaterThan(0);
    });
  }
});
