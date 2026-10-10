# Phase 9 — Quality, evaluation, security, licensing, deployment, milestones

**Goal:** make sure the coach is **correct**, **actually works for the learner**, **safe**, **legal to run/share**, and **shippable**. This phase runs alongside all others (set up CI in Phase 1) and closes each milestone.
**Prerequisite:** none to start; milestone sign-off needs the phase it covers.

## 1. Test pyramid
| Layer | Tool | What | Where |
|---|---|---|---|
| Unit | Vitest | pure logic: win%, SEE, motif detectors, ladder, planner scoring, verifier, FSRS mapping, config validation | `tests/unit` |
| Golden | Vitest + JSON | positions with expected motifs/classes (Phase 3 §8); verifier corpora (Phase 7 §6); planner outputs for the seed learner | `tests/golden` |
| Property | fast-check | SEE vs brute force; export→import round-trip; `rebuildDerived` idempotence | `tests/unit` |
| Integration | Vitest + fake engine | review pipeline stage resumability; import dedupe; consequence rules | `tests/integration` |
| E2E | Playwright (Chromium is pre-installed in the dev container at `/opt/pw-browsers`; do not run `playwright install`) | play a game, blunder → take-back, review a fixture game, complete a daily session, offline mode | `tests/e2e` |
| Visual | Playwright screenshots | compare to prototype baselines (Phase 8 §10) | `tests/visual` |
| Accessibility | axe-core in Playwright | 0 critical on every screen | `tests/e2e/a11y.spec.ts` |
| Content | `tools/validate-content` | Phase 6 §4.2 | CI |
CI order: typecheck → lint → unit/golden/property → integration → build → e2e/visual/a11y → content validation → licence check.

## 2. Does the coach actually work? (evaluation plan)
The product claims it will help reach 1000. Treat that as a hypothesis and **measure it on the owner** (n-of-1 study), not by trusting the design.

### 2.1 Baseline
Before any coaching: ≥ 10 reviewed games (Phase 4 onboarding). Record per game: blunders/40 learner moves, missed-threat count, accuracy (our formula), average time per move, result, opponent rating. Baseline window = mean ± stdev.

### 2.2 Primary outcomes (behavioural, measured every 10 games)
1. **Blunders per 40 moves** (target: −35 % vs baseline in 8 weeks; the value is a *hypothesis to test*, not a promise).
2. **Missed-threat rate** (Phase 5 §10 definition).
3. **Transfer**: proportion of drilled motifs that still appear as real-game mistakes in the following 10 games.
Also track: self-analysis agreement rate (learner's pick vs algorithm, Phase 10 §2), misconception resolution time, mood check-in adherence. Secondary: rating trend (platform-reported, 8-week slope), Blunder Box clear rate, retention (cards ≥ 7-day gap), calibration of confidence, session adherence (days/week).

### 2.3 Method
- Log everything locally; show trends with **confidence bands** (bootstrap over games) and explicitly say "not enough games yet" until n ≥ 10 per window.
- **Dose tracking**: minutes/week and which activities, to correlate with outcomes (observational only — say so).
- **Intervention switches** (optional, owner-approved): alternate two-week blocks of (A) full session vs (B) play-only to see whether drills move the blunder rate. Pre-register the comparison in `docs/eval-log.md` before starting.
- **Kill criteria**: if a lesson/drill type shows no improvement on its target metric after 3 cycles, mark `retire` in config and replace; record in the eval log.
- Report monthly in the check-up letter in plain language with the caveat that rating is noisy.

### 2.4 Calibration tasks (needed to make labels honest)
| Item | Procedure | Done when |
|---|---|---|
| Review thresholds | owner labels 20 games' "first meaningful mistake"; compare to algorithm (Phase 4 §8) | agreement ≥ 70 % or thresholds changed + re-run |
| Opponent levels | learner plays 10 games per level; fit score vs level | level label = level where learner scores ~50 %; labels in UI updated to "≈ your level −/+" |
| Puzzle difficulty | in-app Elo vs shard ratings | mapping stored, planner uses it |
| Diagnosis rules | collect Yes/No corrections (Phase 4 §5) | per-rule precision ≥ 60 %, else demote to low confidence |

## 3. Performance & reliability
- Budgets in Phase 8 §8. Add a `perf` Playwright test that records time-to-first-move and review time for a 40-move fixture and fails on > 20 % regression.
- Worker lifecycle: auto-restart once; surface "engine restarting".
- Persistence: `navigator.storage.persist()`; warn if denied; export reminder monthly.
- Offline: service worker (e.g. `vite-plugin-pwa`, **VERIFY** licence/version) caches app shell + content shards + engine files; update flow with "New version ready — refresh" toast; never auto-reload mid-game.

## 4. Security & privacy
- **CSP** (set in `_headers`): `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://lichess.org https://api.chess.com <ai provider hosts>; img-src 'self' data:; style-src 'self' 'unsafe-inline'` (tighten after removing inline styles); no remote scripts, no CDNs at runtime (vendor everything, with SRI/hash if ever loaded remotely).
- Secrets: AI keys stay in IndexedDB on the device; never log; never include in exports unless the user ticks it.
- Proxy (if needed, Phase 4 §2.1): allow-list `lichess.org`, `api.chess.com`; no request/response logging; per-IP rate limit; no cookies.
- Input safety: PGN and user text are untrusted; render with `textContent`/escape (prototype uses `esc()`); cap lengths; limit PGN size (e.g. 200 KB).
- Prompt injection: Phase 7 §3 (user text as data + verifier).
- Telemetry: **none**. Optional anonymous counters are local-only.
- Children/age: no accounts, no personal data; if the audience may include minors, avoid collecting anything and re-check regional requirements before any public launch (**OWNER**/legal).

## 5. Licensing ledger (`LICENSES.md`, CI fails if a dependency or asset is missing)
| Item | Licence (as found) | Obligation / action | Status |
|---|---|---|---|
| chess.js 1.4.0 | BSD-2-Clause (npm metadata; text in `ui/vendor/chess.js.LICENSE`) | keep notice | ✅ |
| Stockfish (WASM builds, e.g. stockfish.js) | **GPL-3.0** | personal use: keep source link; **public distribution: app must be GPL-3-compatible and offer corresponding source** | **Personal use only (D10 resolved): no obligations while private; do not distribute** — Phase 11 §1 |
| Lichess puzzle & game & eval DBs | CC0 (database.lichess.org) | none; credit as courtesy | ✅ |
| lichess-org/chess-openings (names) | believed CC0 | **VERIFY** before bundling | open |
| Dexie | Apache-2.0 | notice | to confirm at install |
| ts-fsrs | MIT (per jsDelivr listing) | notice | **VERIFY** current version |
| Maia models/code | repo metadata: GPL-3.0 | only if adopted (Phase 7 §1.3) | open |
| Piece set | TBD (prototype uses Unicode glyphs from system fonts) | choose open-licensed set; record author + licence | open |
| Fonts | system font stack in prototype (Inter if added: OFL) | record | open |
| AI providers | each provider's terms/free-tier policy | read + record; respect rate limits | VERIFY at build |
| Lesson text, templates | own | provenance in each file | ✅ by process |
Process: `tools/check-licenses.ts` lists runtime dependencies (npm) + content provenance + assets and compares with `LICENSES.md`.

## 6. Deployment
- **Static hosting** (D8). Example Cloudflare Pages: build `npm run build`, output `app/dist`; `_headers` file for COOP/COEP (only if multi-thread engine is used) and CSP. Limits noted in the blueprint (Appendix A, re-verify before deploying): free plan 500 builds/month, ≤ 20,000 files per site, ≤ 25 MiB per file — the split Stockfish WASM parts and puzzle shards are sized to respect this.
- Environments: `main` → production; PR previews for review.
- Versioning: semantic version in `package.json`; DB schema version separate (Phase 2). Release checklist = §7 for the milestone.
- Rollback: static deploys are immutable; keep last 3.
- Backups: none server-side (local-first). Monthly "export reminder"; export file is the backup.

## 7. Milestones, deliverables, and sign-off checklists

### M1 — "Review my games" (Phases 1–4 + Review/Home UI)
Deliverables: import (Lichess/Chess.com/PGN) → review pipeline → first meaningful mistake with diagnosis hypotheses → Blunder Box cards → Review and Home screens real.
Sign-off:
- [ ] Owner imports own 20 games; review completes < 90 s/game; resumable.
- [ ] Owner agrees with ≥ 70 % of first-meaningful-mistake picks (or thresholds re-tuned).
- [ ] Zero console errors; offline reopening works for reviewed games.
- [ ] Phase 1–4 acceptance tests green.

### M2 — "Train daily" (Phase 5 + minimum Phase 6 + Session/Blunders/Puzzles/Learn UI)
Deliverables: planner, SRS, daily test, consequences, streak/freeze, 12 lessons, 5k puzzles, personal set, Progress screen (with cold-start rules).
Sign-off:
- [ ] 7 consecutive days of real use by the owner without a crash; plan time within ±10 % of budget.
- [ ] No percentage shown before 6 data points; "why this?" visible on each plan item.
- [ ] Consequence lint clean; welcome-back path tested by skipping 3 days in a test profile.

### M3 — "Play the teacher" (Phase 7 + Play UI)
Deliverables: opponent levels, coach mode (Safety Check, take-back, hint ladder), grounded explanations (verifier + templates), chat router.
Sign-off:
- [ ] Opponent calibration table filled from owner games (§2.4).
- [ ] 20 coach-mode interceptions reviewed by the owner: ≥ 80 % judged "fair and not annoying".
- [ ] Verifier rejects all adversarial fixtures; AI outage → templates.

### M4 — "Openings, endgames, depth"
Deliverables: 3 repertoires with why-cards, left-book detection, endgame ladder (6 rungs), 10 model games, lessons to ~40.
Sign-off: content validator green; owner can recall repertoire moves ≥ 85 % after 14 days (retention metric).

### M5 — Public-readiness (DROPPED: D10 = personal use; kept only as a checklist in Phase 11 §8)
GPL compliance (source offer), privacy notice, proxy hardening, content licensing review, load test, accessibility audit.

## 8. Risk register
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Review picks the "wrong" mistake and teaches the wrong lesson | M | H | Owner-labelled calibration; always show confidence and allow "No, it was…"; show up to 3 candidates on expand |
| Engine too slow on phone | M | M | Lite build, depth/time caps, analyse learner plies first, background job |
| Free AI quotas change/vanish | H | L | Templates are first-class; AI only for 4 text kinds; cache |
| Content authoring effort underestimated | H | M | Layered plan (Phase 6 §9); puzzles/openings volume is automatic; lessons in batches |
| Learner overwhelmed/burned out | M | H | One focus skill, time cap, rest day, light day, welcome-back |
| Cold-start data too sparse for adaptive logic | H | M | Explicit `insufficient` state; default plan; calibration set |
| Licence problem when sharing | M | H | Ledger, D10 decision early, GPL-aware design |
| Cross-origin isolation breaks third-party assets | L | M | Keep assets same-origin; lite single-thread fallback |
| "Dark patterns" creep (streak anxiety) | M | H | Forbidden list (Phase 5 §8), freeze days, copy lint |

## 9. Definition of done (whole product, v1)
The owner has used it for 8 weeks; behaviour metrics are visible with honest uncertainty; at least one phase gate was decided by evidence; blunders per 40 moves trend is down or the eval log explains why not and what was changed; all licences recorded; no known critical accessibility or security issue.

## 10. Open questions for the owner (answers change the plan)
1. **D13** Which platform(s) and username(s)? Can you export 10–20 games now to calibrate with?
2. **D10** Personal use only, or will others use it? (Decides GPL handling, proxy, AI-key strategy, privacy notice.)
3. **D15** Preferred opening styles (solid vs aggressive)? Do you want to keep your current opening as one repertoire?
4. **D8** Hosting preference (any free static host is fine)?
5. Daily minutes realistic for you, and which day is the rest day?
6. Name/persona for the teacher (placeholder "Mentor")?
7. Do you want voice coaching later (not in v1)?

## 11. Glossary
- **First meaningful mistake**: earliest learner move that lost ≥ 10 win-% and materially hurt the position (Phase 3 §4).
- **Win %**: engine score mapped to 0–100 chance of winning (Phase 3 §2.1).
- **SEE**: static exchange evaluation — the net material result of a capture sequence on one square.
- **Safety Check**: the 3-question pre-move routine (Phase 5 §8, prototype Coach tab).
- **Blunder Box**: spaced-repetition store of the learner's own mistakes.
- **Woodpecker set**: fixed puzzle set repeated in faster cycles.
- **FSRS**: open-source spaced repetition algorithm (stability/difficulty/retrievability).
- **Cold start**: too little data to make confident adaptive decisions.
- **Grounded package**: the JSON of verified facts the AI may reword.
