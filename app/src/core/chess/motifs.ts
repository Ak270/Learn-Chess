// Rule-based tactical detectors (docs/backend/03 §6). Pure functions of positions; the review pipeline
// (Phase 4) additionally requires the engine's refutation line to realise a motif before it is taught (§6.10).
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { MotifHit } from '../../types/model';
import { pieceValue } from './material';
import { loosePieces, see } from './see';

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const FILES = 'abcdefgh';
const sqName = (f: number, r: number) => `${FILES[f]}${r + 1}` as Square;
const fileOf = (s: Square) => FILES.indexOf(s[0]);
const rankOf = (s: Square) => +s[1] - 1;

const DIRS: Record<'rook' | 'bishop', [number, number][]> = {
  rook: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  bishop: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};
const sliderDirs = (t: PieceSymbol): [number, number][] =>
  t === 'r' ? DIRS.rook : t === 'b' ? DIRS.bishop : t === 'q' ? [...DIRS.rook, ...DIRS.bishop] : [];

function afterMove(fen: string, uci: string): { fen: string; move: Move; chess: Chess } | null {
  const c = new Chess(fen);
  try {
    const move = c.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
    return { fen: c.fen(), move, chess: c };
  } catch {
    return null;
  }
}

/** Squares attacked by the piece on `from` (pseudo-attack, ignores pins). Includes friendly-occupied squares. */
function attacksFrom(c: Chess, from: Square): Square[] {
  const p = c.get(from);
  if (!p) return [];
  const f = fileOf(from);
  const r = rankOf(from);
  const out: Square[] = [];
  const add = (nf: number, nr: number) => {
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push(sqName(nf, nr));
  };
  if (p.type === 'n') {
    for (const [a, b] of [
      [1, 2],
      [2, 1],
      [-1, 2],
      [-2, 1],
      [1, -2],
      [2, -1],
      [-1, -2],
      [-2, -1],
    ])
      add(f + a, r + b);
  } else if (p.type === 'k') {
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a || b) add(f + a, r + b);
  } else if (p.type === 'p') {
    for (const a of [-1, 1]) add(f + a, r + (p.color === 'w' ? 1 : -1));
  } else {
    for (const [a, b] of sliderDirs(p.type)) {
      let nf = f + a;
      let nr = r + b;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const s = sqName(nf, nr);
        out.push(s);
        if (c.get(s)) break;
        nf += a;
        nr += b;
      }
    }
  }
  return out;
}

const hit = (
  id: string,
  role: MotifHit['role'],
  squares: string[],
  severity: 1 | 2 | 3,
  evidence: string,
): MotifHit => ({
  id,
  role,
  squares,
  severity,
  evidence,
});
const sevFromGain = (g: number): 1 | 2 | 3 => (g >= 5 ? 3 : g >= 3 ? 2 : 1);
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// ---------- hanging / loose ----------
export function hangingMotifs(fen: string, owner: Color, role: MotifHit['role']): MotifHit[] {
  const { hanging } = loosePieces(fen, owner);
  return hanging.map((h) =>
    hit(
      'hanging.piece',
      role,
      [h.square, h.attackerSquare!].filter(Boolean),
      sevFromGain(h.gain),
      `${NAME[h.type]} on ${h.square} is attacked from ${h.attackerSquare} and the exchange wins ${h.gain} (SEE +${h.gain})`,
    ),
  );
}
export function looseMotifs(fen: string, owner: Color, role: MotifHit['role']): MotifHit[] {
  const hangSq = new Set(loosePieces(fen, owner).hanging.map((h) => h.square));
  return loosePieces(fen, owner)
    .loose.filter((l) => l.type !== 'p' && !hangSq.has(l.square))
    .map((l) => hit('loose.piece', role, [l.square], 1, `${NAME[l.type]} on ${l.square} has no defender`));
}

// ---------- forks ----------
/** Forks the piece on `sq` (belonging to forker) delivers in the current position. */
export function forksFrom(fen: string, sq: Square): MotifHit[] {
  const c = new Chess(fen);
  const p = c.get(sq);
  if (!p) return [];
  const enemy = opp(p.color);
  const targets: Square[] = [];
  for (const t of attacksFrom(c, sq)) {
    const tp = c.get(t);
    if (!tp || tp.color !== enemy) continue;
    const undefended = c.attackers(t, enemy).length === 0;
    if (tp.type === 'k' || undefended || pieceValue(tp.type) > pieceValue(p.type)) targets.push(t);
  }
  // pawn forks need two targets that are not pawns; otherwise too noisy
  const valuable = p.type === 'p' ? targets.filter((t) => c.get(t)!.type !== 'p') : targets;
  if (valuable.length < 2) return [];
  // the forker must not simply be captured for free (unless the fork includes a check by the king capture rules)
  const safe = see(fen, sq, enemy) <= 0 || valuable.some((t) => c.get(t)!.type === 'k');
  if (!safe) return [];
  const family =
    p.type === 'n' ? 'fork.knight' : p.type === 'p' ? 'fork.pawn' : p.type === 'q' ? 'fork.queen' : 'fork.other';
  const names = valuable.map((t) => `${NAME[c.get(t)!.type]} on ${t}`).join(' and ');
  const gain = Math.min(...valuable.map((t) => pieceValue(c.get(t)!.type)));
  return [hit(family, 'allowed', [sq, ...valuable], sevFromGain(gain), `${NAME[p.type]} on ${sq} attacks ${names}`)];
}

/** Moves by `color` after which the moved piece forks (fork opportunities in the position). */
export function forkMoves(fen: string, color: Color): { uci: string; hits: MotifHit[] }[] {
  const c = new Chess(fen);
  if (c.turn() !== color) return [];
  const out: { uci: string; hits: MotifHit[] }[] = [];
  for (const m of c.moves({ verbose: true })) {
    const a = afterMove(fen, m.lan);
    if (!a) continue;
    const hits = forksFrom(a.fen, m.to);
    if (hits.length) out.push({ uci: m.lan, hits });
  }
  return out;
}

// ---------- pins / skewers ----------
export interface RayHit {
  kind: 'pin.absolute' | 'pin.relative' | 'skewer';
  slider: Square;
  front: Square;
  back: Square;
}
/** Pins and skewers created by sliders of `attacker` against the other side. */
export function raysFor(fen: string, attacker: Color): RayHit[] {
  const c = new Chess(fen);
  const out: RayHit[] = [];
  for (const row of c.board())
    for (const p of row) {
      if (!p || p.color !== attacker) continue;
      for (const [df, dr] of sliderDirs(p.type)) {
        let f = fileOf(p.square) + df;
        let r = rankOf(p.square) + dr;
        let first: Square | null = null;
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const s = sqName(f, r);
          const q = c.get(s);
          if (q) {
            if (q.color === attacker) break;
            if (!first) first = s;
            else {
              const fp = c.get(first)!;
              const bp = q;
              if (bp.type === 'k' && fp.type !== 'k')
                out.push({ kind: 'pin.absolute', slider: p.square, front: first, back: s });
              else if (pieceValue(bp.type) > pieceValue(fp.type))
                out.push({ kind: 'pin.relative', slider: p.square, front: first, back: s });
              else if (pieceValue(fp.type) > pieceValue(bp.type) && fp.type !== 'k')
                out.push({ kind: 'skewer', slider: p.square, front: first, back: s });
              break;
            }
          }
          f += df;
          r += dr;
        }
      }
    }
  return out;
}
export function rayMotifs(fen: string, attacker: Color, role: MotifHit['role']): MotifHit[] {
  const c = new Chess(fen);
  return raysFor(fen, attacker).map((r) =>
    hit(
      r.kind,
      role,
      [r.slider, r.front, r.back],
      r.kind === 'pin.absolute' ? 2 : 1,
      `${NAME[c.get(r.slider)!.type]} on ${r.slider} ${r.kind === 'skewer' ? 'skewers' : 'pins'} the ${NAME[c.get(r.front)!.type]} on ${r.front} against the ${NAME[c.get(r.back)!.type]} on ${r.back}`,
    ),
  );
}

// ---------- discovered attack / check ----------
export function discoveredMotifs(fenBefore: string, uci: string): MotifHit[] {
  const a = afterMove(fenBefore, uci);
  if (!a) return [];
  const mover = a.move.color;
  const before = new Chess(fenBefore);
  const out: MotifHit[] = [];
  const enemyKing = (() => {
    for (const row of a.chess.board())
      for (const p of row) if (p && p.type === 'k' && p.color === opp(mover)) return p.square;
    return null;
  })();
  for (const row of a.chess.board())
    for (const p of row) {
      if (!p || p.color !== mover || p.square === a.move.to || !sliderDirs(p.type).length) continue;
      const nowAtt = new Set(attacksFrom(a.chess, p.square));
      const wasAtt = new Set(attacksFrom(before, p.square));
      const newTargets = [...nowAtt].filter((s) => !wasAtt.has(s) && a.chess.get(s)?.color === opp(mover));
      for (const t of newTargets) {
        const tp = a.chess.get(t)!;
        if (tp.type === 'k')
          out.push(
            hit(
              'discovered.check',
              'played',
              [a.move.from, p.square, t],
              2,
              `moving the ${NAME[a.move.piece]} uncovers a check from ${p.square}`,
            ),
          );
        else if (a.chess.attackers(t, opp(mover)).length === 0 || pieceValue(tp.type) > pieceValue(p.type))
          out.push(
            hit(
              'discovered.attack',
              'played',
              [a.move.from, p.square, t],
              2,
              `moving the ${NAME[a.move.piece]} uncovers ${p.square} attacking the ${NAME[tp.type]} on ${t}`,
            ),
          );
      }
    }
  void enemyKing;
  return out;
}

// ---------- back rank ----------
export function backRankThreat(fen: string, victim: Color): MotifHit[] {
  const c = new Chess(fen);
  let ks: Square | null = null;
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === victim) ks = p.square;
  if (!ks) return [];
  const homeRank = victim === 'w' ? '1' : '8';
  if (ks[1] !== homeRank) return [];
  const f = fileOf(ks);
  const frontR = rankOf(ks) + (victim === 'w' ? 1 : -1);
  const escapes = [-1, 0, 1]
    .map((d) => f + d)
    .filter((x) => x >= 0 && x < 8)
    .map((x) => sqName(x, frontR));
  if (!escapes.every((s) => c.get(s)?.color === victim)) return []; // luft exists
  // enemy heavy piece that can give check on the back rank next move: try null move for the enemy
  const parts = fen.split(' ');
  if (parts[1] === victim) parts[1] = opp(victim); // let the enemy move
  parts[3] = '-';
  let n: Chess;
  try {
    n = new Chess(parts.join(' '));
  } catch {
    return [];
  }
  for (const m of n.moves({ verbose: true }))
    if ((m.piece === 'r' || m.piece === 'q') && m.san.endsWith('#') && m.to[1] === homeRank)
      return [
        hit(
          'backrank.threat',
          'allowed',
          [ks, m.to],
          3,
          `king on ${ks} has no escape squares; ${m.san} would be mate on the back rank`,
        ),
      ];
  return [];
}

// ---------- missed captures / checks / mates ----------
export function mateInOneMoves(fen: string): string[] {
  const c = new Chess(fen);
  return c
    .moves({ verbose: true })
    .filter((m) => m.san.endsWith('#'))
    .map((m) => m.lan);
}
export function missedMotifs(fenBefore: string, playedUci: string, bestUci: string): MotifHit[] {
  if (playedUci === bestUci) return [];
  const best = afterMove(fenBefore, bestUci);
  if (!best) return [];
  const out: MotifHit[] = [];
  const isMate = best.move.san.endsWith('#');
  if (isMate) {
    const back =
      best.move.piece === 'r' || best.move.piece === 'q'
        ? best.move.to[1] === (best.move.color === 'w' ? '8' : '1')
        : false;
    out.push(
      hit(
        back ? 'backrank.mate' : 'missed.mate',
        'missed',
        [best.move.from, best.move.to],
        3,
        `${best.move.san} was checkmate`,
      ),
    );
    return out;
  }
  if (best.move.captured) {
    const gain = see(fenBefore, best.move.to, best.move.color);
    if (gain > 0)
      out.push(
        hit(
          'missed.capture',
          'missed',
          [best.move.from, best.move.to],
          sevFromGain(gain),
          `${best.move.san} wins a ${NAME[best.move.captured]} (SEE +${gain})`,
        ),
      );
  } else if (best.move.san.includes('+')) {
    out.push(
      hit(
        'missed.check',
        'missed',
        [best.move.from, best.move.to],
        1,
        `${best.move.san} gave check and was the engine's choice`,
      ),
    );
  }
  const forks = forksFrom(best.fen, best.move.to);
  for (const f of forks) out.push({ ...f, role: 'missed' });
  return out;
}

/** All hits for one learner ply. Engine verification of relevance is applied by the caller (Phase 4). */
export function motifsForPly(fenBefore: string, playedUci: string, bestUci?: string): MotifHit[] {
  const a = afterMove(fenBefore, playedUci);
  if (!a) return [];
  const mover = a.move.color;
  const out: MotifHit[] = [
    ...hangingMotifs(a.fen, mover, 'allowed'),
    ...backRankThreat(a.fen, mover),
    ...discoveredMotifs(fenBefore, playedUci),
  ];
  // forks the opponent can now play
  for (const f of forkMoves(a.fen, opp(mover)).slice(0, 3))
    out.push(...f.hits.map((h) => ({ ...h, role: 'allowed' as const })));
  if (bestUci) out.push(...missedMotifs(fenBefore, playedUci, bestUci));
  return out;
}
