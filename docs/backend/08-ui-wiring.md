# Phase 8 — UI wiring: from the prototype to the real app

**Goal:** replace every dummy in `ui/` with a real service call **without redesigning anything**. The prototype is the visual and interaction spec; this file is the migration map, component contracts, states, and the backlog of chess-site UI patterns not yet in the prototype.
**Prerequisite:** services from Phases 2–7 exist (or fakes returning the same shapes). **Output:** `app/src/views/*` and `app/src/components/*` matching the prototype pixel-for-pixel, then deletion of `ui/`.
**How to preview the prototype:** `cd ui && python3 -m http.server 8765` → http://localhost:8765/ (details in `ui/README.md`).

## 1. UI pattern inventory (what the prototype already copies, and what it does not)
Reference sources used: chess.com's public navigation (Play, Puzzles, Learn, Train, Watch, Community, search), its Game Review model (accuracy, move-classification labels Brilliant/Great/Best/Excellent/Good/Book/Inaccuracy/Mistake/Miss/Blunder, evaluation graph, Coach panel with arrows/highlights, takebacks in bot play) as documented in its help centre and release notes. **No logos, names, art or code are copied.** Layout conventions (left nav, centred board with player bars and clocks, right-hand tabbed panel, captured-piece rows, eval bar) are common to most chess sites.

| Pattern | In prototype? | Where | Notes |
|---|---|---|---|
| Left nav + active indicator, mobile bottom bar | ✅ | `css/app.css` `#nav`, `@media (max-width: 820px)` | |
| Board with coordinates, last-move & check highlights, legal-move dots, capture rings | ✅ | `js/board.js` | |
| Click-to-move **and** drag-and-drop | ✅ | `Board.onDown/startDrag` | |
| Piece slide/capture/castle/promotion animations | ✅ | `Board.applyMove`, CSS `.piece`, `.captured`, `.promoted` | respects "Reduce motion" (`data-motion='off'`) |
| Right-click arrows (Shift = red) | ✅ | `Board.startArrow` | add circles on single-click right (backlog) |
| Player bars, clocks, captured pieces + material advantage | ✅ | `views/play.js` | |
| Move list with click-to-navigate, ← → keys, flip (F) | ✅ | `views/play.js` | |
| Takeback, hint, resign, draw buttons | ✅ | `views/play.js` | draw offer is a stub |
| Game Review: eval bar, eval graph, move badges, accuracy, "first mistake" card, Coach cards | ✅ | `views/review.js` | graph click-to-jump (backlog) |
| Puzzles with streak, hint ladder, themes | ✅ | `views/puzzles.js`, `views/_puzzle.js` | |
| Learn path with locked nodes, lesson viewer | ✅ | `views/learn.js` | |
| Openings drill with "why" | ✅ | `views/openings.js` | |
| Settings: theme, board colour, motion, sound | ✅ | `views/settings.js`, `ui.js` | |
| Teacher drawer | ✅ | `main.js teacherInit` | |
| **Not yet (backlog)** | ❌ | | premoves; move sounds as real samples; piece-set picker; board editor / "set up position"; PGN/FEN copy & download; analysis-board with variations; evaluation lines panel (MultiPV); multi-game archive list with filters; search; keyboard shortcut help; confetti variants; hover previews on move list; accessibility announcements for moves (aria-live "White plays e4") |

## 2. Component contracts (`src/components/*`)
| Component | Source | Props / API | Notes |
|---|---|---|---|
| `Board` | `ui/js/board.js` | `{chess, orientation, interactive(color), onUserMove({from,to,promotion}) → boolean, coords, animate}`; methods `render(), applyMove(m), setMarks, setArrows, setLastMove, flip` | Dumb: no services. **Keep exactly** — it's tested in the prototype. Port to TS, add `aria-label` on squares for keyboard play (arrow keys + Enter) |
| `EvalBar` | inline in `review.js` / `play.js` | `{winPct}` (not pawns) | animate height; show text only beyond ±5 % |
| `LineChart` | `ui.js lineChart` | `{points, labels, min, max, color, onPoint}` | add `onPoint(i)` to jump in review |
| `PuzzleWidget` | `views/_puzzle.js` | `{puzzle, threatStep, onDone, onWrong}` → `{board, giveUp, destroy}` | wraps hint ladder + threat step; uses `PuzzleService` |
| `CoachCard` | `.coach-card` markup | `{tone: info|warn|bad|good, title, body, actions[]}` | all teacher text passes through `CoachTextService` |
| `Stepper` | `session.js` `.steps` | `{blocks, currentId}` | |
| `Toast`, `Modal`, `Drawer` | `ui.js`, `main.js` | | focus trap + `aria-modal`, Esc to close |
| `Ladder` | `.ladder` | `{step, total}` | |
| `Stat` | `home.js` | `{label, value, prev, good:'up'|'down'}` | numbers animate with `countUp` unless reduced motion |

## 3. Routing
Hash routes remain (static hosting friendly): `#/home #/session #/play #/puzzles #/learn #/learn/:lessonId #/openings #/openings/:id #/blunders #/blunders/:cardId #/review #/review/:gameId #/progress #/settings #/onboarding`.
Query params: `#/play?fen=<FEN>&mode=critical` (Critical Position), `#/review/:gameId?ply=21`.
Rule: **every screen is reachable by URL** and survives refresh (state rebuilt from DB).

## 4. Screen-by-screen wiring
Each row: *what the prototype fakes → real source → states to implement*.

### Home (`views/home.js`)
| Prototype | Real |
|---|---|
| `user`, `sessionBlocks` | `PlannerService.planToday()` + `Profile`; ring % = completed block minutes / total |
| `stats[4]` | `MetricsService` (Phase 5 §10) with `prev` = value 4 weeks ago; "improving/slipping" from sign and `good` |
| `ratingTrend` | platform ratings from imported games or Mentor Elo; goal bar uses `Profile.goalRating` (never assume 600 as start — use first measured) |
| `recentGames` | `GameRepo.recent(5)` + first meaningful `Mistake` summary text (template) |
| Note from Mentor | latest `Journal(teacher_note)` |
States: **empty** (no games → onboarding card "Import your games to meet your first mistake"), **loading** (skeleton cards), **error** (toast + retry), **cold start** (< 6 data points → "Still learning about you" instead of percentages).

### Today's Session (`views/session.js`)
Blocks map 1:1 to `PlanBlock.id`. Replace hard-coded content with `plan.blocks[i].items` and `PuzzleWidget/CardReview`. Persist after every item (`PlannerService.recordBlockResult`). "Save and leave" = persist and route home. Light day toggle on Home calls `planToday(now, 15)`. Each item shows its `why` (small muted line "Because…"). End screen shows streak update and teacher note.

### Play (`views/play.js`)
Lobby uses `LEVELS` (from `opponent.json`), time controls, mode, colour. `PlayService.startGame` returns a `GameSession` with events: `moved`, `botThinking`, `takebackOffer`, `hint`, `ended`. Replace `pickMove` with `Opponent.chooseMove`; `hangingAfter` with Phase 7 §2.2. Save `Game` (source `mentor`) with per-move metadata on every move (resume after refresh). Clocks run from stored timestamps, not intervals, so refresh doesn't lose time. Keyboard: arrows navigate history, `F` flips, `Esc` closes modals.

### Review (`views/review.js`)
See Phase 4 §6 table. Add: loading state while stages run (progress bar), partial results (show classified plies as they complete), "Re-review at higher depth" button, per-ply Coach card with grounded text, graph click-to-jump.

### Puzzles (`views/puzzles.js`)
`PuzzleService.next({skill:'auto', targetRating})`; "auto" uses the planner's focus; theme dropdown filters; show **set progress** (Woodpecker cycle), not an endless feed; rating = in-app puzzle Elo (Phase 5 §5.4).

### Learn (`views/learn.js`)
`roadmap` from `skills.json` + `SkillState.status` (node states: done/current/next/locked from prereqs + evidence). Lesson list from `content/lessons`. Lesson viewer renders the step types in Phase 6 §4.1 (`text|board|interactive|check`) — the prototype's four steps are the reference implementation.

### Openings (`views/openings.js`)
`OpeningRepertoire` + due FSRS cards; "Where you left your book" from Phase 6 §3.4; "Make a card" creates `Card(kind='opening')` after the *why* field is filled (required).

### Blunder Box (`views/blunders.js`)
`SrsService.dueCards('blunder')`; thumbnails use `Board` in read-only small mode (already); ladder from `Card.srs.step`; "Review N due" queue; result panel states exactly what happens next ("returns in 3 days").

### Progress (`views/progress.js`)
Charts from `MetricsService.series()`; skill bars from `SkillState` (show **"not enough data"** when status=insufficient); heatmap from motif × phase counts (replace the prototype's random fill — it uses `Math.random()` for demo only); phase gate checklists from Phase 5 §10 with evidence counts.

### Settings (`views/settings.js`)
Persist through `Profile`/`kv`. Add: platform accounts, AI keys (Phase 7 §3.5), data export/import/delete (Phase 2 §6), storage usage, engine build info, reset onboarding, "reduce motion" respects OS `prefers-reduced-motion` by default.

### Onboarding (new)
Steps: welcome → platform/username → time budget → import & review progress → Baseline Report → first plan. Skippable with PGN paste.

### Profile (new, `#/profile`)
`LearnerProfileExt` form, "What Mentor knows about you" (`CoachMemory` list with dismiss/correct), active misconceptions, expectations card, goals, `.ics` export, Coach Report export. Prototype: `ui/js/views/profile.js`.

### Review modes (Phase 10 §2)
Prototype toggle "Find it first / Show me" in `views/review.js`: hides eval bar, graph and badges until the learner picks the move they think was their first big mistake.

### Ask Mentor drawer
Intent router (Phase 7 §4). Quick-reply chips remain. Show "Verified by engine" label on chess claims, "Unverified" on general answers.

## 5. State & data flow rules
- Views call services; services emit events; views re-render on events (`attempt:added`, `mistake:added`, `plan:updated`). No view reads Dexie.
- Long jobs (review, import) run via `JobService` with `{id, stage, progress, cancel()}`; a global "jobs" chip in the nav shows progress and links to the relevant screen.
- Every async view has: skeleton, empty, error, content. Test each in Playwright by stubbing services.

## 6. Animation & motion spec (keep identical to prototype)
| Element | Animation | Duration/ease |
|---|---|---|
| Page enter | fade + 8px rise (`viewIn`) | 350 ms `cubic-bezier(.2,.8,.2,1)` |
| Cards/steps stagger | `rise` with 50 ms steps | 450 ms |
| Piece move | `transform` transition | 200 ms same easing |
| Capture | fade + scale to .6 | 250 ms |
| Legal dots / badges | `pop` scale from 0 | 150–350 ms |
| Progress bars | width transition | 800 ms |
| Line chart | stroke-dashoffset draw | 1.2 s |
| Confetti | on session complete / solved puzzles | ≤ 3.5 s; disabled with reduced motion |
All animations are disabled when `data-motion='off'` **or** `prefers-reduced-motion: reduce`.

## 7. Accessibility checklist (build-time gates)
- Contrast ≥ 4.5:1 text, 3:1 UI; verify both themes and all board colour schemes.
- Full keyboard play: focus board → arrows move cursor, Enter selects/moves; announce moves via `aria-live`.
- Don't rely on colour alone for classifications (symbols already included in badges).
- Focus trap in modals/drawer; visible `:focus-visible` outline (present).
- Touch targets ≥ 44 px on mobile; the bottom nav uses icon + label.
- Screen-reader text for evaluation and clocks.

## 8. Performance budgets
First load < 150 KB JS gz (engine **not** included); engine loaded lazily when entering Play/Review (lite ≈ 6 MB); LCP < 2.5 s on mid mobile; main-thread long tasks < 50 ms during play (all analysis in workers); memory < 300 MB with engine.

## 9. Migration order (each step shippable)
1. Shell + Settings (Phase 1 acceptance). 2. Board component + Play lobby with the **fake** Opponent. 3. Review screen on stored fixtures. 4. Real engine + Review. 5. Importers + onboarding. 6. Blunder Box + planner + Session. 7. Puzzles/Learn/Openings content. 8. Real Opponent + coach interception. 9. AI wording. 10. Delete `ui/`.

## 10. Acceptance tests
- [ ] Visual regression (Playwright screenshots at 1440×900 and 390×800) for each screen against the prototype baselines (≤ 1 % pixel diff after migration).
- [ ] Each screen renders skeleton/empty/error/content from stubbed services.
- [ ] Keyboard-only play of a full game; axe-core reports 0 critical violations.
- [ ] Reduced-motion: no transitions/animations on key screens.
