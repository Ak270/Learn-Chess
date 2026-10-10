// Composition root: wires the real engine worker, database and services. Views only import from here.
import { createEngineClient } from './core/engine/engineClient';
import { workerTransport } from './core/engine/workerTransport';
import { on } from './data/bus';
import { db } from './data/db';
import { withPersistentCache } from './data/evalCache';
import { repos } from './data/repos';
import { createCoachMemoryService } from './services/CoachMemoryService';
import { createContentService } from './services/ContentService';
import { createMetricsService } from './services/MetricsService';
import { createMisconceptionService } from './services/MisconceptionService';
import { createPlannerService } from './services/PlannerService';
import { createProfileService } from './services/ProfileService';
import { createReviewService } from './services/ReviewService';
import { createSrsService } from './services/SrsService';
import { createTestService } from './services/TestService';
import type { EngineClient } from './types/services';

let engine: (EngineClient & { cacheSize(): number }) | undefined;
/** Engine loads lazily on first use (docs/backend/08 §8: ~1.7 MB lite build, not part of the first load). */
export const getEngine = () => (engine ??= createEngineClient(workerTransport));

export const store = repos(db);
/** Engine with the persistent result cache: repeat positions never cost engine time. */
export const cachedEngine = withPersistentCache(getEngine(), db);
export const reviews = createReviewService({ db, engine: getEngine() });
export const metrics = createMetricsService(db);
export const profile = createProfileService(db);
export const srs = createSrsService(db);
export const content = createContentService(db);
export const misconceptions = createMisconceptionService(db);
export const planner = createPlannerService({ db, srs, content, misconceptions });
export const tests = createTestService(db);
export const coachMemory = createCoachMemoryService(db);
export { db };

// After every review: refresh misconception states, and reopen cleared cards whose skill leaked again (transfer check).
on('review:done', async (gameId) => {
  await misconceptions.evaluate();
  for (const m of await store.mistakesForGame(gameId as string))
    for (const s of m.skillTags) await srs.reopenForSkill(s);
});
