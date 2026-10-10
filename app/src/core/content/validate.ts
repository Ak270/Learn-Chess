// Static content validation (docs/backend/06 §4.2). Engine confirmation lives in tools/validate-content.ts.
import { Chess } from 'chess.js';
import { cfg } from '../../config';
import { SKILL_IDS } from '../../types/ids';

export interface Provenance {
  authoredBy?: string;
  license?: string;
  engineVerified?: boolean;
  reviewedAt?: string | null;
  source?: string;
}
export type Step =
  | { type: 'text'; title: string; body: string }
  | {
      type: 'board';
      fen: string;
      body: string;
      arrows?: [string, string, string?][];
      verify?: { mate?: string[]; nullMoveMate?: string; stalemate?: string };
    }
  | { type: 'interactive'; fen: string; solution: string[]; wrong: { default: string }; onSuccess: string }
  | { type: 'check'; q: string; options: string[]; answer: number; why: string; verify?: { stalemate?: string } };
export interface Lesson {
  id: string;
  title: string;
  skills: string[];
  phase: number;
  minutes: number;
  prereqs: string[];
  provenance?: Provenance;
  steps: Step[];
  cards: { prompt: string; solution: string[]; why: string }[];
  drills?: { puzzleQuery: { skill: string; band: string; count: number } };
}

export const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

/** Flesch-Kincaid grade level (rough syllable counter). */
export function fkGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const ws = words(text);
  if (!ws.length) return 0;
  const syl = (w: string) =>
    Math.max(
      1,
      (
        w
          .toLowerCase()
          .replace(/[^a-z]/g, '')
          .replace(/e$/, '')
          .match(/[aeiouy]+/g) ?? []
      ).length,
    );
  const syllables = ws.reduce((s, w) => s + syl(w), 0);
  return 0.39 * (ws.length / sentences) + 11.8 * (syllables / ws.length) - 15.59;
}

export function legalFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
export function legalUci(fen: string, uci: string): boolean {
  try {
    new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return true;
  } catch {
    return false;
  }
}
function flipTurn(fen: string): string {
  const p = fen.split(' ');
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  return p.join(' ');
}

export function validateLesson(l: Lesson, all: Lesson[]): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(`${l.id}: ${m}`);
  const banned = cfg.get<string[]>('copy.bannedWords');
  const textOf = (s: string, field: string, max: number) => {
    const n = words(s).length;
    if (n > max) e(`${field} has ${n} words (max ${max})`);
    for (const w of banned) if (new RegExp(`\\b${w}\\b`, 'i').test(s)) e(`${field} contains banned word "${w}"`);
  };
  if (!l.provenance?.authoredBy || !l.provenance.license) e('missing provenance (authoredBy, license)');
  if (!l.skills.length || l.skills.some((s) => !(SKILL_IDS as readonly string[]).includes(s)))
    e('unknown or missing skill id');
  for (const p of l.prereqs) if (!all.some((x) => x.id === p)) e(`prereq "${p}" does not exist`);
  l.steps.forEach((s, i) => {
    const w = `step ${i + 1}`;
    if (s.type === 'text') textOf(s.body, `${w} body`, 90);
    if (s.type === 'board') {
      if (!legalFen(s.fen)) e(`${w} illegal FEN`);
      textOf(s.body, `${w} body`, 90);
      const v = s.verify;
      if (v?.mate)
        for (const m of v.mate) {
          const c = new Chess(s.fen);
          try {
            c.move({ from: m.slice(0, 2), to: m.slice(2, 4) });
            if (!c.isCheckmate()) e(`${w} ${m} is not checkmate`);
          } catch {
            e(`${w} ${m} is illegal`);
          }
        }
      if (v?.nullMoveMate) {
        const f = flipTurn(s.fen);
        const c = new Chess(f);
        try {
          c.move({ from: v.nullMoveMate.slice(0, 2), to: v.nullMoveMate.slice(2, 4) });
          if (!c.isCheckmate()) e(`${w} threat ${v.nullMoveMate} is not mate`);
        } catch {
          e(`${w} threat move illegal`);
        }
      }
    }
    if (s.type === 'interactive') {
      if (!legalFen(s.fen)) e(`${w} illegal FEN`);
      if (!s.solution.length) e(`${w} has no solution`);
      for (const m of s.solution) if (!legalUci(s.fen, m)) e(`${w} solution ${m} is illegal`);
      textOf(s.wrong.default, `${w} hint`, 25);
      textOf(s.onSuccess, `${w} success`, 25);
    }
    if (s.type === 'check') {
      textOf(s.why, `${w} why`, 25);
      if (s.answer < 0 || s.answer >= s.options.length) e(`${w} answer index out of range`);
      if (s.verify?.stalemate) {
        const prevFen = (
          l.steps
            .slice(0, i)
            .reverse()
            .find((x) => x.type === 'interactive' || x.type === 'board') as { fen: string } | undefined
        )?.fen;
        if (!prevFen) e(`${w} stalemate check needs an earlier position`);
        else {
          const c = new Chess(prevFen);
          try {
            const m = s.verify.stalemate;
            c.move({ from: m.slice(0, 2), to: m.slice(2, 4) });
            if (!c.isStalemate()) e(`${w} ${m} is not stalemate`);
          } catch {
            e(`${w} stalemate move illegal`);
          }
        }
      }
    }
  });
  l.cards.forEach((c, i) => {
    textOf(c.why, `card ${i + 1} why`, 25);
    if (!c.why.trim()) e(`card ${i + 1} has an empty why`);
  });
  const all2 = [
    l.title,
    ...l.steps.flatMap((s) =>
      s.type === 'text' || s.type === 'board'
        ? [s.body]
        : s.type === 'check'
          ? [s.q, s.why]
          : [s.wrong.default, s.onSuccess],
    ),
  ].join(' ');
  const g = fkGrade(all2.replace(/[A-Za-z]\d[+#]?/g, 'x'));
  if (g > 8.5) e(`reading level ${g.toFixed(1)} is above grade 8`);
  return errs;
}

export function lessonCycles(all: Lesson[]): string[] {
  const errs: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (done.has(id)) return;
    if (visiting.has(id)) return void errs.push(`prerequisite cycle: ${[...path, id].join(' -> ')}`);
    visiting.add(id);
    for (const p of all.find((x) => x.id === id)?.prereqs ?? []) visit(p, [...path, id]);
    visiting.delete(id);
    done.add(id);
  };
  all.forEach((l) => visit(l.id, []));
  return errs;
}
