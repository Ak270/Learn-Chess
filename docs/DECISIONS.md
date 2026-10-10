# Decisions log (owner answers and defaults)

Precedence for conflicts: Phase 11 > Phase 10 > numbered phase file > blueprint v2 > blueprint v1.

| ID | Decision | Value | Source | Date |
|---|---|---|---|---|
| D8 | Hosting | Local only (laptop) | Owner | 2026-10-10 |
| D12 | Product name | Mentor | Owner | 2026-10-10 |
| D13 | Game source | Chess.com, username `amarkelotra`; plus `chess_com_games_2026-10-10.pgn` (49 games) | Owner | 2026-10-10 |
| D15 | Openings | Owner has no preference; proposal pending (see below) | Owner | 2026-10-10 |
| D20 | Repo visibility | Private | Owner | 2026-10-10 |
| — | Daily minutes | 30 (DEFAULT, owner left blank) | Default | 2026-10-10 |
| — | Rest day | Sunday (DEFAULT, owner left blank) | Default | 2026-10-10 |
| — | Preferred practice time | 19:00 local (DEFAULT, owner left blank) | Default | 2026-10-10 |
| — | Time controls | Games in file: 900+10 (15), 600 (12), unlabeled (21); treated as rapid | Derived from PGN | 2026-10-10 |

## Evidence from the owner's PGN (49 games, own rating ~590–674, mean ~640)
- As White: 1.e4 in all 25 games; 16 of them went 1.e4 e5 2.Nf3.
- As Black vs 1.e4: 1...e5 (8 games). Vs 1.d4: 1...d5 (5 games). Several games vs odd first moves (h4, h3, c4, e3, g3, f3, Nf3).
- Results: White 18W/2D/5L, Black 13W/1D/10L.

## Technical notes
- T1 (2026-10-10): `app/src/components/Board.ts` is the prototype board ported with `@ts-nocheck`; full typing is a follow-up.
- T2: Settings are stored in IndexedDB (`kv` table, key `settings.v1`) with a synchronous in-memory cache.
- T3: Local e2e reuses the pre-installed Chromium via `PW_CHROMIUM`; CI installs its own.
- T4: Light theme tokens `--accent`, `--bad`, `--muted` were darkened to pass axe color-contrast (prototype failed it).
- T5 (2026-10-10, Phase 3): D3 resolved to **Stockfish 19** (npm `stockfish@19.0.0`, GPL-3.0, nmrugg/stockfish.js) instead of 17; ships lite single-thread (1.7 MB) as default. Large 99 MB builds not bundled. Engine files are copied to `app/public/engine` at build time (git-ignored).
- T6: win% constant `0.00368208` and accuracy constants VERIFIED against lichess-org/lila source (2026-10-10). Accuracy uses lila's exact `a=103.1668100711649, k=0.04354415386753951, b=-3.166924740191411` (docs said -3.1669).
- T7: Phase 3 §10 items NOT done and why: "golden suite >=95% precision / >=85% recall on the owner's first 20 reviewed games" needs the owner's manual labels (tests/labelled/); done only after M1 owner review.
- T8: Perf measured 2026-10-10 on the dev Mac: 112-ply owner game at depth 12, MultiPV 2 = 3.2 s in Node (budget 90 s).
- T9 (2026-10-10, Phase 4): conflict between Phase 3 §2.3 ("first meaningful + at most N=3 further") and Phase 4 §4/§8 ("first + next two", "<= 3 mistakes per game"). Resolved to **3 total** (config `classification.maxMistakesShown = 2` further). Reason: Phase 4 is the later, UI-facing spec and its acceptance test is explicit.
- T10 (2026-10-10, D14 VERIFIED): from a real Chromium page on the app origin served with COOP/COEP: Chess.com `api.chess.com/pub/...` answers with `access-control-allow-origin: *` (200, 13 monthly archives for the owner); Lichess API is CORS-open; Groq `api.groq.com` preflight allows `authorization,content-type` from any origin. So **direct browser fetch works, no proxy needed**. Chess.com returns 403 to requests with no User-Agent (e.g. bare curl) but browsers send one. The Lichess opening explorer (`explorer.lichess.ovh`) now answers 401 without a token -> bundled opening book is the plan (Phase 6).
- T11: The owner's Chess.com PGN export has no `[%clk]` comments, no `Link`, and dates in `Date`+`EndTime`. Imported dedupe id = stable hash of players, date, end time and movetext. Live API imports include clocks, so time-based diagnosis works there but not for this file.
- T12 (Phase 5): the "solid" rule's clause "transfer.n < 3 and >= 3 games since the skill was introduced" is split: `derive.ts` accepts "too little transfer evidence and not contradicted"; the "games since introduced" part is enforced by the planner/gates, which know game counts.
- T13 (Phase 5): Phase 10 §3 sets calculation deep-dive evidence weight 1.5; Phase 5 §3.1 says 1.0 for calculation puzzles. Phase 10 wins for the *deep-dive mode* only (`weights.calcDeepDive`); ordinary multi-ply puzzles stay 1.0.
- T14 (M2, 2026-10-10): D8 hosting = local; D12 name Mentor; D15 repertoire: the owner had no preference, so the three proposed lines (Italian quiet plan as White, ...e5 vs 1.e4, QGD setup vs 1.d4) ship as **defaults**, engine-checked, marked "needs owner review".
- T15 (M3): Level numbers (400-1200) are labels. The sampler's blunder rates are tested against the table, but strength vs the learner is uncalibrated until the owner plays (Phase 9 §2.4). Opponent realism below ~1100 is limited.
- T16 (M3): intents (fork / threat) exist only in Training mode and are disclosed after the game; Normal and Coach modes have none.
- T17 (M4, honest scope): done = 3 repertoires with why-cards and left-book detection, 3 of 10 model games, endgame rungs 1-3 (KQ, KR drills + K+P lesson), 17 lessons of ~40, misconceptions M01-M08/M10/M11 (M09 needs counting drills), flash-position visualisation, wellbeing rules. **Not done**: endgame rungs 4-6, 7 more model games, ~23 more lessons, blind replay / square drills / hidden-board calculation, Maia evaluation, full frequency opening book (Lichess explorer needs a token), weekly/monthly exam letters, Coach Report PDF (HTML only).
- T18 (Phase 9): M5 dropped (personal use). `ui/` prototype is kept (not deleted) until the owner has used the new screens; it is the visual reference for the Phase 8 visual-regression step, which is NOT yet automated.
- T19 (Phase 9): CSP, offline service worker, precache manifest, first-load budget (101.7 KB gz), licence ledger check and content validation run in CI.
