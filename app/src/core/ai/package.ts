// Grounding package (docs/backend/07 §3.2, §3.4a): ONLY verified facts reach the model. The engine decides what is bad;
// code turns the line into sentences; the model may only reword them.
import { Chess, type PieceSymbol } from 'chess.js';
import habits from '../../content/habits.json';
import type { Cause, Mistake, PlyRecord } from '../../types/model';
import { pieceValue } from '../chess/material';

const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDE = { w: 'White', b: 'Black' } as const;

export interface Fact {
  id: string;
  text: string;
  required?: boolean;
}
export interface GroundedPackage {
  kind: 'mistake_explanation' | 'teacher_note' | 'hint_h3' | 'weekly_letter' | 'concept_answer';
  learnerLevel: string;
  style: { tone: string; maxWords: number; reading: string };
  position: { fen: string; sideToMove: 'w' | 'b' };
  played?: { san: string; uci: string; moveNo: number };
  best?: { san: string; uci: string };
  refutation?: { san: string; line: string[] };
  winPct?: { before: number; after: number };
  facts: Fact[];
  cause?: { top: Cause; confidence: string; signals: string[] };
  learnerWords: string | null;
  habit: string;
  allowedMoves: string[];
  allowedSquares: string[];
  /** numbers that may appear in the text besides digits found in the facts */
  allowedNumbers: number[];
}

export interface LineFacts {
  steps: {
    san: string;
    mine: boolean;
    piece: PieceSymbol;
    from: string;
    to: string;
    captured?: PieceSymbol;
    check: boolean;
    mate: boolean;
  }[];
  netForLearner: number;
  facts: string[];
  allowedMoves: string[];
  allowedSquares: string[];
  learnerColor: 'w' | 'b';
}

/** Replay the played move + the engine's follow-up line and state exactly what happens (no judgement). */
export function lineFacts(fenBefore: string, playedSan: string, replySans: string[]): LineFacts {
  const c = new Chess(fenBefore);
  const learner = c.turn();
  const steps: LineFacts['steps'] = [];
  let net = 0;
  for (const san of [playedSan, ...replySans]) {
    let m;
    try {
      m = c.move(san);
    } catch {
      break;
    }
    const mine = m.color === learner;
    const gain = m.captured ? pieceValue(m.captured) : 0;
    net += mine ? gain : -gain;
    steps.push({
      san: m.san,
      mine,
      piece: m.piece,
      from: m.from,
      to: m.to,
      captured: m.captured,
      check: m.san.includes('+'),
      mate: m.san.includes('#'),
    });
  }
  const facts = steps.map((s, i) => {
    let t = `${i === 0 ? 'You play' : s.mine ? 'You could then play' : 'Your opponent can reply'} ${s.san}: the ${NAME[s.piece]} goes to ${s.to}`;
    if (s.captured)
      t += ` and captures a ${NAME[s.captured]} (${pieceValue(s.captured)} point${pieceValue(s.captured) > 1 ? 's' : ''})`;
    t += s.mate ? ' and it is checkmate' : s.check ? ' with check' : '';
    return t + '.';
  });
  facts.push(
    net === 0
      ? 'Material stays even after this sequence.'
      : net < 0
        ? `After this sequence you are down ${-net} point${-net > 1 ? 's' : ''} of material.`
        : `After this sequence you are up ${net} point${net > 1 ? 's' : ''} of material.`,
  );
  return {
    steps,
    netForLearner: net,
    facts,
    allowedMoves: steps.map((s) => s.san),
    allowedSquares: [...new Set(steps.flatMap((s) => [s.from, s.to]))],
    learnerColor: learner,
  };
}

export const habitFor = (skill?: string) =>
  (habits.habits as Record<string, string>)[skill ?? ''] ?? habits.habits.default;

export interface PackageInput {
  fenBefore: string;
  playedSan: string;
  playedUci: string;
  bestSan?: string;
  bestUci?: string;
  replySans: string[];
  winPct?: { before: number; after: number };
  /** verified one-line motif facts (MotifHit.evidence) */
  motifFacts?: string[];
  cause?: { top: Cause; confidence: string; signals: string[] };
  learnerWords?: string | null;
  skill?: string;
  moveNo: number;
  maxWords?: number;
}

export function buildPackage(i: PackageInput): GroundedPackage {
  const lf = lineFacts(i.fenBefore, i.playedSan, i.replySans);
  const facts: Fact[] = [
    ...(i.motifFacts ?? []).map((t, k) => ({
      id: `M${k + 1}`,
      text: t.charAt(0).toUpperCase() + t.slice(1) + (t.endsWith('.') ? '' : '.'),
      required: k === 0,
    })),
    ...lf.facts.map((t, k) => ({ id: `F${k + 1}`, text: t, required: k === lf.facts.length - 1 })),
  ];
  const moves = [...lf.allowedMoves, ...(i.bestSan ? [i.bestSan] : [])];
  const squares = new Set(lf.allowedSquares);
  for (const f of i.motifFacts ?? []) for (const s of f.match(/\b[a-h][1-8]\b/g) ?? []) squares.add(s);
  if (i.bestUci) {
    squares.add(i.bestUci.slice(0, 2));
    squares.add(i.bestUci.slice(2, 4));
  }
  const nums = [i.moveNo];
  return {
    kind: 'mistake_explanation',
    learnerLevel: 'beginner (about 600 rating)',
    style: { tone: 'calm, direct, kind', maxWords: i.maxWords ?? 80, reading: 'grade 7' },
    position: { fen: i.fenBefore, sideToMove: lf.learnerColor },
    played: { san: i.playedSan, uci: i.playedUci, moveNo: i.moveNo },
    best: i.bestSan ? { san: i.bestSan, uci: i.bestUci ?? '' } : undefined,
    refutation: i.replySans[0] ? { san: i.replySans[0], line: i.replySans } : undefined,
    winPct: i.winPct,
    facts,
    cause: i.cause,
    learnerWords: i.learnerWords ?? null,
    habit: habitFor(i.skill),
    allowedMoves: moves,
    allowedSquares: [...squares],
    allowedNumbers: nums,
  };
}

/** Build a package for a stored Mistake using only stored, verified data. */
export function packageForMistake(
  m: Mistake,
  p: PlyRecord,
  replySans: string[],
  bestSan: string | undefined,
): GroundedPackage {
  const top = m.diagnosis[0];
  return buildPackage({
    fenBefore: m.fen,
    playedSan: p.san,
    playedUci: m.playedUci,
    bestSan,
    bestUci: m.bestUci,
    replySans,
    winPct:
      p.winPctBefore !== undefined && p.winPctAfter !== undefined
        ? { before: p.winPctBefore, after: p.winPctAfter }
        : undefined,
    motifFacts: m.motifs
      .filter((x) => x.role !== 'missed')
      .slice(0, 2)
      .map((x) => x.evidence),
    cause: top ? { top: top.cause, confidence: top.confidence, signals: top.signals.slice(0, 2) } : undefined,
    learnerWords: m.selfExplanation?.text ?? null,
    skill: m.skillTags[0],
    moveNo: Math.ceil(p.ply / 2),
  });
}
export const sideName = (c: 'w' | 'b') => SIDE[c];

/** Convenience: derive the SAN of the best move and the opponent's refutation from stored UCI before building the package. */
export function packageFromStored(m: Mistake, p: PlyRecord): GroundedPackage {
  const c = new Chess(m.fen);
  let bestSan: string | undefined;
  try {
    if (m.bestUci)
      bestSan = new Chess(m.fen).move({
        from: m.bestUci.slice(0, 2),
        to: m.bestUci.slice(2, 4),
        promotion: m.bestUci[4],
      }).san;
  } catch {
    bestSan = undefined;
  }
  const replies: string[] = [];
  try {
    c.move({ from: m.playedUci.slice(0, 2), to: m.playedUci.slice(2, 4), promotion: m.playedUci[4] });
    if (m.refutationUci)
      replies.push(
        c.move({ from: m.refutationUci.slice(0, 2), to: m.refutationUci.slice(2, 4), promotion: m.refutationUci[4] })
          .san,
      );
  } catch {
    /* stored line no longer legal: package has no reply */
  }
  return packageForMistake(m, p, replies, bestSan);
}
