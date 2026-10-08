**PERSONAL CHESS COACH**

**Master Product, Training & Learning-System Blueprint**

*A coach designed to turn a 600-Elo player's mistakes into deliberate improvement*

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>THE PURPOSE OF THIS DOCUMENT</strong></p>
<p>This is the master plan for a chess-improvement system whose first job is not to show an engine evaluation, but to help a real beginner understand their own thinking, mistakes, recurring weaknesses, and next training step.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Status: Product and learning design only. No implementation decisions are treated as final. The document intentionally separates stable coaching principles from replaceable technical choices.

Prepared from the requirements and discussion established in October 2026. Current free/open-source references are time-stamped in Appendix A.

# Document map

Read Sections 1–6 before deciding technology. They define the reason the product exists, the player problems, the learning model, and the coaching philosophy. Sections 7–14 describe the actual training system and player experience. The final sections define the engine/AI boundary, adaptive logic, data, and future implementation direction.

1\. Why we are creating this

2\. Who the product is for and the problem it must solve

3\. Product vision: what “better than a bot” means

4\. Core design principles and non-negotiable rules

5\. Complete beginner skill map

6\. Learning model: from mistake to habit

7\. Adaptive training system

8\. Phase roadmap and progression

9\. Detailed skill modules: why / how / questions / checkpoints

10\. Real-game experience: playing with the player, not at the player

11\. Game review and personal mistake intelligence

12\. Engine, chess-logic, and AI explanation architecture

13\. Training content and data strategy

14\. Progress, mastery, retention, and rating progression

15\. Product experience and UI principles

16\. Free-first technology direction (not implementation yet)

17\. Risks, anti-patterns, and things the product must never do

18\. Future evolution

Appendix A. Current open-source / free references and licensing notes

Appendix B. Example end-to-end learner journey

Appendix C. Definition of done for the blueprint before coding

# 1. Why we are creating this

The starting point is not “build a chess website.” The starting point is a player who wants to improve but is stuck at beginner level. The player can play legal chess, but during real games many decisions are made without a stable thinking process. The result is repeated blunders, lost material, unclear plans, and a feeling that the engine can tell them what was best but cannot make them understand why.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>THE HUMAN GOAL</strong></p>
<p>Become a stronger chess player by understanding my own games deeply, recognizing why I made mistakes, learning the right thinking habits, and seeing those lessons transfer into future games.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## The specific starting problem

- Tactics are weak: simple forks, pins, hanging pieces, checks, captures, mating ideas, and tactical threats are often missed.

- There are large blunders: pieces and pawns are left en prise, checks are missed, and the opponent is allowed to win material without enough resistance.

- Calculation is shallow: after choosing a move, the player often does not ask what the opponent will do next or what the reply after that will be.

- There is no stable move-selection routine: the player starts with “what do I want to do?” before asking “what changed and what is my opponent threatening?”

- Middlegame planning is unclear: after the opening, the player may not know what to improve, what target to attack, what piece is bad, or what plan fits the position.

- Endgame planning is weak: the player may know isolated facts but not know what to prioritize when few pieces remain.

- Game review does not necessarily translate into learning: seeing an engine blunder marker is not the same as understanding a recurring personal mistake.

- The player wants an opponent that feels like a player, not a machine: the experience should create meaningful decisions, pressure, and realistic practice.

## Why ordinary engine analysis is not enough

A chess engine is optimized to evaluate positions and find strong moves. A beginner needs a different output: “what did I fail to notice?”, “what should I have looked for first?”, “why did this mistake happen?”, and “what should I practice so it becomes less likely next time?” The product therefore treats engine analysis as objective evidence, not as the complete teaching experience.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>THE CENTRAL THESIS</strong></p>
<p>Engine decides what happened. Chess-logic explains the chess meaning. The player model connects it to the learner. The AI explains verified facts in human language. The training engine decides what to practice next.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## What we ultimately want to create

The desired result is a personal chess improvement loop: play -\> observe -\> review -\> identify first meaningful mistake -\> understand the reason -\> practice that exact weakness -\> return to a game -\> measure whether the weakness transfers less often -\> repeat. The software becomes a coach that gets better at teaching the player because it remembers the player’s history.

# 2. Who the product is for and the problem it must solve

Primary learner: a beginner around 600 Elo who can play a complete game but experiences a large number of tactical and decision-making errors. This is not a hard ceiling. It is the starting state used to define the coach.

| **Dimension**       | **Definition**                                                                                                        |
|---------------------|-----------------------------------------------------------------------------------------------------------------------|
| Starting level      | Around 600 Elo; beginner with significant tactical and planning gaps.                                                 |
| Main objective      | Improve the player’s decision-making and reduce recurring mistakes, with rating improvement as a consequence.         |
| Emotional problem   | Losing often, not knowing why, feeling that analysis is too engine-centric, and feeling stuck.                        |
| Cognitive problem   | No reliable board-scan and candidate-move process; attention is pulled toward own ideas rather than opponent threats. |
| Knowledge problem   | Important beginner concepts are fragmented rather than connected into a usable decision process.                      |
| Training problem    | Random puzzles and opening memorization do not necessarily target the player’s biggest real-game weaknesses.          |
| Product expectation | The coach should explain, adapt, remember, and play with the learner rather than simply grade them.                   |

## The product must solve two different problems

Learning problem: What knowledge, perception, calculation, and decision habits does the player need? Coaching problem: How does software decide what this particular player should do next? These must not be conflated. A good lesson can still be a bad coach if the system keeps presenting lessons that do not match the player’s current weakness.

# 3. Product vision: what “better than a bot” means

The product should feel like a training partner and coach. It should not constantly interrupt the player, and it should not manufacture praise. It should know when to be silent, when to ask a question, when to reveal the engine, and when to turn a mistake into a lesson.

| **Traditional bot / engine-first** | **Desired Personal Chess Coach**                                                            | **Why the difference matters**              |
|------------------------------------|---------------------------------------------------------------------------------------------|---------------------------------------------|
| “You lost.”                        | “Here is the first decision that changed the game, and here is what you were trying to do.” | Creates understanding rather than judgment. |
| Best move only                     | Best move + what the player missed + why + how to recognize it next time                    | Connects analysis to learning.              |
| Random puzzles                     | Puzzles and positions selected from the player’s observed weaknesses                        | Increases relevance.                        |
| Fixed difficulty                   | Difficulty and assistance change with demonstrated performance                              | Prevents boredom and overload.              |
| Strong computer behavior           | Human-like opponent with appropriate strength and training intent                           | Allows realistic practice.                  |
| AI decides chess facts             | Engine / chess logic decides facts; AI explains them                                        | Reduces hallucination risk.                 |
| Rating as the main scoreboard      | Skill profile, mistake rates, transfer, and rating trend                                    | Measures actual learning.                   |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>PRODUCT PROMISE</strong></p>
<p>The application should help the player eventually ask the right questions without the application. The final form of coaching is independence: the software becomes a scaffold that the player gradually needs less.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 4. Core design principles and non-negotiable rules

**1. Chess truth is deterministic**

The software must not trust an LLM to determine whether a move is legal, whether a tactic exists, or what the best line is when an engine or chess rules layer can answer it.

**2. Learning is player-specific**

The system should adapt to the observed learner, not follow an identical syllabus at the same speed for everyone.

**3. The first meaningful mistake matters most**

Review should prioritize the earliest decision that materially damaged the position, because later errors may be consequences.

**4. Do not confuse puzzle skill with game skill**

The system must separately measure isolated recognition, guided exercises, and transfer to real games.

**5. Do not overload beginners**

A beginner may need fewer ideas, repeated better, with clearer language and more realistic examples.

**6. Explain, do not merely evaluate**

The software should answer “why?” and “how do I avoid this?” without hiding behind centipawn numbers.

**7. Assistance must fade**

Hints are scaffolding, not permanent hand-holding. The player must increasingly perform the thinking themselves.

**8. Hard-coded thresholds are not the coaching model**

Values such as target accuracy, number of games, and difficulty ranges should be configurable and evidence-based. The system should reason from multiple signals rather than a single fixed number.

**9. The player should never be shamed**

Mistakes are training evidence. Feedback should be direct and honest but never discouraging or humiliating.

**10. Free-first, replaceable infrastructure**

The design should prefer local/open components and interchangeable AI providers so changing a provider does not break the coach.

# 5. Complete beginner skill map

This map is intentionally broader than tactics. The system should be capable of seeing beginner failure as a combination of perception, knowledge, calculation, planning, execution, and transfer.

| **Domain**              | **What it includes**                                                                                                                                          | **Why it matters**                                            |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| Board & rules fluency   | Square awareness, legal moves, piece movement, castling, promotion, en passant, check/checkmate                                                               | If rules are uncertain, higher-level thinking becomes noisy.  |
| Material awareness      | Piece values, hanging pieces, overloaded/undefended pieces, simple trades                                                                                     | Prevents catastrophic material loss.                          |
| Checks-captures-threats | Forcing-move scan and opponent scan                                                                                                                           | Creates a repeatable move-selection habit.                    |
| Tactical motifs         | Forks, pins, skewers, discovered attacks, double attacks, deflection, attraction, removal of defender, clearance, interference, back-rank and mating patterns | Builds pattern recognition and tactical calculation.          |
| Calculation             | Candidate moves, 1–3 ply / move sequence, forcing lines, opponent reply, comparison                                                                           | Builds forward-looking decision making.                       |
| Blunder prevention      | Final blunder-check, loose-piece check, enemy forcing reply                                                                                                   | Directly reduces avoidable losses.                            |
| Opening fundamentals    | Center, development, king safety, tempo, piece coordination                                                                                                   | Prevents bad early-game habits without memorization overload. |
| Middlegame planning     | Imbalances, weaknesses, worst piece, targets, improving position, plan selection                                                                              | Addresses “I do not know what to do” positions.               |
| King safety & attack    | King exposure, pawn shelter, attacking resources, mating nets, defense priorities                                                                             | Connects tactics and planning.                                |
| Pawn structure          | Passed pawns, isolated/doubled/backward pawns, pawn breaks, space                                                                                             | Explains long-term plans.                                     |
| Trading & exchanges     | When to trade, what changes after an exchange, favorable/unfavorable trades                                                                                   | Prevents automatic exchanges and unnecessary simplification.  |
| Attack & defense        | Building attacks, defending threats, counterplay, simplifying danger                                                                                          | Teaches active defense and practical play.                    |
| Endgames                | King activity, opposition, key squares, pawn races, basic rook endings, conversion                                                                            | Prevents lost winning endgames and gives simple plans.        |
| Visualization           | Board memory, square color, knight routes, move-list replay                                                                                                   | Supports calculation without moving pieces.                   |
| Time management         | Allocation of thought, recognizing critical positions, avoiding panic/rush                                                                                    | Turns thinking time into better decisions.                    |
| Conversion              | Turning material/positional advantage into a win                                                                                                              | Solves “I was winning but then lost.”                         |
| Defense / resilience    | Finding practical moves in worse positions, avoiding additional blunders                                                                                      | Builds recovery skill and confidence.                         |
| Self-analysis           | Explain own idea, identify first mistake, classify error, create lesson                                                                                       | Makes review a learning process rather than engine worship.   |
| Transfer & retention    | Using learned skills in games and retaining them later                                                                                                        | Ensures training actually improves play.                      |

# 6. Learning model: from mistake to habit

The core unit of the coach is not “a lesson.” It is a learning loop around a specific capability.

Capability -\> Exposure -\> Attempt -\> Observation -\> Diagnosis -\> Explanation -\> Targeted practice -\> Transfer -\> Re-observation -\> Adjustment

## The two-layer learning model

Every skill has both a knowledge layer and a behavior layer. A player may know what a fork is but fail to see one in a game. A player may know opposition but choose the wrong king move under time pressure. The system must track both.

| **Evidence layer**           | **Question**                                                               |
|------------------------------|----------------------------------------------------------------------------|
| Knowledge / concept evidence | Can the player explain the idea or identify it in a clean example?         |
| Recognition evidence         | Can the player spot it in a realistic position?                            |
| Calculation evidence         | Can the player work out the important continuation?                        |
| Decision evidence            | Can the player choose a good move in a position where the concept matters? |
| Transfer evidence            | Does the behavior improve in real games?                                   |
| Retention evidence           | Does the improvement survive after time and topic switching?               |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>WHY THIS MATTERS</strong></p>
<p>A system that only measures puzzle accuracy can create a “good at puzzles, weak at chess games” illusion. The coach must look for transfer into realistic positions and eventually into the player’s own games.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## The diagnostic stack

1\. Observation: exactly what happened on the board and what the player did or did not notice.

2\. Chess interpretation: what chess concept explains the event.

3\. Player interpretation: what mental process likely failed — perception, calculation, evaluation, plan, execution, time, or knowledge.

4\. Training consequence: what experience should the player receive next.

# 7. Adaptive training system

The coach should behave like a feedback system, not a fixed course. Every interaction contributes evidence about what the player currently understands and what still fails under realistic pressure.

## Player skill state

For each skill, maintain a state that can include current confidence estimate, recent accuracy, consistency, assistance level, response time, real-game frequency of the mistake, severity of mistakes, transfer gap, and recency since last review. Exact formulas are implementation details; the product requirement is that decisions come from multiple signals.

## Training selection logic

Conceptually, the training engine asks: “Given what we have observed recently, what activity has the highest expected learning value while remaining appropriate for the player?” It can favor a weak high-impact skill, revisit a skill that is decaying, introduce a slightly harder version of a stable skill, or reduce support where independence is increasing.

| **Signal**                                | **What it tells us**                                 | **Possible response**                                            |
|-------------------------------------------|------------------------------------------------------|------------------------------------------------------------------|
| High puzzle accuracy + poor game transfer | Recognition may be context-bound                     | Use realistic positions, timed decisions, and game-like prompts. |
| Low accuracy + fast answers               | Likely guessing or superficial pattern matching      | Slow down, add explanation, reduce difficulty, ask what changed. |
| Low accuracy + long thought               | Concept or calculation is genuinely difficult        | Simplify position, isolate the skill, then rebuild complexity.   |
| Good performance with hints, poor unaided | Skill is emerging but not independent                | Fade hints gradually.                                            |
| Repeated same mistake in games            | Training has not transferred or lesson is mismatched | Use game-derived positions and focus on the exact failure mode.  |
| Stable improvement over varied contexts   | Skill is becoming robust                             | Reduce frequency; retain with spaced review.                     |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>NO HARDCODED MASTER SWITCH</strong></p>
<p>There should be no single rule such as “80% = mastered.” A checkpoint is a body of evidence. Thresholds may exist inside the eventual implementation, but they should be adjustable and interpreted alongside transfer, consistency, assistance, and recent performance.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 8. Phase roadmap and progression

Phases are learning priorities, not prison walls. The coach should be able to revisit earlier skills whenever game evidence shows regression or incomplete transfer.

| **Phase**                          | **Primary objective**                                | **What the coach does**                                                                                                                        | **Why**                                                                             |
|------------------------------------|------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Phase 0 — Baseline                 | Understand the current player                        | Import/replay several games; identify recurring blunders, tactical themes, thinking habits, time usage, opening problems, and endgame gaps.    | Produces a starting player profile instead of assuming all beginners are identical. |
| Phase 1 — Survival & awareness     | Stop giving away pieces and missing immediate danger | Board scan, opponent last move, checks/captures/threats, loose pieces, simple king danger.                                                     | Creates the minimum decision process for safe play.                                 |
| Phase 2 — Tactical vision          | Recognize basic forcing patterns                     | Forks, pins, skewers, hanging pieces, removal of defender, mating patterns, basic calculation.                                                 | Improves material awareness and tactical confidence.                                |
| Phase 3 — Thinking process         | Build a repeatable move-selection routine            | Candidate moves, opponent reply, blunder check, 2–3 move forcing lines.                                                                        | Moves thinking from impulse toward process.                                         |
| Phase 4 — Opening fundamentals     | Reach playable middlegames consistently              | Center, development, castle, piece coordination, simple repertoire with ideas rather than memorization.                                        | Stops early-game self-destruction without spending excessive time on theory.        |
| Phase 5 — Middlegame plans         | Know what to do after development                    | Targets, weak pieces, pawn breaks, king safety, exchanges, plan selection.                                                                     | Addresses “I have no plan.”                                                         |
| Phase 6 — Endgame foundations      | Convert and defend basic endings                     | King activity, opposition, key squares, pawn races, basic rook endings and conversion.                                                         | Builds practical endgame competence.                                                |
| Phase 7 — Transfer & consolidation | Make skills survive inside real games                | Deliberate game modes, mixed positions, post-game review, spaced repetition.                                                                   | Prevents the “I can solve it but do not play it” problem.                           |
| Phase 8 — Long-term adaptive coach | Continue improving as the learner grows              | Dynamic priorities, higher-level planning, deeper calculation, more sophisticated positional concepts, individualized repertoire and endgames. | Allows the same coach to remain useful beyond beginner level.                       |

# 9. Detailed skill modules

Each module follows the same design contract. “How” describes both the player’s learning process and the software’s internal behavior. Specific thresholds are examples of configurable policy, not fixed truths.

## 9.1 Board awareness and piece safety

**Capability to build:** See the board as relationships of attack, defense, checks, pins, and vulnerable pieces rather than as isolated piece locations.

**Why we are teaching it:** Without a reliable board picture, higher-level tactics and planning are built on unreliable perception.

### How the player learns this skill

Start with static positions, then compare before/after moves, then identify attacked/defended pieces, then move into realistic positions. The player should gradually stop relying on prompts.

### How the software actually makes that happen

Build a position-difference service that can inspect attacks, defenses, checks, material, king exposure, and newly vulnerable pieces after each move. Use engine-supported verification where needed. During practice, reveal less scaffolding as independence grows.

### What the player should be asked

- What changed after the move?

- Which pieces are attacked?

- Which pieces became undefended?

- Is there an immediate check or capture?

- Which piece is most vulnerable and why?

### What a useful answer looks like

A useful answer points to a concrete relationship: “The knight on f3 is attacked by the bishop, and it is currently defended only once.” The answer should identify relevance, not merely list every attacked square.

### What the system should observe and record

- Whether the player notices the change

- Whether they identify the most urgent threat

- Whether they distinguish attack from meaningful tactical threat

- Time taken and hint usage

- Whether similar mistakes continue in games

### How the training adapts

Increase complexity by adding more pieces, multiple simultaneous threats, positional distractions, and then timed decisions. If the player keeps missing the same type of threat, move training closer to the game positions that generated the mistake.

### Checkpoint / evidence of progress

Progress is shown when the player reliably identifies urgent relationships across varied positions and the rate of real-game blunders caused by unnoticed attacks declines. No single score is sufficient.

### How it transfers into real games

During games, use a light awareness checkpoint in training modes; in normal play, collect the evidence silently for later analysis.

### What happens when the player struggles

If the player is overwhelmed, isolate one concept (attacked vs defended) and rebuild from simple positions. If recognition is good but action is bad, move to response-selection training.

### How the skill returns later

Return through spaced mixed positions and game-derived exercises rather than repeating only the original drills.

## 9.2 Opponent threat recognition

**Capability to build:** Automatically ask “What did the opponent’s last move do?” before starting an own-plan sequence.

**Why we are teaching it:** A beginner often plays their own idea without updating the mental model after the opponent moves. This creates avoidable losses even when the player knows many chess concepts.

### How the player learns this skill

Train the sequence: notice the move -\> describe what changed -\> list forcing possibilities -\> identify the most urgent threat -\> decide whether it must be answered. Use guided prompts first, then remove prompts.

### How the software actually makes that happen

Represent the previous and current position, generate meaningful changes, inspect checks/captures/tactical consequences, and compare candidate opponent actions. The analysis layer must distinguish “attacks” from “real threats” by looking at consequences and engine-verified outcomes.

### What the player should be asked

- What did the opponent’s last move attack?

- What new check is possible?

- What new capture is possible?

- What is the strongest forcing idea for the opponent?

- If you play your intended move, what is their best reply?

### What a useful answer looks like

The answer should prioritize the important threat rather than enumerate everything. “The queen attacks my rook, and if I ignore it, I lose material” is useful; “the queen moved” is not.

### What the system should observe and record

- Threat detected or missed

- Threat severity recognized

- Response chosen

- Difference between perceived and actual strongest reply

- Repeated threat-miss patterns across games

### How the training adapts

If the player detects threats in isolated exercises but misses them in games, use the player’s own game positions as training material. If the player sees the threat but chooses poor responses, switch the focus to candidate selection and calculation rather than reteaching threat recognition.

### Checkpoint / evidence of progress

Checkpoint is demonstrated transfer: the player increasingly catches the same class of danger before moving in real games, especially without prompts.

### How it transfers into real games

In guided play, require a brief threat statement before the move. In normal play, do not interrupt unless the selected training mode calls for it; instead capture evidence for review.

### What happens when the player struggles

If the player cannot identify any threat, reduce the position complexity and teach “What changed?” before “What is the best move?”.

### How the skill returns later

Mix old threat types into future training so the skill remains automatic.

## 9.3 Checks, captures, threats (CCT)

**Capability to build:** Use a forcing-move scan for both sides before committing to a move.

**Why we are teaching it:** Checks, captures, and immediate threats contain a large fraction of beginner tactical events. A reliable scan prevents many one-move blunders.

### How the player learns this skill

The player practices scanning opponent first, then own forcing moves, then compares candidate moves. Exercises should progress from obvious to ambiguous situations.

### How the software actually makes that happen

The chess layer can enumerate legal checks and captures and identify strong forcing moves; the training layer asks the player to generate or classify them. The engine verifies whether the move is actually strong rather than merely legal.

### What the player should be asked

- What are the opponent’s checks?

- What can the opponent capture?

- What threat did the opponent create?

- What checks can I play?

- What captures can I play?

- What threats can I create?

### What a useful answer looks like

The player should be able to name the forcing options that actually matter in the position and explain why they matter.

### What the system should observe and record

- Candidate generation coverage

- Missed forcing moves

- False positives

- Response time

- Game blunders involving an available CCT move

### How the training adapts

Adapt by separating generation from evaluation. If the player cannot see any candidate, train recognition. If they see candidates but select badly, train comparison and calculation.

### Checkpoint / evidence of progress

Evidence should show that the scan occurs before important moves and prevents a measurable portion of avoidable tactical mistakes.

### How it transfers into real games

Apply the scan to real-game critical moments and retrospective “pause before move” exercises.

### What happens when the player struggles

When scanning becomes automatic, reduce explicit prompts and make the player verbalize only during selected training modes.

### How the skill returns later

Return in mixed tactical positions and difficult middlegames where the scan must compete with a tempting plan.

## 9.4 Tactical patterns and tactical vision

**Capability to build:** Recognize and calculate common tactical motifs in realistic positions.

**Why we are teaching it:** Knowing the name of a fork is not enough. The player must see the pattern when the board does not look like a textbook puzzle.

### How the player learns this skill

Teach a pattern with simple examples, then vary piece placement, then combine patterns, then embed them in real-game positions. Include “find the opponent’s tactic” as well as “find your tactic.”

### How the software actually makes that happen

Tag positions by motif, reconstruct tactical consequences, and track which motifs fail in real games. Use engine analysis to verify the tactical mechanism and avoid teaching false patterns.

### What the player should be asked

- What tactical idea is available?

- What makes it work?

- Which defender is missing or overloaded?

- What happens after the opponent’s best reply?

- Is there a stronger defensive resource?

### What a useful answer looks like

A good answer explains the mechanism: “The knight fork works because the king and rook are on squares attacked by the knight, and the king cannot recapture.”

### What the system should observe and record

- Motif recognition

- Line accuracy

- False pattern rate

- Transfer to games

- Motif-specific mistake frequency

### How the training adapts

Increase difficulty by reducing visual obviousness, adding competing moves, and requiring the opponent’s best defense. Mix previously learned motifs to test discrimination.

### Checkpoint / evidence of progress

The skill is considered robust only when performance survives mixed positions and appears in game review, not only in isolated puzzles.

### How it transfers into real games

Build exercises from the player’s own missed tactics wherever possible.

### What happens when the player struggles

If a motif remains weak, reduce complexity and teach the underlying board relationship rather than repeating the same pattern label.

### How the skill returns later

Use spaced mixed-motif positions so pattern recognition remains flexible.

## 9.5 Calculation and 2–3 move thinking

**Capability to build:** Look ahead through forcing moves and predict the opponent’s reply rather than playing only the first idea that looks attractive.

**Why we are teaching it:** Beginner losses frequently occur because the player sees their intended move but does not mentally make the opponent move afterward.

### How the player learns this skill

Start with one opponent reply, then two-ply sequences, then short forcing lines. The player should verbalize or select the predicted reply before seeing it.

### How the software actually makes that happen

Generate candidate lines from a position, compare the player’s predicted continuation with engine-verified continuations, and classify the failure as “did not see move,” “saw but mis-evaluated,” or “saw too few candidates.”

### What the player should be asked

- If you play this move, what is the opponent’s strongest reply?

- What is your reply to that?

- Which line is forcing?

- Where does the calculation stop because the position stabilizes?

### What a useful answer looks like

A useful answer is a concrete sequence plus a reason, not a vague statement such as “I think it is better.”

### What the system should observe and record

- Predicted reply accuracy

- Line length before failure

- Forcing vs non-forcing calculation

- Candidate comparison quality

- Calculation-related blunders

### How the training adapts

Use shorter lines when the player fails early, then extend once accuracy stabilizes. Use more forcing positions before quiet positional calculation.

### Checkpoint / evidence of progress

Progress means the player regularly predicts the opponent’s important response in real games and reduces one-move “I didn’t see that” errors.

### How it transfers into real games

Create “do not move the pieces” exercises and then transfer to game positions.

### What happens when the player struggles

If visualization collapses, include board-memory exercises. If prediction is correct but move choice is bad, shift to evaluation and candidate comparison.

### How the skill returns later

Re-test on mixed positions with less structure and occasional time pressure.

## 9.6 Candidate moves and blunder check

**Capability to build:** Choose a small set of meaningful candidate moves, compare them, then perform a final safety scan before playing.

**Why we are teaching it:** At 600 Elo, the main problem is often not that there is only one perfect move; it is that the player does not compare plausible moves or check the final move for tactical consequences.

### How the player learns this skill

Teach a compact process: safety -\> urgent tactics -\> 2 candidates -\> compare -\> strongest opponent reply -\> final blunder check.

### How the software actually makes that happen

Record player candidate moves in training mode, compare them to engine and chess-logic findings, and categorize why the chosen move failed. The system should not force two candidates in every trivial position; candidate generation should activate more strongly when the position is critical.

### What the player should be asked

- What are two moves you are considering?

- What changes after each?

- What is the opponent’s strongest reply to each?

- Which move leaves fewer tactical problems?

- Before playing, what can the opponent capture?

### What a useful answer looks like

The player can explain why one candidate is safer or stronger and can catch obvious tactical refutations before committing.

### What the system should observe and record

- Number of viable candidates

- Quality of candidate set

- Blunder-check catches

- Critical-position detection

- Final-move blunder rate

### How the training adapts

The system should increase independence: hints can move from “find a threat” to “name two candidates” to no prompt. In non-critical positions, it should not add unnecessary cognitive load.

### Checkpoint / evidence of progress

Evidence should come from real-game decisions, not only exercises. The target is a repeatable habit, not a ritual that slows every move.

### How it transfers into real games

Use a training toggle that asks for candidate reasoning only on selected moves; preserve natural flow during normal games.

### What happens when the player struggles

If the player freezes, simplify the process to one rule: “What is their strongest reply?” and reintroduce candidate comparison later.

### How the skill returns later

Use occasional critical-position checkpoints after the skill seems stable.

## 9.7 Opening fundamentals

**Capability to build:** Reach playable positions by understanding core opening ideas instead of memorizing long move sequences.

**Why we are teaching it:** Opening mistakes can create immediate tactical problems, but memorization is not the best starting point for a 600-Elo learner.

### How the player learns this skill

Teach center, development, king safety, piece coordination, tempo, and simple repertoire ideas. Explain the purpose behind moves and recognize common opening errors.

### How the software actually makes that happen

Tag game openings, compare the player’s move to principle-level goals, and distinguish “suboptimal but playable” from “tactical or strategic mistake.” Avoid overusing engine centipawns in the opening.

### What the player should be asked

- What is this move trying to achieve?

- Which piece should be developed?

- Is your king safe?

- Are you moving the same piece repeatedly without reason?

- What changed after the opponent’s opening move?

### What a useful answer looks like

The player should explain an opening move in terms of a goal or principle, not only “because the database says so.”

### What the system should observe and record

- Development efficiency

- Castling timing

- Repeated-piece moves

- Early queen moves

- Opening-specific recurring errors

- Understanding of own repertoire ideas

### How the training adapts

The system should not push opening study when tactical blunders are the dominant weakness. It should allocate opening work according to actual loss impact.

### Checkpoint / evidence of progress

Checkpoint is a series of playable positions where the player can state a plan and avoid common self-created tactical problems.

### How it transfers into real games

Use short opening drills followed by middlegame transitions so the player learns where opening knowledge ends and middlegame thinking begins.

### What happens when the player struggles

If the player memorizes without understanding, switch to explanation and “what is the purpose?” exercises.

### How the skill returns later

Revisit repertoire ideas from the player’s own games and update them as the player grows.

## 9.8 Middlegame planning and positional thinking

**Capability to build:** Turn a non-tactical position into a practical plan: identify what matters, improve the worst piece, target weaknesses, and choose a useful pawn break or activity plan.

**Why we are teaching it:** The player specifically struggles with “no middlegame plan.” After the opening, lack of a process often leads to random moves or attacks.

### How the player learns this skill

Teach a simple hierarchy: safety -\> tactics -\> king safety -\> targets/weaknesses -\> worst piece -\> useful improvement -\> plan. Introduce imbalances only when the player can apply them without losing tactical awareness.

### How the software actually makes that happen

Classify the position into strategic features: material, king safety, pawn structure, space, weak squares/pawns, open files, activity, and piece quality. Present a small set of candidate plans and ask the player to justify one.

### What the player should be asked

- What is the opponent’s weakness?

- What is your worst-placed piece?

- Which of your pieces is doing least?

- What pawn break could change the position?

- What happens if nothing urgent occurs?

- What is your plan for the next few moves?

### What a useful answer looks like

A useful answer is a plan with a reason: “My bishop is poor behind my pawns, so I want to improve it before attacking.”

### What the system should observe and record

- Plan relevance

- Worst-piece recognition

- Target identification

- Unforced random moves

- Plan quality in game review

- Whether the plan survives opponent responses

### How the training adapts

Start with one strategic question at a time, then combine them. Use the player’s own positions because abstract strategy is hard to internalize without context.

### Checkpoint / evidence of progress

Progress appears when the player can create a reasonable plan in quiet positions without ignoring tactical danger.

### How it transfers into real games

Provide a board annotation mode where the player can mark target, worst piece, and plan before seeing engine suggestions.

### What happens when the player struggles

If plans are vague, use concrete positional features first. If plans are good but tactics collapse, switch back to tactical safety.

### How the skill returns later

Revisit plans through “what would you do here?” positions after intervals, not only during dedicated lessons.

## 9.9 King safety, attack, and defense

**Capability to build:** Understand the king as a tactical and strategic feature, and learn to attack or defend without ignoring urgent threats elsewhere.

**Why we are teaching it:** Many beginner attacks fail because the attacker ignores development, defenders, or tactical counterplay; many defenses fail because the player becomes passive or misses simplification.

### How the player learns this skill

Teach king-safety signals, open lines, exposed king, attacking pieces, defenders, mating patterns, and practical defensive priorities. Use both sides of the attack/defense equation.

### How the software actually makes that happen

Evaluate king exposure, attacking resources, available checks, defenders near the king, and mating threats. Feed verified motifs to the explanation layer.

### What the player should be asked

- Whose king is safer and why?

- What is the attacker trying to open?

- How many attackers and defenders are involved?

- What forcing checks exist?

- Can the defender simplify or trade attackers?

### What a useful answer looks like

Answers should connect king safety to concrete pieces, lines, and tactical resources.

### What the system should observe and record

- Missed mates

- Unnecessary king exposure

- Failure to add defenders

- Successful defensive simplification

- Attack attempts without sufficient support

### How the training adapts

Use tactical king-safety positions before strategic attacking plans. Adapt toward defense when the player repeatedly over-attacks and loses to counterplay.

### Checkpoint / evidence of progress

Progress is reduced exposure to basic mating tactics and better recognition of whether an attack is justified.

### How it transfers into real games

Use realistic attack/defense scenarios and game review around king incidents.

### What happens when the player struggles

If the player cannot see mating threats, return to basic checks and mating patterns.

### How the skill returns later

Mix attacking and defending positions so the player learns to switch roles.

## 9.10 Pawn structure and exchanges

**Capability to build:** Understand how pawn changes and piece trades create longer-term plans and consequences.

**Why we are teaching it:** Beginners often exchange automatically or push pawns without recognizing the permanent effects on squares and structure.

### How the player learns this skill

Teach before/after comparisons: what squares opened or closed, what became weak, what piece became good/bad, and whether the exchange helped the plan.

### How the software actually makes that happen

Compare position features before and after a pawn move or exchange and connect them to engine-evaluated plans. Keep language concrete.

### What the player should be asked

- What changed after this pawn move?

- Which square became weaker?

- Which piece improved?

- Who benefits from the exchange?

- What endgame would remain?

### What a useful answer looks like

A good answer explains a consequence rather than reciting a positional label.

### What the system should observe and record

- Automatic exchanges

- Unnecessary pawn moves

- Missed structural changes

- Bad piece trades

- Endgames created by exchanges

### How the training adapts

Use small, concrete examples and later embed them in full positions. If the player is not yet stable tactically, keep structural teaching light.

### Checkpoint / evidence of progress

Progress means the player increasingly predicts the consequence of exchanges and pawn moves before making them.

### How it transfers into real games

Review actual exchanges from the player’s games and ask what changed afterward.

### What happens when the player struggles

If the concept feels abstract, show before/after boards and one concrete consequence only.

### How the skill returns later

Bring structure concepts back during middlegame and endgame reviews.

## 9.11 Endgame foundations

**Capability to build:** Know the first practical question to ask in simplified positions and use basic endgame techniques reliably.

**Why we are teaching it:** Without a plan, the player can lose won endings or drift in equal ones. Endgames also provide a clean environment for learning calculation, king activity, and conversion.

### How the player learns this skill

Teach king activity, opposition, key squares, pawn races, basic mating finishes, then basic rook-endgame ideas. Keep the number of concepts controlled and practice them repeatedly.

### How the software actually makes that happen

Recognize endgame type from material, surface the relevant technique family, and select exercises that fit the player’s observed gap. Use exact tablebase sources when appropriate for verification rather than relying only on a general engine evaluation.

### What the player should be asked

- What is the most active piece?

- What is the king trying to achieve?

- Is there opposition?

- Who has the passed pawn?

- Can the king enter?

- What is the conversion plan?

### What a useful answer looks like

The player should be able to state a practical plan rather than just recall a rule name.

### What the system should observe and record

- Technique accuracy

- Conversion rate

- Premature exchanges

- King activity

- Pawn-race calculation

- Endgame blunders in games

### How the training adapts

Choose endgame exercises based on positions actually reached by the player as well as a progression of fundamental techniques.

### Checkpoint / evidence of progress

Checkpoint means the player can execute core endings without heavy prompts and can identify the relevant technique family in real games.

### How it transfers into real games

Use “play the ending” modes where the opponent is human-like and the player must convert rather than simply answer a puzzle.

### What happens when the player struggles

If a technical concept is too hard, reduce to pure king/pawn positions and build upward.

### How the skill returns later

Endgame techniques should reappear after time gaps and in converted positions from real games.

## 9.12 Visualization and board memory

**Capability to build:** Maintain a useful internal board representation long enough to calculate short variations.

**Why we are teaching it:** Calculation fails when the player forgets where pieces move after one or two imagined moves.

### How the player learns this skill

Use square-color drills, knight-route exercises, short move-list replay, “what pieces moved?” tasks, and no-board line prediction. Keep drills short and varied.

### How the software actually makes that happen

Track visualization-specific failures separately from tactical misunderstanding so the system does not misdiagnose poor calculation when the real problem is board memory.

### What the player should be asked

- Where is each key piece after the imagined move?

- What square does the knight reach?

- Which line opened?

- Which defender disappeared?

### What a useful answer looks like

The player correctly reconstructs relevant pieces and lines, not every square on the board.

### What the system should observe and record

- Reconstruction accuracy

- Variation length before board confusion

- Key-piece tracking

- Performance without moving pieces

### How the training adapts

Increase complexity slowly and mix visualization into calculation practice rather than creating an isolated “brain game” forever.

### Checkpoint / evidence of progress

Progress is shown when calculation accuracy improves without needing to physically move pieces for simple variations.

### How it transfers into real games

Use short visualization checkpoints during training and optional offline exercises.

### What happens when the player struggles

If performance falls sharply, shorten variations and reduce the number of tracked pieces.

### How the skill returns later

Maintain the skill through occasional short drills.

## 9.13 Time management and critical-position awareness

**Capability to build:** Spend thinking time where it changes decisions and avoid both panic moves and endless thought in trivial positions.

**Why we are teaching it:** A beginner can know a concept but fail to use it because of rushing, while overthinking simple positions wastes time and increases fatigue.

### How the player learns this skill

Teach recognition of critical positions: tactical tension, irreversible moves, king danger, major trades, passed pawns, or moments with several candidate moves.

### How the software actually makes that happen

Record move times, critical-position features, and outcome. Do not simply prescribe a fixed seconds-per-move rule; infer whether the player is under-thinking or over-thinking relative to position complexity.

### What the player should be asked

- Was this a critical position?

- What changed that made it important?

- Did you spend enough time?

- Did you spend too much time on something routine?

### What a useful answer looks like

The player can explain why extra time was justified.

### What the system should observe and record

- Think time vs position complexity

- Fast blunder frequency

- Long-think frequency

- Clock-related errors

- Decision quality after pauses

### How the training adapts

Adapt time guidance to the player’s pattern. A rushed player gets deliberate pause triggers; an overthinker gets decision boundaries and candidate limits.

### Checkpoint / evidence of progress

Progress means fewer clock-driven errors while maintaining useful calculation.

### How it transfers into real games

Use rapid games and post-game timing charts.

### What happens when the player struggles

If time pressure is severe, prefer simpler thinking routines and stronger automatic board scans.

### How the skill returns later

Review time habits periodically rather than every game.

## 9.14 Conversion and defense

**Capability to build:** Turn good positions into wins and bad positions into the strongest practical resistance.

**Why we are teaching it:** Winning a piece is not the same as converting. Likewise, a losing position can often be made much harder to win.

### How the player learns this skill

Teach conversion checklist: king safety, simplification when appropriate, activate pieces, eliminate counterplay, create/advance passed pawns, avoid unnecessary risk. Defense checklist: checks, captures, threats, simplification, counterplay, fortress ideas when relevant.

### How the software actually makes that happen

Classify positions by advantage type and inspect the sequence from “winning advantage” to result. Separate failure to recognize advantage from poor execution of a known plan.

### What the player should be asked

- What is your advantage?

- How can the opponent create counterplay?

- What should be simplified?

- What is the opponent’s practical resource?

- What must you avoid?

### What a useful answer looks like

A good answer names the advantage and the method of converting it.

### What the system should observe and record

- Conversion rate

- Counterplay allowed

- Simplification quality

- Defensive resource discovery

- Winning-position losses

### How the training adapts

Use endgame and middlegame positions extracted from the player’s own wins and losses. Increase realism rather than only increasing engine depth.

### Checkpoint / evidence of progress

Progress appears when advantages are converted more reliably and losing positions survive longer without unnecessary blunders.

### How it transfers into real games

Create special training games starting from winning/losing positions.

### What happens when the player struggles

If the player cannot recognize what advantage they have, return to positional evaluation basics.

### How the skill returns later

Revisit with spaced practical positions.

## 9.15 Game review and self-analysis

**Capability to build:** Turn a game into a lesson by identifying the earliest meaningful mistake and explaining the player’s thinking.

**Why we are teaching it:** The review process is where experience becomes learning. Without it, the player can lose the same way many times.

### How the player learns this skill

Review first without the engine: ask what the player thought at key moments. Then use engine analysis to verify and classify. Finally, convert mistakes into targeted training.

### How the software actually makes that happen

Capture the player’s intended move where possible, run engine analysis at appropriate moments, identify evaluation changes, compare the player’s explanation with the position, and link the error to the player skill graph.

### What the player should be asked

- What were you trying to do?

- What did you expect the opponent to play?

- What changed after their move?

- Where did the game first become difficult?

- What would you do differently now?

### What a useful answer looks like

The best answer is specific and self-explanatory, not “Stockfish says this is bad.”

### What the system should observe and record

- First meaningful mistake

- Player intention

- Expected reply

- Actual best reply

- Mistake category

- Severity

- Repeated pattern

- Lesson created

### How the training adapts

If a mistake repeats, move it upward in training priority. If the player can explain it but repeats it in games, increase transfer training rather than explanation.

### Checkpoint / evidence of progress

Progress means review explanations become more accurate and repeated error classes decline.

### How it transfers into real games

Every meaningful game should contribute selectively to the player profile; not every engine inaccuracy deserves a lesson.

### What happens when the player struggles

If the player becomes discouraged by many errors, show only the few highest-value lessons first.

### How the skill returns later

Review old games after several weeks to test whether the player now sees the previous mistake without help.

# 10. Real-game experience: playing with the player, not at the player

The game experience is part of the training method. The opponent should be strong enough to make the player think but not so mechanical that every game feels like a punishment. The product should distinguish strength, style, and training intent.

## Player-facing game modes

| **Mode**          | **Behavior**                                                                                     | **Learning purpose**                                   |
|-------------------|--------------------------------------------------------------------------------------------------|--------------------------------------------------------|
| Normal Play       | No interruptions; player plays a realistic game at an appropriate strength.                      | Natural transfer and authentic decision data.          |
| Coach Play        | Light prompts or pre-move reflection checkpoints at selected moments.                            | Build the thinking routine while preserving game flow. |
| Weakness Practice | Opponent and starting positions emphasize a target skill without feeling like a scripted puzzle. | Create repeated realistic exposure.                    |
| Critical Position | Start from a real position and ask the player to play it out.                                    | Isolate decision making.                               |
| Conversion Game   | Player starts with an advantage and must win it.                                                 | Train conversion.                                      |
| Defense Game      | Player starts worse but receives a fair, human-like opponent.                                    | Train resistance and practical defense.                |

## What “human-like” means for this product

- The opponent strength should be appropriate, but strength alone is not enough. The model should produce move choices that resemble human decision distributions rather than always choosing the strongest engine move.

- The opponent should make mistakes at a level consistent with the selected strength, without being obviously scripted to hand the learner free wins.

- Training behavior can be influenced by the player’s target without breaking the illusion of a real game. For example, a tactical training mode may select positions where the relevant motif is naturally available.

- The system should be honest about what is happening: normal mode should feel like a game; training mode can reveal that the position is part of a targeted exercise.

# 11. Game review and personal mistake intelligence

The review engine is where the coach becomes personal. It should not treat all engine drops equally. It should explain the first decision that materially changed the game, then connect that decision to a pattern of previous mistakes.

## The review pipeline

1\. Reconstruct the game and relevant positions.

2\. Detect critical moments using evaluation changes, tactical events, material changes, king danger, and phase transitions.

3\. Identify the earliest meaningful mistake rather than dumping every engine inaccuracy.

4\. Compare the player’s played move, intended move (when available), best move, and strongest opponent reply.

5\. Classify the mistake across multiple dimensions: tactic, perception, calculation, evaluation, planning, execution, time, knowledge, or misunderstanding.

6\. Check whether this mistake matches an existing weakness in the player profile.

7\. Generate a concise explanation using only verified facts.

8\. Create a training recommendation and decide whether the mistake should affect the next session priority.

## Example: same blunder, different diagnoses

| **Observed event**                                       | **Possible underlying cause**              | **Training response**                             |
|----------------------------------------------------------|--------------------------------------------|---------------------------------------------------|
| Player leaves rook en prise                              | Did not notice it was attacked             | Board awareness / threat recognition.             |
| Player notices rook attack but ignores it                | Wrong priority or over-focus on own attack | Opponent-threat and candidate selection training. |
| Player sees the threat but thinks rook can move safely   | Calculation error                          | Short forcing-line exercise.                      |
| Player knows the correct move but rushes it              | Time-management / execution issue          | Critical-position pause routine.                  |
| Player sees the tactic in puzzles but misses it in games | Transfer failure                           | Game-like training and player-derived positions.  |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>KEY REQUIREMENT</strong></p>
<p>The review system must explain not only “what move was bad,” but “what failed in the player’s thinking.” That is the bridge from analysis to improvement.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 12. Engine, chess-logic, and AI explanation architecture

This is a safety and quality boundary. Chess analysis must not depend on an LLM being correct about a position. The AI is an explanation layer, not the source of chess truth.

| **Layer**            | **Responsibility**                                                                                   | **What it must not do**                                               |
|----------------------|------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| Chess rules layer    | FEN/PGN parsing, legal moves, board state, game-state transitions.                                   | Invent legal moves or infer rules from language.                      |
| Engine layer         | Objective evaluation, principal variations, tactical verification, search depth/nodes as available.  | Generate teaching explanations by itself.                             |
| Chess-analysis layer | Convert engine facts into concepts: blunder, hanging piece, fork, threat, king safety, endgame, etc. | Pretend engine confidence means pedagogical truth.                    |
| Player model         | Track the learner’s behavior, recurring errors, transfer, assistance needs, and progress.            | Treat one game as a full portrait of the player.                      |
| AI explanation layer | Explain verified facts in simple language, compare expectations, produce teaching narratives.        | Change moves, invent variations, or contradict verified engine facts. |
| Training engine      | Choose the next experience based on evidence and learning goals.                                     | Follow a static calendar blindly.                                     |

## How an AI explanation should be grounded

The AI should receive a structured, machine-readable analysis package: FEN, played move, best move, relevant engine line, evaluation before/after, identified tactical or strategic mechanism, opponent’s strongest reply, and player-specific context that is safe to expose. The prompt should explicitly forbid introducing new chess facts not contained in the package when the explanation is factual.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>GROUNDING RULE</strong></p>
<p>The AI may improve wording, analogy, sequencing, and motivation. It may not be allowed to become the source of truth for move legality, evaluation, tactical existence, or historical game facts.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**Example input to the explanation layer:**

{ Position: FEN; Played move: Qe2; Evaluation before: +1.4; Evaluation after: -2.8; Best move: Nf3; Opponent best response: Rxe3; Mistake category: hanging piece / missed opponent threat; Player level: beginner; Explanation style: simple and direct. }

Example output goal: “You started an attack, but your rook was already vulnerable. The move Qe2 did not answer the opponent’s threat, so ...Rxe3 wins material. Before starting your own plan, check what the opponent’s last move attacked.”

## Free AI provider strategy

AI provider access should be abstracted behind one application interface. Current providers and free tiers change frequently, so the product should treat them as replaceable services, not foundational dependencies. Examples currently worth evaluating include Gemini, Groq, and OpenRouter; current details are listed in Appendix A and should be re-checked before deployment.

# 13. Training content and data strategy

The product needs a mixture of public chess data, engine-generated analysis, curated instructional positions, and—most importantly—the player’s own games.

| **Data source**             | **Use**                                                                       | **Design implication**                                                                  |
|-----------------------------|-------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Public puzzle datasets      | Build a large reservoir of tactical positions and themes.                     | Filter by concept, difficulty, phase, opening context, and player weakness.             |
| Public game datasets / PGNs | Study realistic positions and create game-derived training.                   | Use game context, not just isolated positions.                                          |
| Engine-evaluated positions  | Speed up common analysis and provide verified reference lines where suitable. | Treat depth/quality as metadata; do not treat all evaluations as equally authoritative. |
| Player’s own games          | Primary source of personal coaching evidence.                                 | Every meaningful repeated mistake should be traceable to source games.                  |
| Curated lessons             | Teach foundational concepts with controlled complexity.                       | Use these when the player lacks conceptual prerequisites.                               |

As of 5 October 2026, Lichess reports 6,157,341 rated/tagged puzzles and 416,442,401 evaluated positions in its open database, released under CC0. This makes a free-first training data layer technically realistic, subject to licensing and storage choices. \[2\]

# 14. Progress, mastery, retention, and rating progression

The player should see progress without reducing improvement to rating alone. Rating is important, but it is noisy and can lag behind skill development.

## Progress dimensions

- Blunders per game and severity distribution.

- Missed opponent threats per game.

- Tactical motif recognition and transfer.

- Two- and three-move calculation accuracy where appropriate.

- Candidate-move quality at critical moments.

- Middlegame plan quality and random-move frequency.

- Endgame conversion and defensive resilience.

- Game-review self-explanation quality.

- Time usage relative to critical-position complexity.

- Retention after time gaps.

- Rating trend as an outcome metric rather than the only metric.

## What counts as mastery

Mastery should be evidence-based and multi-context. A strong signal is: the player can recognize the concept, explain it, perform it with reduced assistance, apply it in realistic positions, and show reduced recurrence of the relevant error in real games. Mastery should not permanently remove the skill from training; it should move the skill into lower-frequency maintenance and reappear when evidence of decay appears.

# 15. Product experience and UI principles

The UI should be familiar enough that a chess player can start playing immediately, but significantly more explanatory and training-aware than an ordinary engine board.

## Core screens

| **Screen**             | **Primary purpose**           | **What makes it coach-like**                                                   |
|------------------------|-------------------------------|--------------------------------------------------------------------------------|
| Home / Coach dashboard | Show what matters today.      | One training priority, recent improvement, and one clear next action.          |
| Play                   | Play a realistic game.        | Human-like opponent and optional coach modes.                                  |
| Analysis               | Understand a game.            | Story of the game, first meaningful mistake, reasoning diagnosis, and lessons. |
| Training               | Practice a weakness.          | Exercises selected from the player model rather than random difficulty.        |
| Skill profile          | Understand the learner.       | Strength/weakness map with evidence from games and training.                   |
| Lesson / Concept       | Learn a foundational concept. | Simple explanation, examples, checks for understanding, and transfer.          |
| Progress               | See improvement.              | Behavioral metrics, retention, and rating trend together.                      |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>UI PRINCIPLE</strong></p>
<p>The default question should not be “What is the engine score?” The default question should be “What do I need to understand from this position?” Engine evaluation remains accessible, but the coaching narrative comes first.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 16. Free-first technology direction (not implementation yet)

This section deliberately describes direction, not a final stack. The objective is to preserve the ability to build and use a strong personal version without a mandatory monthly bill.

| **Area**                      | **Direction**                                                                                                                                                       |
|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Chess engine                  | Stockfish or another appropriately licensed strong engine. Stockfish is GPLv3 and explicitly designed as open-source chess software. \[1\]                          |
| Chess datasets                | Lichess open database for puzzles and evaluated positions; currently millions of puzzles and hundreds of millions of evaluated positions. \[2\]                     |
| Human-like play               | Evaluate Maia-family or other human-move models where licensing and current availability permit; treat as a replaceable component.                                  |
| AI explanation                | Provider abstraction supporting one or more free tiers, with local-model fallback where practical.                                                                  |
| Web hosting                   | Static-first hosting is attractive for a personal project. Cloudflare Pages currently documents a 500 builds/month Free limit and free static asset requests. \[7\] |
| User data                     | A hosted free database such as Supabase is a candidate; Supabase currently grants two free projects on its Free plan. \[6\]                                         |
| Client-side analysis          | Prefer browser-side engine execution where feasible to reduce server compute costs and keep private analysis local.                                                 |
| Account/cloud synchronization | Optional at first. A personal version can store games and profile locally before adding accounts.                                                                   |

## Why “replaceable” matters

Free API quotas change. Models are deprecated. providers modify free tiers. Licensing changes. Therefore the architecture should isolate AI, engine, board UI, storage, and hosting choices behind clean interfaces. The learning model must remain intact even if a specific provider changes.

# 17. Risks, anti-patterns, and things the product must never do

| **Risk**                                   | **Failure mode**                                                   | **Design response**                                                                                     |
|--------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| LLM hallucination presented as chess truth | Wrong move/variation/explanation is treated as fact                | Use engine/rules verification and restrict AI to explanation.                                           |
| Engine dumping                             | Player sees centipawns and long lines but learns little            | Translate engine findings into player-relevant lessons and limit analysis to the highest-value moments. |
| Overtraining easy puzzles                  | High puzzle score hides weak game transfer                         | Use difficulty and context adaptation; test transfer into games.                                        |
| Too much interruption                      | Normal games feel like quizzes                                     | Use training modes, not constant popups; preserve natural play.                                         |
| Teaching advanced theory too early         | Time is spent on low-impact knowledge while blunders continue      | Prioritize high-impact beginner weaknesses first.                                                       |
| One-size-fits-all curriculum               | All users receive the same sequence                                | Let game evidence reprioritize training.                                                                |
| False mastery from puzzle score            | Skill is marked complete without real-game evidence                | Require realistic and game transfer evidence.                                                           |
| Rating obsession                           | Player feels failure despite behavioral improvement                | Show behavior-level improvements and learning evidence.                                                 |
| Shaming feedback                           | Player avoids review or loses confidence                           | Be direct, specific, calm, and constructive.                                                            |
| Hard-coded thresholds                      | System becomes brittle and ignores context                         | Use configurable policies informed by multiple signals.                                                 |
| Provider lock-in                           | A free API change breaks the coach                                 | Abstract AI and hosting dependencies.                                                                   |
| License ignorance                          | Project is technically impressive but cannot be distributed safely | Track licenses for engine, board UI, data, models, and redistribution before public release.            |
| Training that feels fake                   | Opponent or exercises become predictable                           | Use real positions, plausible opponents, and transparent training modes.                                |

# 18. Future evolution

The first version should solve the beginner learning loop extremely well. Future growth can add depth without changing the core philosophy.

- Automatic ingestion from supported chess platforms or uploaded PGNs.

- Voice-based coaching where the player can describe their idea before a move.

- Personal opening repertoire built from the player’s preferred styles and actual games.

- Scenario-based training generated from recurring personal mistakes.

- Local language explanations while preserving chess notation and engine facts.

- Long-term “coach memory” across months and years.

- Player-versus-player training rooms with coaching analysis after the game.

- Mobile-first version with the same player model and training state.

- Optional local LLM explanation for privacy and zero recurring AI API cost.

- Higher-level planning and deeper positional training as the player’s strength increases.

# Appendix A — Current open-source / free references and licensing notes

The following details were checked against official/current sources on 8 October 2026. Free tiers and provider availability change; re-check them immediately before deployment.

**\[1\] Stockfish — official About / license**

https://stockfishchess.org/about/

Stockfish is distributed under GPL v3. The official site explains redistribution and source-code obligations.

**\[2\] Lichess Open Database**

https://database.lichess.org/

Lichess states that database exports are CC0. As of 5 Oct 2026 it lists 6,157,341 rated/tagged puzzles and 416,442,401 evaluated positions.

**\[3\] Google Gemini API pricing**

https://ai.google.dev/gemini-api/docs/pricing

Google currently documents free-tier pricing for selected Gemini models. Exact quotas and model availability vary by model and account.

**\[4\] Groq rate limits**

https://console.groq.com/docs/rate-limits

Groq documents model-specific free-plan rate limits and returns 429 responses when limits are exceeded.

**\[5\] OpenRouter pricing / free models**

https://openrouter.ai/pricing/ and https://openrouter.ai/openrouter/free

OpenRouter currently documents 25+ free models on its Free plan, with a 50 requests/day account rate limit; the exact free model pool changes.

**\[6\] Supabase billing**

https://supabase.com/docs/guides/platform/billing-on-supabase

Supabase currently documents two free projects on the Free plan.

**\[7\] Cloudflare Pages limits**

https://developers.cloudflare.com/pages/platform/limits/

Cloudflare currently documents 500 builds/month on the Free plan, 20,000 files per site, and a 25 MiB maximum site asset size.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>LICENSING WARNING</strong></p>
<p>Free data or software is not automatically license-free. Before public distribution, verify the license and attribution requirements for every engine, board library, dataset, model, font, icon set, and external API used by the product.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# Appendix B — Example end-to-end learner journey

This example shows how the same player moves through the system. It is not a fixed script; the adaptive engine should change the sequence when evidence changes.

| **Stage**                   | **What happens**                                                                                                                                                                                   | **Underlying principle**               |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------|
| Day 1: Baseline             | Player imports or plays several games. The system finds repeated hanging-piece errors, missed checks, and weak opponent-threat recognition. It does not yet prescribe an advanced opening program. | Training follows evidence and transfer |
| Session 2: Awareness        | The player practices “what changed?” and “what did the opponent attack?” on simple positions. Hints are strong at first.                                                                           | Training follows evidence and transfer |
| Session 3: Game transfer    | The player plays a rapid game with a light threat checkpoint. The system observes one missed threat and one correct use of the habit.                                                              | Training follows evidence and transfer |
| Session 4: Targeted tactics | The system adds fork and hanging-piece puzzles because those patterns appear in the player’s games.                                                                                                | Training follows evidence and transfer |
| Session 5: Calculation      | The player now sees more threats but still fails to predict the opponent’s strongest reply. Training shifts from perception to 1–2 move calculation.                                               | Training follows evidence and transfer |
| Week 2 review               | The player’s missed-threat rate has improved in games, but blunders remain. The coach continues maintenance while introducing candidate moves and blunder-check habits.                            | Training follows evidence and transfer |
| Week 3–4                    | The player begins reaching playable middlegames. The coach introduces “worst piece / target / plan” exercises only after basic safety remains stable.                                              | Training follows evidence and transfer |
| Later phase                 | The player begins converting positions with extra material, and the system adds endgame training from actual endings reached in games.                                                             | Training follows evidence and transfer |
| Long-term                   | The coach reduces prompts in skills that have become independent and shifts training time toward the next bottleneck.                                                                              | Training follows evidence and transfer |

# Appendix C — Definition of done for the blueprint before coding

Before implementation begins, the planning phase should be considered complete only when the following questions have written answers.

- What exact player problem is the product solving first?

- What does the first training loop look like from game to lesson to re-test?

- What skills are tracked independently?

- What evidence distinguishes perception, calculation, evaluation, planning, execution, and transfer errors?

- How does the system choose the next training activity?

- How does it know when to reduce assistance?

- How does it detect regression?

- How does it review games without flooding the player with engine noise?

- How is chess truth separated from AI language generation?

- How does the player experience normal play versus training play?

- What data is stored about a player and why?

- Which components are local/open and which depend on external free services?

- What happens when an AI provider is unavailable?

- What licenses must be tracked before distribution?

- How will success be measured beyond rating?

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>FINAL PRODUCT NORTH STAR</strong></p>
<p>Build the coach around the learner’s thinking, not the engine’s numbers. The application succeeds when the player increasingly notices, calculates, plans, and reviews independently — and when the repeated mistakes that once felt mysterious become recognizable and fixable.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

*Document note: current service quotas, model names, and free-tier terms are intentionally kept replaceable. Revalidate them before any implementation or public launch.*
