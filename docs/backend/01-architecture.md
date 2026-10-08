# Phase 1 — Architecture, repo layout, interfaces

**Goal:** a skeleton where every later phase has an obvious home, boundaries are enforced by interfaces, and the prototype UI can be migrated screen by screen.
**Prerequisite:** read `00-INDEX.md` §1 rules and §3 decisions.
**Output:** compiling TypeScript project, empty-but-typed modules, CI running lint + tests, the prototype served from the new build.

## 1. System picture (all in the browser)

```
┌────────────────────────── UI (views, no business logic) ──────────────────────────┐
│ Home  Session  Play  Puzzles  Learn  Openings  BlunderBox  Review  Progress  Settings │
└───────────────▲──────────────────────────────▲─────────────────────────────────────┘
                │ calls services                │ subscribes to store events
┌───────────────┴───────────── Services (pure TS, testable) ────────────────────────┐
│ ReviewService  PlannerService  SrsService  SkillService  PlayService  ContentService  CoachTextService │
└───┬──────────────┬───────────────┬─────────────────┬────────────────┬─────────────┘
    │              │               │                 │                │
 ChessCore     Repository      Importer          Opponent         AiProvider
 (rules+detect) (IndexedDB)   (Lichess/Chess.com/  (SF skill /     (Gemini/Groq/
    │                          PGN)               Maia)           OpenRouter/templates)
 EngineClient ──► Web Worker ──► Stockfish WASM
```
Rule: **views never import engines, DB or providers directly**; they call a service. Services never touch the DOM.

## 2. Repository layout (target)

```
/ui/                      # prototype (kept until Phase 8 completes, then deleted)
/app/
  index.html
  vite.config.ts   tsconfig.json   package.json
  public/
    _headers                    # COOP/COEP for cross-origin isolation (optional, see §6)
    engine/                     # stockfish wasm/js files (copied at build; see 03)
    content/                    # static content bundles (lessons, openings, puzzle shards)
  src/
    main.ts  router.ts  shell/            # nav, toasts, modals (from ui/js/main.js, ui.js)
    views/                                # one file per screen (from ui/js/views/*)
    components/                           # Board, Eval bar, Chart, PuzzleWidget, CoachCard...
    services/                             # see §3
    core/
      chess/                              # rules wrapper, SEE, attack maps, motifs (Phase 3)
      engine/                             # EngineClient + worker (Phase 3)
      srs/  skills/  planner/              # Phase 5
      content/                            # loaders & validators (Phase 6)
      ai/                                 # provider interface, grounding, verifier (Phase 7)
    data/                                 # Dexie db, schema, migrations (Phase 2)
    config/                               # JSON policy files with comments of origin (Phase 3,5)
    types/                                # shared TS types (Phase 2)
  tests/  unit/  golden/  e2e/
/docs/ ...
/LICENSES.md                              # every dependency + asset licence (Phase 9)
```

## 3. Service interfaces (the contract between phases)

```ts
// core/engine — Phase 3
interface EngineClient {
  init(opts?: { threads?: number; hashMb?: number }): Promise<void>;
  analyse(fen: string, o: { depth?: number; movetimeMs?: number; multiPv?: number }): Promise<EngineResult>;
  stop(): void; dispose(): void;
}
interface EngineResult { fen: string; depth: number; lines: { multipv: number; cp?: number; mate?: number; pv: string[] }[] } // cp/mate are from side-to-move view

// services/ReviewService — Phase 4
interface ReviewService {
  reviewGame(gameId: string, o?: { depth?: number }): AsyncIterable<ReviewProgress>; // streams so UI shows a progress bar
  getReview(gameId: string): Promise<GameReview | undefined>;
}

// services/SrsService — Phase 5
interface SrsService {
  dueCards(now: Date, kind?: CardKind, limit?: number): Promise<Card[]>;
  grade(cardId: string, outcome: Outcome, ctx: { hints: number; ms: number; confidence?: Confidence }): Promise<Card>;
  addBlunderCard(from: MistakeRef): Promise<Card>;
}

// services/PlannerService — Phase 5
interface PlannerService {
  planToday(now: Date, minutes: number): Promise<SessionPlan>;   // the 6 blocks
  recordBlockResult(planId: string, blockId: string, result: BlockResult): Promise<void>;
}

// services/PlayService — Phase 7
interface Opponent { name: string; elo: number; chooseMove(fen: string, history: string[], ctx: OpponentCtx): Promise<string /*uci*/> }
interface PlayService { startGame(cfg: GameConfig): GameSession; }

// core/ai — Phase 7
interface AiProvider { id: string; explain(pkg: GroundedPackage, style: Style): Promise<string>; available(): Promise<boolean> }

// importers — Phase 4
interface Importer { id: 'lichess'|'chesscom'|'pgn'; fetchGames(q: ImportQuery): AsyncIterable<RawGame> }
```
Every implementation lives in its own file; a registry (`services/index.ts`) wires defaults so tests can inject fakes.

## 4. Build tooling & commands (to create in this phase)
1. `npm create vite@latest app -- --template vanilla-ts` then add: `dexie`, `chess.js`, `ts-fsrs`, `vitest`, `@playwright/test`, `eslint`, `prettier`, and the Stockfish package chosen in D3.
2. Scripts: `dev`, `build`, `preview`, `test` (vitest), `e2e` (playwright), `lint`, `typecheck`.
3. CI (GitHub Actions): typecheck → lint → unit → build → e2e on the built output.
4. Copy the prototype's `css/app.css` to `src/styles/app.css` unchanged; copy `ui/js/board.js` to `src/components/Board.ts` and type it (it is already self-contained: it only needs a chess.js instance).
5. `src/config/` loader that validates JSON files with a schema and exposes typed `cfg.get('classification.blunderWinPct')`. A test fails if any config key lacks a `source` comment.

## 5. State management
- One tiny event bus (`on/emit`) + Dexie `liveQuery` for DB-backed views. No global store library.
- Ephemeral state (current game, current puzzle) lives in the view/service object and is persisted at defined checkpoints (move played, puzzle done), so a refresh never loses more than the current move.

## 6. Engine hosting detail (affects headers)
- Multi-thread Stockfish needs `SharedArrayBuffer`, which requires the page to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. On Cloudflare Pages put them in `public/_headers`.
- If those headers are absent the app must still work: detect `crossOriginIsolated`; if false load the **lite single-thread** build. Never hard-require threads.
- Loading cross-origin resources (e.g. avatars, fonts) under COEP needs `Cross-Origin-Resource-Policy`/CORS on them; keep everything same-origin to avoid breakage. (VERIFY when enabling.)

## 7. Error and offline policy
- Every service returns typed results or throws `AppError{code, userMessage, recoverable}`. Views render `userMessage` in a toast and never show stack traces.
- Network features declare `needsNetwork: true`; the shell shows a small "offline" chip and disables only those controls.

## 8. Acceptance tests for Phase 1
- [ ] `npm run build` produces a static bundle that serves the shell and one migrated view (Settings) with identical look to the prototype.
- [ ] `typecheck`, `lint`, `unit` pass in CI.
- [ ] A fake `EngineClient` and fake `AiProvider` can be injected in a unit test (proves boundaries).
- [ ] Config loader rejects a key without `source`.
- [ ] Lighthouse a11y ≥ 95 on the Settings view.

## 9. Pitfalls
- Do not let `Board` import services (it is a dumb component; the prototype already gets this right).
- `chess.js` is a mutable object; pass FEN strings between services and rebuild instances locally to avoid hidden shared state.
- Keep the worker protocol versioned (`{v:1,...}`) so an engine swap does not break callers.
