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
