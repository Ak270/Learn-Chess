// Coach memory miners (docs/backend/10 §1.4): rule-based, each observation cites >= 3 data points, learner can dismiss.
import type { Game, GameReview, Mistake, PlyRecord } from '../../types/model';

export interface MemoryData {
  game: Game;
  review: GameReview;
  /** learner plies only */
  plies: PlyRecord[];
  mistakes: Mistake[];
}
export interface Memory {
  /** stable key so a dismissal sticks */
  key: string;
  text: string;
  /** references to the data points behind it, e.g. "gameId:ply" */
  evidence: string[];
}
export const MIN_EVIDENCE = 3;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function mineMemories(data: MemoryData[]): Memory[] {
  const out: Memory[] = [];
  const add = (m: Memory) => m.evidence.length >= MIN_EVIDENCE && out.push(m);

  // 1. when the first big mistake usually happens
  const firsts = data.flatMap((d) =>
    d.review.firstMeaningfulPly && !d.review.firstMeaningfulFlagged
      ? [{ ref: `${d.game.id}:${d.review.firstMeaningfulPly}`, move: Math.ceil(d.review.firstMeaningfulPly / 2) }]
      : [],
  );
  if (firsts.length >= MIN_EVIDENCE) {
    const moves = firsts.map((f) => f.move).sort((a, b) => a - b);
    const lo = moves[Math.floor(moves.length * 0.25)];
    const hi = moves[Math.ceil(moves.length * 0.75) - 1];
    add({
      key: 'first-mistake-window',
      text: `Your first big mistake is usually between moves ${lo} and ${hi}.`,
      evidence: firsts.map((f) => f.ref),
    });
  }

  // 2. which pieces get left hanging
  const kinds: Record<string, string[]> = {};
  for (const d of data)
    for (const m of d.mistakes)
      for (const h of m.motifs)
        if (h.id === 'hanging.piece' || h.id === 'hanging.protected') {
          const k = /(pawn|knight|bishop|rook|queen)/.exec(h.evidence)?.[1];
          if (k) (kinds[k] ??= []).push(`${m.gameId}:${m.ply}`);
        }
  const top = Object.entries(kinds).sort((a, b) => b[1].length - a[1].length)[0];
  if (top && top[1].length >= MIN_EVIDENCE)
    add({
      key: `hanging-kind-${top[0]}`,
      text: `Most pieces you leave hanging are ${top[0]}s (${top[1].length} times).`,
      evidence: top[1],
    });

  // 3. blunder rate trend (needs at least 3 games in each half)
  const chrono = [...data].sort((a, b) => a.game.startedAt - b.game.startedAt);
  if (chrono.length >= 6) {
    const half = Math.floor(chrono.length / 2);
    const rate = (xs: MemoryData[]) => xs.reduce((s, d) => s + d.review.blundersPer40, 0) / xs.length;
    const a = rate(chrono.slice(0, half));
    const b = rate(chrono.slice(half));
    if (a > 0 && Math.abs(b - a) / a >= 0.25)
      add({
        key: 'blunder-trend',
        text: `Blunders per 40 moves went from ${a.toFixed(1)} to ${b.toFixed(1)} across your last ${chrono.length} games.`,
        evidence: chrono.map((d) => d.game.id),
      });
  }

  // 4. time after losing material (needs clocks)
  const after: { ref: string; ms: number }[] = [];
  const base: number[] = [];
  for (const d of data) {
    const ps = d.plies.filter((p) => p.timeSpentMs !== undefined);
    ps.forEach((p, i) => {
      base.push(p.timeSpentMs!);
      const prev = ps[i - 1];
      if (prev && (prev.winPctLoss ?? 0) >= 15) after.push({ ref: `${d.game.id}:${p.ply}`, ms: p.timeSpentMs! });
    });
  }
  if (after.length >= MIN_EVIDENCE && base.length >= 20 && median(after.map((a) => a.ms)) < 0.6 * median(base))
    add({
      key: 'faster-after-loss',
      text: 'You play noticeably faster right after a big mistake.',
      evidence: after.map((a) => a.ref),
    });

  return out;
}
