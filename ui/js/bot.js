// DUMMY engine layer: tiny material search so the UI behaves realistically.
// Real design: Stockfish WASM in a Web Worker (see docs/backend). This file is replaced, not extended.
import { Chess } from '../vendor/chess.js';

export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** material balance from White's perspective, in pawns */
export function material(chess) {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p) s += (p.color === 'w' ? 1 : -1) * VAL[p.type];
  return s;
}

/** negamax with alpha-beta; returns score for side to move */
function search(chess, depth, alpha, beta) {
  if (chess.isCheckmate()) return -100 - depth;
  if (chess.isDraw()) return 0;
  if (depth === 0) return (chess.turn() === 'w' ? 1 : -1) * material(chess);
  const moves = chess.moves({ verbose: true }).sort((a, b) => (b.captured ? VAL[b.captured] : 0) - (a.captured ? VAL[a.captured] : 0));
  let best = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const v = -search(chess, depth - 1, -beta, -alpha);
    chess.undo();
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** score (pawns, White-positive) of position by searching `depth` plies */
export function evalFen(fen, depth = 2) {
  const c = new Chess(fen);
  const v = search(c, depth, -Infinity, Infinity);
  return c.turn() === 'w' ? v : -v;
}

export const LEVELS = [
  { id: 1, name: 'Pawn Pete', elo: 400, depth: 1, noise: 3.0, blurb: 'Plays fast, hangs pieces. Great for your first wins.' },
  { id: 2, name: 'Knight Nora', elo: 600, depth: 1, noise: 1.4, blurb: 'Grabs free pieces but misses 2-move ideas.' },
  { id: 3, name: 'Bishop Ben', elo: 800, depth: 2, noise: 1.0, blurb: 'Sees simple threats. Sometimes sloppy.' },
  { id: 4, name: 'Rook Rita', elo: 1000, depth: 2, noise: 0.5, blurb: 'Your target level. Punishes loose pieces.' },
  { id: 5, name: 'Queen Quin', elo: 1200, depth: 3, noise: 0.3, blurb: 'Calculates three plies. Few free gifts.' },
];

export function pickMove(chess, level) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  let best = null, bestScore = -Infinity;
  const early = chess.history().length < 20;
  for (const m of moves) {
    chess.move(m);
    const backRank = m.color === 'w' ? '1' : '8';
    let pos = 0; // tiny positional sense so the dummy bot looks human: develop, centralise, castle
    if (early) {
      if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === backRank) pos += 0.35;
      if (m.piece === 'p' && 'de'.includes(m.to[0]) && '45'.includes(m.to[1])) pos += 0.3;
      if (m.flags.includes('k') || m.flags.includes('q')) pos += 0.5;
      if ((m.piece === 'q' || m.piece === 'r') && !m.captured) pos -= 0.35;
      if (m.piece === 'p' && 'ah'.includes(m.to[0])) pos -= 0.2;
    }
    const v = -search(chess, level.depth - 1, -Infinity, Infinity) + pos + (Math.random() - 0.5) * 2 * level.noise;
    chess.undo();
    if (v > bestScore) { bestScore = v; best = m; }
  }
  return best;
}

/** hanging-piece detector used by Coach mode: did `move` (just played by `color`) leave a piece en prise? */
export function hangingAfter(chess, color) {
  // call after the move is played; opponent is to move
  const out = [];
  for (const m of chess.moves({ verbose: true })) {
    if (!m.captured) continue;
    const gain = VAL[m.captured];
    chess.move(m);
    const recapture = chess.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
    chess.undo();
    const loses = VAL[m.piece] > 0 ? VAL[m.piece] : 0;
    if (!recapture || gain > loses) out.push({ from: m.from, to: m.to, piece: m.captured, by: m.piece, gain: recapture ? gain - loses : gain });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** classify a played move by eval swing (mover's perspective). DUMMY thresholds; real ones live in config. */
export function classify(deltaPawns, { isBook = false, isBest = false } = {}) {
  if (isBook) return 'book';
  if (isBest) return 'best';
  if (deltaPawns <= -3) return 'blunder';
  if (deltaPawns <= -1.5) return 'mistake';
  if (deltaPawns <= -0.5) return 'inaccuracy';
  if (deltaPawns <= -0.15) return 'good';
  return 'excellent';
}

/** best line (SAN list) for the side to move, by the dummy search. Real build: Stockfish principal variation. */
export function principalLine(fen, plies = 3, depth = 3) {
  const c = new Chess(fen), out = [];
  for (let i = 0; i < plies && !c.isGameOver(); i++) {
    let best = null, bs = -Infinity;
    for (const m of c.moves({ verbose: true })) {
      c.move(m); const v = -search(c, depth - 1, -Infinity, Infinity); c.undo();
      if (v > bs) { bs = v; best = m; }
    }
    if (!best) break;
    out.push(c.move(best).san);
  }
  return out;
}
