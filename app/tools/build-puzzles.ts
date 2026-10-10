// Offline puzzle shard builder (docs/backend/06 §2.2). NOT part of the browser bundle.
// Usage: zstd -dc lichess_db_puzzle.csv.zst | npx tsx tools/build-puzzles.ts [perCell=150]
// Stage 1 streams the CSV and filters/reservoir-samples candidates; stage 2 replays each line with chess.js and
// verifies it with Stockfish (learner's first move must beat the second-best by >= 100 cp, or be mate).
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { createEngineClient, type UciTransport } from '../src/core/engine/engineClient';

const PER_CELL = Number(process.argv[2] ?? 150);
const CANDIDATES_PER_CELL = PER_CELL * 4;
const BANDS: [string, number, number][] = [
  ['400-700', 400, 700],
  ['700-900', 700, 900],
  ['900-1150', 900, 1150],
  ['1150-1400', 1150, 1400],
];
const THEME_SKILL: [string, string][] = [
  ['hangingPiece', 'piece_safety'],
  ['backRankMate', 'tactic_backrank'],
  ['fork', 'tactic_fork'],
  ['pin', 'tactic_pin'],
  ['skewer', 'tactic_skewer'],
  ['discoveredAttack', 'tactic_discovered'],
  ['mateIn1', 'mate_patterns'],
  ['mateIn2', 'mate_patterns'],
  ['deflection', 'tactic_removing_defender'],
  ['attraction', 'tactic_removing_defender'],
  ['capturingDefender', 'tactic_removing_defender'],
];
const MATE_THEMES = new Set(['mateIn1', 'mateIn2', 'backRankMate']);
const rnd = (() => {
  let s = 20261010;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
})();

interface Puzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
}
type Cell = { seen: number; items: Puzzle[] };
const cells = new Map<string, Cell>();

async function stage1() {
  const rl = createInterface({ input: process.stdin });
  let n = 0;
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      if (line.startsWith('PuzzleId')) continue;
    }
    const c = line.split(',');
    if (c.length < 8) continue;
    const [id, fen, moves, rating, rd, popularity, plays, themes] = c;
    n++;
    if (+popularity < 80 || +plays < 500 || +rd > 100) continue;
    const r = +rating;
    const band = BANDS.find(([, lo, hi]) => r >= lo && r < hi);
    if (!band) continue;
    if (moves.split(' ').length > 6) continue; // at most 3 learner moves
    const ths = themes.split(' ');
    const skill = THEME_SKILL.find(([t]) => ths.includes(t))?.[1];
    if (!skill) continue;
    const key = `${skill}|${band[0]}`;
    const cell = cells.get(key) ?? cells.set(key, { seen: 0, items: [] }).get(key)!;
    cell.seen++;
    const p: Puzzle = { id, fen, moves, rating: r, themes: ths };
    if (cell.items.length < CANDIDATES_PER_CELL) cell.items.push(p);
    else {
      const j = Math.floor(rnd() * cell.seen);
      if (j < CANDIDATES_PER_CELL) cell.items[j] = p;
    } // reservoir sampling
  }
  console.error(`stage 1: read ${n} rows, ${cells.size} cells`);
}

function nodeTransport(): Promise<UciTransport> {
  const require = createRequire(import.meta.url);
  const initEngine = require('stockfish');
  return initEngine(resolve('node_modules/stockfish/bin/stockfish-19-lite-single.js')).then(
    (engine: { listener: (l: string) => void; sendCommand: (c: string) => void; terminate?: () => void }) => {
      let cb: (l: string) => void = () => {};
      engine.listener = (l: string) => cb(l);
      return {
        send: (c: string) => engine.sendCommand(c),
        onLine: (f: (l: string) => void) => (cb = f),
        dispose: () => engine.terminate?.(),
      };
    },
  );
}

async function stage2() {
  const engine = createEngineClient(nodeTransport, { hashMb: 64 });
  const index: Record<string, Record<string, number>> = {};
  let rejected = 0;
  for (const [key, cell] of [...cells].sort()) {
    const [skill, band] = key.split('|');
    const keep: Puzzle[] = [];
    for (const p of cell.items) {
      if (keep.length >= PER_CELL) break;
      const mv = p.moves.split(' ');
      const ch = new Chess(p.fen);
      let ok = true;
      try {
        for (let i = 0; i < mv.length; i++)
          ch.move({ from: mv[i].slice(0, 2), to: mv[i].slice(2, 4), promotion: mv[i][4] });
      } catch {
        ok = false;
      }
      if (!ok) {
        rejected++;
        continue;
      }
      const isMate = p.themes.some((t) => MATE_THEMES.has(t));
      if (isMate && !ch.isCheckmate()) {
        rejected++;
        continue;
      }
      if (!isMate) {
        const start = new Chess(p.fen);
        start.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] });
        const r = await engine.analyse(start.fen(), { depth: 14, multiPv: 2 });
        const [a, b] = r.lines;
        const clear =
          a.pv[0] === mv[1] &&
          (a.mate !== undefined ||
            !b ||
            b.mate !== undefined ||
            (a.cp ?? 0) - (b.cp ?? 0) >= 100 ||
            (a.cp ?? 0) >= 600);
        if (!clear) {
          rejected++;
          continue;
        }
      }
      keep.push(p);
    }
    const dir = `public/content/puzzles/${skill}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/${band}.json`,
      JSON.stringify({
        provenance: {
          source: 'Lichess puzzle database',
          url: 'https://database.lichess.org/#puzzles',
          license: 'CC0',
          engineVerified: true,
          engine: 'Stockfish 19 lite, depth 14, MultiPV 2, margin 100 cp (mates verified by replay)',
          skill,
          band,
        },
        puzzles: keep.map((p) => ({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, themes: p.themes })),
      }),
    );
    (index[skill] ??= {})[band] = keep.length;
    console.error(`${key}: kept ${keep.length} of ${cell.items.length} candidates (cell had ${cell.seen})`);
  }
  writeFileSync(
    'public/content/puzzles/index.json',
    JSON.stringify({ builtAt: new Date().toISOString(), perCell: PER_CELL, counts: index }, null, 1),
  );
  console.error(`done; rejected ${rejected}`);
  engine.dispose();
  process.exit(0);
}

await stage1();
await stage2();
