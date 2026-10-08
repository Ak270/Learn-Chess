# Phase 4 — Game import, review pipeline, diagnosis, review screen

**Goal:** from a username or a PGN, produce for each game a **teaching review**: the first meaningful mistake, why it probably happened, and one or two more mistakes worth learning from — then create Blunder Box cards. This is milestone **M1**.
**Prerequisite:** Phases 2–3. **Output:** `src/core/importers/*`, `src/services/ReviewService.ts`, `src/core/diagnosis/*`, wired `views/review.ts` and the Home "recent games" list.
**UI link:** replaces `sampleGame`, `diagnosis`, `recentGames` in `ui/js/data.js` and the hard-coded paragraphs in `ui/js/views/review.js`.

## 1. First-run onboarding & baseline (Phase 0 of the learning model)
1. Ask: platform + username (Lichess and/or Chess.com), daily minutes, rest day. Store in `Profile`. **Do not ask for a rating**; optionally ask self-rating, but flag `selfRating` as untrusted.
2. Import the last **20** rated/casual standard games (config `onboardingGames`). Show a progress screen: "Importing → Reviewing game 3 of 20 …" with a cancel button.
3. When ≥ 5 reviewed games exist, generate the **Baseline Report** (Phase 5 §9): blunders/game, missed-threat rate, motif histogram, phase of first mistake, time-use pattern. This seeds `SkillState` and the first focus skill.
4. If < 5 games: run the **Calibration set** (20 puzzles of increasing difficulty with confidence ratings + 2 short play games vs Pawn Pete/Knight Nora) and seed skills from those.

## 2. Importers (`Importer` interface from Phase 1)

### 2.1 Lichess
- `GET https://lichess.org/api/games/user/{username}` with query `max`, `since`, `until`, `rated`, `perfType=rapid,classical,blitz`, `clocks=true`, `evals=false` (we run our own), `opening=true`, `pgnInJson=true`; header `Accept: application/x-ndjson`. Read as a **stream** and parse line by line; stop at `max`.
- Games arrive newest-first. Dedupe on `(source='lichess', sourceId=<game id>)`.
- Learner colour: compare `players.white.user.name` / `players.black.user.name` (case-insensitive) with the username.
- **VERIFY**: CORS for browser `fetch`. If blocked, implement `proxyFetch()` (Cloudflare Worker, 20 lines) with a strict allow-list of `lichess.org` and `api.chess.com` and no logging.

### 2.2 Chess.com
- List months: `GET https://api.chess.com/pub/player/{u}/games/archives` → array of month URLs. Fetch **newest first, serially** (parallel can return 429). Honour `ETag`/`Last-Modified`; cache raw responses in `kv` keyed by URL.
- Each game JSON has `pgn`, `time_class`, `rules`, `white/black {username, rating, result}`, `end_time`, `url`. Keep `rules==='chess'` only. The `@id` of players can be the reliable username source.
- Send a descriptive `User-Agent` if a proxy is used (browsers forbid setting it; the proxy sets it).
- **VERIFY** CORS as above.

### 2.3 PGN paste/upload
`chess.js.loadPgn` per game (split on `[Event`). Reject variants (`[Variant "…"]` ≠ Standard) and games with `SetUp/FEN` start positions in v1 with a clear message. Extract `%clk` comments (`{ [%clk 0:14:32] }`) into `Game.clocks`.

### 2.4 Normalisation
Every importer outputs `RawGame {source, sourceId, pgn, white, black, result, startedAt, timeControl, ratings, clocks?, termination?}`; `GameRepo.saveIfNew` handles dedupe and sets `playerColor`. Games shorter than 6 plies or with abandoned/aborted termination are skipped (config).

## 3. Review pipeline (`ReviewService.reviewGame`)
A **resumable job** with stages; each stage persists its output so a closed tab resumes:

| Stage | Work | Output |
|---|---|---|
| 1 Parse | PGN → plies with FEN before/after, SAN/UCI, clock deltas → `timeSpentMs` | `PlyRecord` skeletons |
| 2 Engine | For each learner ply: analyse `fenBefore` (MultiPV 2) and `fenAfter` (MultiPV 1); opponent plies: only `fenAfter` when needed for `miss` | evals, best/second best |
| 3 Classify | Phase 3 §3 | `cls`, `accuracy`, `winPct*` |
| 4 Motifs | Phase 3 §6 on mistakes/blunders/misses + sampled "good" plies for false-positive stats | `MotifHit[]` |
| 5 Select | Phase 3 §4 first meaningful mistake + ≤ `maxMistakesShown` others with distinct skill tags | `Mistake[]` |
| 6 Diagnose | §4 below | `DiagnosisHypothesis[]` |
| 7 Cards | create `Card(kind='blunder')` per selected mistake (dedupe by `fenKey+bestUci`) | Blunder Box |
| 8 Evidence | emit `SkillEvidence` rows (transfer layer: learner's real-game behaviour) | skills updated (Phase 5) |
| 9 Summary | accuracy, phase grades, counts, teacher text (Phase 7) | `GameReview` |

Progress stream `{stage, done, total}` drives the progress bar. Cancel = stop engine, persist what exists.

### 3.1 Phase grades (shown as "Opening: Solid / Middlegame: Costly")
`grade = f(mean winPctLoss in phase, count of blunders)` with config bands: `Solid` (< 3), `Fine` (3–6), `Costly` (> 6 or ≥ 1 blunder). Never show a number-only grade.

## 4. Diagnosis engine (`src/core/diagnosis`)
Output hypotheses, **never a single verdict**. Each = `{cause, confidence, signals[]}`. Rules (start values in `config/diagnosis.json`, to be tuned on labelled data):

| Cause | Signals (all must be recorded in `signals` as text) | Confidence rule |
|---|---|---|
| `perception` (didn't see it) | Mentor game: Safety Check skipped or no threat statement; `timeSpentMs` < `rushedMs` (default: < 25 % of learner's median time/move, min 3 s); motif was a 1-move threat (`hanging.piece`, `missed.capture`, `missed.check`) | high if ≥ 2 signals, medium if 1 |
| `calculation` (saw but misjudged) | Mentor game: learner *stated* the threat/plan but chose a move refuted at depth ≥ 2; or time spent high (> 2× median) and still lost material | high with explicit statement, else medium |
| `over_focus_own_plan` | Played move creates a threat of its own (checks/captures/forks by learner) **and** ignores an opponent threat present before the move; self-explanation text mentions only own pieces/ideas (keyword + square match) | medium |
| `rushed` | `timeSpentMs` < `rushedMs` on a *critical* position (eval swing potential ≥ 15 win% = best vs worst legal differ) | medium |
| `knowledge_gap` | Same motif missed in lessons/drills/tests ≥ 3 times (Attempts) | medium |
| `transfer_failure` | Learner solves this motif in drills with ≥ 80 % unaided accuracy over ≥ 8 attempts, yet it appears in games ≥ 2 times in last 10 games | high |
| `tilt` | ≥ 2 blunders in 6 consecutive learner plies after losing material, move times collapsing | low (ask the learner) |
| `unknown` | fallback | low |
Imported (non-Mentor) games lack Safety-Check data, so **perception vs calculation cannot be separated** there — mark this limitation in `signals` and ask via the self-explanation prompt (§5).

## 5. Self-explanation prompt (the cheap, high-value signal)
For the first meaningful mistake: before revealing the explanation, show *"What were you aiming for with <move>?"* with a free-text box and 4 quick chips: **Attack something / Defend something / Develop / Not sure**. Store in `Mistake.selfExplanation`. Use it to (a) sharpen diagnosis (`over_focus_own_plan` if "Attack" and ignored threat), (b) train self-analysis skill, (c) show the learner their own words next to the verdict. The prototype's textarea + "Save and reveal diagnosis" is exactly this flow.
The learner can respond to each hypothesis: **Yes / No, it was…** (`confirmedByUser`, `correctedTo`). Corrections feed rule tuning (store counts per rule; surface in Phase 9 metrics).

## 6. Review screen wiring (map from prototype)
| Prototype element (`ui/js/views/review.js`) | Source in real build |
|---|---|
| Board + move navigation + arrows | `Board` component + `PlyRecord.fenBefore/uci`; arrow = refutation line `Mistake.refutationUci` |
| Eval bar and graph | `PlyRecord.winPct*` (graph y-axis = win%, not cp) |
| Move list badges | `PlyRecord.cls` with `classMeta` palette |
| "First meaningful mistake" card | `Mistake` where `isFirstMeaningful` |
| "Your turn" textarea | §5 |
| Diagnosis cards | `Mistake.diagnosis` (+ Yes/No buttons write back) |
| Accuracy / phase grades / move quality chips | `GameReview` summary |
| "Add to Blunder Box" | already created in stage 7; button toggles `suspended` |
| "Play this position" | opens Play with `startFen = Mistake.fen` (Critical Position mode) |

## 7. Data safety & privacy
- Imported games are public data but **stay local**. The proxy (if any) sees only usernames and month paths; it keeps no logs.
- Never send full game history to an AI provider; only the single position package (Phase 7).

## 8. Acceptance tests
- [ ] Import 20 games for a real Lichess and a real Chess.com test account (record fixtures); dedupe works on re-import.
- [ ] Clock parsing: `[%clk]` → `timeSpentMs` accurate to ±1 s on 5 fixtures (including increment games).
- [ ] Resumability: kill the tab mid-review; reopening continues from the last completed stage without re-running the engine for finished plies.
- [ ] On 20 owner games, first-meaningful-mistake agrees with a human coach's pick in ≥ 70 % (label with the owner; iterate thresholds) — record in `docs/eval-log.md`.
- [ ] Review UI shows ≤ 3 mistakes per game, never > 1 identical skill tag unless the owner expands.

## 9. Pitfalls
- Lichess ndjson streams can contain a trailing empty line; ignore. Chess.com may return games with `rules: 'chess960'`; skip with a counter shown to the user.
- Time-spent from clocks must add back the increment: `spent = prevClock - clock + increment`.
- Engine depth differences make the same game reviewed on two devices disagree slightly; store `engineVersion`, `depth` in `GameReview` and re-review only on explicit request.
