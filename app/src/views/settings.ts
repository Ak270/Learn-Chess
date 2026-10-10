import { $, $$, toast, modal, esc } from '../shell/dom';
import { settings } from '../shell/settings';
import { db } from '../data/db';

const BOARDS: [string, string, string][] = [
  ['green', '#ebecd0', '#739552'],
  ['brown', '#f0d9b5', '#b58863'],
  ['blue', '#dee3e6', '#8ca2ad'],
  ['slate', '#d7d7d7', '#6f7c8c'],
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function render(root: HTMLElement) {
  const tog = (k: 'coords' | 'sound', label: string, sub: string) =>
    `<div class="setting"><div><b>${label}</b><div class="small muted">${sub}</div></div><input class="toggle" type="checkbox" data-k="${k}" ${settings.get(k) ? 'checked' : ''} aria-label="${label}"></div>`;
  root.innerHTML = `
  <div class="page-h"><div><h1>Settings</h1><p class="muted">Everything is stored on this device. Nothing is sent anywhere unless you add a Groq key.</p></div></div>
  <div class="grid g2" style="align-items:start">
    <section class="card"><h2>Appearance</h2>
      <div class="setting"><b>Theme</b><div class="seg" id="theme"><button data-v="dark" class="${settings.get('theme') === 'dark' ? 'on' : ''}">Dark</button><button data-v="light" class="${settings.get('theme') === 'light' ? 'on' : ''}">Light</button></div></div>
      <div class="setting"><b>Board</b><div class="row">${BOARDS.map(([n, l, d]) => `<button class="swatch ${settings.get('board') === n ? 'on' : ''}" data-b="${n}" style="--l:${l};--d:${d}" aria-label="${n} board"></button>`).join('')}</div></div>
      ${tog('coords', 'Coordinates', 'Show a–h and 1–8 on the board')}
      <div class="setting"><div><b>Reduce motion</b><div class="small muted">Turns off piece and page animations</div></div><input class="toggle" type="checkbox" id="motion" ${settings.get('motion') === 'off' ? 'checked' : ''} aria-label="Reduce motion"></div>
      ${tog('sound', 'Sounds', 'Move, capture, check')}</section>
    <section class="card"><h2>Training</h2>
      <div class="setting"><div><b>Daily time</b><div class="small muted">Sessions are capped to this</div></div><select id="mins" aria-label="Daily minutes" style="width:110px">${[20, 30, 40, 60].map((m) => `<option ${settings.get('minutes') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Rest day</b><div class="small muted">No pressure, streak is safe</div></div><select id="rest" aria-label="Rest day" style="width:130px">${DAYS.map((d, i) => `<option value="${i}" ${settings.get('restDay') === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Default mode</b><div class="small muted">Coach adds the Safety Check</div></div><div class="seg" id="mode"><button data-v="coach" class="${settings.get('mode') === 'coach' ? 'on' : ''}">Coach</button><button data-v="normal" class="${settings.get('mode') === 'normal' ? 'on' : ''}">Normal</button></div></div>
      <h2 style="margin-top:20px">AI explanations (Groq)</h2><p class="small muted">Optional. The key stays in this browser. Wording only: chess facts always come from code.</p>
      <div class="setting"><label for="gk"><b>Groq API key</b></label><input type="password" id="gk" value="${esc(settings.get('groqKey'))}" placeholder="gsk_…" style="width:220px" autocomplete="off"></div>
      <div class="setting"><label for="gm"><b>Model</b></label><input type="text" id="gm" value="${esc(settings.get('groqModel'))}" style="width:220px"></div>
      <h2 style="margin-top:20px">Your data</h2><p class="small muted">Games, answers and timings are used only to drive training.</p>
      <div class="row"><button class="btn" id="exp">Export everything</button><button class="btn danger" id="del">Delete everything</button></div></section>
  </div>`;
  const seg = (id: string, key: 'theme' | 'mode') =>
    $$(`#${id} button`, root).forEach(
      (b) =>
        (b.onclick = () => {
          settings.set(key, b.dataset.v as never);
          $$(`#${id} button`, root).forEach((x) => x.classList.toggle('on', x === b));
        }),
    );
  seg('theme', 'theme');
  seg('mode', 'mode');
  $$('[data-b]', root).forEach(
    (b) =>
      (b.onclick = () => {
        settings.set('board', b.dataset.b!);
        $$('[data-b]', root).forEach((x) => x.classList.toggle('on', x === b));
      }),
  );
  $$<HTMLInputElement>('input[data-k]', root).forEach(
    (i) => (i.onchange = () => settings.set(i.dataset.k as 'coords' | 'sound', i.checked)),
  );
  $<HTMLInputElement>('#motion', root).onchange = (e) =>
    settings.set('motion', (e.target as HTMLInputElement).checked ? 'off' : 'on');
  $<HTMLSelectElement>('#mins', root).onchange = (e) => settings.set('minutes', +(e.target as HTMLSelectElement).value);
  $<HTMLSelectElement>('#rest', root).onchange = (e) => settings.set('restDay', +(e.target as HTMLSelectElement).value);
  $<HTMLInputElement>('#gk', root).onchange = (e) =>
    settings.set('groqKey', (e.target as HTMLInputElement).value.trim());
  $<HTMLInputElement>('#gm', root).onchange = (e) =>
    settings.set('groqModel', (e.target as HTMLInputElement).value.trim());
  $('#exp', root).onclick = () => toast('Export arrives with the data layer (Phase 2).');
  $('#del', root).onclick = () =>
    modal(
      `<h2>Delete everything?</h2><p class="muted">This removes your games, answers, settings and the Groq key stored in this browser. It cannot be undone.</p>
     <div class="row"><button class="btn danger" id="del-yes">Delete everything</button><button class="btn" id="del-no">Cancel</button></div>`,
      {
        onMount: (bg, close) => {
          $('#del-no', bg).onclick = close;
          $('#del-yes', bg).onclick = async () => {
            await db.delete();
            localStorage.clear();
            location.reload();
          };
        },
      },
    );
}
