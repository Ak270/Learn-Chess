// Threat detection (docs/backend/03 §6.4): what does the side that just moved threaten NEXT move?
// Built on a "null move" for the threatener, all rule-based; the optional engine check downgrades minor threats.
import { Chess, type Color, type Square } from 'chess.js';
import { cfg } from '../../config';
import { winPctOf } from './eval';
import { forkMoves, raysFor } from './motifs';
import { pieceValue } from './material';
import { see } from './see';
import type { EngineClient } from '../../types/services';

export interface Threat {
  kind: 'check' | 'capture' | 'mate' | 'fork' | 'pin';
  from?: Square;
  to?: Square;
  gain: number;
  evidence: string;
  severity: 'major' | 'minor';
}
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** FEN with the opponent of `sideToMove` to move instead (null move); undefined if that is illegal. */
export function nullMoveFen(fen: string): string | undefined {
  const p = fen.split(' ');
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  try {
    new Chess(p.join(' '));
    return p.join(' ');
  } catch {
    return undefined;
  }
}

/** Threats made by the side that just moved (i.e. the side NOT to move in `fen`), top 3 by gain. */
export function threats(fen: string): Threat[] {
  const c = new Chess(fen);
  if (c.inCheck()) {
    const attackers = c.attackers(findKing(c, c.turn()), c.turn() === 'w' ? 'b' : 'w');
    return [
      {
        kind: 'check',
        from: attackers[0],
        gain: 100,
        severity: 'major',
        evidence: `you are in check from the ${NAME[c.get(attackers[0])!.type]} on ${attackers[0]}`,
      },
    ];
  }
  const nf = nullMoveFen(fen);
  if (!nf) return [];
  const n = new Chess(nf);
  const threatener: Color = n.turn();
  const out: Threat[] = [];
  for (const m of n.moves({ verbose: true })) {
    if (m.san.endsWith('#'))
      out.push({
        kind: 'mate',
        from: m.from,
        to: m.to,
        gain: 100,
        severity: 'major',
        evidence: `${m.san} would be checkmate`,
      });
    else if (m.captured) {
      const gain = see(nf, m.to, threatener);
      if (gain > 0)
        out.push({
          kind: 'capture',
          from: m.from,
          to: m.to,
          gain,
          severity: gain >= 3 ? 'major' : 'minor',
          evidence: `the ${NAME[m.piece]} on ${m.from} can capture the ${NAME[m.captured]} on ${m.to} and win ${gain}`,
        });
    }
  }
  for (const f of forkMoves(nf, threatener).slice(0, 2))
    out.push({
      kind: 'fork',
      from: f.uci.slice(0, 2) as Square,
      to: f.uci.slice(2, 4) as Square,
      gain: 3,
      severity: 'major',
      evidence: f.hits[0].evidence,
    });
  const before = raysFor(fen, threatener);
  for (const r of raysFor(nf, threatener)) {
    if (!before.some((b) => b.slider === r.slider && b.front === r.front && b.back === r.back) && r.kind !== 'skewer')
      out.push({
        kind: 'pin',
        from: r.slider,
        to: r.front,
        gain: pieceValue(c.get(r.front)?.type ?? 'p'),
        severity: 'minor',
        evidence: `the piece on ${r.slider} pins the ${NAME[c.get(r.front)?.type ?? 'p']} on ${r.front}`,
      });
  }
  const rank: Record<Threat['kind'], number> = { mate: 0, check: 1, capture: 2, fork: 3, pin: 4 };
  return out
    .sort((a, b) => b.gain - a.gain || rank[a.kind] - rank[b.kind])
    .filter((t, i, a) => a.findIndex((x) => x.kind === t.kind && x.to === t.to && x.from === t.from) === i)
    .slice(0, 3);
}

function findKing(c: Chess, color: Color): Square {
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  throw new Error('no king');
}

/** Engine check: if the threatener's best score is below +1.0 pawn the threat is downgraded to minor. */
export async function verifyThreats(fen: string, ts: Threat[], engine: EngineClient): Promise<Threat[]> {
  const nf = nullMoveFen(fen);
  if (!nf || !ts.length) return ts;
  const r = await engine.analyse(nf, { depth: cfg.get<number>('engine.hint.depth'), multiPv: 1 });
  const cp = r.lines[0].mate !== undefined ? (r.lines[0].mate > 0 ? 10000 : -10000) : (r.lines[0].cp ?? 0);
  void winPctOf;
  return cp < cfg.get<number>('engine.threat.minorBelowPawns') * 100
    ? ts.map((t) => ({ ...t, severity: 'minor' as const }))
    : ts;
}

/** Multiple-choice "what does the opponent threaten?" with exactly one true answer (the top threat) plus distractors. */
export function threatQuestion(
  fen: string,
  rngPick: (n: number) => number = () => 0,
  preferTo: string[] = [],
): { options: { text: string; correct: boolean }[]; truth?: Threat } | undefined {
  const all = threats(fen);
  // when asked about a specific hanging piece, the true answer is the capture of that piece
  let pref = all.find((t) => t.kind === 'capture' && t.to && preferTo.includes(t.to));
  if (!pref && preferTo.length) {
    // the opponent is to move, so the piece can be taken right now (an immediate capture, not a next-move threat)
    const sq = preferTo[0] as Square;
    const piece = new Chess(fen).get(sq);
    if (piece)
      pref = {
        kind: 'capture',
        to: sq,
        gain: pieceValue(piece.type),
        severity: 'major',
        evidence: `the ${NAME[piece.type]} on ${sq} can be captured`,
      };
  }
  const ts = pref ? [pref, ...all.filter((t) => t !== pref)] : all;
  const c = new Chess(fen);
  const mine = c.turn();
  const truth = ts[0];
  const options: { text: string; correct: boolean }[] = [];
  const describe = (t: Threat) =>
    t.kind === 'check'
      ? 'I am in check'
      : t.kind === 'mate'
        ? 'They threaten checkmate'
        : t.kind === 'fork'
          ? 'They threaten a fork'
          : t.kind === 'pin'
            ? 'They are pinning a piece'
            : `They can take my ${NAME[c.get(t.to!)?.type ?? 'p']} on ${t.to}`;
  if (truth) options.push({ text: describe(truth), correct: true });
  else options.push({ text: 'Nothing: there is no real threat', correct: true });
  // distractors: false threats about pieces that are not actually under threat
  const threatened = new Set(ts.map((t) => t.to));
  const mineSquares: { sq: Square; type: string }[] = [];
  for (const row of c.board())
    for (const p of row)
      if (p && p.color === mine && p.type !== 'k' && !threatened.has(p.square))
        mineSquares.push({ sq: p.square, type: p.type });
  mineSquares.sort((a, b) => pieceValue(b.type as 'p') - pieceValue(a.type as 'p'));
  for (const m of mineSquares.slice(0, 2))
    options.push({ text: `They can take my ${NAME[m.type]} on ${m.sq}`, correct: false });
  if (truth) options.push({ text: 'Nothing: there is no real threat', correct: false });
  else options.push({ text: 'They threaten checkmate', correct: false });
  const shuffled = options
    .map((o, i) => ({ o, k: (i * 7 + rngPick(10)) % 11 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.o);
  return { options: shuffled, truth };
}
