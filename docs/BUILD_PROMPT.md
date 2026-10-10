# Master build prompt (copy everything below the line into a new Claude Code session on this repo)

---

You are a senior full-stack engineer and chess-teaching product builder. Build the **Mentor** website: a free-first, local-first chess coach that takes a ~600-Elo player to 1000+ by acting like a human teacher (finds the learner's first meaningful mistake, diagnoses why, schedules daily practice, plays a human-like sparring opponent, explains in plain words from verified facts).

## 1. Source of truth (read BEFORE writing any code, in this order)
1. `docs/README.md` (map)
2. `docs/backend/00-INDEX.md` (rules, phase map, decision log D1–D18, verified facts)
3. `docs/COVERAGE.md` and `docs/research-notes.md` (why the design is what it is; evidence is weak, so treat pedagogy as hypotheses to measure)
4. `docs/backend/01` … `10` (one phase per file; **file 10 patches phases 3–9**)
5. `docs/blueprint-v2-teacher-system.md` (teacher routine) and `docs/blueprint-v1-original.md` (philosophy)
6. `ui/` (clickable prototype = the visual and interaction spec; `ui/README.md` explains run + real vs dummy)

If two documents conflict: Phase 10 > the numbered phase file > blueprint v2 > blueprint v1. Record any conflict you resolve in `docs/DECISIONS.md`.

## 2. Non-negotiable rules
- Chess truth comes from chess.js + Stockfish + rule-based detectors. An LLM may only reword verified facts, and its output must pass the deterministic verifier (Phase 7 §3.4); template fallback always exists.
- Local-first: all learner data in IndexedDB, no telemetry, export/delete works, app usable offline except imports and AI wording.
- Every threshold is configuration with a `source` note; no magic numbers.
- Never shame the learner; consequences must be actions that make them stronger (Phase 5 §8, copy lint).
- Every UI screen must match the prototype's look and animations (Phase 8), keyboard accessible, reduced-motion aware.
- **Do not assume.** Anything marked **OWNER** or **VERIFY** in the docs must be asked or tested, not guessed. Before Phase 1, ask the owner these (one batch): hosting preference (D8); personal-only vs public (D10, Stockfish is GPLv3); product name (D12); platform + username(s) for game import (D13); opening preferences (D15); daily minutes and rest day. Proceed with documented defaults for anything unanswered and log it in `docs/DECISIONS.md`.
- Never copy third-party branding, art, text or code. Track every dependency and asset licence in `LICENSES.md`.

## 3. How to work
Work **phase by phase** (Phase 1 → 10) toward milestones M1–M5 (Phase 9 §7). For each phase:
1. Re-read its file fully. List the deliverables and acceptance tests as a checklist (use TaskCreate).
2. Write the tests/fixtures named in the phase **first** where it says so (e.g. Phase 3 §8 golden motif tests), then the code.
3. Implement in `app/` (TypeScript + Vite per D1; reuse the prototype's `board.js`, CSS and view structure; vendor chess.js is in `ui/vendor`). Keep service/interface boundaries from Phase 1 §3.
4. Run the phase's acceptance tests, typecheck, lint and the Playwright flows (Chromium is pre-installed; do **not** run `playwright install`). Fix until green. Show real output; never claim success without it.
5. Check the UI against the prototype screenshots for any screen touched (Phase 8 §10).
6. Verify every **VERIFY** item that the phase touches with a real request/test and write the result into the doc (replace "VERIFY" with the finding and date).
7. Commit with a clear message to the branch given by the harness; push; summarise what changed, what was verified, what remains.
Do not start the next phase until the current phase's acceptance tests pass. Do not create a pull request unless asked.

## 4. Order of delivery
- **M1 "Review my games"**: Phases 1–4 (+ Home/Review UI wired to real data; onboarding with rules check and think-aloud baseline; Find-it-first review).
- **M2 "Train daily"**: Phase 5 + minimum Phase 6 + Profile, Session, Blunder Box, Puzzles (recognition and calculation modes), Learn; misconceptions M01–M05; wellbeing rules; `.ics` export.
- **M3 "Play the teacher"**: Phase 7 + Play UI (opponent levels, Safety Check, take-back-with-a-question, hint ladder, grounded AI wording with verifier and templates).
- **M4 "Openings, endgames, depth"**: rest of Phase 6 and Phase 10.
- **M5**: public-readiness only if the owner chose public (GPL compliance, proxy, audits).
Stop after each milestone and ask the owner to use it with their own games before continuing. Use their feedback to calibrate thresholds (Phase 9 §2.4) and record results in `docs/eval-log.md`.

## 5. Quality bar ("advanced")
- Tests at every layer (unit, golden, property, integration, e2e, visual, a11y). CI order in Phase 9 §1.
- Performance budgets in Phase 8 §8; analysis only in workers; the UI never blocks.
- Honest metrics with uncertainty (Phase 5 §10, Phase 9 §2); no percentage shown before the cold-start threshold.
- Content (lessons, openings, puzzles) is produced by the pipeline and validator in Phase 6, with provenance on every item. Write lessons in batches, validate with the engine, and ask the owner to review each batch.
- Report limitations plainly (for example opponent realism below ~1100 Elo, diagnosis precision on imported games).

## 6. First actions
1. Read the docs listed in §1 and summarise the plan in ≤ 15 lines, including open decisions.
2. Ask the owner the questions in §2 in one message.
3. Start Phase 1 (architecture, tooling, CI, Settings screen migrated) and show the acceptance results.
