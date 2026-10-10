// EngineClient over a UCI transport (a Web Worker in the browser, an in-process engine in tests).
// One request in flight at a time; results cached by `fenKey|depth|multipv` (a shallow result never
// satisfies a deeper request). On a crash the transport is recreated once and the request retried once.
import { cfg } from '../../config';
import type { EngineClient, EngineResult } from '../../types/services';
import { parseBestmove, SearchCollector } from './uci';

export interface UciTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  dispose(): void;
}
export type TransportFactory = () => Promise<UciTransport>;

export class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public recoverable = true,
  ) {
    super(`${code}: ${userMessage}`);
  }
}

const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function createEngineClient(
  makeTransport: TransportFactory,
  opts: { threads?: number; hashMb?: number; maxCache?: number } = {},
): EngineClient & { cacheSize(): number } {
  let tp: UciTransport | null = null;
  let waiter: ((line: string) => void) | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let initOpts: { threads?: number; hashMb?: number } = opts;
  const cache = new Map<string, EngineResult>(); // Map keeps insertion order -> LRU by re-insertion
  const maxCache: number = opts.maxCache ?? cfg.get<number>('engine.cacheMaxEntries');

  const wait = (until: (l: string) => boolean) =>
    new Promise<void>((resolve) => {
      waiter = (l) => {
        if (until(l)) {
          waiter = null;
          resolve();
        }
      };
    });

  async function boot() {
    tp = await makeTransport();
    tp.onLine((l) => waiter?.(l));
    const uok = wait((l) => l === 'uciok');
    tp.send('uci');
    await uok;
    const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    if (initOpts.threads && isolated) tp.send(`setoption name Threads value ${initOpts.threads}`);
    tp.send(`setoption name Hash value ${initOpts.hashMb ?? cfg.get('engine.defaultHashMb')}`);
    const rok = wait((l) => l === 'readyok');
    tp.send('isready');
    await rok;
  }

  async function search(
    fen: string,
    o: { depth?: number; movetimeMs?: number; multiPv?: number },
  ): Promise<EngineResult> {
    if (!tp) await boot();
    const t = tp!;
    const col = new SearchCollector();
    t.send(`setoption name MultiPV value ${o.multiPv ?? 1}`);
    t.send(`position fen ${fen}`);
    const done = wait((l) => {
      col.push(l);
      return parseBestmove(l) !== null;
    });
    t.send(o.movetimeMs ? `go movetime ${o.movetimeMs}` : `go depth ${o.depth ?? cfg.get('engine.review.depth')}`);
    await done;
    return col.result(fen);
  }

  const client = {
    async init(o: { threads?: number; hashMb?: number } = {}) {
      initOpts = { ...initOpts, ...o };
      if (!tp) await boot();
    },
    analyse(fen: string, o: { depth?: number; movetimeMs?: number; multiPv?: number } = {}): Promise<EngineResult> {
      const depth: number = o.depth ?? cfg.get<number>('engine.review.depth');
      const key = `${fenKey(fen)}|${o.movetimeMs ? 't' + o.movetimeMs : depth}|${o.multiPv ?? 1}`;
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return Promise.resolve(hit);
      }
      const run = async (): Promise<EngineResult> => {
        try {
          return await search(fen, o);
        } catch {
          // worker crash: recreate once, retry once, else surface ENGINE_DOWN
          tp?.dispose();
          tp = null;
          waiter = null;
          try {
            return await search(fen, o);
          } catch {
            throw new AppError('ENGINE_DOWN', 'The analysis engine stopped. Reduced-accuracy mode is on.');
          }
        }
      };
      const p = chain.then(run, run).then((r) => {
        cache.set(key, r);
        if (cache.size > maxCache) cache.delete(cache.keys().next().value as string);
        return r;
      });
      chain = p.catch(() => undefined);
      return p;
    },
    stop() {
      tp?.send('stop');
    },
    dispose() {
      tp?.dispose();
      tp = null;
    },
    cacheSize: () => cache.size,
  };
  return client;
}
