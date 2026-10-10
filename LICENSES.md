# Licences of dependencies, data and assets
Personal use only (docs/backend/11-personal-use-limits.md). `npm run check:licenses` fails if a dependency or content file is missing here.
Verified 2026-10-10 from each package's npm metadata unless stated.

| Item | Licence | Used for | Notes |
|---|---|---|---|
| chess.js 1.4 | BSD-2-Clause | rules, PGN | notice kept in the npm package |
| dexie | Apache-2.0 | IndexedDB | |
| ts-fsrs 5.4 | MIT | spaced repetition (FSRS) | API verified by test |
| stockfish (npm 19.0.0, Stockfish.js by nmrugg / Chess.com) | **GPL-3.0** | engine in a Web Worker | **Private use only. Do not distribute. Keep the GitHub repo private.** Source: github.com/nmrugg/stockfish.js |
| vite, vitest, typescript, typescript-eslint, eslint, @eslint/js, prettier, tsx | MIT / Apache-2.0 | tooling | dev only |
| @playwright/test, @axe-core/playwright | Apache-2.0 / MPL-2.0 | browser tests | dev only |
| jsdom, fake-indexeddb, fast-check, @types/node | MIT / Apache-2.0 | tests | dev only |
| Lichess puzzle database | CC0 | ~4.8k puzzle shards in `public/content/puzzles` | downloaded 2026-10-10 from database.lichess.org, filtered and engine-verified by `tools/build-puzzles.ts`; the download was deleted |
| Generated endgame drills | own | `public/content/puzzles/eg_basic_mates` | `tools/build-endgames.ts` |
| Lessons, templates, repertoires, rules check, think-aloud, hints, habits, misconceptions | own (AI-assisted drafting, engine-verified) | `app/src/content` | each file carries `provenance`; marked "needs owner review" until you sign them off |
| Historic model games (Opera Game, Légal, Réti) | public domain (games); commentary own | `modelGames.json` | |
| Piece art | none: Unicode chess glyphs from system fonts | board | no third-party artwork |
| Fonts | system font stack | UI | |
| Groq API | provider terms and free-tier limits apply | optional wording | key stays in this browser; never exported unless ticked |
| Lichess API, Chess.com Published-Data API | provider terms apply | game import | serial access, ETag cache, 429 back-off |
