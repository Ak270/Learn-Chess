// Composition root: wires the real engine worker, database and services. Views only import from here.
import { createEngineClient } from './core/engine/engineClient';
import { workerTransport } from './core/engine/workerTransport';
import { db } from './data/db';
import { repos } from './data/repos';
import { withPersistentCache } from './data/evalCache';
import { createReviewService } from './services/ReviewService';
import { createMetricsService } from './services/MetricsService';
import { createProfileService } from './services/ProfileService';
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
export { db };
