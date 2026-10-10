// Content validator with engine confirmation (docs/backend/06 §4.2). Run in CI: npm run validate:content
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import { createEngineClient, type UciTransport } from '../src/core/engine/engineClient';
import { lessonCycles, validateLesson, type Lesson } from '../src/core/content/validate';
import { REPERTOIRES, steps } from '../src/core/openings/repertoire';

const dir = 'src/content/lessons';
const lessons = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Lesson);
let errors = [...lessons.flatMap((l) => validateLesson(l, lessons)), ...lessonCycles(lessons)];

const require = createRequire(import.meta.url);
const engine = createEngineClient(async (): Promise<UciTransport> => {
  const e = await require('stockfish')(resolve('node_modules/stockfish/bin/stockfish-19-lite-single.js'));
  let cb: (l: string) => void = () => {};
  e.listener = (l: string) => cb(l);
  return { send: (c) => e.sendCommand(c), onLine: (f) => (cb = f), dispose: () => e.terminate?.() };
});

for (const l of lessons)
  for (const [i, s] of l.steps.entries())
    if (s.type === 'interactive') {
      const r = await engine.analyse(s.fen, { depth: 16, multiPv: 3 });
      const [a] = r.lines;
      const b = r.lines.find((l) => !s.solution.includes(l.pv[0]));
      const best = a.pv[0];
      const margin = a.mate !== undefined || !b || b.mate !== undefined ? Infinity : (a.cp ?? 0) - (b.cp ?? 0);
      if (a.mate === 1) {
        // every mate-in-one must be accepted, otherwise a correct answer would be marked wrong
        const mates = new Chess(s.fen)
          .moves({ verbose: true })
          .filter((m) => m.san.endsWith('#'))
          .map((m) => m.lan);
        const missing = mates.filter((m) => !s.solution.includes(m));
        if (missing.length) errors.push(`${l.id} step ${i + 1}: also mates in one: ${missing.join(', ')}`);
        continue;
      }
      if (!s.solution.includes(best))
        errors.push(`${l.id} step ${i + 1}: engine prefers ${best}, lesson says ${s.solution.join('/')}`);
      else if (margin < 100)
        errors.push(`${l.id} step ${i + 1}: best move beats the second by only ${margin} cp (need >= 100)`);
      const c = new Chess(s.fen);
      if (c.isGameOver()) errors.push(`${l.id} step ${i + 1}: position is already over`);
    }
// repertoire nodes: after each learner move the position must be >= -0.4 pawns for the learner (docs/backend/06 §3.3)
for (const rep of REPERTOIRES)
  for (const st of steps(rep).filter((x) => x.node.byLearner)) {
    const c = new Chess(st.fenBefore);
    c.move(st.node.san);
    const r = await engine.analyse(c.fen(), { depth: 16, multiPv: 1 });
    const cp = r.lines[0].mate !== undefined ? (r.lines[0].mate > 0 ? -10000 : 10000) : -(r.lines[0].cp ?? 0);
    if (cp < -40) errors.push(`${rep.id} move ${st.idx + 1} ${st.node.san}: engine says ${cp} cp for you (limit -40)`);
  }
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`content OK: ${lessons.length} lessons`);
process.exit(0);
