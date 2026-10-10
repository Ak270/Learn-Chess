// Template wording from verified facts (the always-available fallback; Phase 7 may reword but never invent).
import { Chess } from 'chess.js';
import type { Mistake, MoveClass, PlyRecord } from '../../types/model';
import { pieceValue } from './material';

const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const moveLabel = (ply: number, san: string) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${san}`;
const SUFFIX: Partial<Record<MoveClass, string>> = {
  blunder: '??',
  mistake: '?',
  miss: '?',
  inaccuracy: '?!',
  brilliant: '!!',
  great: '!',
};
export const withSuffix = (label: string, cls?: MoveClass) => label + (cls ? (SUFFIX[cls] ?? '') : '');

export interface MistakeFacts {
  headline: string;
  summary: string;
  reply?: { san: string; sentence: string };
  turn: string;
}

export function mistakeFacts(m: Mistake, p: PlyRecord): MistakeFacts {
  const side = p.color === 'w' ? 'White' : 'Black';
  const them = p.color === 'w' ? 'Black' : 'White';
  const headline = withSuffix(moveLabel(p.ply, p.san), p.cls);
  let reply: MistakeFacts['reply'];
  if (m.refutationUci) {
    const c = new Chess(m.fen);
    try {
      c.move({ from: m.playedUci.slice(0, 2), to: m.playedUci.slice(2, 4), promotion: m.playedUci[4] });
      const r = c.move({
        from: m.refutationUci.slice(0, 2),
        to: m.refutationUci.slice(2, 4),
        promotion: m.refutationUci[4],
      });
      const win = r.captured
        ? ` and wins a ${NAME[r.captured]} (${pieceValue(r.captured)} point${pieceValue(r.captured) > 1 ? 's' : ''})`
        : r.san.endsWith('#')
          ? ' and it is checkmate'
          : r.san.includes('+')
            ? ' with check'
            : '';
      reply = { san: r.san, sentence: `${them} can answer ${r.san}${win}.` };
    } catch {
      /* stored move no longer legal: no reply sentence */
    }
  }
  const before = Math.round(p.winPctBefore ?? 50);
  const after = Math.round(p.winPctAfter ?? 50);
  const evidence = m.motifs.find((x) => x.role === 'allowed')?.evidence ?? m.motifs[0]?.evidence;
  const summary = evidence
    ? `${headline}: ${evidence.charAt(0).toUpperCase()}${evidence.slice(1)}.`
    : `${headline} gave up a lot compared with ${m.bestUci ? 'the best move' : 'the alternatives'}.`;
  return {
    headline,
    summary,
    reply,
    turn: `The game turned here: ${side}'s chance to win went from about ${before}% to ${after}%.`,
  };
}
