# Mentor — Backend & Build Guide: INDEX (read this first)

> Audience: whoever builds this (a developer or an AI coding agent) with **no prior context**.
> Each file is self-contained. Do the phases **in order**; each phase ends with acceptance tests that must pass before the next begins.
> Product intent lives in `../blueprint-v1-original.md` (philosophy) and `../blueprint-v2-teacher-system.md` (teacher routine). The clickable prototype is in `../../ui/`.

## 0. The one-paragraph product
A website that teaches a ~600-Elo player to reach **1000+** by acting like a human teacher: it finds the **first meaningful mistake** in the player's own games, diagnoses *why* it happened, turns it into a repeating **Blunder Box** card, schedules a **daily session** (recall → lesson → drills → slow game → test → note), plays a human-like **sparring opponent** with a coach mode (Safety Check, take-back-with-a-question, hint ladder), and tracks **behaviour metrics** (blunders/game, missed threats, retention), not just rating.

## 1. Non-negotiable rules (apply to every phase)
1. **Chess truth is deterministic.** Legality, evaluation, tactics come from `chess.js` + Stockfish + rule-based detectors. An LLM only *words* verified facts (see Phase 7).
2. **Local-first.** All player data lives in the browser (IndexedDB). No upload without explicit opt-in. Everything must work with the network off, except importing games and AI wording (which has a template fallback).
3. **Every threshold is configuration**, with a documented starting value and the evidence it came from (`config/*.json`). No magic numbers in code.
4. **Never shame.** Consequences must be actions that make the player stronger (see Phase 5 §Consequences).
5. **Replaceable edges.** Engine, opponent model, AI provider, importers, storage and hosting sit behind interfaces defined in Phase 1.
6. **Explain, with evidence.** Any diagnosis shown to the player carries a confidence label and the signals that produced it, and the player can correct it.
7. **Fade assistance.** Every hint/aid is logged so independence can be measured.

## 2. Phase map (build order)

| Phase | File | Outcome | Depends on |
|---|---|---|---|
| 1 | `01-architecture.md` | Repo layout, tech decisions, module boundaries, interfaces, build tooling | — |
| 2 | `02-data-model.md` | IndexedDB schema, types, migrations, export/import, privacy | 1 |
| 3 | `03-chess-core.md` | Engine worker, evaluation maths, move classification, first-meaningful-mistake, motif detectors | 1, 2 |
| 4 | `04-import-review.md` | Game import (Lichess/Chess.com/PGN), review pipeline, diagnosis, review UI wiring | 3 |
| 5 | `05-learning-engine.md` | Skill state, spaced repetition, Blunder Box, session planner, daily test, consequences, gates | 2, 4 |
| 6 | `06-content.md` | Puzzle pipeline, personal sets, openings, lessons, endgame ladder, model games, curriculum 600→1000 | 3, 5 |
| 7 | `07-teacher-ai-opponent.md` | Sparring opponent, coach mode logic, grounded AI wording, verifier, fallbacks | 3, 5 |
| 8 | `08-ui-wiring.md` | Screen-by-screen map from the prototype to real modules; replacing every dummy | 2–7 |
| 9 | `09-quality-ops.md` | Tests, evaluation of whether the coach works, performance, a11y, licensing ledger, deploy, milestones | all |

Suggested milestones (each shippable to the owner for real use):
- **M1 "Review my games"** = Phases 1–4 (import + first meaningful mistake + Blunder Box cards created).
- **M2 "Train daily"** = Phase 5 + minimal Phase 6 (puzzles + 6 lessons) + UI wiring of Home/Session/Blunders.
- **M3 "Play the teacher"** = Phase 7 + Play screen.
- **M4 "Openings, endgames, depth"** = rest of Phase 6.

## 3. Decision log (nothing is assumed silently)
Status: **OWNER** = needs the owner's answer; **PROPOSED** = default chosen, change only with reason; **VERIFY** = must be tested at build time.

| ID | Decision | Default | Why | Alternatives | Status |
|---|---|---|---|---|---|
| D1 | Language/tooling | TypeScript + Vite, no UI framework at first (reuse the prototype's vanilla ES-module views) | Smallest surface, free hosting, prototype already works | React/Svelte later if UI grows | PROPOSED |
| D2 | Storage | IndexedDB via Dexie (Apache-2.0) | Offline, structured, free | SQLite-WASM (OPFS) if queries get heavy | PROPOSED |
| D3 | Engine | Stockfish 17 WASM in a Web Worker; build = lite single-thread by default, multi-thread when cross-origin-isolated | Works on any static host and phones; stronger when headers available | Lichess cloud-eval API for cached positions (network) | PROPOSED, VERIFY exact package/version |
| D4 | Rules library | `chess.js` 1.4.0 (BSD-2) — already vendored in `ui/vendor` | Has `attackers()`, PGN, FEN | — | DONE |
| D5 | Sparring opponent | Stockfish with skill limit + human-error model first; evaluate Maia later | Licence/browser support of Maia unverified (see Phase 7) | Maia (GPL-3.0 per repo metadata; browser ONNX conversions exist only third-party) | PROPOSED, VERIFY licence |
| D6 | AI wording | Provider interface; Gemini/Groq/OpenRouter free tiers; **template fallback always on** | Free-tier limits change | Local small model (WebLLM) | PROPOSED, VERIFY quotas at build |
| D7 | Spaced repetition | FSRS via `ts-fsrs` (MIT) for opening/concept/blunder cards; fixed ladder 1-3-7-21 days for the first Blunder Box version | FSRS is open and well-evidenced; ladder is simple to explain to the learner | SM-2 | PROPOSED, VERIFY ts-fsrs API |
| D8 | Hosting | Static (Cloudflare Pages or any static host) | No server cost | GitHub Pages | OWNER (preference) |
| D9 | Accounts/cloud sync | None in v1 | Privacy, scope | Supabase later (opt-in) | PROPOSED |
| D10 | Licence posture | Personal use first. Stockfish is **GPLv3**; if the site is ever distributed publicly, the whole app must be GPL-compatible and source offered | Avoid legal surprise | Server-side engine (still GPL obligations for distribution of the binary) | **OWNER**: personal only or public? |
| D11 | Piece set / assets | Unicode glyphs in prototype; real build uses an open-licensed set with licence recorded in `LICENSES.md` | Avoid copying proprietary art | — | VERIFY licence of chosen set |
| D12 | Product name/branding | "Mentor" is a placeholder | No third-party marks used | — | OWNER |
| D13 | Where games live | Lichess and/or Chess.com username import | Owner's accounts unknown | PGN paste | **OWNER**: which platform? |
| D14 | Chess.com/Lichess from browser | Direct fetch if CORS allows, else a tiny proxy function | CORS not confirmed for either | Manual PGN upload | VERIFY |
| D15 | Opening repertoire | Owner chooses 1 White setup + 1 vs 1.e4 + 1 vs 1.d4 | Personal taste matters for retention | We propose, owner picks | **OWNER** |

## 4. Facts verified while writing these docs (8 Oct 2026) — with how to re-verify
- **Lichess puzzle DB** `lichess_db_puzzle.csv.zst`, 6,157,341 puzzles, CC0. Columns: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate`. `FEN` is the position **before** the opponent's move; the first UCI move in `Moves` is the opponent's, the next starts the solution. Source: https://database.lichess.org/ .
- **Lichess eval DB** `lichess_db_eval.jsonl.zst`, 416,442,401 positions, one JSON per line: `fen`, `evals[{knodes,depth,pvs[{cp|mate,line}]}]`; use the deepest eval's first PV. CC0. Same page.
- **Stockfish web builds** (per project README seen via search): full multithread ~66 MB needs COOP/COEP headers; large single-thread works without; **lite** (~6 MB) in single- and multi-thread variants. The npm `stockfish` page seen listed v16 while the GitHub README describes 17 → **VERIFY package/version** before pinning.
- **Maia**: repo metadata lists **GPL-3.0**; weights are Lc0 `.pb.gz` (maia-1100…1900); official browser/ONNX build not found (third-party ONNX conversions exist, provenance unverified). Maia bots on Lichess play above their label (one 2025 observation: maia1 ≈1495 rapid).
- **ts-fsrs**: MIT per jsDelivr listing; recommended desired retention range 85–92 %; check README for current API.
- **Chess.com PubAPI**: `/pub/player/{u}/games/archives`, `/pub/player/{u}/games/{YYYY}/{MM}`; serial access fine, parallel may 429; send a descriptive User-Agent; ETag/Last-Modified supported; **CORS unknown → VERIFY**.
- **Lichess games export**: `GET https://lichess.org/api/games/user/{username}` with `since/until/max/rated/perfType/vs`, plus flags such as `pgnInJson`, `clocks`, `evals`, `opening`; streams NDJSON/PGN; **CORS unknown → VERIFY** (test with a real fetch from the app origin).
- **Lichess opening explorer** (`explorer.lichess.ovh`): could not confirm whether a token is now required → **VERIFY**; design must work with a bundled opening book as fallback (Phase 6).
