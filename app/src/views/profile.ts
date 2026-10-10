// "My Profile" (docs/backend/08 §4, docs/backend/10 §1): preferences, what Mentor knows (with dismiss), beliefs, expectations, exports.
import { coachMemory, db, metrics, misconceptions, planner, profile, store } from '../app';
import { coachReportHtml } from '../core/export/report';
import { dailyIcs } from '../core/export/ics';
import { skillTitle } from '../core/planner/plan';
import { $, $$, esc, modal, toast } from '../shell/dom';
import { settings } from '../shell/settings';
import { cfg } from '../config';

interface Ext {
  motivation: string;
  goal: string;
  pace: 'gentle' | 'steady' | 'push';
  askBeforeTell: boolean;
  ownBoardAccess: boolean;
  bestTime: string;
}
const DEFAULT_EXT: Ext = {
  motivation: 'understand',
  goal: '',
  pace: 'steady',
  askBeforeTell: true,
  ownBoardAccess: false,
  bestTime: '19:00',
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const download = (name: string, type: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function render(root: HTMLElement) {
  const prof = await profile.getOrCreate();
  const ext: Ext = { ...DEFAULT_EXT, ...(((await db.kv.get('profile.ext'))?.value as Partial<Ext>) ?? {}) };
  const saveExt = (p: Partial<Ext>) =>
    db.kv.put({ key: 'profile.ext', value: { ...ext, ...p } }).then(() => Object.assign(ext, p));
  const memories = await coachMemory.list();
  const states = await misconceptions.states();
  const defs = misconceptions.defs;
  const goalDefault = `Reach ${prof.goalRating}`;
  root.innerHTML = `
  <div class="page-h"><div><h1>Your profile</h1><p class="muted">What Mentor knows about you, what it assumes, and what you can change.</p></div></div>
  <div class="grid g2 stagger" style="align-items:start">
    <section class="card"><h2>About you</h2>
      <div class="setting"><label for="name"><b>Name</b></label><input id="name" type="text" value="${esc(prof.displayName === 'Learner' ? '' : prof.displayName)}" placeholder="Learner" style="width:200px"></div>
      <div class="setting"><label for="mot"><b>Why do you play?</b></label><select id="mot" style="width:200px">${[
        ['understand', 'Understand the game'],
        ['win_more', 'Win more'],
        ['beat_a_friend', 'Beat a friend'],
        ['prove_to_self', 'Prove it to myself'],
        ['fun', 'Fun'],
      ]
        .map(([v, l]) => `<option value="${v}" ${ext.motivation === v ? 'selected' : ''}>${l}</option>`)
        .join('')}</select></div>
      <div class="setting"><div><label for="goal"><b>Goal</b></label><div class="small muted">Rating goals are fine; behaviour goals are better.</div></div><input id="goal" type="text" value="${esc(ext.goal || goalDefault)}" style="width:200px"></div>
      <div class="setting"><div><b>Pace</b><div class="small muted">How hard the plan pushes</div></div><div class="seg" id="pace" role="group" aria-label="Pace">${(['gentle', 'steady', 'push'] as const).map((p) => `<button data-p="${p}" class="${ext.pace === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></div>
      <div class="setting"><div><b>Ask before telling</b><div class="small muted">Mentor asks what you were thinking first. Turn off for direct explanations.</div></div><input id="abt" type="checkbox" class="toggle" ${ext.askBeforeTell ? 'checked' : ''} aria-label="Ask before telling"></div>
      <div class="setting"><div><b>I have a real board</b><div class="small muted">Unlocks offline tasks like calculating without moving pieces.</div></div><input id="rb" type="checkbox" class="toggle" ${ext.ownBoardAccess ? 'checked' : ''} aria-label="I have a real board"></div>
      <div class="setting"><div><label for="mins"><b>Daily time</b></label></div><select id="mins" style="width:110px">${[15, 20, 30, 40, 60].map((m) => `<option ${prof.dailyMinutes === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="setting"><div><label for="rest"><b>Rest day</b></label></div><select id="rest" style="width:130px">${DAYS.map((d, i) => `<option value="${i}" ${prof.restDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="setting"><div><label for="time"><b>Best time of day</b></label><div class="small muted">Used for the calendar reminder</div></div><input id="time" type="time" value="${esc(ext.bestTime)}"></div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn" id="ics">Add daily reminder (.ics)</button><button class="btn" id="rep">Coach report</button></div>
    </section>
    <div class="grid" style="align-content:start">
      <section class="card"><h2>What Mentor knows about you</h2><p class="small muted">Each note needs at least 3 pieces of evidence. Dismiss anything that is wrong and it will never be used.</p>
        <div id="mem">${memories.length ? memories.map((m) => `<div class="coach-card" data-key="${esc(m.key)}"><div class="small">${esc(m.text)}</div><div class="row small muted" style="margin-top:6px"><span>${m.evidence.length} data points</span><span class="grow"></span><button class="btn small ghost" data-dis="${esc(m.key)}">Not true</button></div></div>`).join('') : '<p class="small muted">Nothing with enough evidence yet. Review more games and this fills in.</p>'}</div></section>
      <section class="card"><h2>Beliefs that may be costing you games</h2>
        ${defs
          .map((d) => {
            const s = states.find((x) => x.id === d.id)!;
            return `<div class="coach-card ${s.status === 'active' ? 'warn' : 'info'}"><h4>"${esc(d.title)}" <span class="chip ${s.status === 'active' ? 'yellow' : ''}">${s.status}</span></h4><div class="small">${esc(d.truth)}</div><div class="small muted" style="margin-top:4px">${s.status === 'active' ? esc(d.learnerPhrase) + ' · ' : ''}Seen ${s.hits.length}× in your reviewed games · skill: ${esc(skillTitle(d.skill))}</div></div>`;
          })
          .join('')}
        <a class="btn small" href="#/learn">Open the lessons</a></section>
      <section class="card" style="border-left:4px solid var(--info)"><h3>What to expect</h3>
        <p class="small">• Improvement is measured in months. Mentor makes <b>no promise</b> about how fast you reach ${prof.goalRating}.</p>
        <p class="small">• Ratings are noisy. A dip after facing stronger players is normal.</p>
        <p class="small">• Mentor uses coaching practice, not proven trials, so it measures what works <b>for you</b> and shows the uncertainty.</p>
        <p class="small">• Puzzle ratings usually run far above game ratings. Do not chase them.</p></section>
    </div>
  </div>`;
  const on = <T extends HTMLElement>(s: string) => $<T>(s, root);
  on<HTMLInputElement>('#name').onchange = async (e) => {
    await profile.update({ displayName: (e.target as HTMLInputElement).value.trim() || 'Learner' });
  };
  on<HTMLSelectElement>('#mot').onchange = (e) => void saveExt({ motivation: (e.target as HTMLSelectElement).value });
  on<HTMLInputElement>('#goal').onchange = (e) => void saveExt({ goal: (e.target as HTMLInputElement).value });
  on<HTMLInputElement>('#abt').onchange = (e) =>
    void saveExt({ askBeforeTell: (e.target as HTMLInputElement).checked });
  on<HTMLInputElement>('#rb').onchange = (e) =>
    void saveExt({ ownBoardAccess: (e.target as HTMLInputElement).checked });
  on<HTMLInputElement>('#time').onchange = (e) => void saveExt({ bestTime: (e.target as HTMLInputElement).value });
  on<HTMLSelectElement>('#mins').onchange = async (e) => {
    const v = +(e.target as HTMLSelectElement).value;
    await profile.update({ dailyMinutes: v });
    settings.set('minutes', v);
  };
  on<HTMLSelectElement>('#rest').onchange = async (e) => {
    const v = +(e.target as HTMLSelectElement).value;
    await profile.update({ restDay: v as 0 });
    settings.set('restDay', v);
  };
  $$('#pace button', root).forEach(
    (b) =>
      (b.onclick = () => {
        void saveExt({ pace: b.dataset.p as Ext['pace'] });
        $$('#pace button', root).forEach((x) => x.classList.toggle('on', x === b));
      }),
  );
  $$('[data-dis]', root).forEach(
    (b) =>
      (b.onclick = async () => {
        await coachMemory.dismiss(b.dataset.dis!);
        const c = b.closest('.coach-card') as HTMLElement;
        c.style.transition = 'opacity .3s';
        c.style.opacity = '0';
        setTimeout(() => c.remove(), 300);
        toast('Removed. Mentor will not use that note.');
      }),
  );
  on('#ics').onclick = async () => {
    const p = await profile.getOrCreate();
    download(
      'mentor-daily.ics',
      'text/calendar',
      dailyIcs({ time: ext.bestTime, minutes: p.dailyMinutes, restDay: p.restDay }),
    );
    toast(`Calendar file downloaded (daily at ${ext.bestTime}, not on ${DAYS[p.restDay]}).`);
  };
  on('#rep').onclick = async () => {
    const b = await metrics.baseline(10);
    const games = await store.gamesNewestFirst(10);
    const mistakes = [];
    for (const g of games) {
      for (const m of await store.mistakesForGame(g.id)) {
        if (!m.isFirstMeaningful) continue;
        mistakes.push({
          title: `Move ${Math.ceil(m.ply / 2)} in a game vs ${g.playerColor === 'w' ? g.black : g.white}`,
          fen: m.fen,
          arrow: m.bestUci ? ([m.bestUci.slice(0, 2), m.bestUci.slice(2, 4)] as [string, string]) : undefined,
          text: m.motifs[0]?.evidence ?? 'First meaningful mistake.',
          diagnosis: m.diagnosis.map((h) => `${h.cause.replace(/_/g, ' ')} (${h.confidence})`),
        });
      }
    }
    const plan = await planner.planToday().catch(() => undefined);
    const html = coachReportHtml({
      generatedAt: new Date().toLocaleDateString(),
      name: prof.displayName,
      games: b.n,
      baseline: b.ready
        ? { blundersPer40: b.blundersPer40, missedThreatsPerGame: b.missedThreatsPerGame, accuracy: b.accuracy, n: b.n }
        : undefined,
      mistakes: mistakes.slice(0, 5),
      memories: memories.map((m) => m.text),
      focus: plan ? skillTitle(plan.focusSkill) : 'Piece safety',
      limitations: [
        'Imported games carry no information about what the player was thinking, so "did not see it" and "saw it, misjudged" cannot be separated.',
        'Diagnoses are hypotheses with signals, never verdicts.',
        `Engine: ${cfg.get<number>('engine.review.depth')} plies deep; borderline classifications can change with more depth.`,
      ],
    });
    modal(
      `<h2>Coach report</h2><p class="muted">A printable page with your numbers, top mistakes with diagrams and active notes. Nothing is uploaded: the file is made on this device.</p><div class="row"><button class="btn primary" id="dl">Download HTML</button><button class="btn" onclick="this.closest('.modal-bg').remove()">Close</button></div>`,
      {
        onMount: (bg) => ($('#dl', bg).onclick = () => download('mentor-coach-report.html', 'text/html', html)),
      },
    );
  };
}
