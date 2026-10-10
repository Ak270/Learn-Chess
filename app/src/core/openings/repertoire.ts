// Opening repertoires (docs/backend/06 §3): ideas first, lines second, a "why" on every learner move, left-book detection.
import { Chess } from 'chess.js';
import data from '../../content/repertoires.json';
import type { Card } from '../../types/model';

export interface RepNode {
  san: string;
  byLearner: boolean;
  why: string;
  replies?: { san: string; note: string }[];
}
export interface Repertoire {
  id: string;
  side: 'w' | 'b';
  name: string;
  oppFirst: string | null;
  ideas: { id: string; title: string; text: string }[];
  line: RepNode[];
}
export const REPERTOIRES = data.repertoires as unknown as Repertoire[];

export interface Step {
  idx: number;
  node: RepNode;
  fenBefore: string;
  uci: string;
  fenKey: string;
}
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function steps(rep: Repertoire): Step[] {
  const c = new Chess();
  return rep.line.map((node, idx) => {
    const fenBefore = c.fen();
    const m = c.move(node.san);
    return { idx, node, fenBefore, uci: m.lan, fenKey: key(fenBefore) };
  });
}

/** Cards for the learner's own moves only; opponent nodes are context, never cards. `why` is required. */
export function cardsFor(rep: Repertoire, now: number): Omit<Card, 'id'>[] {
  return steps(rep)
    .filter((s) => s.node.byLearner)
    .map((s) => {
      if (!s.node.why.trim()) throw new Error(`repertoire ${rep.id}: empty why at move ${s.idx + 1}`);
      return {
        kind: 'opening' as const,
        fen: s.fenBefore,
        prompt: `${rep.name}: what do you play here?`,
        solution: [s.uci],
        why: s.node.why,
        skillTags: ['opening_repertoire_recall' as const],
        sourceRef: { lineId: `${rep.id}:${s.idx}` },
        srs: { scheduler: 'fsrs' as const, dueAt: now, lapses: 0, cleanStreak: 0 },
        state: 'new' as const,
        createdAt: now,
      };
    });
}

export interface LeftBook {
  repertoireId: string;
  /** ply index (0-based) of the learner's first deviation, if any */
  leftAt?: number;
  /** ply of the opponent's first move outside the repertoire's known replies */
  oppDeviationAt?: number;
  expected?: string;
  played?: string;
}

/** Match a finished game against the repertoire for the learner's colour and the opponent's first move. */
export function leftBook(movesSan: string[], learner: 'w' | 'b'): LeftBook | undefined {
  const first = movesSan[0];
  const rep = REPERTOIRES.find((r) => r.side === learner && (r.side === 'w' || r.oppFirst === first));
  if (!rep) return undefined;
  const out: LeftBook = { repertoireId: rep.id };
  for (let i = 0; i < rep.line.length && i < movesSan.length; i++) {
    const node = rep.line[i];
    if (movesSan[i].replace(/[+#]/g, '') === node.san) continue;
    if (node.byLearner) {
      out.leftAt = i;
      out.expected = node.san;
      out.played = movesSan[i];
    } else {
      // an opponent move is "known" when this node lists it as a common alternative for the same ply
      const known = node.replies?.some((r) => r.san === movesSan[i].replace(/[+#]/g, ''));
      if (!known) {
        out.oppDeviationAt = i;
        out.expected = node.san;
        out.played = movesSan[i];
      }
    }
    break;
  }
  return out.leftAt === undefined && out.oppDeviationAt === undefined ? undefined : out;
}
