// PGN splitting, validation, header + clock extraction (docs/backend/04 §2.3-2.4).
import { Chess } from 'chess.js';
import { cfg } from '../../config';
import type { RawGame } from '../../types/services';

export class ImportError extends Error {
  constructor(
    public code: 'VARIANT' | 'FEN_START' | 'TOO_SHORT' | 'ABANDONED' | 'PARSE' | 'TOO_BIG' | 'NOT_PLAYER',
    message: string,
  ) {
    super(message);
  }
}

export function splitPgn(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n(?=\[Event )/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('['));
}

export function headersOf(pgn: string): Record<string, string> {
  const h: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/gm)) h[m[1]] = m[2];
  return h;
}

/** "900+10" -> {base:900, inc:10}; "600" -> {600,0}; "1/86400" (daily) -> undefined */
export function parseTimeControl(tc?: string): { base: number; inc: number } | undefined {
  const m = tc?.match(/^(\d+)(?:\+(\d+))?$/);
  return m ? { base: +m[1], inc: m[2] ? +m[2] : 0 } : undefined;
}

export function isEvidenceEligible(tc?: string): boolean {
  const t = parseTimeControl(tc);
  if (!t) return false;
  const equiv = t.base + 40 * t.inc;
  return t.base >= cfg.get('evidence.minBaseSeconds') || equiv >= cfg.get('evidence.minEquivalentSeconds');
}

const clkRe = /\[%clk (\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]/;
const toSec = (h: string, m: string, s: string) => +h * 3600 + +m * 60 + +s;

/** Clock readings (seconds remaining after each ply), when the PGN carries %clk comments for every ply. */
export function parseClocks(pgn: string): number[] | undefined {
  const c = new Chess();
  try {
    c.loadPgn(pgn);
  } catch {
    return undefined;
  }
  const comments = c.getComments();
  const plies = c.history().length;
  const byPly: (number | undefined)[] = new Array(plies).fill(undefined);
  const replay = new Chess();
  const hist = c.history();
  for (let i = 0; i < plies; i++) {
    replay.move(hist[i]);
    const cm = comments.find((x) => x.fen === replay.fen());
    const m = cm?.comment.match(clkRe);
    if (m) byPly[i] = toSec(m[1], m[2], m[3]);
  }
  return byPly.every((x) => x !== undefined) && plies > 0 ? (byPly as number[]) : undefined;
}

/** spent = prevClock - clock + increment (docs/backend/04 §9). First move of each side starts from the base time. */
export function timeSpentMs(clocks: number[], tc?: string): number[] {
  const t = parseTimeControl(tc);
  const out: number[] = [];
  for (let i = 0; i < clocks.length; i++) {
    const prev = i >= 2 ? clocks[i - 2] : t?.base;
    out.push(prev === undefined ? 0 : Math.max(0, Math.round((prev - clocks[i] + (t?.inc ?? 0)) * 1000)));
  }
  return out;
}

/** Stable 32-bit FNV-1a hash -> base36; used to dedupe exports that carry no unique game link. */
export function stableHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

export function startedAtOf(h: Record<string, string>): number {
  const d = (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-');
  const t = (h.UTCTime ?? h.StartTime ?? h.EndTime ?? '00:00:00').replace(/ GMT.*$/, '');
  const ms = Date.parse(`${d}T${t}Z`);
  return Number.isFinite(ms) ? ms : 0;
}

const movetext = (pgn: string) =>
  pgn
    .replace(/^\[.*\]\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface NormalizeOpts {
  source: RawGame['source'];
  sourceId?: string;
  username?: string;
  /** both names of the learner on this platform (case-insensitive) */
  usernames?: string[];
}

/** Validate one PGN game and turn it into a RawGame; throws ImportError with a user-facing reason. */
export function normalizePgn(pgn: string, o: NormalizeOpts): RawGame {
  const maxBytes = cfg.get('importer.pgnMaxBytes');
  if (pgn.length > maxBytes) throw new ImportError('TOO_BIG', 'This game is too large to import.');
  const h = headersOf(pgn);
  if (h.Variant && !/^(standard|chess)$/i.test(h.Variant))
    throw new ImportError('VARIANT', `Variant "${h.Variant}" is not supported yet.`);
  if (h.SetUp === '1' || h.FEN)
    throw new ImportError('FEN_START', 'Games that start from a custom position are not supported yet.');
  const term = (h.Termination ?? '').toLowerCase();
  if (cfg.get<string[]>('import.skipTerminations').some((k) => term.includes(k)))
    throw new ImportError('ABANDONED', 'Abandoned or aborted game.');
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    throw new ImportError('PARSE', 'This game could not be read.');
  }
  const plies = chess.history().length;
  if (plies < cfg.get('import.minPlies')) throw new ImportError('TOO_SHORT', 'Too short to learn from.');
  const names = (o.usernames ?? (o.username ? [o.username] : [])).map((n) => n.toLowerCase());
  const white = h.White ?? '?';
  const black = h.Black ?? '?';
  let playerColor: 'w' | 'b' | undefined;
  if (names.includes(white.toLowerCase())) playerColor = 'w';
  else if (names.includes(black.toLowerCase())) playerColor = 'b';
  else if (names.length) throw new ImportError('NOT_PLAYER', 'The learner did not play this game.');
  const result = (['1-0', '0-1', '1/2-1/2'].includes(h.Result) ? h.Result : '*') as RawGame['result'];
  const clocks = parseClocks(pgn);
  const rating = (k: string) => (h[k] && /^\d+$/.test(h[k]) ? +h[k] : undefined);
  return {
    source: o.source,
    sourceId:
      o.sourceId ??
      h.Link ??
      `${o.source}:${stableHash([white, black, h.Date, h.UTCDate, h.EndTime, h.UTCTime, movetext(pgn)].join('|'))}`,
    pgn,
    white,
    black,
    playerColor: playerColor ?? 'w',
    result,
    startedAt: startedAtOf(h),
    timeControl: h.TimeControl,
    termination: h.Termination,
    whiteRating: rating('WhiteElo'),
    blackRating: rating('BlackElo'),
    clocks,
    plies,
  };
}
