# Research notes: how to get from ~600 to 1000+ (and how a human teacher actually works)

Compiled 10 Oct 2026 from web searches and page reads. **Evidence quality is low-to-moderate everywhere**: nearly all of it is coach opinion, forum posts, blogs, and one correlational Lichess analysis. No controlled study comparing puzzles vs games vs analysis for rating gain was found. We therefore treat every item below as a **design hypothesis to be measured on the learner** (see `backend/09-quality-ops.md` §2), not as proven fact.

Quality key: **S** = structured/expert source, **B** = blog/forum opinion, **C** = commercial/affiliate (discount), **R** = research-adjacent (learning science / ITS literature).

## 1. What sources agree on for players under ~1000

| # | Finding | Sources (quality) | Becomes in our design |
|---|---|---|---|
| 1 | Under 1000, most games are decided by hanging pieces and simple tactics; "stop hanging pieces, learn basic tactics, learn basic checkmates" was the most common advice from experienced players | [2000+ players survey blog](https://www.chess.com/blog/MagicianSlayer/i-asked-50-players-rated-2000-for-advice-to-beginners-heres-what-they-said-part-1) (B; body lists 10 interviews, not the 50 in the title), [Chess.com forum](https://www.chess.com/forum/view/for-beginners/how-to-reach-1000-elo-from-600-elo-anything-helps) (B) | Phase 1–2 focus; basic mates moved **earlier** (see addendum §7) |
| 2 | Stage guidance: below ~500 stop hanging pieces and take free material; ~500–1000 add one-move ideas (forks, pins, discovered checks) | [Chess.com blog](https://www.chess.com/blog/nekochabo/why-your-tactics-arent-improving)-adjacent forum thread (B) | Skill order in Phase 5 §2 already matches |
| 3 | Pre-move scan: checks, captures, threats for **both** sides; ask what the opponent's last move attacked; deal with that before your own plan | forums, [Heisman via ICC page](https://www.chessclub.com/videos/webcast/icc/c/Heisman/2016_07_02/Heisman.html) (S/B) | Safety Check (already core) |
| 4 | **Analyse your own games without the engine first**, then check with it; replay with the eval bar hidden; return to the critical position and play it out vs an engine near your rating | survey blog (B), Lichess forum (B) | **New:** "Find it yourself first" review mode (addendum §2) |
| 5 | Review **losses**, and review soon (one source: within ~48 h) — but students tend to skip their worst games and pick "explained" ones | [Heisman adult lessons](https://www.danheisman.com/adult-lesson-guide2.html) (S), [time-management article](https://www.uschessacademy.com/blog/time-management-tips-adult-chess-students) (B/C) | **New:** auto-queue worst/lost games + review-freshness nudge (addendum §6) |
| 6 | Tactics training fails when it is random, mixes recognition and calculation, is rushed, or avoids your own games. Fix: diagnose which skill is weak; **recognition = fast & many**, **calculation = slow, written lines, real board, exercises you solve ~70 % of the time, ≥10 min, not "solved" if you missed something important**; speed only after accuracy | [nekochabo blog](https://www.chess.com/blog/nekochabo/why-your-tactics-arent-improving) (B) | **New:** two puzzle modes with different rules (addendum §3) |
| 7 | Puzzle ratings run far above live ratings (people report +500–700) because puzzles have a single best move and no clock; correlation with game rating exists but causation untested | [Lichess data analysis](https://lichess.org/@/ggSayItBack/blog/do-puzzles-matter-a-data-analysis/twAyjQDX) (B, correlational) | Never present puzzle rating as the goal; show it with an explanation (addendum §5) |
| 8 | Slower time controls (≥10 min rapid; increments like 15+10, 25+10) for learning; avoid 3-min blitz; "speed comes after accuracy" | several (B); Heisman suggests ~45-min slow games with delay (S) | Policy: only slow games count as training evidence (Phase 5 §5.3 already uses 15+10; make it a hard rule in addendum §5) |
| 9 | Opening: ideas over theory below ~1600; simple setups; basic principles (centre, develop, castle) | survey blog (B), chessgrandmonkey plan (C) | Small repertoire with *why* (Phase 6 §3) |
| 10 | Endgames: opinions differ; consistent core = basic king+queen and king+rook mates, then king-and-pawn basics | survey blog, plan (B/C) | Endgame ladder rungs 1–3 pulled forward |
| 11 | **Visualization / replay a game from memory**, candidate-move checklist, "what does my opponent want?" | survey blog (B) | `visualization` skill gets real exercises (addendum §4) |
| 12 | Play opponents at or slightly above your level; win-rate dips are normal and not regression; a sparring partner near your level was cited as the most helpful factor by one player | Heisman (S), survey blog (B) | Adaptive matchmaking + "performance vs opponent strength" display (addendum §5) |
| 13 | Teachers ask questions (Socratic) instead of just telling; ask "what were you thinking?"; check time per move — the same move in 20 s vs 10 min means different things | Heisman (S) | **New:** ask-before-tell policy (addendum §8); time already in diagnosis |
| 14 | Adult constraints: limited time, slow visible progress (months–years), repeated mistakes persist before fading, fatigue/hunger cause blunders, corrections should be about moves not the person | Heisman (S) | Wellbeing & expectation module (addendum §5) |
| 15 | Timelines: "2–4 months to 1000" appears only in an **affiliate** plan with no data; experienced players report wildly varying times (1–6 years to 2000) | chessgrandmonkey (C), survey blog (B) | **We make no timeline promise.** Honest-expectations screen (addendum §5) |
| 16 | Playing many games alone does not improve you; practice must be deliberate | survey blog (B), coaching blogs (B) | Core thesis of the product |

## 2. Learning-science and tutoring-system findings (R)
| Finding | Source | Design use |
|---|---|---|
| Intelligent tutoring systems share four parts: **domain model, student model, pedagogical model, interaction layer**; the student model is updated after each response and the pedagogical model chooses the next action | [Cognitive-tutor architecture summaries](https://wiki.ubc.ca/MET:Cognitive_Tutors) (R, secondary) | Our module split (Phases 3/5/7/8) maps 1:1; add explicit "student model" docs (addendum §1) |
| **Model tracing** (follow each step, give hints/errors) + **knowledge tracing** (mastery per knowledge component → pick problems) | same | Step-level feedback in drills (threat-statement step); Phase 5 skill states |
| Graduated hints: broad prompt → strategic cue → explicit step | same (low-quality page, but standard practice) | Our H1–H4 hint ladder |
| Spacing and retrieval practice are among the best-supported techniques | [Carpenter, Pan & Butler 2022 summary](https://teach.cvm.iastate.edu/?p=2949) (R) | Blunder Box, FSRS, daily recall |
| Deliberate practice needs feedback, repetition, reflection (effect size debated) | Ericsson summaries (R) | Daily loop |
| Streaks help continuation but broken streaks can cause quitting | [Decision Lab on streaks](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification) (R, secondary) | Freeze days; welcome-back path |
| ITS misconception ("bug") libraries: diagnosing *wrong rules* the learner holds, not just wrong answers | general ITS literature (not directly sourced in this search) | **New:** misconception catalogue (addendum §1.3) |

## 3. Competitor/platform feature scan (B)
Comparison blogs agree: both big platforms have large puzzle sets; Lichess gives free engine analysis and "Study" tools; Chess.com has more structured lessons and a coach-style review. No source identified which features *cause* improvement. Our differentiator remains: **personal mistake intelligence + daily teacher routine**, which neither platform is described as providing.

## 4. What we could not establish
- Whether puzzles, games, or analysis give the largest rating gain per hour (no controlled data).
- A trustworthy timeline for 600 → 1000.
- Which exact puzzle difficulty maximises learning for chess (the "~70 % solve rate" rule is one blogger's heuristic; it matches general desirable-difficulty ideas but is not chess-validated).
All three are handled by **measurement on the learner** (Phase 9 §2) rather than assumption.
