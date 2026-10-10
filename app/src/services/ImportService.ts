// Orchestrates: importer -> dedupe/save -> returns ids for review (docs/backend/04 §1-2).
import type { MentorDB } from '../data/db';
import { repos } from '../data/repos';
import type { ImportQuery, Importer } from '../types/services';

export interface ImportSummary {
  ids: string[];
  added: number;
  duplicates: number;
  skipped: Record<string, number>;
  skipMessages: string[];
}

export async function runImport(
  db: MentorDB,
  importer: Importer,
  q: ImportQuery,
  onProgress?: (n: number) => void,
): Promise<ImportSummary> {
  const r = repos(db);
  const out: ImportSummary = { ids: [], added: 0, duplicates: 0, skipped: {}, skipMessages: [] };
  const query: ImportQuery = {
    ...q,
    onSkip: (code, message) => {
      out.skipped[code] = (out.skipped[code] ?? 0) + 1;
      if (!out.skipMessages.includes(message)) out.skipMessages.push(message);
      q.onSkip?.(code, message);
    },
  };
  for await (const raw of importer.fetchGames(query)) {
    const { game, duplicate } = await r.addGame({
      source: raw.source,
      sourceId: raw.sourceId,
      pgn: raw.pgn,
      startedAt: raw.startedAt,
      timeControl: raw.timeControl,
      white: raw.white,
      black: raw.black,
      playerColor: raw.playerColor,
      result: raw.result,
      termination: raw.termination,
      playerRating: raw.playerColor === 'w' ? raw.whiteRating : raw.blackRating,
      opponentRating: raw.playerColor === 'w' ? raw.blackRating : raw.whiteRating,
      clocks: raw.clocks,
    });
    out.ids.push(game.id);
    if (duplicate) out.duplicates++;
    else out.added++;
    onProgress?.(out.ids.length);
  }
  return out;
}
