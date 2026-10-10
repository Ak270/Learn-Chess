// fetch wrapper: serial access, 429 back-off, ETag cache (docs/backend/04 §2.2). `fetchFn` is injectable for tests.
import { cfg } from '../../config';

export interface HttpCache {
  get(url: string): Promise<{ etag?: string; body: string } | undefined>;
  set(url: string, v: { etag?: string; body: string }): Promise<void>;
}
export const memoryCache = (): HttpCache => {
  const m = new Map<string, { etag?: string; body: string }>();
  return { get: async (u) => m.get(u), set: async (u, v) => void m.set(u, v) };
};

export interface HttpOpts {
  fetchFn?: typeof fetch;
  cache?: HttpCache;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string, o: HttpOpts = {}, immutable = false): Promise<T> {
  const f = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? defaultSleep;
  const cached = await o.cache?.get(url);
  if (cached && immutable) return JSON.parse(cached.body) as T;
  for (let attempt = 0; ; attempt++) {
    const res = await f(url, { headers: cached?.etag ? { 'If-None-Match': cached.etag } : {} });
    if (res.status === 304 && cached) return JSON.parse(cached.body) as T;
    if (res.status === 429) {
      if (attempt >= (o.maxRetries ?? 3))
        throw new HttpError(429, 'The site asked us to slow down. Try again in a minute.');
      const ra = Number(res.headers.get('retry-after'));
      await sleep(ra > 0 ? ra * 1000 : cfg.get('import.backoffMs') * (attempt + 1));
      continue;
    }
    if (res.status === 404) throw new HttpError(404, 'Username not found.');
    if (!res.ok) throw new HttpError(res.status, `The site answered ${res.status}.`);
    const body = await res.text();
    await o.cache?.set(url, { etag: res.headers.get('etag') ?? undefined, body });
    return JSON.parse(body) as T;
  }
}
