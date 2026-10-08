# Personal Chess Coach — Blueprint v2: The Teacher System

Status: design only. This document **extends** `blueprint-v1-original.md` (kept unchanged next to it). Where v2 conflicts with v1, v2 wins. v1's philosophy (engine = truth, AI = explainer, learner-centred, transfer over puzzle score) stays.

Written 8 Oct 2026 after reviewing v1 against the owner's real goal.

---

## 0. The real goal (restated)

A ~600-Elo player who:

1. cannot do a proper board analysis and does not think forward;
2. blunders and misses things constantly;
3. has no middlegame plan and no endgame knowledge;
4. plays a fixed opening and forgets any new opening or tactic;
5. wants to understand **their own** mistakes, and be taught **like by a human teacher**, not graded by a bot;
6. wants a website that **plays with them like a teacher** and shows how a strong player thinks;
7. wants the coach to use the large free resources (engines, datasets, free AI tiers) as deeply as possible.

## 1. Does v1 do what is wanted? Honest verdict

| Goal | v1 coverage | Gap |
|---|---|---|
| Board analysis, forward thinking, blunders | Good (§9.1–9.6, CCT, blunder check) | No daily routine that actually *drills* the habit; no measurable definition of "missed threat" |
| Middlegame / endgame | Listed (§9.8–9.11) | No concrete ladder, no minimum viable content |
| **Forgets openings and tactics** | **Almost absent** (v1 says "avoid memorization") | Needs a retention system (spaced repetition on understood ideas) — added in §6 |
| Understand own mistakes | Strong concept (§11) | Diagnosis evidence is hand-waved — fixed in §8 |
| **Teacher feel: daily task, daily test, consequences, weekly review** | **Missing** | The biggest gap — §3–§5 |
| **Plays like a teacher** | Mode list only (§10) | Teacher behaviours in-game undefined — §5 |
| **"Play like a pro"** | Missing | Model-game and "think like a master" training — §7 |
| Use free resources deeply | Listed (§13, §16) | No concrete mapping resource → feature — §9 |
| Buildable | No MVP, 8 phases at once | v1 scope — §10 |

Conclusion: v1 is a good *philosophy* document. It lacked the **teacher's operating routine** (what happens every day and week), the **retention system**, and a **buildable first version**. v2 adds them.

## 2. What teachers actually do — research digest

Honesty note: I could search articles and summaries, not read the books themselves. Items marked **[source]** come from pages found; **[synthesis]** is my reasoning. Sources are listed at the end. Re-verify before treating any claim as settled; several (Woodpecker results, deliberate-practice effect size) are disputed or anecdotal.

1. **Few ideas at a time.** A coach interviewed on blunders says that for beginners "everything needs to be very simple" **[source: Say Chess]**. → one focus skill per week.
2. **Replace "don't blunder" with a concrete action.** "Avoid blunders" is a non-action; a habit you *perform* (a fixed pre-move check) works better **[source: Say Chess]**. → the Safety Check routine (§4).
3. **Adults mostly just play games.** A teacher of adults and kids reports the typical adult mistake is "games only – no analysis after the game, no openings study, no puzzles" **[source: Fiverr coach listing — weak evidence, anecdotal]**. → the daily plan forces all four: game, review, puzzles, opening.
4. **Checks, captures, threats — both sides' — in that order** (Heisman) **[source: ICC/Heisman page]**. v1 already has CCT; v2 makes it the first step of every drill.
5. **Puzzles: solve fully, slowly, before moving.** Quality over quantity; calculate the line to the end **[source: coach blog]**. → no speed puzzles until accuracy is stable.
6. **Repetition of a fixed set (Woodpecker).** Solve a set, then repeat the *same* set faster in successive cycles **[source: Woodpecker summaries]**. Evidence is anecdotal (GM-norm story); critics argue tactics don't compress into rules the way vocabulary does, so spaced repetition fits **openings and conceptual cards** better than tactics **[source: Zwischenzug]**. → v2 uses Woodpecker-style *cycles* for tactics, and spaced repetition for openings/concepts.
7. **Lesson → drill → next step (Dutch "Steps" method).** Six levels; each is thematic lessons followed by exercises; difficulty rises mainly by calculation depth; a coach who sees "step 2 mistakes" in your games keeps you on that level longer **[source: Lichess blog/forum on Steps]**. → our phases are gated by evidence from the learner's own games, the same idea.
8. **Deliberate practice:** well-defined tasks, informative feedback, repetition, self-reflection; without good feedback improvement is minimal **[source: Ericsson summary]**. The size of its effect is debated (Macnamara et al. 2016 vs Ericsson) — so we use it as a design guide, not a promise.
9. **Retrieval and spacing** are the best-supported learning techniques (Carpenter, Pan & Butler 2022 review) **[source]**. → daily test starts with retrieval of *old* material, not just new.
10. **Streaks help, and broken streaks hurt.** Highlighting a streak raises continuation, but users whose streak breaks are more likely to quit; gamification can also replace intrinsic motivation **[source: JCR study, secondhand]**. → streaks with freeze days and a "welcome back" path; **no punishment that triggers shame** (§4.4).
11. **Psychology of mistakes.** Rowson's "Seven Deadly Chess Sins" (thinking, blinking, wanting, materialism, egoism, perfectionism, looseness) is a taxonomy of *why* strong-ish players err; reviewers say much is above beginner level **[source]**. → we borrow the idea of tagging the *psychological* cause (rushing, over-wanting own plan, fear of losing material) but use plain beginner wording.
12. **Fast time controls produce more blunders; review your own games to find repeating mistakes** **[source: Lichess forum answer]**. → default to slow games for training (15+10 or slower), blitz is "optional fun, not training data".

## 3. The Teacher Loop (the core of v2)

A human teacher gives: a lesson, homework, a test, feedback on *your own games*, consequences for sloppy work, and a plan. The site must do all six.

### 3.1 Daily session (target 30–45 min, hard cap configurable)

| # | Block | Min | What happens | Why |
|---|---|---|---|---|
| 1 | **Warm-up recall** | 5 | 5 cards from *earlier* material (old tactic, opening idea, a past blunder position) — answer before seeing hints | retrieval + spacing |
| 2 | **Today's lesson** | 5 | One idea only (e.g. "undefended pieces"). Short, one board, one analogy. Ends with a 1-question check | few ideas at a time |
| 3 | **Guided drills** | 10–15 | 6–10 positions on the lesson. Player must state **checks / captures / threats** (both sides) *before* playing. Hint ladder: none → nudge → highlight → reveal | CCT habit, fading help |
| 4 | **Play block** | 15–25 | A slow game or a "critical position" from the player's own games, played out against the teacher-opponent | transfer |
| 5 | **Daily test** | 5 | See §3.2 | feedback + retention |
| 6 | **Teacher note** | 1 | 3 lines: what went well, one thing to fix, tomorrow's focus | closes the loop, reduces overload |

Skippable only by choosing "light day" (blocks 1, 3 shortened, 5) — never silent skipping.

### 3.2 Daily test

- 8–10 questions, **interleaved**: ~50 % old material (due cards), ~30 % today's, ~20 % "mixed trap" positions where the lesson does *not* apply (prevents pattern-guessing).
- Each answer needs a **confidence rating** (sure / unsure / guess). Being sure and wrong is the most valuable signal.
- Graded on **process and outcome**: Did you state the opponent's threat? Did you check the landing square? A correct move reached by guessing counts as "unstable".
- Output: updates the skill state (v1 §7) and schedules the next review of each item.

### 3.3 Weekly cycle

- **Day 1–5:** daily sessions, one *focus skill* for the week (chosen from the blunder log).
- **Day 6 — Review day:** replay the week's games with the teacher: the one first meaningful mistake per game, the player's self-explanation first (what did you intend?), then the teacher's.
- **Day 7 — Weekly exam (15 min):** unseen positions built from the player's own mistakes + the week's skill + two old skills. Result decides: advance, stay, or step back.
- **Rest rule:** at least one rest day per week, enforced as a feature (burnout and tilt are real).

### 3.4 Monthly check-up

Re-play 5 oldest-blunder positions without help; compare blunder rate per game against the baseline; teacher writes a short letter: strengths, the one bottleneck, next month's plan. Phase gates (v1 §8) are decided here, from evidence, not from a score threshold.

## 4. The Safety Check and consequences ("punishments", redesigned)

### 4.1 The Safety Check (the one habit the whole product trains)

Before every move in training and coach mode:

1. **What did their last move do?** (threat, new attack, discovered line)
2. **Checks, captures, threats — theirs, then mine.**
3. **Pick a candidate. Where can the opponent's best reply land?** (is anything left hanging, is my king safe)
4. **Blunder check:** "If I play this, what is the *first thing* they will capture or check?"

Trained as a concrete action (point at squares / name them), per research point 2.

### 4.2 What triggers a consequence

Only **process failures**, never losing a game: skipped the Safety Check; rushed (move in < N s in a critical position); repeated the *same* blunder type after it was taught; skipped the daily test.

### 4.3 Consequences that teach (instead of punishment)

| Trigger | Consequence | Purpose |
|---|---|---|
| Any blunder in a game | **Blunder Box**: the position becomes a card; it returns after 1 day, 3 days, 7 days, 21 days until solved cleanly 3 times | the exact error is repaired, not forgotten |
| Rushed move on a critical position | **Slow-down lock**: for the next few moves the move button needs a one-line threat statement | forces the missing step |
| Same blunder type 3× in a week | **Back-to-basics drill**: next session is only that skill, hints on | stops practising a bad habit |
| Failed weekly exam | **Stay on skill**: not advanced; the teacher states exactly what evidence is missing | honest gating |
| Skipped sessions | **Welcome-back path**: short 10-minute re-entry session; streak "freeze" days exist; no guilt text | broken streaks make people quit (research point 10) |
| Hint dependency | Hints cost "coach points" (visible, not punitive) — fewer hints raise the independence score | assistance fades |

### 4.4 Hard rule

No humiliating language, no loss of progress, no public shaming. v1 principle #9 stands: a consequence must be something the player can *do* that makes them stronger. If a consequence only makes the player feel bad, it is cut.

## 5. The teacher at the board

"Plays like a teacher, not a bot" means specific, designable behaviours:

1. **Opponent strength ladder.** Human-like opponent at the player's level, rising slowly. Candidate engine: Maia (trained on Lichess games at 1100–1900; Lichess bots @maia1/5/9 exist). Caveats found: they play above their label, and **I could not verify Maia's licence — check before use**. Fallback: Stockfish with limited skill plus a human-error model; treat as replaceable.
2. **Sparring rhythm.** The teacher sometimes plays a quiet move that *sets a trap that the learned skill defends against* (training-mode only, and disclosed afterwards: "I left that fork on purpose — you caught it").
3. **Take-back with a question.** After a blunder in coach mode the teacher can offer: "Want to take that back? First tell me what I threaten." If the player finds it, the take-back is granted; if not, a hint ladder runs.
4. **"Ask the teacher" button** with a ladder: (a) "look at the opponent's last move" → (b) "check this piece" → (c) "here is the threat" → (d) best move. Each rung costs coach points.
5. **Silent in normal play.** Normal Play records evidence only and never interrupts.
6. **Post-game conversation, not a report.** Teacher asks: "Where did you feel unsure?" → shows the first meaningful mistake → asks the player to guess the reason → then reveals the diagnosis. Player's own words are stored.
7. **Voice and tone.** Direct, calm, specific; names the *habit*, not the person. The explanation text is produced by an LLM from verified engine facts (v1 §12), with a post-generation check that every move and square mentioned exists in the analysis package.

## 6. Openings and tactics that stick (the "I always forget" problem)

v1 mostly said "don't memorise". The owner's real problem is **forgetting**, so v2 treats retention as a first-class feature.

- **Tiny repertoire first:** one system as White, one answer to 1.e4, one answer to 1.d4 (chosen with the owner; favour setups with clear plans and few forced lines).
- **Understand → then memorise.** Each opening node is a card with *three* parts: the move, **why** (idea in one sentence), and **what the opponent's common deviation is**. Cards with no "why" are not created.
- **Spaced repetition scheduler** (SM-2/FSRS-style; FSRS is open-source) for opening cards, tactic patterns and Blunder Box positions. Scheduling is deterministic; no LLM involved.
- **Data from the player's real games:** the first move where the player left the book becomes a card ("you went wrong here in 4 games").
- **Tactics:** Woodpecker-style cycles of a fixed personal set (~100–300 positions to start, drawn from the Lichess puzzle database by theme and rating), repeated in shorter cycles; the set is rebuilt from the player's own misses.
- **Interleave** different motifs in drills so the player must *identify* the pattern, not just apply the lesson of the day.
- **Forgetting detector:** if a previously mastered card is failed, it returns to a shorter interval and the skill state records decay (v1 §14).

## 7. "Play like a pro" — teaching how strong players think

Not by showing engine lines but by modelling the thought process:

1. **Think-aloud model games.** Short, annotated games (public-domain PGNs) where each key move pauses: "Before I show the move, what is the opponent threatening? What are the candidates?" The player guesses, then sees the master's reason in plain words.
2. **Guess-the-move** on pro games with scoring on *reasoning*, not exact move match.
3. **Plan templates** for the middlegame: list weaknesses → worst-placed piece → pawn break → trade or keep tension. Applied step by step in "Critical Position" mode (v1 §10).
4. **Endgame ladder** (each rung has a pass test): (1) K+Q vs K mate, (2) K+R vs K mate, (3) K+P: opposition and key squares, (4) square of the pawn / pawn races, (5) basic Lucena and Philidor ideas, (6) converting an extra piece safely.
5. **Pro habits list** shown as short cards: don't move until you know the threat; trade when ahead; improve your worst piece; king safety before attack; time spent matches position difficulty.

## 8. Diagnosis: how the system can really know *why* a mistake happened

The engine says *what* was bad. The following signals suggest *why*; the coach shows the diagnosis as a **hypothesis with a confidence**, and the player can correct it.

| Cause | Signals | Confidence |
|---|---|---|
| Didn't see the threat (perception) | Fast move; Safety Check skipped or skipped threat statement; piece attacked by a one-move threat | high if threat statement missing |
| Saw but misjudged (calculation) | Player *wrote* the threat but chose a move that fails to a 2–3-ply line | high |
| Over-focused on own plan | Move creates own threat while ignoring theirs; self-explanation names only own idea | medium |
| Rushed / time | Time per move far below player's own median in a critical position | medium |
| Knowledge gap | Same motif missed in lessons and tests, not only in games | medium |
| Transfer failure | Solves the motif in drills, misses it in games (v1 §7) | high with enough samples |
| Fear / tilt | Streak of blunders after losing material; rapid moves | low — ask the player |

Because single games give thin evidence, the system **asks one short question at the critical move** ("What were you aiming for?") in coach mode rather than guessing silently.

## 9. Mapping free resources to features

| Resource | Use | Notes |
|---|---|---|
| Stockfish (GPLv3) in the browser (WASM) | analysis, tactic verification, blunder detection | GPL affects distribution — decide early, personal use is simple |
| Lichess puzzle DB (CC0) | tagged tactic reservoir by theme and rating | filter by theme and rating; build personal sets |
| Lichess open game DB (CC0) | opening statistics: what real players around 600–1200 actually play; deviation lines | choose "what to expect at my level", not master theory |
| Lichess/Chess.com game export | import the player's own games | API terms to check |
| Maia (human-like) | teacher-opponent | licence **unverified** |
| FSRS (open-source) | spaced repetition scheduling | deterministic |
| Free LLM tiers (Gemini / Groq / OpenRouter) | wording of explanations, teacher notes | behind a provider interface; verified facts only; app must still work with LLM down (templated text fallback) |
| Static hosting + local storage (IndexedDB) | zero-cost personal deployment | cloud sync optional later |

## 10. Version 1 scope (what to build first)

**Goal of v1:** prove the loop *own game → first meaningful mistake → diagnosed → repaired by Blunder Box + daily drill → retested in a later game.*

In scope:
- Board, play vs. a level-appropriate bot (Stockfish limited / Maia if licence OK), PGN import.
- Browser Stockfish review that finds the **first meaningful mistake** per game and labels basic motifs (hanging piece, fork, missed check/capture) with rule-based detection (not an LLM).
- Blunder Box with a spaced-repetition scheduler.
- Daily session skeleton: recall → one lesson (Safety Check) → drills → one game → test → teacher note.
- Safety Check coach mode in play.
- Local storage only.

Out of scope until v1 works: endgame ladder, middlegame plan templates, model-game tool, accounts, mobile app, voice.

## 11. Things the original brief did not mention but matter

- **Time control for training:** slow by default (15+10 or slower).
- **Session length cap and rest days** to avoid burnout and tilt.
- **Calibration:** a first-session baseline (5 imported or played games + 20 positions) to fix the starting level; rating self-report is not trusted.
- **Honest metrics:** blunders per 40 moves, missed-threat rate in coach-mode games, Blunder Box clear rate, retention of old cards, plus rating as outcome only. A "success" needs a baseline and N games; no claims before data.
- **Measuring whether the coach works:** compare the player's own before/after rates; also log which lesson types didn't help and retire them.
- **Privacy:** local-first; no cloud upload without explicit opt-in; games, answers and timing are stored only to drive training; the user can export/delete everything.
- **Accessibility:** colour-blind-safe board themes, keyboard move entry, readable text sizes.
- **Offline use** for drills and cards.
- **Licensing ledger** before any public release (engine, models, datasets, board library, fonts).
- **Failure modes:** LLM down → templated explanations; engine slow on phone → lower depth and mark as lower confidence.

## 12. Open questions for the owner

1. How many minutes per day can you actually commit, and on which days?
2. Which platform are your games on (Chess.com, Lichess, both)? Can you export 10–20 games?
3. Personal use only, or do you plan to share it publicly (decides GPL/licensing handling)?
4. Preferred openings: do you want to keep your fixed opening and add a second, or restart with a new small repertoire?
5. Should the teacher have a name/persona, and should it speak in short text or voice?
6. Is one 15-minute "play block" enough, or do you want a longer game on weekends?

## Sources

- Blunder coaching interview: https://saychess.substack.com/p/7-interview-with-ono-about-blunders
- Adult-beginner coaching listing (anecdotal): https://fiverr.com/ironchess/coach-you-in-chess
- Lichess forum on blunders/time controls: https://lichess.org/forum/redirect/post/2ii6Uj57
- Woodpecker Method summaries: https://forwardchess.com/blog/what-is-the-woodpecker-method/ , https://www.houseofstaunton.com/blogs/chess-tutorials/the-woodpecker-method
- Spaced repetition vs Woodpecker discussion: https://zwischenzug.substack.com/p/spaced-repetition/comments
- Steps (Dutch) method: https://lichess.org/@/HanSchut/blog/the-steps-method-for-learning-and-teaching-chess/L74I4Ihq , https://lichess.org/@/NoelStuder/blog/the-chess-step-method-explained/QCCUDwgt
- Heisman (CCT, safe moves): https://forwardchess.com/blog/book-review-a-guide-to-chess-improvement/ , https://www.chessclub.com/videos/webcast/icc/c/Heisman/2016_07_02/Heisman.html
- Rowson, Seven Deadly Chess Sins: https://www.newinchess.com/seven-deadly-chess-sins-the , https://perpetualchesspod.com/new-blog/2021/1/29/book-recap-the-seven-deadly-chess-sins
- Maia: https://lichess.org/@/lichess/blog/introducing-maia-a-human-like-neural-network-chess-engine/X9PUixUA
- Spacing/retrieval: https://teach.cvm.iastate.edu/?p=2949 (summarises Carpenter, Pan & Butler 2022)
- Streaks/gamification: https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
- Deliberate practice: https://www.progressfocused.com/2020/08/who-was-anders-ericsson.html
