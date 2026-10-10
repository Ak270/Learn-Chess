// Habit detectors behind the misconception catalogue (docs/backend/10 §1.3, M01-M05). Same rule as other motifs:
// the review pipeline only attaches them when the engine agrees the move cost something.
import { Chess, type Move, type Square } from 'chess.js';
import type { MotifHit } from '../../types/model';
import { ownThreatPlayed, opponentThreatBefore } from '../diagnosis/diagnose';
import { pieceValue } from './material';
import { loosePieces, see } from './see';

const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const hit = (id: MotifHit['id'], squares: string[], evidence: string, severity: 1 | 2 | 3 = 2): MotifHit => ({
  id,
  role: 'played',
  squares,
  severity,
  evidence,
});

/** M01 "a protected piece is safe": the piece has a defender, yet the exchange still wins material for the attacker. */
export function protectedButHanging(fenAfter: string, owner: 'w' | 'b'): MotifHit[] {
  const c = new Chess(fenAfter);
  return loosePieces(fenAfter, owner)
    .hanging.filter((h) => c.attackers(h.square, owner).length > 0)
    .map((h) => ({
      id: 'hanging.protected' as const,
      role: 'allowed' as const,
      squares: [h.square, ...(h.attackerSquare ? [h.attackerSquare] : [])],
      severity: 2 as const,
      evidence: `the ${NAME[h.type]} on ${h.square} was defended, but the attacker on ${h.attackerSquare} is worth less, so the exchange still wins ${h.gain}`,
    }));
}

/** M02 "a check is always good": a check whose checking piece is taken (or material lost) within two plies. */
export function checkWaste(fenBefore: string, uci: string, replyUci?: string): MotifHit[] {
  const c = new Chess(fenBefore);
  let m: Move;
  try {
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return [];
  }
  if (!m.san.includes('+') || m.san.endsWith('#') || !replyUci) return [];
  try {
    const r = c.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] });
    if (r.to === m.to && r.captured)
      return [
        hit(
          'check.waste',
          [m.to],
          `${m.san} gave check, but the ${NAME[m.piece]} was captured on ${m.to} (${r.san}) and nothing was gained`,
        ),
      ];
  } catch {
    /* illegal reply: ignore */
  }
  return [];
}

/** M03 "always capture": a capture that loses material in the exchange (SEE < 0). */
export function greedyCapture(fenBefore: string, uci: string): MotifHit[] {
  const c = new Chess(fenBefore);
  let m: Move;
  try {
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return [];
  }
  if (!m.captured) return [];
  const gain = see(fenBefore, m.to as Square, m.color);
  return gain < 0
    ? [
        hit(
          'greedy.capture',
          [m.from, m.to],
          `${m.san} took a ${NAME[m.captured]} but the exchange on ${m.to} loses ${-gain} overall (SEE ${gain})`,
          gain <= -3 ? 3 : 2,
        ),
      ]
    : [];
}

/** M05 "trade anything equal": an even trade (capture then recapture on the same square) that cost win chances. */
export function unfavorableTrade(fenBefore: string, uci: string, replyUci?: string): MotifHit[] {
  const c = new Chess(fenBefore);
  let m: Move;
  try {
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return [];
  }
  if (!m.captured || !replyUci) return [];
  const gain = see(fenBefore, m.to as Square, m.color);
  const recapture = replyUci.slice(2, 4) === m.to;
  return gain === 0 && recapture && pieceValue(m.captured) >= 1
    ? [hit('unfavorable.trade', [m.from, m.to], `${m.san} started an even trade on ${m.to} that left you worse off`, 1)]
    : [];
}

/** M04 "ignore their last move if my plan is faster": a piece was already attacked and an attack of your own was played instead. */
export function ignoredThreat(fenBefore: string, uci: string, color: 'w' | 'b'): MotifHit[] {
  if (!opponentThreatBefore(fenBefore, color) || !ownThreatPlayed(fenBefore, uci)) return [];
  const after = new Chess(fenBefore);
  try {
    after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return [];
  }
  // if the move resolved the threat (captured the attacker, moved away, defended) it was not ignored
  if (!loosePieces(after.fen(), color).hanging.length) return [];
  const t = loosePieces(fenBefore, color).hanging[0];
  return [
    hit(
      'ignored.threat',
      [uci.slice(0, 2), uci.slice(2, 4), ...(t ? [t.square] : [])],
      `a piece of yours was already attacked${t ? ` (${NAME[t.type]} on ${t.square})` : ''}, and the move made a threat of its own instead`,
    ),
  ];
}

export const habitMotifs = (fenBefore: string, uci: string, color: 'w' | 'b', replyUci?: string): MotifHit[] => [
  ...greedyCapture(fenBefore, uci),
  ...checkWaste(fenBefore, uci, replyUci),
  ...unfavorableTrade(fenBefore, uci, replyUci),
  ...ignoredThreat(fenBefore, uci, color),
];

// ---------- game-level habits (M06-M08, M10, M11): need the learner's neighbouring plies ----------
export interface HabitPly {
  ply: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  winPctBefore: number;
  winPctLoss: number;
  materialDropAfterBestReply: number;
}
const QUEEN_MOVE = /^Q/;

/** Habit hits for one learner ply given the learner's plies so far (oldest first, including this one last). */
export function gameHabits(
  history: HabitPly[],
  inaccuracyLoss: number,
  mistakeLoss: number,
  blunderLoss: number,
): MotifHit[] {
  const cur = history[history.length - 1];
  const out: MotifHit[] = [];
  const learnerMoveNo = history.length;
  // M06 early.queen: the queen moves a second time before the learner's 7th move, and it cost something
  const queenMoves = history.filter((h) => QUEEN_MOVE.test(h.san));
  if (QUEEN_MOVE.test(cur.san) && queenMoves.length >= 2 && learnerMoveNo <= 6 && cur.winPctLoss >= inaccuracyLoss)
    out.push(
      hit(
        'early.queen',
        [cur.uci.slice(0, 2), cur.uci.slice(2, 4)],
        `the queen has moved ${queenMoves.length} times in the first ${learnerMoveNo} moves, and ${cur.san} lost time or material`,
        1,
      ),
    );
  // M07 opening.repeat_piece: the same minor/major piece moves twice in the first 8 moves without capturing
  if (
    learnerMoveNo <= 8 &&
    !/x/.test(cur.san) &&
    /^[NBRK]/.test(cur.san) &&
    !/^O/.test(cur.san) &&
    cur.winPctLoss >= inaccuracyLoss
  ) {
    const sq = cur.uci.slice(0, 2);
    const prev = history
      .slice(0, -1)
      .find((h) => h.uci.slice(2, 4) === sq && h.san[0] === cur.san[0] && !/x/.test(h.san));
    if (prev)
      out.push(
        hit(
          'opening.repeat_piece',
          [cur.uci.slice(0, 2), cur.uci.slice(2, 4)],
          `the same ${NAME[cur.san[0].toLowerCase()]} moved again (${prev.san} then ${cur.san}) while other pieces were still undeveloped`,
          1,
        ),
      );
  }
  // M08 king.center: still uncastled after move 10 and a mistake was made
  if (learnerMoveNo > 10 && cur.winPctLoss >= mistakeLoss && !history.some((h) => /^O-O/.test(h.san))) {
    const c = new Chess(cur.fenAfter);
    const king = c
      .board()
      .flat()
      .find((p) => p && p.type === 'k' && p.color === cur.color);
    if (king && 'def'.includes(king.square[0]) && king.square[1] === (cur.color === 'w' ? '1' : '8'))
      out.push(
        hit(
          'king.center',
          [king.square],
          `your king was still on ${king.square}, uncastled, after move ${learnerMoveNo}`,
          2,
        ),
      );
  }
  // M10 stalemate.risk: a winning position turned into stalemate
  if (cur.winPctBefore > 85) {
    const c = new Chess(cur.fenAfter);
    if (c.isStalemate())
      out.push(
        hit(
          'stalemate.risk',
          [cur.uci.slice(2, 4)],
          `${cur.san} left the opponent with no legal move and no check: stalemate, a draw from a winning position`,
          3,
        ),
      );
  }
  // M11 unsound.sacrifice: gave up 3+ points with a capture or check and got nothing back
  if (cur.materialDropAfterBestReply >= 3 && cur.winPctLoss >= blunderLoss && (/x/.test(cur.san) || /\+/.test(cur.san)))
    out.push(
      hit(
        'unsound.sacrifice',
        [cur.uci.slice(0, 2), cur.uci.slice(2, 4)],
        `${cur.san} gave up ${cur.materialDropAfterBestReply} points of material and the best reply left nothing in return`,
        2,
      ),
    );
  return out;
}
