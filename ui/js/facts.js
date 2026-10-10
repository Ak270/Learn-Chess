// Turns "position + your move + the engine's follow-up line" into VERIFIED facts and plain sentences.
// No AI involved here. The AI (groq.js) may only reword what this file produces.
import { Chess } from '../vendor/chess.js';
import { VAL } from './bot.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDE = { w: 'White', b: 'Black' };

/** @returns {{steps:Array, netForLearner:number, facts:string[], sentence:string, allowedMoves:string[], allowedSquares:string[]}} */
export function lineFacts(fenBefore, playedSan, replySans) {
  const c = new Chess(fenBefore);
  const learner = c.turn();
  const steps = [];
  let net = 0;
  const all = [playedSan, ...replySans];
  for (const san of all) {
    const m = c.move(san);
    if (!m) break;
    const mine = m.color === learner;
    const gain = m.captured ? VAL[m.captured] : 0;
    net += mine ? gain : -gain;
    steps.push({ san: m.san, color: m.color, mine, piece: m.piece, from: m.from, to: m.to, captured: m.captured, check: m.san.includes('+'), mate: m.san.includes('#') });
  }
  const facts = steps.map((s, i) => {
    let t = `${i === 0 ? 'You play' : s.mine ? 'You could then play' : 'Your opponent can reply'} ${s.san}: the ${NAME[s.piece]} goes to ${s.to}`;
    if (s.captured) t += ` and captures a ${NAME[s.captured]} (${VAL[s.captured]} point${VAL[s.captured] > 1 ? 's' : ''})`;
    if (s.mate) t += ' and it is checkmate'; else if (s.check) t += ' with check';
    return t + '.';
  });
  const outcome = net === 0 ? 'Material stays even after this sequence.' : net < 0 ? `After this sequence you are down ${-net} point${-net > 1 ? 's' : ''} of material.` : `After this sequence you are up ${net} point${net > 1 ? 's' : ''} of material.`;
  facts.push(outcome);
  const allowedMoves = steps.map((s) => s.san);
  const allowedSquares = [...new Set(steps.flatMap((s) => [s.from, s.to]))];
  return { steps, netForLearner: net, facts, sentence: facts.join(' '), allowedMoves, allowedSquares, learnerColor: learner };
}

/** Package sent to the AI. Contains ONLY what is listed. */
export function buildPackage(fenBefore, playedSan, lf, extra = {}) {
  return {
    kind: 'mistake_explanation', learnerLevel: 'beginner (about 600 rating)',
    style: { tone: 'calm, direct, kind', maxWords: 80, reading: 'grade 7' },
    position: { fen: fenBefore, youPlay: SIDE[lf.learnerColor] },
    played: playedSan, facts: lf.facts, allowedMoves: lf.allowedMoves, allowedSquares: lf.allowedSquares,
    habit: extra.habit || 'Before moving a piece, check which enemy pieces can capture on its new square.',
    learnerWords: extra.learnerWords || null,
  };
}

const BANNED = ['stupid', 'terrible', 'obviously', 'just ', 'engine', 'centipawn', 'idiot', 'dumb', 'awful'];
/** Deterministic checker. Returns {ok, problems[]}. */
export function verifyText(text, pkg) {
  const problems = [];
  const moveRe = /\b(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;
  const okMoves = new Set(pkg.allowedMoves.map((m) => m.replace(/[+#]/g, '')));
  for (const tok of text.match(moveRe) || []) {
    const t = tok.replace(/[+#]/g, '');
    const sq = /^[a-h][1-8]$/.test(t);
    if (sq) { if (!pkg.allowedSquares.includes(t)) problems.push(`square ${t} not in facts`); }
    else if (!okMoves.has(t)) problems.push(`move ${tok} not in facts`);
  }
  const factDigits = new Set((pkg.facts.join(' ').match(/\d+/g)) || []);
  for (const n of text.match(/\d+/g) || []) if (!factDigits.has(n)) problems.push(`number ${n} not in facts`);
  const low = text.toLowerCase();
  for (const b of BANNED) if (low.includes(b)) problems.push(`banned word "${b.trim()}"`);
  const words = text.trim().split(/\s+/).length;
  if (words > pkg.style.maxWords + 15) problems.push(`too long (${words} words)`);
  return { ok: problems.length === 0, problems };
}
