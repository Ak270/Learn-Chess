# Mentor (app)

Personal-use, local-first chess coach. TypeScript + Vite, no UI framework. All learner data lives in this browser's IndexedDB.
Stockfish (GPL-3.0) is bundled, so **keep the app, its URL and the GitHub repo private** (docs/backend/11).

## Run it on your laptop
```bash
cd app
npm install
npm run dev          # http://localhost:5173
# or a production build with offline support:
npm run build && npm run preview   # http://localhost:4173
```
The first visit installs the service worker. After that the app (including the engine and the puzzle shards) works offline.
Importing games and Groq wording need the network.

## Everything the checks run
| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | strict TypeScript, ESLint |
| `npm test` | unit, golden (motifs, habits), property (SEE vs brute force, win%), integration with the **real Stockfish 19 in Node** |
| `npm run validate:content` | every lesson position engine-checked (best move beats the rest by >= 1 pawn), repertoire lines >= -0.4, copy lint, reading level |
| `npm run check:licenses` | `LICENSES.md` lists every dependency; every content file has provenance |
| `npm run build && npm run check:budget` | first-load JS < 150 KB gz (engine is lazy) |
| `npm run e2e` | Playwright: onboarding, review, lesson, Blunder Box, session, puzzles, play, coach take-back, Ask Mentor, a11y (axe), offline, CSP |

Local e2e reuses the Chromium that Playwright already downloaded: `export PW_CHROMIUM="<path to Chrome for Testing>"`.

## Content tools (offline, not part of the browser bundle)
* `zstd -dc lichess_db_puzzle.csv.zst | npx tsx tools/build-puzzles.ts 150` builds the puzzle shards (CC0 Lichess database).
* `npm run build:endgames` generates engine-verified king-and-queen / king-and-rook mate drills.

## Where things live
`src/core` pure logic (chess, engine client, opponent, AI grounding, planner, SRS) · `src/services` use-cases over IndexedDB ·
`src/views` screens ported from the prototype in `../ui` · `src/content` authored lessons, repertoires, templates · `src/config` every threshold with its `source`.
