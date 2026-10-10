import type { ImportQuery, Importer, RawGame } from '../../types/services';
import { cfg } from '../../config';
import { ImportError, normalizePgn } from './common';
import { getJson, type HttpOpts } from './http';

interface CcGame {
  url?: string;
  pgn?: string;
  rules?: string;
  time_class?: string;
  end_time?: number;
}

export function chesscomImporter(http: HttpOpts = {}): Importer {
  return {
    id: 'chesscom',
    async *fetchGames(q: ImportQuery): AsyncIterable<RawGame> {
      const user = (q.username ?? '').trim();
      if (!user) throw new ImportError('PARSE', 'Enter a Chess.com username.');
      const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}`;
      const { archives } = await getJson<{ archives: string[] }>(`${base}/games/archives`, http);
      const newestFirst = [...archives].reverse().slice(0, cfg.get('import.chesscomMaxMonths'));
      const thisMonth = new Date().toISOString().slice(0, 7).replace('-', '/');
      let n = 0;
      for (const url of newestFirst) {
        if (q.signal?.cancelled) return;
        const month = await getJson<{ games: CcGame[] }>(url, http, !url.endsWith(thisMonth));
        for (const g of [...month.games].reverse()) {
          if (q.max && n >= q.max) return;
          if (g.rules && g.rules !== 'chess') {
            q.onSkip?.('VARIANT', `Skipped a ${g.rules} game.`);
            continue;
          }
          if (!g.pgn) continue;
          try {
            const raw = normalizePgn(g.pgn, { source: 'chesscom', sourceId: g.url, username: user });
            n++;
            yield raw;
          } catch (e) {
            if (e instanceof ImportError) q.onSkip?.(e.code, e.message);
            else throw e;
          }
        }
      }
    },
  };
}
