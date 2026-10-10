# Phase 6 — Content: puzzles, personal sets, openings, lessons, endgames, model games, curriculum 600→1000

**Goal:** supply the *material* the learning engine schedules. Volume comes from free data (puzzles, openings, your own games); **quality** comes from authored lessons and engine-verified items. This phase answers: "will the site have lots of lessons, tests, puzzles, openings, middlegame, endgame?" — yes, built in layers (§9 gives the exact counts per milestone).
**Prerequisite:** Phase 3 (engine verification), Phase 5 (skills, card schema). **Output:** `tools/` (offline content pipeline), `public/content/*` bundles, `src/core/content/*` loaders+validators, authored files in `content/`.
**UI link:** replaces `puzzles`, `lessons`, `roadmap`, `openings`, `leftBook`, `dailyTest` in `ui/js/data.js`; powers `puzzles.js`, `learn.js`, `openings.js`, `session.js`.

## 1. Content principles
1. **Each item has provenance**: `{source, license, authoredBy, engineVerified:boolean, reviewedAt}`. CI rejects items missing it.
2. **Every item is tagged** with `skillTags` (Phase 5 ids), `difficulty` (rating-like number), `phase`.
3. **Explain "why" in plain words** (≤ 25 words) for every solution; reading level ~ grade 6–8; no jargon without a link to a concept lesson.
4. **Small bundles, lazy loaded**, cached for offline by the service worker.
5. **Authoring is separate from the app**: JSON/Markdown in `content/`, validated by a script, bundled at build time.

## 2. Puzzles (volume layer — free, CC0)

### 2.1 Source and format (verified)
Lichess puzzle DB `lichess_db_puzzle.csv.zst` (6,157,341 rows; CC0). Columns: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate`.
- `FEN` = position **before the opponent's move**. `Moves` = space-separated UCI; **move 1 is the opponent's** (play it to reach the puzzle start); moves 2,4,6… are the learner's solution, 3,5,… are forced replies. Every learner move in the line is the only good move; in mate-in-1 puzzles any mate counts.
- `Themes` examples (full list on the Lichess site): `fork, pin, skewer, hangingPiece, backRankMate, discoveredAttack, mateIn1, mateIn2, trappedPiece, deflection, attraction, clearance, interference, sacrifice, quietMove, advantage, crushing, endgame, middlegame, opening, short, oneMove`.

### 2.2 Offline build pipeline (`tools/build-puzzles.ts`, run manually/CI, **not** in the browser)
1. Download + stream-decompress (zstd) the CSV (≈ hundreds of MB).
2. Filter: `Popularity ≥ 80`, `NbPlays ≥ 500`, `RatingDeviation ≤ 100`, solution length ≤ 3 learner moves for Phase 1–2, `Themes` includes at least one **mapped** theme (table below).
3. Rating band: keep `Rating` in **400–1400** initially (Lichess puzzle ratings and a chess-site rating are different scales; the learner's *puzzle* level is calibrated at runtime by the Elo-like estimator in Phase 5 §5.4 — don't assume a mapping from 600).
4. Sanity: replay `Moves` with `chess.js`; reject illegal lines. Engine-verify (depth 16): learner's first move must beat the 2nd-best by ≥ 100 cp or mate (reject ambiguous puzzles).
5. Map to skills (`config/themeMap.json`): `hangingPiece→piece_safety`, `fork→tactic_fork`, `pin→tactic_pin`, `skewer→tactic_skewer`, `discoveredAttack→tactic_discovered`, `backRankMate→tactic_backrank`, `mateIn1/mateIn2→mate_patterns`, `deflection/attraction/clearance/interference→tactic_removing_defender (extended later)`, `endgame→eg_*` by sub-theme.
6. Write shards `public/content/puzzles/{skill}/{band}.json` (~300–500 puzzles per shard, minified `{id,fen,moves,rating,themes}` ≈ 60 KB gz each). Total for v1: ~12 skills × 4 bands × 400 ≈ 19k puzzles ≈ 5–8 MB gz. Hosting limits to respect (from Appendix A of the blueprint, re-verify): **≤ 20,000 files per site, ≤ 25 MiB per file**.
7. Emit `puzzles-index.json` (counts per skill/band) for the planner.

### 2.3 Runtime puzzle flow (matches `_puzzle.js`)
`PuzzleService.next({skill, targetRating, excludeIds})` → loads the shard, picks nearest rating not seen in last N days. Convert to `PuzzleView`: apply move 1 to get the start FEN; side to move = learner; solution = learner's UCI moves; **threat-statement step** shown when `assistLevel ≥ 1`. Wrong move → feedback + retry allowed twice; third → show solution and queue a `tactic` card.

### 2.4 Personal Woodpecker sets (retention layer)
- A **set** = 100–300 puzzles on the focus skills, chosen once and **repeated in cycles** (cycle k target time ≈ 70 % of cycle k−1). Source: curated shards **plus every position from the learner's own mistakes** (`Card.kind='blunder'`).
- Data: `PuzzleSet {id, name, puzzleIds[], cycles:[{startedAt, endedAt, accuracy, medianMs}]}` (add a table in Phase 2 when implementing).
- Promotion rule: finish cycle at ≥ 90 % accuracy unaided → next cycle faster; < 80 % → repeat same cycle with hints on. (Config.) Evidence goes to `recognition`/`calculation`.
- Never mix new rating bands into a running set; add a new set instead.

## 3. Openings (retention + understanding)

### 3.1 Principles
Teach **ideas first, lines second**; a small repertoire (D15: owner picks) with *why* on every card; the system keeps track of **where the learner leaves the book in real games** and where the **opponent deviates**.

### 3.2 Data model
```ts
interface OpeningRepertoire { id: string; side: 'w'|'b'; name: string; startFen: string; nodes: OpeningNode[]; ideas: Idea[] }
interface OpeningNode { id: string; fenKey: string; moveSan: string; byLearner: boolean; why: string /*≤25 words*/; commonReplies: {san: string; note: string; freq?: number}[]; trap?: string; engineCheck: { evalCp: number; depth: number } }
interface Idea { id: string; title: string; text: string; fen?: string; arrows?: [string,string][] } // "Why we put a bishop on c4"
```
Cards (`Card.kind='opening'`) are generated per learner node: prompt = position before the move, solution = SAN, why = node.why. **Opponent nodes are not cards**; they are shown as context and as "what do you do if they play X?" cards for the first 2–3 common replies.

### 3.3 Where do lines come from?
- **Authored**: we write 3 small repertoires (owner chooses among 2–3 candidates per slot; D15). Each line ≤ 8 learner moves deep initially.
- **Frequency data**: from the **Lichess opening explorer** (`explorer.lichess.ovh`) — **VERIFY** whether it needs an API token now; **fallback**: an offline book built from the CC0 Lichess game DB monthly dumps (filter 800–1400 rated players, count first 12 plies, keep nodes with ≥ 200 games) and shipped as a compact trie (< 1.5 MB gz). Use it for (a) "book" classification (Phase 3), (b) "what do players at your level actually play here".
- **ECO names**: `lichess-org/chess-openings` dataset (**VERIFY** licence, believed CC0) for names.
- **Engine check** at build time: every authored node ≥ −0.4 pawns at depth 18 (reject dubious lines for a beginner repertoire).

### 3.4 Left-book detection (the "forgets openings" fix)
For each imported/played game compute the first ply where learner ≠ repertoire move (`leftBookAt`) and where opponent ≠ any `commonReplies` (`oppDeviationAt`). Surface on Openings screen ("Left your line at move 4 in 3 games"). One tap creates a card for the *position where you deviated* with the correct move and its why.

### 3.5 Drill flow (matches `openings.js`)
Show board at the node; learner plays move; reveal `why`; self-grade (Again/Hard/Good/Easy) → FSRS. Weekly "play it out" game from the repertoire start vs the sparring bot restricted to book replies for N moves.

## 4. Lessons (authored layer)

### 4.1 Format (`content/lessons/*.json`)
```jsonc
{
  "id": "l2", "title": "Undefended pieces", "skills": ["piece_safety"], "phase": 1, "minutes": 5, "prereqs": ["l1"],
  "provenance": {"authoredBy": "Mentor team", "license": "own", "engineVerified": true, "reviewedAt": "2026-10-08"},
  "steps": [
    {"type":"text","title":"Why this matters","body":"…≤ 90 words…"},
    {"type":"board","fen":"4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1","arrows":[["d1","d5","red"]],"body":"Is the queen protected?"},
    {"type":"interactive","fen":"…","solution":["Rxd5"],"wrong":{"default":"Check what is attacked and unprotected."},"onSuccess":"Nothing could recapture."},
    {"type":"check","q":"A piece is undefended when…","options":["…","…","…"],"answer":1,"why":"…"}
  ],
  "cards": [{"prompt":"What is an undefended piece?","solution":["Nothing can recapture on its square."],"why":"Free pieces decide most games."}],
  "drills": {"puzzleQuery": {"skill":"piece_safety","band":"400-800","count":8}}
}
```
This is exactly the structure of the prototype's `learn.js` lesson (steps 1–4) and `session.js` lesson block.

### 4.2 Validator (`tools/validate-content.ts`, CI gate)
- All FENs legal; every `interactive.solution` legal and **engine-confirmed best** (depth 16, margin ≥ 100 cp).
- `body` ≤ 90 words; `why` ≤ 25 words; no banned shaming words; reading-grade check (Flesch–Kincaid ≤ 8).
- Every `skills` id exists; every `prereqs` resolves; no cycles.
- Provenance present; `license` not empty; no third-party text copied (record `source` for any adapted idea).

### 4.3 Authoring workflow
Draft (human or AI) → validator → **human review** (owner reads each lesson once; "reviewedAt") → merge. AI-drafted text is allowed **only** because the validator + review exist; AI never supplies the chess fact (the FEN/solution are chosen by us and verified by the engine).

## 5. Curriculum 600 → 1000 (what exists at each milestone)

| Skill (Phase) | Lessons (target v1 → v2) | Examples |
|---|---|---|
| piece_safety (1) | 4 → 6 | The Safety Check · Undefended pieces · Loose pieces · Trades and counting attackers |
| opponent_threats (1) | 3 → 5 | What did their last move do? · Hidden attacks · Threats vs. real threats |
| checks_captures_threats (1) | 3 → 4 | CCT for both sides · Order of looking · Forcing vs. quiet |
| blunder_check (1/3) | 2 → 3 | The last-second scan · Where can their reply land? |
| tactic_fork (2) | 3 → 5 | Knight forks · Pawn forks · Queen forks · Family forks |
| tactic_pin / skewer (2) | 3 → 5 | Absolute vs relative pin · Skewers · Using a pin |
| tactic_discovered, tactic_backrank, mate_patterns (2) | 5 → 8 | Back-rank mate · Smothered mate · Ladder · Queen+King patterns |
| tactic_removing_defender (2) | 1 → 3 | Capturing the defender · Deflection |
| candidate_moves, calculation_2ply/3ply (3) | 4 → 8 | Three candidates · Their best reply · Counting forcing lines |
| opening_principles, repertoire (4) | 4 → 8 | Centre, develop, castle · 3 repertoire primers |
| mg_targets…king_safety (5) | 4 → 12 | Worst piece · Open files · Weak squares · Good vs. bad trades · King danger signs |
| eg_basic_mates … defence (6) | 6 → 12 | KQ-K and KR-K mate · King and pawn: opposition · Square of the pawn · Lucena/Philidor basics · Converting an extra piece |
| time_management, self_analysis | 2 → 3 | Spending time on critical moves · Review your own mistake |
**Counts: v1 ≈ 40 lessons, v2 ≈ 80.** (Written in batches of 6–8 per milestone, each validated and reviewed.)

**Reorder (Phase 10 §7):** rungs 1–2 (KQ-K and KR-K mates) are taught in Phase 1–2, because research says "learn basic checkmates" is the most common advice below 1000 and they prevent stalemate disasters. Visualization exercises: Phase 10 §4.

## 6. Endgame ladder (Phase 6 skills)
Each rung = lesson + 8–12 drills (positions authored/generated + engine-verified win/draw) + a **pass test** (play the position out vs the engine from the starting FEN; success = reach the stated outcome within N moves without engine intervention).
1. **KQ vs K mate** · 2. **KR vs K mate** · 3. **K+P vs K: opposition & key squares** · 4. **Square of the pawn / pawn races** · 5. **Rook endings basics (Lucena/Philidor ideas; cut-off)** · 6. **Convert an extra piece safely (trade down, keep pawns)**.
Generation tool: random legal positions from a template (e.g. `7k/5K2/8/8/8/8/8/6Q1 w` style) filtered by **tablebase-like verification via the engine** (depth 20; reject positions where the result is not what the rung teaches). (Syzygy tablebases are an option later — **VERIFY** licence/size before bundling.)
Sample verified-legal templates: `7k/5K2/8/8/8/8/8/6Q1 w - - 0 1` (KQ vs K), `k7/8/1K6/8/8/8/8/7R w - - 0 1` (KR vs K), `8/8/8/4k3/8/4K3/4P3/8 w - - 0 1` (K+P vs K).

## 7. Model games — "think like a stronger player"
Authored from **public-domain historical games** (e.g. Morphy–Duke of Brunswick & Count Isouard, "Opera Game", Paris 1858: `1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8#` — verified legal and mating in chess.js).
Format: `{pgn, pauses:[{ply, prompt, expectedIdeas[], reveal}]}`. At each pause ask the **Safety-Check questions as the master would**: what is attacked, what are the threats, what are candidates; learner guesses; reveal with plain-language reason. Scored on *reasoning categories hit*, not exact move match. 10 games in v2, grouped by skill.

## 8. Daily test & weekly exam sources
Daily test (Phase 5 §6): old items from `Card`s due; today's items from the focus skill; "trap" items generated from puzzles where the pattern does **not** apply (use puzzles tagged with a different theme that *resemble* today's by piece layout — selector `similarLayout(fen)` using piece-type placement overlap). Weekly exam draws 6 of the learner's own mistakes (Blunder Box positions not seen in 3 days).

## 9. Volume summary (answering "will there be huge lessons/tests/puzzles?")
| Item | M2 (first usable) | M4 (full v1) | Growth path |
|---|---|---|---|
| Puzzles available | ~5k (12 shards) | ~19k | whole 6M DB by theme on demand |
| Authored lessons | ~12 | ~40 | → 80 (v2) |
| Opening repertoire | 1 small line | 3 repertoires | personal, from own games |
| Endgame rungs | 0 | 6 | + rook endings depth |
| Model games | 0 | 10 | 30 |
| Tests | auto-generated daily/weekly from all above | same | same |
| Your own games | unlimited | unlimited | primary content |

## 10. Acceptance tests
- [ ] `build-puzzles` reproducibly yields shards; spot-check 200 random puzzles by replay + engine.
- [ ] `validate-content` fails on: illegal FEN, missing provenance, `why` > 25 words, solution not engine-best.
- [ ] Opening drill: wrong move gives hint; right move reveals `why`; grading updates FSRS; left-book detection works on 5 fixture games.
- [ ] Planner can fill a 40-minute plan from content alone for each of Phase 1–3 skills (no empty block).
- [ ] Site build respects hosting file-count/size limits (script checks).

## 11. Pitfalls
- Puzzle `FEN` is **before** the opponent's first move — forgetting to apply it is the classic bug.
- Lichess puzzles are tagged by *how the motif appears*; some "fork" puzzles are really advantage-capturing puzzles. Always show the stated `why`, not just the theme name.
- Don't bundle huge engine-only datasets (416 M evals) — use them offline for authoring checks, never in the client.
