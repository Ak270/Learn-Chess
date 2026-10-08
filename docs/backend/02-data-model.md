# Phase 2 — Data model, storage, privacy

**Goal:** a single local database that stores everything the coach needs to remember — games, mistakes, cards, attempts, skill evidence, plans — with a design that makes **evidence traceable** (any statement the coach makes can be traced to source games/attempts) and **exportable/deletable**.
**Prerequisite:** Phase 1 skeleton.
**Output:** `src/types/*.ts`, `src/data/db.ts` (Dexie), migrations, repository functions, export/import, seed fixtures for tests.

## 1. Principles
1. **Append-only evidence.** Never edit history. Everything the learner does becomes an immutable `Event`; derived tables (`SkillState`, `Card` schedule) can be rebuilt from events (`rebuildDerived()` must exist and be tested).
2. **IDs are ULIDs** (sortable, generated client-side). **Times are UTC epoch ms.**
3. **Positions are FEN strings** (4-field "position key" for dedupe: pieces, side, castling, en-passant — no clocks).
4. **No personal data beyond what training needs.** Stored: games (public anyway), the learner's answers, timings, hint usage, self-explanations, settings. Not stored: email, real name, location.
5. **Schema versioned** with Dexie migrations. Every migration has a test with a fixture from the previous version.

## 2. Entities (TypeScript)

```ts
type ID = string; type Ms = number;

interface Profile {            // exactly one row, id='me'
  id: 'me'; createdAt: Ms; displayName: string;
  platformAccounts: { lichess?: string; chesscom?: string };
  selfRating?: number;          // user-reported start; NEVER used for decisions after calibration
  estimatedRating?: number;     // from calibration + games; see Phase 5
  dailyMinutes: number; restDay: 0|1|2|3|4|5|6; goalRating: number; // 1000 by default
  settingsVersion: number;
}

interface Game {
  id: ID; source: 'lichess'|'chesscom'|'pgn'|'mentor'; sourceId?: string; // dedupe key with source
  pgn: string; startedAt: Ms; timeControl?: string;           // "900+10"
  white: string; black: string; playerColor: 'w'|'b';          // which side is the learner
  result: '1-0'|'0-1'|'1/2-1/2'|'*'; termination?: string;
  opponentRating?: number; playerRating?: number;
  mode?: 'normal'|'coach'|'training';                          // only for source='mentor'
  clocks?: number[];                                           // seconds remaining after each ply, if available
  importedAt: Ms; reviewedAt?: Ms; reviewVersion?: number;
}

interface PlyRecord {          // one per ply, created at review time
  gameId: ID; ply: number;     // 1-based
  fenBefore: string; san: string; uci: string; color: 'w'|'b';
  timeSpentMs?: number;
  evalBefore?: EvalPoint; evalAfter?: EvalPoint;               // from mover's perspective, see Phase 3
  bestUci?: string; bestLine?: string[];
  winPctBefore?: number; winPctAfter?: number; winPctLoss?: number;
  cls?: MoveClass; accuracy?: number; isBook?: boolean;
  motifs?: MotifHit[];                                         // rule-based, Phase 3
  phase: 'opening'|'middlegame'|'endgame';
}
type EvalPoint = { cp?: number; mate?: number; depth: number };
type MoveClass = 'brilliant'|'great'|'best'|'excellent'|'good'|'book'|'inaccuracy'|'mistake'|'miss'|'blunder';
interface MotifHit { id: MotifId; role: 'allowed'|'missed'|'played'; squares: string[]; severity: 1|2|3; evidence: string }

interface Mistake {            // a ply flagged by review; the coaching unit
  id: ID; gameId: ID; ply: number; fen: string;                // position BEFORE the learner's move
  playedUci: string; bestUci: string; refutationUci?: string;  // opponent's best reply to the played move
  winPctLoss: number; isFirstMeaningful: boolean; rank: number; // rank within the game by damage
  motifs: MotifHit[]; skillTags: SkillId[];
  diagnosis: DiagnosisHypothesis[];                            // Phase 4
  selfExplanation?: { text: string; at: Ms };                  // what the learner said they were aiming for
  cardId?: ID;                                                 // Blunder Box card created from this
}
interface DiagnosisHypothesis { cause: Cause; confidence: 'high'|'medium'|'low'; signals: string[]; confirmedByUser?: boolean|'corrected'; correctedTo?: Cause }
type Cause = 'perception'|'calculation'|'over_focus_own_plan'|'rushed'|'knowledge_gap'|'transfer_failure'|'tilt'|'unknown';

interface Card {               // spaced-repetition unit (blunder / opening / concept / tactic)
  id: ID; kind: 'blunder'|'opening'|'concept'|'tactic'|'endgame';
  fen?: string; prompt: string; solution: string[]; why: string;     // 'why' REQUIRED for opening/concept cards
  skillTags: SkillId[]; sourceRef?: { mistakeId?: ID; puzzleId?: string; lineId?: string; lessonId?: string };
  srs: { scheduler: 'ladder'|'fsrs'; step?: number; fsrs?: unknown; dueAt: Ms; lastAt?: Ms; lapses: number; cleanStreak: number };
  state: 'new'|'learning'|'review'|'cleared'|'suspended'; createdAt: Ms;
}

interface Attempt {            // every answer the learner gives anywhere (append-only)
  id: ID; at: Ms; context: 'drill'|'puzzle'|'test'|'recall'|'weekly_exam'|'game_prompt'|'review';
  cardId?: ID; puzzleId?: string; fen?: string; playedUci?: string;
  correct: boolean; hints: number; ms: number;
  confidence?: 'sure'|'unsure'|'guess'; threatsStated?: string[];  // ids of checks/captures/threats ticked
  skillTags: SkillId[];
}

interface SkillEvidence {      // append-only; produced from Attempts, Mistakes, game stats
  id: ID; at: Ms; skill: SkillId; layer: 'knowledge'|'recognition'|'calculation'|'decision'|'transfer'|'retention';
  outcome: 1|0|0.5; weight: number; assisted: boolean; sourceRef: { attemptId?: ID; mistakeId?: ID; gameId?: ID };
}
interface SkillState {         // derived; rebuildable
  skill: SkillId; updatedAt: Ms;
  layers: Record<'knowledge'|'recognition'|'calculation'|'decision'|'transfer'|'retention', { mean: number; n: number }>;
  independence: number; recentGameRate?: number; transferGap?: number; lastSeen: Ms; trend: number;
}

interface SessionPlan { id: ID; date: string /*YYYY-MM-DD local*/; minutes: number; focusSkill: SkillId; blocks: PlanBlock[]; createdAt: Ms; completedAt?: Ms; light: boolean; teacherNote?: string[] }
interface PlanBlock { id: 'recall'|'lesson'|'drills'|'play'|'test'|'note'; targetMin: number; items: PlanItem[]; startedAt?: Ms; doneAt?: Ms; summary?: unknown }
interface PlanItem { kind: 'card'|'puzzle'|'lesson'|'game'|'test'; ref: string; why: string /* shown to learner: "Because you left a knight hanging in 3 games" */ }

interface Streak { id: 'me'; current: number; best: number; freezeLeft: number; lastDay: string }
interface Journal { id: ID; at: Ms; kind: 'teacher_note'|'weekly_letter'|'monthly_letter'; body: string; refs: ID[] }
interface ContentProgress { id: string /*lesson/opening id*/; kind: 'lesson'|'opening'|'endgame'|'modelgame'; state: 'new'|'seen'|'done'; at: Ms; score?: number }
interface KV { key: string; value: unknown }                     // settings, cache keys, flags
```

`SkillId` and `MotifId` are string unions defined in `src/types/ids.ts` (list in Phase 5 §2 and Phase 3 §6).

## 3. Dexie schema (version 1)
```ts
db.version(1).stores({
  profile:  'id',
  games:    'id, [source+sourceId], startedAt, reviewedAt',
  plies:    '[gameId+ply], gameId, cls, phase',
  mistakes: 'id, gameId, [gameId+ply], isFirstMeaningful, *skillTags',
  cards:    'id, kind, state, srs.dueAt, *skillTags',
  attempts: 'id, at, context, cardId, puzzleId, *skillTags',
  evidence: 'id, at, skill, layer',
  skills:   'skill',
  plans:    'id, date',
  streak:   'id',
  journal:  'id, at, kind',
  progress: 'id, kind',
  kv:       'key',
});
```
(`*field` = multi-entry index. Compound index names must be exact.)

## 4. Repository layer
One file per aggregate in `src/data/repos/` exposing only intent-named functions (`dueCards`, `addAttempt`, `mistakesForGame`…). No Dexie calls outside `data/`. Each write that affects derived state emits an event on the bus (`attempt:added`, `mistake:added`, `card:graded`) so services update skills/streaks.
Transactions: `addAttempt` + `addEvidence` + `updateCard` happen in **one** Dexie transaction.

## 5. Derived-data rebuild
`rebuildDerived()` re-runs: attempts → evidence (via Phase 5 mapping), evidence → skills, card history → schedule (SRS fields are *also* stored for speed but can be recomputed from attempts). Use it for (a) schema migrations, (b) when config weights change, (c) tests (golden fixtures).

## 6. Export / import / delete
- **Export** = one JSON: `{ app:'mentor', schema:1, exportedAt, tables:{ games:[…], … } }`, optionally gzip. Games' PGN stored as strings.
- **Import** validates the schema version and merges by ID (idempotent).
- **Delete all** = `db.delete()` + clear service worker caches + clear localStorage. Confirm dialog states exactly what is removed. Settings screen buttons already exist in the prototype.
- No analytics. If metrics are ever added they are local-only counters shown on the Progress screen.

## 7. Sizing & performance
- A game ≈ 5 KB PGN + ≈ 80 `PlyRecord`s ≈ 40 KB → 1,000 games ≈ 45 MB. Fine for IndexedDB; request persistent storage (`navigator.storage.persist()`) and show usage in Settings.
- Index only what UI queries (above). Review `plies` can be deleted for games older than N months and regenerated on demand (configurable).

## 8. Fixtures for tests (create now)
`tests/fixtures/`: 20 real PGNs covering: normal game, castling both sides, en passant, promotion, resignation, timeout, Chess960 (must be rejected gracefully), a game with clocks, a game with evals. Plus a **seed learner**: 30 days of synthetic attempts/evidence for planner tests.

## 9. Acceptance tests
- [ ] Create → read → update for every entity; compound index lookups return expected rows.
- [ ] `rebuildDerived()` on the seed learner reproduces stored `SkillState` within 1e-9.
- [ ] Export then import into an empty DB yields byte-identical tables (sorted).
- [ ] Migration test: v0 fixture → v1 passes (add the pattern even though v1 is first).
- [ ] Delete-all leaves zero IndexedDB databases for the origin.

## 10. Pitfalls
- Dexie multi-entry indexes can't be on nested arrays of objects; store tag arrays as flat strings.
- Never store `chess.js` instances. Store FEN/PGN.
- Keep `Attempt.skillTags` denormalised; planner queries need them without joins.
