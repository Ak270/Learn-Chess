import type { ImportQuery, Importer, RawGame } from '../../types/services';
import { ImportError, normalizePgn } from './common';

interface LiGame {
  id: string;
  variant?: string;
  pgn?: string;
}

/** NDJSON stream parser; ignores blank/partial trailing lines (docs/backend/04 §9). */
export async function* ndjson<T>(body: ReadableStream<Uint8Array>): AsyncIterable<T> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as T;
    }
    if (done) break;
  }
  if (buf.trim()) yield JSON.parse(buf) as T;
}

export function lichessImporter(o: { fetchFn?: typeof fetch } = {}): Importer {
  return {
    id: 'lichess',
    async *fetchGames(q: ImportQuery): AsyncIterable<RawGame> {
      const user = (q.username ?? '').trim();
      if (!user) throw new ImportError('PARSE', 'Enter a Lichess username.');
      const params = new URLSearchParams({
        max: String(q.max ?? 20),
        rated: 'true',
        perfType: 'rapid,classical,blitz',
        clocks: 'true',
        evals: 'false',
        opening: 'true',
        pgnInJson: 'true',
      });
      if (q.since) params.set('since', String(q.since));
      const res = await (o.fetchFn ?? fetch)(
        `https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`,
        {
          headers: { Accept: 'application/x-ndjson' },
        },
      );
      if (res.status === 404) throw new ImportError('NOT_PLAYER', 'Username not found.');
      if (!res.ok || !res.body) throw new ImportError('PARSE', `Lichess answered ${res.status}.`);
      let n = 0;
      for await (const g of ndjson<LiGame>(res.body)) {
        if (q.signal?.cancelled || (q.max && n >= q.max)) return;
        if (g.variant && g.variant !== 'standard') {
          q.onSkip?.('VARIANT', `Skipped a ${g.variant} game.`);
          continue;
        }
        if (!g.pgn) continue;
        try {
          const raw = normalizePgn(g.pgn, { source: 'lichess', sourceId: g.id, username: user });
          n++;
          yield raw;
        } catch (e) {
          if (e instanceof ImportError) q.onSkip?.(e.code, e.message);
          else throw e;
        }
      }
    },
  };
}
