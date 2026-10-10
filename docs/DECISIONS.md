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
