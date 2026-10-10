import type { ImportQuery, Importer, RawGame } from '../../types/services';
import { cfg } from '../../config';
import { ImportError, normalizePgn, splitPgn } from './common';

/** Paste / upload importer: `username` is optional; when given, only that player's games are accepted. */
export function pgnImporter(text: string): Importer {
  return {
    id: 'pgn',
    async *fetchGames(q: ImportQuery): AsyncIterable<RawGame> {
      if (new Blob([text]).size > 50 * cfg.get('importer.pgnMaxBytes'))
        throw new ImportError('TOO_BIG', 'That file is too large.');
      for (const g of splitPgn(text)) {
        if (q.signal?.cancelled) return;
        try {
          const raw = normalizePgn(g, {
            source: 'pgn',
            username: q.username,
          });
          yield raw;
        } catch (e) {
          if (e instanceof ImportError) q.onSkip?.(e.code, e.message);
          else throw e;
        }
      }
    },
  };
}
