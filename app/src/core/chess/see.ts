// Static Exchange Evaluation, attack maps, hanging/loose pieces (docs/backend/03 §6.1-6.3).
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { pieceValue } from './material';

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Material (pawns) that `side` nets by starting a capture sequence on `sq`; either side may stop. */
export function see(fen: string, sq: Square, side: Color): number {
  const c = new Chess(fen, { skipValidation: true } as never);
  const target = c.get(sq);
  if (!target || target.color === side) return 0;
  const gain: number[] = [pieceValue(target.type)];
  let occupant = 0;
  let cur: Color = side;
  let first = true;
  for (;;) {
    const attackers = c
      .attackers(sq, cur)
      .map((s) => ({ s, p: c.get(s)! }))
      .sort((a, b) => pieceValue(a.p.type) - pieceValue(b.p.type));
    if (!attackers.length) break;
    const a = attackers[0];
    if (!first) gain.push(occupant - gain[gain.length - 1]);
    first = false;
    occupant = pieceValue(a.p.type);
    c.remove(a.s); // reveals x-rays
    cur = opp(cur);
  }
  if (first) return 0; // nobody can capture
  // `gain` currently holds the exchange values; the last speculative recapture is resolved by minimax.
  for (let i = gain.length - 1; i >= 1; i--) gain[i - 1] = -Math.max(-gain[i - 1], gain[i]);
  return gain[0];
}

export interface PieceHit {
  square: Square;
  type: PieceSymbol;
  color: Color;
  gain: number;
  attackerSquare?: Square;
}

export function attackMap(fen: string): Record<Square, { w: Square[]; b: Square[] }> {
  const c = new Chess(fen);
  const out = {} as Record<Square, { w: Square[]; b: Square[] }>;
  for (const f of 'abcdefgh')
    for (const r of '12345678') {
      const sq = `${f}${r}` as Square;
      out[sq] = { w: c.attackers(sq, 'w'), b: c.attackers(sq, 'b') };
    }
  return out;
}

/** Pieces of `color` that are loose (undefended) and/or hanging (attacked with SEE > 0). Kings excluded. */
export function loosePieces(fen: string, color: Color): { loose: PieceHit[]; hanging: PieceHit[] } {
  const c = new Chess(fen);
  const loose: PieceHit[] = [];
  const hanging: PieceHit[] = [];
  for (const row of c.board())
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const defenders = c.attackers(p.square, color).length;
      const attackers = c.attackers(p.square, opp(color));
      if (defenders === 0) loose.push({ square: p.square, type: p.type, color, gain: 0 });
      if (attackers.length) {
        const gain = see(fen, p.square, opp(color));
        if (gain > 0) {
          const a = attackers.map((s) => ({ s, v: pieceValue(c.get(s)!.type) })).sort((x, y) => x.v - y.v)[0].s;
          hanging.push({ square: p.square, type: p.type, color, gain, attackerSquare: a });
        }
      }
    }
  return { loose, hanging };
}
