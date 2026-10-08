# Phase 3 — Chess core: engine, evaluation maths, classification, first meaningful mistake, motif detectors

**Goal:** turn "a position and a move" into **verified chess facts**: how good the move was, what it allowed or missed, and whether it is the mistake worth teaching. This is the foundation of the whole product; the LLM never replaces anything in this phase.
**Prerequisite:** Phases 1–2. **Output:** `src/core/engine/*`, `src/core/chess/*`, `src/config/chess.json`, golden tests.
**UI link:** replaces `ui/js/bot.js` (dummy) and the hand-set `classMeta`/`evals` in `ui/js/data.js`. Review screen reads `PlyRecord`/`Mistake` instead.

## 1. Engine client

### 1.1 Worker protocol
`EngineClient` wraps a Web Worker running the Stockfish WASM build (D3). Speak **UCI** to the worker; expose the typed API from Phase 1.
- Boot: `uci` → wait `uciok` → `setoption name Threads value N` (only if `crossOriginIsolated`) → `setoption name Hash value 32` → `isready` → wait `readyok`.
- Analyse: `setoption name MultiPV value K`; `position fen <FEN>`; `go depth D` (or `go movetime T`). Collect `info` lines until `bestmove`.
- Parse `info depth d multipv m score (cp X | mate Y) [lowerbound|upperbound] pv m1 m2 …`. **Ignore bound lines.** Keep the **last** info per multipv at the final depth.
- Score is from the **side to move**. Normalise immediately into `EvalPoint` with an explicit `pov` field in your internal type; never pass raw scores around.
- Serialise requests (one in flight). Provide `stop()` → `stop` command; ensure a `bestmove` is awaited so state doesn't leak into the next request.
- Cache: key = `fenKey|depth|multipv` → result, in memory plus `kv` table (cap 20k entries, LRU).
- Failure modes: worker crash → recreate once, retry once, else surface `AppError('ENGINE_DOWN')` and let the caller degrade (see §9).

### 1.2 Depth/time budget (config)
| Use | Setting | Why |
|---|---|---|
| Review (per ply, two positions) | depth 12–14 or 250–400 ms, MultiPV 2 | Enough to find hanging pieces, forks, 2-ply tactics at 600–1200 level |
| Hint / threat check | depth 10, MultiPV 1 | Instant feel |
| Opponent move | depth/skill per level (Phase 7) | Strength control |
| Puzzle verification (offline tooling) | depth 18+ | Quality of content |
Review of a 40-move game ≈ 80 plies × 2 positions × 0.3 s ≈ 48 s on a laptop: run in the background with a progress bar; analyse the **learner's plies first** (opponent plies only where needed for refutation).

## 2. Evaluation maths (all constants live in `config/chess.json` with `source`)

### 2.1 Centipawns → win percentage
`winPct(cp) = 50 + 50 * (2 / (1 + exp(-K * cp)) - 1)` with `K = 0.00368208` (Lichess's open-source fit to real game results — **VERIFY the constant against lila's `WinPercent` source before shipping**). Mate scores: map to `cp = sign * 10000` for this function (it saturates).
`mover POV`: after the learner moves, the engine evaluates from the opponent's view; `evalAfter_mover = -score`.

### 2.2 Loss and accuracy
- `winPctLoss = max(0, winPctBefore_mover - winPctAfter_mover)` where `Before` = engine's best line for the mover in the position before the move; `After` = engine eval of the position after the played move, flipped to mover POV.
- Per-move accuracy (Lichess formula, VERIFY): `acc = clamp(103.1668 * exp(-0.04354 * winPctLoss) - 3.1669, 0, 100)`. Game accuracy = mean of per-move accuracies (Lichess uses a volatility-weighted harmonic/arith blend; start with the mean and document the difference).

### 2.3 Starting thresholds (configurable; calibrate with the owner's real games in Phase 9)
| Name | Default | Meaning |
|---|---|---|
| `inaccuracyWinPct` | 5 | loss ≥ 5 points |
| `mistakeWinPct` | 10 | loss ≥ 10 |
| `blunderWinPct` | 15 | loss ≥ 15 |
| `meaningfulWinPct` | 10 | a mistake is "meaningful" if loss ≥ this **and** the position before was not already lost/won decisively (see §4) |
| `alreadyLostBelow` | 8 | mover win% before < 8 → "already lost", don't teach the fall |
| `alreadyWonAbove` | 92 | mover win% before > 92 → only count a loss that drops below 70 |
Beginners blunder constantly, so **reporting** uses the *first meaningful* + at most N=3 further ones (config `maxMistakesShown`).

## 3. Move classification (per learner ply)
Compute for each ply: `bestUci`, `secondBestUci`, `winPctBest`, `winPctSecond`, `winPctPlayed`, `loss`.
Evaluate in this priority:
1. **book** — ply ≤ `bookMaxPly` (default 14) **and** the resulting position is in the bundled opening book (Phase 6 §3) for the learner's rating band. No loss computed.
2. **brilliant** — played == best, `winPctBefore ≥ 40` (not already lost), the move **sacrifices material** (SEE of the move's destination < 0 for the mover **or** net material after the engine's line < material before by ≥ 2 pawns for ≥ 2 plies) and `winPctPlayed ≥ winPctBefore - 3`. Rare by design; never show if confidence in the SEE check is low.
3. **great** — played == best and `winPctBest - winPctSecond ≥ greatGapWinPct (default 15)` (an only-move) **or** it flips the game: `winPctBefore < 40 → winPctPlayed ≥ 50`.
4. **best** — played == best (or loss ≤ 0.5).
5. **miss** — `loss ≥ inaccuracyWinPct` **and** the opponent's *previous* ply was a mistake/blunder (`oppLoss ≥ mistakeWinPct`) **and** the best move would have punished it (`winPctBest - winPctBefore_prev ≥ 10`). I.e. you failed to exploit an error. Show as "Miss", not "Blunder", so beginners learn to look for *opportunities*.
6. **blunder / mistake / inaccuracy** by loss thresholds above.
7. **excellent** (loss ≤ 2) / **good** (loss ≤ 5) otherwise.
The prototype's palette in `ui/js/data.js` (`classMeta`) already contains the same ten labels — reuse it.

## 4. First meaningful mistake (the central algorithm)
```
input: learner plies with {winPctBefore, winPctPlayed, loss, cls, isBook, motifs}
for ply in order:
   if isBook: continue
   if winPctBefore < alreadyLostBelow: continue            # nothing meaningful left to lose
   if winPctBefore > alreadyWonAbove and winPctPlayed >= 70: continue
   if loss >= meaningfulWinPct:                             # candidate
        if materialDropAfterBestReply(ply) >= 1 or mateAllowed(ply) or loss >= 2*meaningfulWinPct:
              return ply                                    # FIRST MEANINGFUL
return argmax(loss)                                          # fall back to the largest drop, flagged isFirstMeaningful=false
```
`materialDropAfterBestReply` = material change for the learner after the opponent's engine-best reply (1–2 plies). This avoids flagging positional inaccuracies the beginner cannot act on.
Also store `rank` (damage order) for the extra mistakes; the UI shows only: first meaningful, plus the next two by damage whose skillTag differs (to avoid flooding with three identical hangs).

## 5. Phase detection (for stats and lesson targeting)
Config-driven, deterministic:
- `opening`: ply ≤ 20 **and** no queen trade **and** non-pawn material ≥ 80 % of start.
- `endgame`: both sides' non-pawn material (N=3,B=3,R=5,Q=9) ≤ `endgameMaterial` (default 13) **or** queens off and ≤ 20 total.
- else `middlegame`.

## 6. Tactical primitives (`src/core/chess/*`) — built on `chess.js` (`attackers(square, color)`, `moves({verbose})`)

### 6.1 Attack/defence map
`attackMap(fen)` → for each square: `attackedBy: {w: Sq[], b: Sq[]}`; computed once per position with `chess.attackers`. Cache by FEN.

### 6.2 Static Exchange Evaluation (SEE)
Purpose: decide if a capture/piece is really winning or losing material.
```
see(fen, targetSq, sideToCapture):
   gain[0] = value(piece on targetSq)
   attackers = sorted ascending by value for each colour (x-rays: after removing an attacker, re-query attackers on the square)
   loop alternating sides: if no attackers left -> stop
        gain[d] = value(movedPiece) - gain[d-1]   # standard swap list
   minimax back through gain[] (each side may stop capturing)
   return gain[0] resolved
```
Piece values (config): P1 N3 B3 R5 Q9, K = 100 (kings may capture only if square is not defended).
Use `chess.remove()`/`put()` on a **copy** to uncover x-rays.

### 6.3 Hanging / loose
- **loose(piece)** = attacked by opponent, **or** undefended (0 defenders). 
- **hanging(piece)** = loose **and** `see(piece.square, opponent) > 0`. Output includes `gain` and `attackerSquare`. The prototype `hangingAfter` in `ui/js/bot.js` is the 1-ply version of exactly this and is the migration reference.
- Run on the position **after** the learner's move to produce "allowed" hits; run on the position **before** to produce "you could have captured" hits.

### 6.4 Threat detection (what did their last move do?)
`threats(fen)` for the side that just moved (the "threatener"):
1. If the side to move is in check → the threat is simply "you are in check"; stop.
2. Build `fenNull` by flipping the side to move and clearing en-passant. (Illegal if the opponent's king would be capturable → in that case skip.)
3. For the threatener as side-to-move in `fenNull`: list captures with `see > 0`, checks that lead to forced mate within 2 plies (engine MultiPV depth 8), forks (§6.5), pins newly created (§6.6).
4. Rank by `gain`; return top 3 with `{kind, from, to, gain, evidence}`.
This powers the Safety Check feedback ("their queen now attacks your rook on e3") and the hint ladder. Verify top threat with the engine (`analyse(fenNull, depth 10)`); if the engine's best score for the threatener is < +1.0 pawn, downgrade severity to "minor".

### 6.5 Fork
A move (or position) has a **fork** when one piece attacks ≥ 2 enemy targets where each target is (a) undefended, or (b) of greater value than the forker, or (c) the king, and the forked side cannot resolve both with one move (check: for each defender reply, run `see` after the reply; if some target still loses material in all replies → confirmed). Detect for N, Q, P, B, R separately; family label e.g. `fork.knight`.

### 6.6 Pin / skewer / discovered attack
- **Absolute pin**: ray from an enemy slider through exactly one of that side's pieces to its king. **Relative pin**: same to a more valuable piece.
- **Skewer**: slider attacks a valuable piece with a less valuable piece behind it on the same ray.
- **Discovered attack/check**: moving piece P unblocks a ray from own slider to a target; flag if P's move itself creates a second threat.
Implement ray walking on the 8 directions; stop at first blockers; use board coordinates from `chess.board()`.

### 6.7 Back-rank
Side's king on back rank, all squares in front blocked by own pieces/pawns, enemy rook/queen can reach the back rank with check → `backrank.threat` (allowed) or `backrank.mate` (missed). Engine-verify with `mate` score.

### 6.8 Missed check / capture / mate
Compare engine best move with the played one: if best is a **check**/**capture**/**mate-in-n** and played is not → `missed.check` / `missed.capture` / `missed.mate`. These map to the "Missed X" tags in the UI and to Blunder Box themes.

### 6.9 Motif ids (starting list)
`hanging.piece, loose.piece, fork.knight, fork.pawn, fork.queen, fork.other, pin.absolute, pin.relative, skewer, discovered.attack, discovered.check, backrank.threat, backrank.mate, missed.capture, missed.check, missed.mate, overloaded.defender (v2), trapped.piece (v2), removing.defender (v2)`.
Each detector returns `MotifHit[]` with `role`, `squares`, `severity` (1 minor … 3 decisive), and a human-checkable `evidence` string used by Phase 7 grounding (e.g. "Qf6 attacks Nh4; Nh4 has 0 defenders; SEE +3").

### 6.10 False-positive control (important)
A motif is attached to a mistake **only if** the engine agrees it matters: the played move's refutation line (opponent best reply) must realise the motif (material/mate gain ≥ 2 pawns or mate). Otherwise store as `info` and do not teach it. Keeps explanations honest and short.

## 7. Skill tag mapping
`motif → SkillId` table in `config/skillmap.json` (e.g. `hanging.piece → piece_safety`, `missed.capture → checks_captures_threats`, `fork.* → tactic_fork`). Used by Phase 4 (Mistake.skillTags) and Phase 5.

## 8. Golden tests (write BEFORE the detectors)
`tests/golden/motifs.json`: for each motif ≥ 5 positives and ≥ 5 negatives with FEN, move, expected hits. Examples to include now:
- `6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1` → missed `backrank.mate` if White plays anything but Ra8#.
- `2r1k3/8/8/8/2N5/8/8/4K3 w - - 0 1` → `fork.knight` available via Nd6+.
- `4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1` → Black queen `hanging.piece`; Rxd5 = `missed.capture` if not played.
- The prototype game (`ui/js/data.js` `sampleGame`) 11.Nh4 → `hanging.piece` (Qxh4, SEE +3) and first meaningful mistake at ply 21.
Property tests: SEE must equal brute-force minimax over capture sequences on random positions (≤ 6 pieces).

## 9. Degraded modes
- Engine unavailable → use SEE/threat detectors only; classification limited to {blunder-by-material, ok}; banner "Reduced accuracy mode".
- Analysis cancelled (user leaves) → persist partial `PlyRecord`s; resume on reopen.

## 10. Acceptance tests
- [ ] Parser unit tests for 30 real UCI info transcripts (cp, mate, bounds, multipv).
- [ ] `winPct` monotonic, symmetric (`winPct(-x) = 100 - winPct(x)`), `winPct(0) = 50`.
- [ ] The sample game yields: first meaningful mistake = ply 21, class blunder, motif `hanging.piece`, refutation `Qxh4`.
- [ ] Golden motif suite ≥ 95 % precision, ≥ 85 % recall on the owner's first 20 reviewed games after manual labelling (create `tests/labelled/`).
- [ ] 40-move game reviewed in < 90 s on a mid laptop at depth 12; UI never blocks (worker only).

## 11. Pitfalls
- Engine scores are side-to-move relative: the #1 source of sign bugs. Wrap them in a type that carries `pov`.
- Don't classify the **opponent's** plies with the learner's thresholds; opponents are used only for `miss` and refutations.
- Cache by position **and** depth; a depth-8 cached result must not satisfy a depth-14 request.
- `chess.js` rejects some FENs with illegal ep squares; sanitise null-move FENs.
