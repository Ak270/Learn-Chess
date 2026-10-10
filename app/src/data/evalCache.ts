// Persistent engine-result cache in the kv table so a closed tab resumes a review without re-running the
// engine for finished positions (docs/backend/04 §8 resumability; docs/backend/03 §1.1 cache cap 20k, LRU).
import { cfg } from '../config';
import type { EngineClient, EngineResult } from '../types/services';
import type { MentorDB } from './db';

const PREFIX = 'eval:';
const keyOf = (fen: string, o: { depth?: number; movetimeMs?: number; multiPv?: number }) =>
  `${PREFIX}${fen.split(' ').slice(0, 4).join(' ')}|${o.movetimeMs ? 't' + o.movetimeMs : (o.depth ?? 0)}|${o.multiPv ?? 1}`;

export function withPersistentCache(engine: EngineClient, db: MentorDB): EngineClient {
  let writes = 0;
  const cap = cfg.get('engine.cacheMaxEntries');
  return {
    init: (o) => engine.init(o),
    stop: () => engine.stop(),
    dispose: () => engine.dispose(),
    async analyse(fen, o) {
      const k = keyOf(fen, o);
      const hit = await db.kv.get(k);
      if (hit) return (hit.value as { r: EngineResult }).r;
      const r = await engine.analyse(fen, o);
      await db.kv.put({ key: k, value: { r, at: Date.now() } });
      if (++writes % 500 === 0) {
        const n = await db.kv.where('key').startsWith(PREFIX).count();
        if (n > cap) {
          const all = await db.kv.where('key').startsWith(PREFIX).toArray();
          all.sort((a, b) => (a.value as { at: number }).at - (b.value as { at: number }).at);
          await db.kv.bulkDelete(all.slice(0, n - cap).map((x) => x.key));
        }
      }
      return r;
    },
  };
}
