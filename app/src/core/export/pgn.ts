// Annotated PGN export (docs/backend/10 §6): our classifications and win% as comments, openable on Lichess.
import { Chess } from 'chess.js';
import type { Game, GameReview, Mistake, PlyRecord } from '../../types/model';
import { classMeta } from '../../shell/classMeta';

const esc = (s: string) => s.replace(/[{}]/g, '');

export function annotatedPgn(game: Game, plies: PlyRecord[], mistakes: Mistake[], review?: GameReview): string {
  const c = new Chess();
  const parts: string[] = [];
  for (const p of plies) {
    const m = c.move({ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4), promotion: p.uci[4] });
    const n = Math.ceil(p.ply / 2);
    const mistake = mistakes.find((x) => x.ply === p.ply);
    const bits: string[] = [];
    if (p.color === game.playerColor && p.cls) bits.push(`${classMeta[p.cls].label}`);
    if (p.winPctAfter !== undefined)
      bits.push(`${Math.round(p.color === 'w' ? p.winPctAfter : 100 - p.winPctAfter)}% White`);
    if (mistake?.isFirstMeaningful) bits.push(`First meaningful mistake. ${mistake.motifs[0]?.evidence ?? ''}`);
    if (p.cls && ['mistake', 'blunder', 'miss'].includes(p.cls) && p.bestUci) bits.push(`Better: ${p.bestUci}`);
    parts.push(
      `${p.color === 'w' ? `${n}. ` : p.ply === 1 || parts.length === 0 ? `${n}... ` : ''}${m.san}${bits.length ? ` {${esc(bits.join('. '))}}` : ''}`,
    );
  }
  const head = [
    ['Event', 'Mentor annotated review'],
    ['White', game.white],
    ['Black', game.black],
    ['Result', game.result],
    ['TimeControl', game.timeControl ?? '-'],
    ['Annotator', `Mentor${review ? ` (${review.engine.name}, depth ${review.engine.depth})` : ''}`],
  ]
    .map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`)
    .join('\n');
  return `${head}\n\n${parts.join(' ')} ${game.result}\n`;
}
