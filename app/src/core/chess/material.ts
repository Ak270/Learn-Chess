// Material, phase detection (docs/backend/03 §5).
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { cfg } from '../../config';

export const pieceValue = (t: PieceSymbol) => cfg.get(`pieceValue.${t}`);

export function material(fen: string): { w: number; b: number; wNonPawn: number; bNonPawn: number; queens: number } {
  const out = { w: 0, b: 0, wNonPawn: 0, bNonPawn: 0, queens: 0 };
  for (const row of new Chess(fen).board())
    for (const p of row) {
      if (!p || p.type === 'k') continue;
      const v = pieceValue(p.type);
      out[p.color] += v;
      if (p.type !== 'p') out[p.color === 'w' ? 'wNonPawn' : 'bNonPawn'] += v;
      if (p.type === 'q') out.queens++;
    }
  return out;
}
export const materialFor = (fen: string, color: Color) => {
  const m = material(fen);
  return color === 'w' ? m.w - m.b : m.b - m.w;
};

const START_NON_PAWN = 2 * (2 * 3 + 2 * 3 + 2 * 5 + 9); // both sides: 2N+2B+2R+Q per side = 62
export function gamePhase(fen: string, ply: number): 'opening' | 'middlegame' | 'endgame' {
  const m = material(fen);
  const nonPawn = m.wNonPawn + m.bNonPawn;
  const total = m.w + m.b;
  const end = cfg.get('phase.endgameMaterial');
  if ((m.wNonPawn <= end && m.bNonPawn <= end) || (m.queens === 0 && total <= cfg.get('phase.endgameQueensOffTotal')))
    return 'endgame';
  if (
    ply <= cfg.get('phase.openingMaxPly') &&
    m.queens === 2 &&
    nonPawn >= cfg.get('phase.openingMinMaterialFrac') * START_NON_PAWN
  )
    return 'opening';
  return 'middlegame';
}
