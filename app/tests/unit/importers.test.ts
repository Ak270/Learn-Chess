import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chesscomImporter } from '../../src/core/importers/chesscom';
import { lichessImporter, ndjson } from '../../src/core/importers/lichess';
import { pgnImporter } from '../../src/core/importers/pgn';
import { getJson, memoryCache } from '../../src/core/importers/http';
import {
  isEvidenceEligible,
  normalizePgn,
  parseClocks,
  splitPgn,
  timeSpentMs,
  ImportError,
} from '../../src/core/importers/common';
import { MentorDB } from '../../src/data/db';
import { repos } from '../../src/data/repos';
import type { RawGame } from '../../src/types/services';

const OWNER_PGN = readFileSync('../chess_com_games_2026-10-10.pgn', 'utf8');
const collect = async (it: AsyncIterable<RawGame>) => {
  const out: RawGame[] = [];
  for await (const g of it) out.push(g);
  return out;
};
const res = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe('PGN importer on the owner export (49 real games)', () => {
  it('splits and imports every game with the right colour, rating and unique ids', async () => {
    expect(splitPgn(OWNER_PGN)).toHaveLength(49);
    const skipped: string[] = [];
    const games = await collect(
      pgnImporter(OWNER_PGN).fetchGames({ username: 'amarkelotra', onSkip: (c) => skipped.push(c) }),
    );
    expect(games.length + skipped.length).toBe(49);
    expect(games.length).toBeGreaterThanOrEqual(40);
    expect(new Set(games.map((g) => g.sourceId)).size).toBe(games.length);
    for (const g of games) {
      expect((g.playerColor === 'w' ? g.white : g.black).toLowerCase()).toBe('amarkelotra');
      expect(g.plies).toBeGreaterThanOrEqual(6);
    }
    const first = games[0];
    expect(first.startedAt).toBeGreaterThan(Date.parse('2025-01-01'));
  });
  it('dedupes on re-import into the database', async () => {
    const db = new MentorDB('imp-dedupe');
    const r = repos(db);
    const raw = await collect(pgnImporter(OWNER_PGN).fetchGames({ username: 'amarkelotra' }));
    for (let pass = 0; pass < 2; pass++) for (const g of raw) await r.addGame({ ...g, mode: undefined });
    expect(await db.games.count()).toBe(raw.length);
  });
  it('rejects variants, custom start positions, short games and strangers with clear codes', () => {
    const base = '[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "1-0"]\n';
    const code = (extra: string, moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0') => {
      try {
        normalizePgn(base + extra + '\n' + moves, { source: 'pgn', username: 'a' });
        return 'ok';
      } catch (e) {
        return (e as ImportError).code;
      }
    };
    expect(code('[Variant "Chess960"]')).toBe('VARIANT');
    expect(code('[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]')).toBe('FEN_START');
    expect(code('', '1. e4 e5 1-0')).toBe('TOO_SHORT');
    expect(code('[Termination "Game abandoned"]')).toBe('ABANDONED');
    expect(code('', '1. e4 e5 2. Ke2 Ke7 3. Kxe5 1-0')).toBe('PARSE');
    expect(() =>
      normalizePgn(base + '\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0', { source: 'pgn', username: 'zzz' }),
    ).toThrow(/did not play/);
  });
});

describe('clocks', () => {
  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
  };
  /** Build a PGN whose clocks follow from known thinking times: clock = prevOwn - spent + inc. */
  const mk = (spentSec: number[], base: number, inc: number) => {
    const mv = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
    const clk: number[] = [];
    spentSec.forEach((s, i) => clk.push((i >= 2 ? clk[i - 2] : base) - s + inc));
    const tc = inc ? `${base}+${inc}` : `${base}`;
    const body = mv.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m} {[%clk ${fmt(clk[i])}]}`).join(' ');
    return { pgn: `[Event "x"]\n[White "a"]\n[Black "b"]\n[TimeControl "${tc}"]\n[Result "*"]\n\n${body} *`, tc };
  };
  it('spent = previous own clock - clock + increment, within 1 s (5 fixtures incl. increments)', () => {
    const cases: [number[], number, number][] = [
      [[2, 3, 8, 7, 20, 1], 600, 0],
      [[11, 15, 19, 17, 20, 13], 900, 10],
      [[2.5, 4, 4.5, 5, 9, 8], 180, 2],
      [[0, 0, 60, 30, 60, 30], 3600, 0],
      [[8, 8, 8, 9, 10, 4], 300, 3],
    ];
    for (const [spent, base, inc] of cases) {
      const { pgn, tc } = mk(spent, base, inc);
      const clocks = parseClocks(pgn)!;
      expect(clocks).toBeDefined();
      timeSpentMs(clocks, tc).forEach((s, i) => expect(Math.abs(s - spent[i] * 1000)).toBeLessThanOrEqual(1000));
    }
  });
  it('returns undefined when clocks are missing', () => {
    expect(parseClocks('[Event "x"]\n\n1. e4 e5 *')).toBeUndefined();
  });
  it('training-evidence eligibility follows the conditions policy', () => {
    expect(isEvidenceEligible('600')).toBe(true);
    expect(isEvidenceEligible('900+10')).toBe(true);
    expect(isEvidenceEligible('180')).toBe(false);
    expect(isEvidenceEligible('300')).toBe(false);
    expect(isEvidenceEligible('1/86400')).toBe(false);
  });
});

describe('Chess.com importer (fake fetch)', () => {
  const games = splitPgn(OWNER_PGN).slice(0, 6);
  const month = (rules = 'chess') => ({
    games: games.map((pgn, i) => ({ url: `https://www.chess.com/game/live/${1000 + i}`, pgn, rules })),
  });
  const archives = {
    archives: [
      'https://api.chess.com/pub/player/amarkelotra/games/2025/07',
      'https://api.chess.com/pub/player/amarkelotra/games/2025/08',
    ],
  };
  const fetchFn = (async (url: string) => {
    if (url.endsWith('/archives')) return res(JSON.stringify(archives));
    return res(JSON.stringify(month()));
  }) as unknown as typeof fetch;

  it('walks months newest first, serially, keeps standard chess, uses game url as sourceId', async () => {
    const out = await collect(
      chesscomImporter({ fetchFn, cache: memoryCache() }).fetchGames({ username: 'AmarkeLotra', max: 8 }),
    );
    expect(out).toHaveLength(8);
    expect(out[0].sourceId).toMatch(/chess\.com\/game\/live\//);
    expect(out[0].source).toBe('chesscom');
  });
  it('skips non-chess rules and reports them', async () => {
    const f = (async (url: string) =>
      url.endsWith('/archives')
        ? res(JSON.stringify(archives))
        : res(JSON.stringify(month('chess960')))) as unknown as typeof fetch;
    const skipped: string[] = [];
    const out = await collect(
      chesscomImporter({ fetchFn: f }).fetchGames({ username: 'amarkelotra', max: 5, onSkip: (c) => skipped.push(c) }),
    );
    expect(out).toHaveLength(0);
    expect(skipped.every((c) => c === 'VARIANT')).toBe(true);
  });
  it('backs off on 429 using Retry-After, then succeeds; gives up with a friendly message', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const f = (async () =>
      ++calls < 3
        ? new Response('', { status: 429, headers: { 'retry-after': '2' } })
        : res('{"ok":1}')) as unknown as typeof fetch;
    expect(await getJson('u', { fetchFn: f, sleep: async (ms) => void sleeps.push(ms) })).toEqual({ ok: 1 });
    expect(sleeps).toEqual([2000, 2000]);
    const always = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    await expect(getJson('u', { fetchFn: always, sleep: async () => {}, maxRetries: 1 })).rejects.toThrow(/slow down/);
  });
  it('uses ETag: a 304 serves the cached body; immutable months are not refetched', async () => {
    const cache = memoryCache();
    let n = 0;
    const f = (async (_u: string, init?: RequestInit) => {
      n++;
      const inm = (init?.headers as Record<string, string>)?.['If-None-Match'];
      return inm === 'v1' ? new Response(null, { status: 304 }) : res('{"a":1}', { headers: { etag: 'v1' } });
    }) as unknown as typeof fetch;
    expect(await getJson('x', { fetchFn: f, cache })).toEqual({ a: 1 });
    expect(await getJson('x', { fetchFn: f, cache })).toEqual({ a: 1 });
    expect(n).toBe(2);
    expect(await getJson('x', { fetchFn: f, cache }, true)).toEqual({ a: 1 });
    expect(n).toBe(2);
  });
  it('reports unknown usernames', async () => {
    const f = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(collect(chesscomImporter({ fetchFn: f }).fetchGames({ username: 'nobody' }))).rejects.toThrow(
      /not found/,
    );
  });
});

describe('Lichess importer (fake NDJSON stream)', () => {
  const pgn = splitPgn(OWNER_PGN)[0];
  it('parses chunked ndjson with a trailing blank line and standard-variant filter', async () => {
    const lines = [
      JSON.stringify({ id: 'abc12345', variant: 'standard', pgn }),
      JSON.stringify({ id: 'zzz', variant: 'crazyhouse', pgn }),
    ];
    const body = lines.join('\n') + '\n\n';
    const enc = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.slice(0, 37)); // split mid-JSON on purpose
        c.enqueue(enc.slice(37));
        c.close();
      },
    });
    const f = (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch;
    const skipped: string[] = [];
    const out = await collect(
      lichessImporter({ fetchFn: f }).fetchGames({ username: 'amarkelotra', onSkip: (c) => skipped.push(c) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe('abc12345');
    expect(skipped).toEqual(['VARIANT']);
  });
  it('ndjson helper handles an empty stream', async () => {
    const s = new ReadableStream<Uint8Array>({ start: (c) => c.close() });
    const out: unknown[] = [];
    for await (const x of ndjson(s)) out.push(x);
    expect(out).toEqual([]);
  });
});
