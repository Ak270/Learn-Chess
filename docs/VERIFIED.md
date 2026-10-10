# Facts checked against the real world (VERIFY items)

| Item | Result | How | Date |
|---|---|---|---|
| Win% constant 0.00368208 | correct | lichess-org `winningChances.ts` (PR 11148) | 2026-10-10 |
| Accuracy formula | `103.1668100711649*exp(-0.04354415386753951*d) - 3.166924740191411` | lila `AccuracyPercent.scala` | 2026-10-10 |
| Stockfish package | npm `stockfish@19.0.0` (GPL-3.0); lite single-thread 1.7 MB works in Node and in a browser Worker under COOP/COEP and the CSP | tests + e2e | 2026-10-10 |
| Chess.com CORS | `access-control-allow-origin: *`; 13 archives for the owner; **403 without a User-Agent** (browsers send one) | real fetch from the app origin | 2026-10-10 |
| Lichess API CORS | open (answers 404/200 with the origin echoed) | real fetch | 2026-10-10 |
| Groq CORS | preflight allows `authorization,content-type` from any origin; unauthenticated call returns 401 | real request | 2026-10-10 |
| Groq model ids / limits | **not verified**: listing models needs a key. Use "Test Groq key" in Settings; the model id is a setting | - | open |
| Lichess opening explorer | needs a token now (401), so a small bundled book is used instead | real request | 2026-10-10 |
| ts-fsrs | 5.4.2, MIT, API `fsrs()/createEmptyCard()/Rating`; deterministic with `enable_fuzz:false` | probe + tests | 2026-10-10 |
| Lichess puzzle DB | 307 MB `lichess_db_puzzle.csv.zst`, CC0, downloaded with the owner's approval, then deleted | download | 2026-10-10 |
| Service worker offline | whole app incl. engine reopens offline; needs `ignoreVary` when matching module scripts | e2e | 2026-10-10 |
| 112-ply review speed | 3.3 s at depth 12 MultiPV 2 (budget 90 s) | integration test | 2026-10-10 |
