# Phase 10 (Addendum) — Gaps found after research: understanding the person, analyse-first review, two kinds of tactics practice, wellbeing, expectations

**Why this file exists:** after re-checking Phases 1–9 against the research in `../research-notes.md` and against the full list of things a human teacher does (`../COVERAGE.md`), these areas were missing or too thin. They are specified here and **also** patched into the earlier phases where noted in §10. Build them in the milestone shown in §11.
**Rule:** nothing here weakens the non-negotiables in `00-INDEX.md` §1.

## 1. Understanding the person (the "student model" beyond skill scores)
A teacher knows *who* they teach. The data model so far held skills, mistakes and cards. Add a **Learner Model** with four parts.

### 1.1 Profile & preferences (asked once, editable any time)
```ts
interface LearnerProfileExt {            // extends Profile (Phase 2)
  motivation: 'win_more'|'understand'|'beat_a_friend'|'prove_to_self'|'fun'|'other'; motivationText?: string;
  goals: { type:'rating'|'behaviour'|'event'; target:string; due?: string }[]; // e.g. "reach 1000", "fewer than 2 blunders per 40 moves"
  availability: { weekdayMinutes: number[7]; bestTimeOfDay?: 'morning'|'afternoon'|'evening'|'late' };
  explanationStyle: { length:'short'|'medium'; visuals:'arrows_first'|'text_first'; askBeforeTell: boolean }; // §8
  pace: 'gentle'|'steady'|'push';       // affects load caps and consequence strictness
  ownBoardAccess: boolean;              // can do real-board tasks (§9)
  language: 'en';                       // i18n-ready strings
}
```
UI: the **Profile** screen (prototype `#/profile`) shows these, "What Mentor knows about you" (§1.4), and the expectations card (§5).

### 1.2 Think-aloud baseline (how this person actually thinks)
In onboarding (and again every 8 weeks) show **5 positions** (one hanging piece, one fork available, one opponent threat, one quiet position, one forced mate-in-1). For each ask: *"What do you see? What will you play? What could they do next?"* Capture structured answers (checkbox list of threats/candidates + short free text), time to first move, and whether the learner looked for the opponent's threat first.
Scoring rubric (rule-based, shown to learner as observations not grades): `mentionsOpponentThreat`, `candidateCount`, `checkedReply`, `foundBestMove`, `timeToMoveMs`. Result seeds `opponent_threats`, `candidate_moves`, `blunder_check` states and the first teacher note ("You found the best move 4/5 times but looked at their reply only once — that is the habit we'll build").
Data: `Attempt.context='think_aloud'` + `ThinkAloudRecord{attemptId, rubric, text}`.

### 1.3 Misconception catalogue (why the person errs, not just what)
Intelligent tutors track **wrong beliefs**, not only wrong answers. Maintain `content/misconceptions.json`:
```ts
interface Misconception { id: string; title: string; belief: string; truth: string; detectors: MotifId[]; minOccurrences: number; windowGames: number; lessonId: string; learnerPhrase: string }
```
Starter list (detector motifs in brackets are added to Phase 3 §6.9):
| id | Belief | Truth | Detector signal |
|---|---|---|---|
| M01 | "A protected piece is safe" | A protected piece can still lose material if the attacker is worth less | [`hanging.piece` with SEE>0 while defended] |
| M02 | "A check is always a good move" | Checks that lose the checking piece or waste time help the opponent | [`check.waste`: check played, piece lost within 2 plies] |
| M03 | "Always capture when you can" | Some captures lose to a recapture or a trap | [`greedy.capture`: capture with SEE<0 or allowing a tactic] |
| M04 | "I can ignore their last move if my plan is faster" | Their threat usually comes first | [`allowed:*` threat existing before move + own threat played] |
| M05 | "Trade pieces when I am behind / trade anything equal" | Trade when ahead or when it removes their best piece; avoid when behind | [`unfavorable.trade` by win% loss] |
| M06 | "The queen should attack early" | Early queen moves lose time and get chased | [`early.queen`: queen moves ≥2 before ply 12 followed by a loss of tempo/piece] |
| M07 | "Move the same piece again and again in the opening" | Develop each piece once | [`opening.repeat_piece`] |
| M08 | "My king is fine in the middle" | Castle early | [`king.center` past ply 20 with open lines] |
| M09 | "I counted attackers/defenders and it was safe" | Miscounted exchanges lose pieces | [SEE mismatch between learner's stated count and truth in drills] |
| M10 | "A winning position can't be spoiled" | Stalemate/back-rank can ruin it | [`stalemate.risk`, `no.luft` allowed] |
| M11 | "A sacrifice makes an attack" | Sacrifices need a calculated follow-up | [`unsound.sacrifice`: material given, no compensation at depth 12] |
Learner-facing copy uses `learnerPhrase` ("A belief that may be costing you games: 'a protected piece is safe'.") — never accusatory. A misconception is **active** when `minOccurrences` hits occur within `windowGames`; the planner (Phase 5 §5.2) gets a bonus term for the linked skill and schedules the linked lesson plus 4 drills built to *contradict* the belief (positions where "protected" pieces still fall, etc.). **Resolved** after 10 games without recurrence.
Data: `MisconceptionState{id, status, hits:[{gameId,ply}], activatedAt?, resolvedAt?}`.

### 1.4 Coach memory & transparency ("what Mentor knows about you")
Durable, human-readable observations with evidence: `CoachMemory{id, text, evidence:[ref], firstSeen, lastConfirmed, status:'active'|'faded'|'dismissed'}`. Examples: "You play faster after losing a piece (3 of last 5 games)", "Your first big mistake is usually between moves 10 and 14", "Hanging-piece errors dropped from 40 % to 22 % in 6 weeks".
Generation: rule-based pattern miners over `PlyRecord/Mistake/Attempt` (time after loss, phase of first mistake, time-of-day accuracy, piece-type of hanging pieces). Each memory must cite ≥ 3 data points. The learner can **dismiss or correct** any memory; dismissed ones are never used. The teacher note and chat may only reference active memories.

## 2. Analyse-first review ("find it yourself first")
Research (experienced players, coaches): analyse the game **without the engine first**, then check; replay with evaluation hidden; return to the critical position and play it out. Review therefore has two modes (setting default = **Find it first** for losses):
1. **Find it first** — hide eval bar, graph, badges, and best moves. The learner navigates the game and presses **"I found my first big mistake"** at the move they think it is (or "I don't see one"). Then we reveal: compare their pick with the algorithm's *first meaningful mistake* (Phase 3 §4): *exact*, *off by ≤ 2 plies*, *different*, *none found*. Result updates `self_analysis` evidence (high weight) and diagnoses (e.g. learner can't see their own errors → more guided review).
2. **Show me** — current prototype behaviour (everything visible).
After reveal: the self-explanation prompt (Phase 4 §5) → diagnosis → **Play it out**: start from the pre-mistake position vs the sparring opponent at the learner's level (Critical Position mode) for ≥ 8 moves; result stored as `decision` evidence.
Quota: Find-it-first on ≤ 2 games per day (time), the rest Show-me, to avoid fatigue.
Data: `ReviewAttempt{gameId, mode, learnerPickPly?, truthPly, delta, at}`.

## 3. Two kinds of tactics practice (recognition vs calculation)
Research (blog, consistent with learning science): recognition and calculation are different skills; mixing them wastes effort. Split the puzzle widget (Phase 8) into two modes with different rules, both feeding different evidence layers.

| | **Recognition sprints** | **Calculation deep-dives** |
|---|---|---|
| Purpose | spot the motif quickly, build pattern bank | work out a line fully |
| Puzzle choice | known themes, ratings the learner solves ≥ 85 % | ratings where predicted success ≈ **70 %** (logistic on in-app Elo; configurable `calcTargetP`) |
| Volume/time | 10–20 per set, soft target 5–15 s each **only after** accuracy ≥ 90 % over last 20 | 2–4 per set, **minimum think time** (default 90 s, `calcMinThinkMs`) before the move input unlocks; timer is a nudge ("keep looking — what can they answer?"), not a lock if the learner taps "I'm sure" |
| Input | one move | **write the line first** (click the whole sequence on the board in a "plan" overlay) then confirm; solved only if the **full line** matches; partial = not solved |
| Hints | ladder as usual | ladder + "show opponent's best reply" only at H3 |
| Evidence | `recognition` | `calculation` (weight 1.5) |
| Board | normal | optional **"real board" toggle**: hides piece highlights and animations; reminds "use a physical board if you have one" |
Rule of thumb enforced: *accuracy before speed*. Speed bonuses (timers shown) switch on only when the accuracy gate is met. Diagnosis (planner): if recognition accuracy high but calculation low → more deep-dives; if the learner misses opponents' tactics in games → recognition sets built from their own game positions.
Both are selected by the planner via `PuzzleService.next({mode})`.

## 4. Visualization training (the `visualization` skill finally gets exercises)
Sources recommend replaying games from memory and seeing sequences without moving pieces. Exercise types (all engine-free, rule-based, deterministic):
1. **Flash position**: show a position (6–12 pieces, taken from the learner's games or puzzles) for N seconds (start 8 s), hide, learner reconstructs by drag-drop; score = pieces correct; N shrinks as accuracy stays ≥ 80 %.
2. **Blind replay**: show 6 plies of notation (e.g. the learner's opening) with no board; ask "where is the white knight now?" / "is e5 attacked?".
3. **Square/knight drills**: colour of a named square; shortest knight route between two squares.
4. **Hidden-board calculation**: board shown, then pieces fade after the first move of a 2–3 ply line; learner states the final position or best reply.
Scheduling: 2–3 min block inside the *drills* block 2× per week once `calculation_2ply` is introduced. Evidence → `visualization` (knowledge/recognition layers).

## 5. Expectations, honesty, wellbeing, and training conditions
### 5.1 Expectations screen (onboarding + Profile)
Plain-language facts the learner sees up front:
- Improvement is measured in months; **no timeline is promised** (one popular "2–4 months" claim came from an affiliate plan with no data; see research notes).
- Ratings are noisy; short-term dips are normal, especially when you play stronger opponents.
- We rely on coaching practice, not proven trials; **we will measure whether it works for you** and show the evidence with uncertainty.
- What we track instead of only rating: blunders per 40 moves, missed threats, retention, calibration.
- Puzzle ratings run much higher than game ratings for most people; don't chase them.

### 5.2 Training conditions policy (hard rules, config)
- Only games with base time ≥ 10 min or increments making total ≥ 15+10-equivalent count as **training evidence**; faster games are allowed for fun but excluded from planner decisions and gate metrics (flag `evidenceEligible`).
- Review-freshness: unreviewed games older than 48 h show a gentle badge; the best time window is within 48 h (research-opinion, treated as a nudge not a rule).

### 5.3 Adaptive matchmaking
Track `levelEstimate` with an Elo-like update (K=24) from results vs sparring levels. Recommend the level where expected score ≈ 40–60 %; every 5th game offer a "challenge" one level up (win-rate dips there are labelled normal). Display **performance vs opponent strength** ("You scored level with 800-rated bots") instead of raw win rate.

### 5.4 Wellbeing, tilt, fatigue
| Signal | Rule | Action (never punitive) |
|---|---|---|
| 2 consecutive losses | in-session | offer: "Take a 5-minute break, review the last game, or play a lower level" (default highlighted: review) |
| 3 consecutive losses with move time collapsing | tilt flag (low confidence) | stop auto-suggesting new games; ask "how are you feeling?" (1-tap); log |
| In-session accuracy drops ≥ 30 % vs the session's first third and times shorten | fatigue flag | "Good place to stop — 3 more drills or call it a day?" |
| Time-of-day pattern (needs ≥ 15 games) | miner | memory item: "You blunder more after 11 pm" |
| Daily cap reached | | session ends with a positive summary, no "one more game" nudges |
Check-in: 1-tap mood/energy (1–5) before and after sessions (optional; powers the miner; skippable forever).

## 6. Reminders and accountability (local-first friendly)
- A true push reminder needs a server; we avoid that (privacy, cost). Options in priority order: (a) **calendar file export (.ics)** with a recurring daily event at the chosen time; (b) in-app banner on open; (c) optional browser notifications **only while installed as a PWA and permitted** (**VERIFY** platform support; do not rely on it).
- "Share with a human": export a **Coach Report** (HTML/PDF): metrics with uncertainty, top 3 mistakes with board images, active memories, plan. Also **annotated PGN export** (our review comments + classifications) so a human coach or friend can open it on Lichess.
- Optional later: PvP rooms with post-game coaching (Phase 18 of blueprint v1).

## 7. Curriculum reorder & missing skills
Add skills (to Phase 5 §2 table) and content:
- `rules_fluency` (castling conditions, en passant, promotion choice, stalemate vs checkmate, threefold/50-move/insufficient material) — **Phase 0/1**. Detect: illegal-move attempts per game, games lost/drawn by missing a stalemate/draw rule; onboarding 8-question check.
- `material_counting` (piece values, trade arithmetic, counting attackers/defenders) — **Phase 1**, linked to misconception M09.
- **Basic mates (K+Q vs K, K+R vs K) move from Phase 6 to Phase 1–2** (sources: "learn basic checkmates" is the most common advice below 1000; also prevents stalemate disasters). Keep deeper endgames in Phase 6.
- Early opening principles (3 rules) stay light in Phase 1–2; repertoire work stays Phase 4.

## 8. Teaching style policy (how the teacher talks)
- **Ask-before-tell (default on):** for a mistake, first ask what the learner was thinking/aiming for; for puzzles, the threat-statement step; reveal afterwards. Setting "Just tell me" switches to direct explanations (some adults find Socratic style frustrating — per teacher guidance — so it is adjustable). If the learner skips ≥ 3 questions in a row, reduce question frequency automatically and mention it once.
- **Same mistake, new angle:** if an explanation was shown for the same motif ≥ 2 times without improvement, change modality (arrow-first visual, different analogy, a simpler position) instead of repeating the same words. Analogy library per motif (`content/analogies/*.json`).
- **Talk about moves, not the person:** lint (Phase 5 §8) + templates.
- **One idea per message; ≤ 90 words.** Longer explanation = expandable "More".

## 9. Beyond the screen
- **Real-board tasks** (opt-in via `ownBoardAccess`): weekly "calculate without moving pieces", "set up this position and play it against a friend", and logging one over-the-board/club game via move entry or PGN. Sources note that slow over-the-board games build sound habits.
- **Resources shelf** (optional, non-affiliated, clearly labelled): books/videos that sources mention for this level — e.g. Silman's *Complete Endgame Course*, Keres's *Practical Chess Endings*, Chernev's *Logical Chess: Move by Move*, Heisman's suggestions for beginners (*Chess Tactics for Students*, *Everyone's 2nd Chess Book*). Listed as "recommended by experienced players in our research", never presented as endorsed or proven; no affiliate links.
- **Community/accountability**: none in v1 (see COVERAGE.md for rationale and the future option).

## 10. Amendments applied to earlier phases (patch list)
| File | Change |
|---|---|
| `00-INDEX.md` | Phase table gets row 10; decisions D16–D18 added |
| `03-chess-core.md` §6.9 | New motif ids: `check.waste, greedy.capture, unfavorable.trade, early.queen, opening.repeat_piece, king.center, stalemate.risk, no.luft, unsound.sacrifice` (detector specs in §1.3 above; same engine-confirmation rule §6.10) |
| `04-import-review.md` §1 | Onboarding adds rules check (8 Qs) and think-aloud baseline (§1.2); review modes Find-it-first/Show-me (§2) |
| `05-learning-engine.md` §2 | Skills `rules_fluency`, `material_counting` added; misconception bonus in planner score; wellbeing rules (§5.4) feed consequences |
| `06-content.md` §5–6 | Basic mates in Phase 1–2; visualization exercise content (§4); analogies library; resources shelf |
| `07-teacher-ai-opponent.md` §5 | Ask-before-tell policy and modality switching (§8) |
| `08-ui-wiring.md` | New screen **Profile** and review mode toggle (prototype updated), puzzle widget modes (§3) |
| `09-quality-ops.md` §2 | Metrics added: self-analysis agreement rate, misconception resolution, mood check-in adherence |

## 11. Where this lands in the milestones
- **M1:** rules check + think-aloud baseline, Find-it-first review, review-freshness nudge, annotated PGN export.
- **M2:** Profile screen, two puzzle modes, misconception catalogue (M01–M05 first), wellbeing rules, expectations screen, `.ics` export, basic mates lessons.
- **M3:** adaptive matchmaking, ask-before-tell modality switching.
- **M4:** visualization exercises, real-board tasks, resources shelf, Coach Report export, remaining misconceptions.

## 12. Acceptance tests
- [ ] Find-it-first: reveal comparison correct for exact / ±2 / different / none (table-driven).
- [ ] Calculation mode: a partially correct line is *not* marked solved; speed timers hidden until the accuracy gate is met.
- [ ] Misconception activation/resolution works on a fixture of 12 games; learner phrase contains no banned words.
- [ ] Coach memory refuses to create an item with < 3 evidence rows; dismissed memory never appears in notes.
- [ ] Wellbeing: two scripted losses trigger the break offer; daily-cap summary shows no "play more" prompt.
- [ ] Training-evidence filter excludes < 10-minute games from planner inputs but keeps them in history.
- [ ] `.ics` export opens in a standard calendar app with a daily recurrence at the chosen time.
