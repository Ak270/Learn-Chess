// Adaptive matchmaking (docs/backend/10 §5.3): Elo-like level estimate; recommend where expected score ~ 40-60%.
import { cfg } from '../../config';
import { LEVELS, type Level } from '../opponent/levels';

export interface Played {
  levelElo: number;
  /** 1 win, 0.5 draw, 0 loss for the learner */
  score: number;
}
export const expectedScore = (est: number, opp: number) => 1 / (1 + Math.pow(10, (opp - est) / 400));

export function updateEstimate(est: number, opp: number, score: number): number {
  return est + cfg.get<number>('elo.k') * (score - expectedScore(est, opp));
}
/** estimate from a list of results, oldest first, starting from `start` */
export function estimateFrom(results: Played[], start = 400): number {
  return results.reduce((e, r) => updateEstimate(e, r.levelElo, r.score), start);
}

export function recommendLevel(est: number, gamesPlayed: number): { level: Level; challenge: boolean } {
  const levels = LEVELS();
  const margin = cfg.get<number>('play.levelMargin'); // 0.1 => 40-60%
  const inBand = levels.filter((l) => Math.abs(expectedScore(est, l.elo) - 0.5) <= margin);
  const base = inBand.length
    ? inBand.reduce((a, b) =>
        Math.abs(expectedScore(est, a.elo) - 0.5) <= Math.abs(expectedScore(est, b.elo) - 0.5) ? a : b,
      )
    : levels.reduce((a, b) => (Math.abs(a.elo - est) <= Math.abs(b.elo - est) ? a : b));
  const challenge = gamesPlayed > 0 && (gamesPlayed + 1) % cfg.get<number>('play.challengeEvery') === 0;
  const up = levels.find((l) => l.id === base.id + 1);
  return { level: challenge && up ? up : base, challenge: challenge && !!up };
}

/** "You scored level with 800-rated bots" instead of a raw win rate */
export function performanceLine(results: Played[]): string | undefined {
  const byElo = new Map<number, number[]>();
  for (const r of results) (byElo.get(r.levelElo) ?? byElo.set(r.levelElo, []).get(r.levelElo)!).push(r.score);
  const rows = [...byElo]
    .filter(([, s]) => s.length >= 3)
    .map(([elo, s]) => ({ elo, avg: s.reduce((a, b) => a + b, 0) / s.length }));
  if (!rows.length) return undefined;
  const best = rows.sort((a, b) => Math.abs(a.avg - 0.5) - Math.abs(b.avg - 0.5))[0];
  return best.avg >= 0.6
    ? `You scored ahead of ${best.elo}-rated bots.`
    : best.avg <= 0.4
      ? `${best.elo}-rated bots are still a little ahead of you, which is normal.`
      : `You scored level with ${best.elo}-rated bots.`;
}
