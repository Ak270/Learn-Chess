// Deterministic post-generation verifier (docs/backend/07 §3.4). Anything that fails -> retry once -> template.
import { cfg } from '../../config';
import { fkGrade, words } from '../content/validate';
import type { GroundedPackage } from './package';

export interface Verdict {
  ok: boolean;
  problems: string[];
}

const MOVE_RE = /\b(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;
const STYLE_BANNED = ['engine', 'centipawn', 'obviously', 'just ', 'stockfish', 'evaluation says'];
const INJECTION =
  /(ignore (all |any |the )?(previous|above|prior)|system prompt|as an ai|disregard|you are now|new instructions)/i;
const CLAIM_WORDS = [
  'checkmate',
  'mate',
  'fork',
  'forks',
  'pin',
  'pins',
  'pinned',
  'skewer',
  'trap',
  'trapped',
  'sacrifice',
  'discovered',
];

const norm = (m: string) => m.replace(/[+#]/g, '');

export function verifyText(text: string, pkg: GroundedPackage): Verdict {
  const problems: string[] = [];
  const okMoves = new Set(pkg.allowedMoves.map(norm));
  const okSquares = new Set(pkg.allowedSquares);
  for (const tok of text.match(MOVE_RE) ?? []) {
    const t = norm(tok);
    if (/^[a-h][1-8]$/.test(t)) {
      if (!okSquares.has(t)) problems.push(`square ${t} is not in the facts`);
    } else if (!okMoves.has(t)) problems.push(`move ${tok} is not in the facts`);
  }
  const factText = pkg.facts.map((f) => f.text).join(' ');
  const okNums = new Set<string>([...(factText.match(/\d+/g) ?? []), ...pkg.allowedNumbers.map(String)]);
  // digits inside SAN/squares are covered by the move/square checks
  const stripped = text.replace(MOVE_RE, ' ');
  for (const n of stripped.match(/\d+/g) ?? []) if (!okNums.has(n)) problems.push(`number ${n} is not in the facts`);
  const low = text.toLowerCase();
  for (const w of CLAIM_WORDS)
    if (
      new RegExp(`\\b${w}\\b`).test(low) &&
      !new RegExp(`\\b${w}\\b`).test(factText.toLowerCase()) &&
      !new RegExp(`\\b${w}\\b`).test(pkg.habit.toLowerCase())
    )
      problems.push(`claim "${w}" has no matching fact`);
  for (const b of [...STYLE_BANNED, ...cfg.get<string[]>('copy.bannedWords')])
    if (low.includes(b)) problems.push(`banned phrase "${b.trim()}"`);
  if (INJECTION.test(text)) problems.push('looks like an instruction injected through the learner words');
  const n = words(text).length;
  if (n > pkg.style.maxWords) problems.push(`too long (${n} words, max ${pkg.style.maxWords})`);
  if (fkGrade(text.replace(MOVE_RE, 'x')) > 8.5) problems.push('reading level above grade 8');
  for (const f of pkg.facts.filter((x) => x.required)) {
    const sq = f.text.match(/\b[a-h][1-8]\b/g) ?? [];
    const kw = (f.text.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter(
      (w) =>
        ![
          'after',
          'could',
          'then',
          'point',
          'points',
          'play',
          'plays',
          'goes',
          'sequence',
          'material',
          'stays',
          'still',
        ].includes(w),
    );
    const digits = f.text.match(/\d+/g) ?? [];
    const hit =
      sq.some((s) => text.includes(s)) ||
      kw.some((w) => low.includes(w)) ||
      digits.some((d) => new RegExp(`\\b${d}\\b`).test(text));
    if (!hit) problems.push(`required fact ${f.id} is not covered`);
  }
  return { ok: problems.length === 0, problems };
}
