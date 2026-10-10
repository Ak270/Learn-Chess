// Behavioural metrics (docs/backend/05 §10) computed from stored reviews. No percentage before the cold-start threshold.
import type { MentorDB } from '../data/db';
import type { Game, GameReview, MotifHit, PlyRecord } from '../types/model';

export const COLD_START_REVIEWED_GAMES = 5; // docs/backend/04 §1.3: baseline report needs >= 5 reviewed games

export interface ReviewedGame {
  game: Game;
  review: GameReview;
}

const THREAT_MOTIFS = /^(hanging\.piece|loose\.piece|fork\.)/;
export const isMissedThreat = (m: MotifHit) => m.role === 'allowed' && THREAT_MOTIFS.test(m.id);

export function createMetricsService(db: MentorDB) {
  async function reviewedGames(limit = 10, onlyEligible = false): Promise<ReviewedGame[]> {
    const games = (await db.games.filter((g) => !!g.reviewedAt).toArray()).sort((a, b) => b.startedAt - a.startedAt);
    const out: ReviewedGame[] = [];
    for (const game of games) {
      const review = (await db.kv.get(`review.v1:${game.id}`))?.value as GameReview | undefined;
      if (!review || (onlyEligible && !review.evidenceEligible)) continue;
      out.push({ game, review });
      if (out.length >= limit) break;
    }
    return out;
  }

  async function learnerPlies(gameId: string, color: 'w' | 'b'): Promise<PlyRecord[]> {
    return (await db.plies.where('gameId').equals(gameId).sortBy('ply')).filter((p) => p.color === color);
  }

  async function baseline(limit = 10) {
    const rg = await reviewedGames(limit);
    const n = rg.length;
    if (n < COLD_START_REVIEWED_GAMES) return { ready: false as const, n, needed: COLD_START_REVIEWED_GAMES };
    let blunders = 0;
    let moves = 0;
    let missedThreats = 0;
    const motifs: Record<string, number> = {};
    const firstPhase: Record<string, number> = { opening: 0, middlegame: 0, endgame: 0 };
    const times: number[] = [];
    const acc: number[] = [];
    for (const { game, review } of rg) {
      const ps = await learnerPlies(game.id, game.playerColor);
      moves += ps.length;
      blunders += review.counts.blunder ?? 0;
      acc.push(review.accuracy);
      for (const p of ps) {
        if (p.timeSpentMs !== undefined) times.push(p.timeSpentMs);
        for (const m of p.motifs ?? []) {
          if (isMissedThreat(m)) missedThreats++;
          if (m.role !== 'played') motifs[m.id] = (motifs[m.id] ?? 0) + 1;
        }
      }
      if (review.firstMeaningfulPly && !review.firstMeaningfulFlagged) {
        const p = ps.find((q) => q.ply === review.firstMeaningfulPly);
        if (p) firstPhase[p.phase]++;
      }
    }
    times.sort((a, b) => a - b);
    return {
      ready: true as const,
      n,
      blundersPer40: moves ? (blunders / moves) * 40 : 0,
      blundersPerGame: blunders / n,
      missedThreatsPerGame: missedThreats / n,
      accuracy: acc.reduce((s, x) => s + x, 0) / n,
      motifs,
      firstMistakePhase: firstPhase,
      medianMoveMs: times.length ? times[Math.floor(times.length / 2)] : undefined,
    };
  }

  /** Home stat cards: value + the value 4 weeks earlier. `undefined` while in cold start. */
  async function homeStats(now = Date.now()) {
    const rg = await reviewedGames(30);
    if (rg.length < COLD_START_REVIEWED_GAMES)
      return { ready: false as const, n: rg.length, needed: COLD_START_REVIEWED_GAMES };
    const cutoff = now - 28 * 86_400_000;
    const split = (xs: ReviewedGame[]) => ({
      recent: xs.filter((x) => x.game.startedAt > cutoff).slice(0, 10),
      older: xs.filter((x) => x.game.startedAt <= cutoff).slice(0, 10),
    });
    const { recent, older } = split(rg);
    const per40 = (xs: ReviewedGame[]) => {
      let b = 0;
      let m = 0;
      for (const x of xs) {
        b += x.review.counts.blunder ?? 0;
        m += Object.values(x.review.counts).reduce((s, v) => s + (v ?? 0), 0);
      }
      return m ? (b / m) * 40 : undefined;
    };
    const base = recent.length >= COLD_START_REVIEWED_GAMES ? recent : rg.slice(0, 10);
    return {
      ready: true as const,
      n: rg.length,
      blundersPer40: per40(base),
      blundersPer40Prev: older.length >= COLD_START_REVIEWED_GAMES ? per40(older) : undefined,
    };
  }

  return { reviewedGames, baseline, homeStats, learnerPlies };
}
export type MetricsService = ReturnType<typeof createMetricsService>;
