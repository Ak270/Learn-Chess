// Puzzles (docs/backend/08 §4, docs/backend/10 §3): recognition sprints and calculation deep-dives, set progress, in-app Elo.
import { content, db, planner, store } from '../app';
import { mountPuzzle } from '../components/PuzzleWidget';
import { cfg } from '../config';
import { skillTitle, SKILL_DEFS } from '../core/planner/plan';
import { assistLevel, evidenceFromAttempt } from '../core/skills/derive';
import { $, esc, toast } from '../shell/dom';
import { runFlash } from './flash';
import type { PuzzleView } from '../core/content/puzzles';
import type { SkillId } from '../types/ids';

type Mode = 'recognition' | 'calculation';
const OFFER: SkillId[] = [
  'piece_safety',
  'tactic_fork',
  'tactic_pin',
  'tactic_skewer',
  'tactic_discovered',
  'tactic_backrank',
  'mate_patterns',
];

/** speed targets appear only after accuracy >= 90% over the last 20 recognition attempts (accuracy before speed) */
async function speedGate(): Promise<boolean> {
  const last = (await db.attempts.where('context').equals('puzzle').toArray())
    .filter((a) => a.source !== 'calc_deepdive')
    .slice(-cfg.get<number>('puzzle.speedGateWindow'));
  return (
    last.length >= cfg.get<number>('puzzle.speedGateWindow') &&
    last.filter((a) => a.correct && !a.hints).length / last.length >= cfg.get<number>('puzzle.speedGateAccuracy')
  );
}

export async function render(root: HTMLElement) {
  let mode: Mode = 'recognition';
  let skill: SkillId | 'auto' = 'auto';
  const elo = () => content.puzzleElo();

  const lobby = async () => {
    const r = await elo();
    const counts = await content.loadCounts();
    const have = OFFER.filter((s) => counts[s]);
    root.innerHTML = `
    <div class="page-h"><div><h1>Puzzles</h1><p class="muted">Solve slowly and completely. State what you see first. Speed comes later.</p></div><div class="row"><span class="chip">puzzle rating ${Math.round(r)}</span></div></div>
    <section class="card" style="max-width:720px"><h2>Choose a set</h2>
      <div class="setting"><div><b>Kind of practice</b><div class="small muted">${mode === 'recognition' ? 'Spot the pattern quickly. Positions you usually get right.' : 'Work out a whole line. Harder positions, think first.'}</div></div>
        <div class="seg" id="mode" role="group" aria-label="Practice kind"><button data-m="recognition" class="${mode === 'recognition' ? 'on' : ''}">Recognition</button><button data-m="calculation" class="${mode === 'calculation' ? 'on' : ''}">Calculation</button></div></div>
      <div class="setting"><label for="sk"><b>Skill</b></label><select id="sk" style="width:240px"><option value="auto">Automatic (today's focus)</option>${have.map((s) => `<option value="${s}" ${skill === s ? 'selected' : ''}>${esc(skillTitle(s))}</option>`).join('')}</select></div>
      ${have.length ? '' : '<p class="small muted">No puzzle shards found. Run the content build, or use the Blunder Box for your own positions.</p>'}
      <div class="row" style="margin-top:12px"><button class="btn big" id="flash">Flash position</button><button class="btn primary big" id="start" ${have.length ? '' : 'disabled'}>Start ${mode === 'recognition' ? cfg.get<number>('puzzle.recognitionSetSize') : cfg.get<number>('puzzle.calcSetSize')} puzzles</button></div></section>`;
    $('#mode', root)
      .querySelectorAll('button')
      .forEach(
        (b) =>
          (b.onclick = () => {
            mode = (b as HTMLElement).dataset.m as Mode;
            void lobby();
          }),
      );
    ($('#sk', root) as HTMLSelectElement).onchange = (e) =>
      (skill = (e.target as HTMLSelectElement).value as SkillId | 'auto');
    $('#start', root).onclick = () => void runSet();
    $('#flash', root).onclick = () => void runFlash(root, () => void lobby());
  };

  const runSet = async () => {
    const size =
      mode === 'recognition' ? cfg.get<number>('puzzle.recognitionSetSize') : cfg.get<number>('puzzle.calcSetSize');
    const plan = skill === 'auto' ? await planner.planToday(Date.now()).catch(() => undefined) : undefined;
    const focus: SkillId =
      skill === 'auto'
        ? plan?.focusSkill && OFFER.includes(plan.focusSkill)
          ? plan.focusSkill
          : 'piece_safety'
        : skill;
    const results: { correct: boolean; clean: boolean; ms: number }[] = [];
    const seen: string[] = [];
    const gate = await speedGate();

    const one = async () => {
      const r0 = await elo();
      const p =
        mode === 'recognition' ? cfg.get<number>('puzzle.recognitionTargetP') : cfg.get<number>('puzzle.calcTargetP');
      const target = r0 - 400 * Math.log10(p / (1 - p));
      const pz: PuzzleView | undefined = await content.nextPuzzle({
        skill: focus,
        targetRating: target,
        excludeIds: seen,
      });
      if (!pz) {
        toast('No more puzzles for that skill right now.');
        return summary();
      }
      seen.push(pz.id);
      const st = await db.skills.get(focus);
      const level = assistLevel(st?.independence ?? 0);
      root.innerHTML = `
      <div class="page-h"><div><h1>${mode === 'recognition' ? 'Recognition' : 'Calculation'}: ${esc(skillTitle(focus))}</h1><p class="muted">${mode === 'recognition' ? (gate ? `You are accurate enough to aim for under ${Math.round(cfg.get<number>('puzzle.speedTargetMs') / 1000)} seconds. Accuracy still comes first.` : 'No timer yet. Accuracy first.') : 'Think first. The board unlocks after a while, or when you are sure.'}</p></div>
        <div class="row"><span class="chip green">${results.filter((x) => x.clean).length} clean</span><span class="chip">${results.length + 1} / ${size}</span></div></div>
      <div class="bar" style="max-width:520px;margin-bottom:12px"><i style="width:${(results.length / size) * 100}%"></i></div>
      <div id="pz"></div><div id="after"></div>`;
      mountPuzzle(
        $('#pz', root),
        {
          fen: pz.fen,
          line: pz.line,
          skill: focus,
          chips: pz.themes.slice(0, 2),
          rating: pz.rating,
          lastMove: pz.lastMove,
          idea: `Theme: ${pz.themes.slice(0, 3).join(', ')}.`,
        },
        {
          threatStep: level >= 2,
          assistLevel: level,
          maxWrong: mode === 'recognition' ? cfg.get<number>('puzzle.maxWrongRecognition') : 0,
          lockMs: mode === 'calculation' ? cfg.get<number>('puzzle.calcMinThinkMs') : undefined,
          onDone: async (r) => {
            const correct = r.correct && !r.gaveUp;
            const clean = correct && !r.hints && r.wrongTries === 0;
            results.push({ correct, clean, ms: r.ms });
            const attempt = {
              at: Date.now(),
              context: 'puzzle' as const,
              puzzleId: pz.id,
              fen: pz.fen,
              correct,
              hints: r.hints,
              ms: r.ms,
              skillTags: [focus],
              source: (mode === 'calculation' ? 'calc_deepdive' : 'puzzle_recognition') as
                'calc_deepdive' | 'puzzle_recognition',
              threatsStated: r.threats,
            };
            await store.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
            await content.recordPuzzleResult(pz.rating, clean);
            $('#after', root).innerHTML =
              `<button class="btn primary big" id="next" style="margin-top:12px;width:100%;max-width:520px">${results.length < size ? 'Next puzzle →' : 'See my set →'}</button>`;
            $('#next', root).onclick = () => (results.length < size ? void one() : void summary());
          },
        },
      );
    };
    const summary = async () => {
      const n = results.length;
      const acc = n ? results.filter((x) => x.clean).length / n : 0;
      const med = n ? [...results].map((x) => x.ms).sort((a, b) => a - b)[Math.floor(n / 2)] : 0;
      const r = await elo();
      await db.kv.put({
        key: `puzzleset:${Date.now()}`,
        value: { mode, skill: focus, n, accuracy: acc, medianMs: med, at: Date.now() },
      });
      const advice =
        acc >= cfg.get<number>('puzzle.setCycleAccuracy')
          ? 'Clean and steady. Next time we can go a little harder.'
          : acc < cfg.get<number>('puzzle.setCycleRepeatBelow')
            ? 'Worth repeating this kind of set with hints on. Nothing is lost.'
            : 'Good work. One more set will lock it in.';
      root.innerHTML = `<div class="page-h"><div><h1>Set done</h1><p class="muted">${esc(skillTitle(focus))}</p></div></div>
        <section class="card" style="max-width:560px"><div class="grid g3" style="gap:8px"><div class="card flat"><div class="small muted">Clean</div><div style="font-size:26px;font-weight:800">${results.filter((x) => x.clean).length}/${n}</div></div><div class="card flat"><div class="small muted">Typical time</div><div style="font-size:26px;font-weight:800">${Math.round(med / 1000)}s</div></div><div class="card flat"><div class="small muted">Puzzle rating</div><div style="font-size:26px;font-weight:800">${Math.round(r)}</div></div></div>
        <p style="margin-top:10px">${advice}</p><p class="small muted">Puzzle ratings usually run well above game ratings. Do not chase them.</p>
        <div class="row"><button class="btn primary" id="again">Another set</button><button class="btn ghost" id="back">Choose something else</button></div></section>`;
      $('#again', root).onclick = () => void runSet();
      $('#back', root).onclick = () => void lobby();
    };
    await one();
  };

  void SKILL_DEFS;
  await lobby();
}
