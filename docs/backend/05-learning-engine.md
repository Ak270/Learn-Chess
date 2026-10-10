# Phase 5 — Learning engine: skills, evidence, spaced repetition, planner, tests, consequences, gates

**Goal:** the "teacher brain". It decides **what to practise today and why**, grades **how well** the learner did (accuracy + independence + confidence), schedules **repeats**, applies **consequences that teach**, detects **regression**, and decides **when to advance**. Milestone **M2**.
**Prerequisite:** Phases 2–4 (Mistakes, Cards, Attempts exist). **Output:** `src/core/skills`, `src/core/srs`, `src/core/planner`, `src/services/{Skill,Srs,Planner,Test}Service.ts`, configs in `src/config/learning.json`.
**UI link:** replaces everything in `ui/js/data.js` for `user, sessionBlocks, stats, skills, blunderCards, ladder, roadmap, dailyTest, teacherNotes` and drives `home.js, session.js, blunders.js, progress.js, learn.js`.

## 1. Design stance (from the research, see blueprint v2 §2)
- Few ideas at a time → **one focus skill per week**.
- Retrieval + spacing beat re-reading → every session starts with **recall of old cards** and ends with a **mixed test**.
- Deliberate practice needs feedback + repetition + reflection → every attempt gets immediate feedback, repeats are scheduled, and the learner is asked to self-explain.
- Measure **transfer** (real games) separately from drills.
- No single threshold decides mastery; **evidence bundles** do, with an explicit **"not enough evidence yet"** state for sparse data (a 600-Elo learner plays few games).

## 2. Skill taxonomy (`SkillId`) and prerequisites
Keep this list in `config/skills.json` with `{id, title, phase, prereqs[], layers[], motifs[], blurb}`.

| Phase | SkillIds |
|---|---|
| 1 Survive & Aware | `piece_safety`, `opponent_threats`, `checks_captures_threats`, `blunder_check` |
| 2 Tactical vision | `tactic_fork`, `tactic_pin`, `tactic_skewer`, `tactic_discovered`, `tactic_backrank`, `tactic_removing_defender`, `mate_patterns` |
| 3 Thinking process | `candidate_moves`, `calculation_2ply`, `calculation_3ply`, `visualization` |
| 4 Opening basics | `opening_principles`, `opening_repertoire_recall` |
| 5 Middlegame | `mg_targets`, `mg_worst_piece`, `mg_pawn_breaks`, `mg_trades`, `king_safety` |
| 6 Endgames | `eg_basic_mates`, `eg_opposition`, `eg_pawn_races`, `eg_rook_basics`, `conversion`, `defence` |
| Cross-cutting | `time_management`, `self_analysis` |
| Foundations (Phase 10 §7) | `rules_fluency`, `material_counting` (Phase 0/1) |
Prereq examples: `tactic_fork ← piece_safety, checks_captures_threats`; `calculation_2ply ← blunder_check`; `mg_* ← piece_safety, candidate_moves`. Prereqs gate **introduction**, never block **remedial** work for a skill the games prove is leaking.

## 3. Evidence → skill state

### 3.1 Evidence mapping (`mapAttemptToEvidence`)
Each `Attempt`/game event produces rows `{skill, layer, outcome, weight, assisted}`:

| Source | Layer | outcome | weight |
|---|---|---|---|
| Concept check question (lesson) | knowledge | correct? | 0.5 |
| Clean-position puzzle, theme known | recognition | correct unaided? | 1.0 (0.4 if hints used → `assisted=true`) |
| Puzzle requiring ≥ 2 plies | calculation | correct? | 1.0 |
| Critical-position drill from learner's game | decision | correct? | 1.5 |
| Real game, motif absent in a position where it was present (learner avoided the trap/used the tactic) | transfer | 1 | 1.5 |
| Real game, motif **allowed/missed** (Phase 3 hits) | transfer | 0 | 2.0 (most informative) |
| Card reviewed after ≥ 7 days gap | retention | correct? | 1.0 |
| Daily test question not matching today's lesson | recognition/decision (+ retention if old) | correct? | 1.0 |
Confidence adjusts weight: *sure & wrong* → weight × 1.5 (misconception); *guess & right* → outcome 0.5.

### 3.2 State computation (`rebuildSkill`)
Per skill × layer maintain an exponentially-decayed Beta posterior:
```
α, β start at (1, 1)                     # uninformative prior; calibration may seed (α0, β0)
for each evidence e (oldest→newest):
    decay all by 2^(-Δt / halfLife)      # halfLife default 30 days (config), per layer
    α += weight * outcome ; β += weight * (1 - outcome)
mean = α/(α+β) ;   nEff = α+β-2
```
`SkillState.layers[layer] = {mean, n:nEff}`.
Derived fields:
- `independence` = weighted share of correct **unassisted** evidence among last 20 evidence rows.
- `transferGap` = `mean(recognition) − mean(transfer)` (needs nEff ≥ 5 in both; else `undefined`).
- `trend` = mean(last 10) − mean(previous 10) per skill.
- `status`: `insufficient` (nEff total < 6) | `learning` | `solid` | `maintenance` | `decaying`. Rules:
  - `solid` ⇔ recognition ≥ 0.8 **and** decision ≥ 0.7 **and** independence ≥ 0.7 **and** (transfer.mean ≥ 0.7 **or** transfer.n < 3 and ≥ 3 games since introduced — "not yet contradicted") **and** nEff ≥ 10. Values live in config; **explain every status in the UI with the evidence rows** ("Why solid?").
  - `maintenance` = solid for ≥ 14 days (reviews thinned to FSRS/ladder only).
  - `decaying` = was solid/maintenance and (last 5 evidence rows have mean < solid-0.2 **or** a transfer miss occurred) → returns to active training.
- **Cold start**: until `nEff ≥ 6` never display percentages, show "Still learning about you (3/6 data points)" and keep the planner on the Phase 1 default plan. Calibration set (Phase 4 §1) seeds `(α0,β0)` with weight 0.5.

## 4. Spaced repetition

### 4.1 Blunder Box (ladder scheduler — simple, explainable)
- Ladder steps `[1, 3, 7, 21]` days (config). New card → `dueAt = now` (today). 
- Grade outcome:
  - **Clean** = correct, 0 hints, `ms ≤ cleanMsLimit` (default 60 s) → `step += 1`, `cleanStreak += 1`.
  - **Assisted** = correct with hints → stay on same step, `dueAt = tomorrow`, `cleanStreak = 0`.
  - **Wrong** = `step = max(0, step − 1)`, `lapses += 1`, `dueAt = tomorrow`, `cleanStreak = 0`. Also create a `SkillEvidence` with weight × 1.5.
- **Cleared** when `cleanStreak = 3` (matches the UI copy "until you solve it cleanly three times"). Cleared cards come back **once** after 45 days as a retention probe (config).
- **Transfer check**: when a cleared card's motif+skill appears again as a real-game mistake → reopen card with `step = 0` and raise skill `decaying`.

### 4.2 Opening / concept / endgame cards (FSRS)
- Use `ts-fsrs` (MIT; **VERIFY** current API/version) with `request_retention = 0.90` (config; commonly 0.85–0.92), `maximum_interval = 180`.
- Map outcome → rating: wrong → `Again`; correct with hint or `ms > slowMs` → `Hard`; correct unaided → `Good`; correct unaided & `confidence='sure'` & fast & learner pressed "Easy" → `Easy`.
- Persist FSRS card state in `Card.srs.fsrs` and review log rows in `attempts`. `rebuildDerived` can replay.
- **Daily caps**: new cards ≤ 5/day (config), reviews ≤ `minutes × 1.5` cards. Overflow rolls forward oldest-first; never shown as a guilt number — "12 cards waiting; today we do the 6 that matter".
- Cards with empty `why` are rejected at creation (validator).

## 5. Session planner (`PlannerService.planToday`)

### 5.1 Inputs
`minutes` (≤ Profile.dailyMinutes, 15 for light day), `now`, due cards, `SkillState[]`, last 10 reviewed games' mistakes, current week's focus (if any), streak/rest-day state, recent consequence flags.

### 5.2 Focus skill selection (weekly, re-evaluated if evidence changes a lot)
```
score(s) = 0.35 * leakRate(s)          # share of last 10 games' *meaningful* mistakes tagged s (0..1)
         + 0.20 * severity(s)          # mean winPctLoss of those mistakes / 50
         + 0.20 * (1 - mastery(s))     # mastery = mean of knowledge/recognition/decision/transfer means (known layers only)
         + 0.15 * decayRisk(s)         # 1 if status=decaying; else days_since_seen/45 capped
         + 0.10 * leverage(s)          # prerequisite for many locked skills
         + 0.10 * misconceptionActive(s) # Phase 10 §1.3: linked misconception currently active
         − 0.30 * recentlyFocused(s)   # was focus in the last 2 weeks and status now solid
eligible = prereqs(s) all solid  OR  leakRate(s) ≥ 0.2  (remedial override)
focus = argmax score over eligible
```
Weights are config; **log the full score table** into the plan (`teacherNote` and "Why this?" panel) so the learner sees reasons ("Hanging pieces: 5 of your last 8 big mistakes").
Cold start (< 5 reviewed games): focus = `piece_safety`.

### 5.3 Block allocation (default 40 min; scale proportionally to `minutes`)
| Block | Minutes | Content rule |
|---|---|---|
| recall | 5 | up to 5 due cards, oldest first, mix of kinds; **retrieval before hints** |
| lesson | 5 | next un-seen lesson of the focus skill; if all seen → a "worked example" from the learner's own game |
| drills | 10–15 | 8 positions: 50 % Blunder-Box/own-game, 30 % curated puzzles on the focus skill (Phase 6), 20 % mixed warm-ups of the previous focus; difficulty ladder adapts after each drill (±100 rating on streak of 2 clean / 2 fail); **threat-statement step on** until independence ≥ 0.7 |
| play | 15–25 | slow game (≥ 15+10) in Coach mode vs the level one step below the learner's estimated strength for confidence, alternating with "Critical Position" from own games; Safety Check on |
| test | 5 | §6 |
| note | 1 | §8 teacher note |
Light day (15 min): recall (3) + 4 drills (7) + test (5 questions). Rest day: no plan; streak untouched; optional "free play" only.
If many cards are due (> 2× cap) → recall expands, new content pauses (a visible, kind message).

### 5.4 Adaptation inside a session
After each drill update an in-session ability estimate (simple Elo-like on puzzle rating, K = 24). If 3 fails in a row on a skill: switch to **simplified** versions (fewer pieces, hints on) and note `struggle=true` in the plan; if 4 clean in a row: skip ahead one difficulty tier.

## 6. Daily test (`TestService`)
- 10 questions: **5 old** (due/other skills, retention), **3 today's** (focus), **2 traps** where today's pattern does *not* apply (e.g. the "fork" isn't there; the correct answer is a quiet safe move) — prevents pattern-guessing.
- Each question requires a **confidence** pick before the result appears.
- Grading per question → `Attempt` + evidence (§3.1). Calibration metric: Brier score `(conf − outcome)²` with sure=0.9, unsure=0.6, guess=0.35 (config). Shown as "Your 'sure' answers are right 78 % of the time" (honest feedback loop).
- Output: *Right & sure* → solid; *Right & unsure/guess* → unstable (card re-queued sooner); *Wrong & sure* → **misconception flag** (schedules a targeted mini-lesson tomorrow); *Wrong & unsure* → expected.
- Test results feed the teacher note and next-day plan.

## 7. Assistance fading (hint ladder policy)
Hint ladder (same everywhere): H1 "look at their last move" → H2 highlight piece/squares → H3 name the threat/idea → H4 reveal move. Each use logs `hints` and costs coach points (visible, not punitive).
`assistLevel(skill)` = 3 when independence < 0.4, 2 when < 0.6, 1 when < 0.8, 0 otherwise; it decides which hints are *offered by default*, whether the threat-statement step is mandatory, and whether Safety Check ticks are required. Lowering requires 10 evidence rows; raising happens immediately after 3 misses in a row.

## 8. Consequences that teach (implementation of blueprint v2 §4)
Defined as data in `config/consequences.json`: `{trigger, window, action, message, undo}`.
| Trigger (evaluated after each game/session) | Action |
|---|---|
| Blunder (win% loss ≥ blunder) in any game | Auto-create Blunder Box card (already) |
| Move played in < `rushedMs` on a critical position (Coach mode) | Next 3 moves require a one-line **threat statement** ("slow-down lock") |
| Same motif tag in ≥ 3 mistakes in 7 days | Next session `focus = that skill`, hints ON, play block replaced with Critical Position drills |
| Daily test: *wrong & sure* | Misconception mini-lesson next day (3 min) |
| Weekly exam failed | Stay on skill; teacher letter names the missing evidence; no punishment text |
| ≥ 2 missed days | **Welcome-back path**: 10-minute re-entry plan; freeze day consumed automatically; streak shown as "best 12 · current restarting" without guilt copy |
| Hint dependency (hints/attempt > 1.5 for 5 sessions) | Lower difficulty one tier and *explain* ("Let's rebuild confidence") |
**Forbidden:** loss of ratings/points/progress, public lists, sarcastic copy, countdown guilt timers, pay-to-restore streaks. Lint test greps copy files for banned words (config list).
Streak logic: `lastDay` local date; freeze days regenerate 1 per 7 completed days (max 2). Rest day never breaks a streak.

## 9. Weekly / monthly cycle (`PlannerService.weekly`, `monthly`)
- **Day-6 Review**: replay up to 5 game mistakes of the week with the learner's self-explanation first (Phase 4 §5).
- **Day-7 Exam** (15 min): 12 unseen positions from the learner's own mistakes (6), week's skill (4), two older skills (2). Decide: `advance` (focus skill's evidence bundle met) | `stay` | `step_back` (remedial on prerequisite).
- **Monthly check-up**: replay the 5 oldest unresolved mistakes unaided; compute behavioural metrics vs baseline; **phase gate** decision using §10; generate the letter (Phase 7 wording over structured facts).
- **Baseline report** (after onboarding) uses the same metric functions.

## 10. Metrics (definitions the UI uses on Home/Progress)
All computed from `PlyRecord`/`Mistake`/`Attempt`; unit-tested with fixtures.
| Metric | Exact definition |
|---|---|
| Blunders per game | count of learner plies with `cls='blunder'` ÷ games (rolling last 10, **normalised per 40 learner moves**) |
| Missed threats per game | count of learner moves whose motif hits include `allowed:hanging.piece|loose.piece|fork.*` created by the opponent's previous move and present before the learner moved ÷ games |
| Blunder Box clear rate | cards `cleared` ÷ cards created, last 30 days |
| Retention | correct unaided on cards with gap ≥ 7 days ÷ attempts |
| Independence | share of correct attempts with `hints=0` |
| Calibration | share of 'sure' answers that were right |
| Rating trend | platform ratings (imported) or Mentor Elo, 8-week line; **outcome metric only** |
Phase gates (examples; configurable; judged *together*): Phase 1→2 requires (a) blunders/40 moves ≤ 2.0 over last 10 games or −35 % vs baseline, (b) `piece_safety` & `opponent_threats` status ∈ {solid, maintenance}, (c) threat statements unprompted in ≥ 70 % of coach-mode moves in last 3 games, (d) ≥ 10 reviewed games since baseline (anti-cold-start). The UI "Phase gates" card shows each criterion with ✅/⬜ and evidence counts.

## 11. Regression detection
Nightly (on app open) job over solid/maintenance skills: compare last-5-games leak rate to the skill's 'solid' period; if it exceeds `baseline + 1.0 × stdev` (or a single severe transfer miss) → `status='decaying'`, enqueue retention probes, show a friendly notice ("Forks slipped in your last two games — a refresher is in tomorrow's plan").

## 12. Teacher note generator (structured, then worded in Phase 7)
`TeacherNoteFacts = { wentWell: Fact[], fixThis: Fact, tomorrow: PlanPreview }`. Facts are pulled from the day's evidence (e.g. "unprompted Safety Check on 7 of 10 moves", "hanging-piece drills 6/8 clean"). Phase 7 turns it into 3 lines; the **template fallback** (same facts, fixed sentences) must exist here.

## 13. Acceptance tests (simulation-based)
- [ ] **Seed learner simulation**: scripted learner who blunders hanging pieces 40 % → 15 % over 30 days. Planner must pick `piece_safety` for week 1, advance by week 3–4, and never schedule skills whose prereqs aren't solid unless remedial.
- [ ] Ladder scheduler: table-driven tests for clean/assisted/wrong sequences; cleared after 3 clean.
- [ ] Cold start: with 0–4 games the UI never displays a percentage; planner returns the default Phase-1 plan.
- [ ] `rebuildDerived()` idempotent; skills identical after export/import.
- [ ] Consequence lint test passes; no banned copy.
- [ ] Planner determinism: same inputs + same `seed` → same plan (use seeded RNG).
- [ ] Time cap respected within ±10 % for 15/20/40/60-minute plans.

## 14. Pitfalls
- Don't let the focus skill flip every day; re-evaluate only after a game review or at day 7 (hysteresis: new score must beat current by 15 %).
- Beware survivorship: skills with little data look "weak" because of priors; use `nEff` to widen uncertainty and avoid overreacting.
- Keep **explanations of every decision** as data (`why` fields), not as UI strings invented later.
