import { settings, $, $$, toast, modal } from '../ui.js';

export function render(root) {
  const boards = [['green', '#ebecd0', '#739552'], ['brown', '#f0d9b5', '#b58863'], ['blue', '#dee3e6', '#8ca2ad'], ['slate', '#d7d7d7', '#6f7c8c']];
  const tog = (k, label, sub) => `<div class="setting"><div><b>${label}</b><div class="small muted">${sub}</div></div><input class="toggle" type="checkbox" data-k="${k}" ${settings.get(k) ? 'checked' : ''} aria-label="${label}"></div>`;
  root.innerHTML = `
  <div class="page-h"><div><h1>Settings</h1><p class="muted">Everything is stored on this device in the real build unless you opt in to sync.</p></div></div>
  <div class="grid g2" style="align-items:start">
    <section class="card"><h2>Appearance</h2>
      <div class="setting"><b>Theme</b><div class="seg" id="theme"><button data-v="dark" class="${settings.get('theme') === 'dark' ? 'on' : ''}">Dark</button><button data-v="light" class="${settings.get('theme') === 'light' ? 'on' : ''}">Light</button></div></div>
      <div class="setting"><b>Board</b><div class="row">${boards.map(([n, l, d]) => `<button class="swatch ${settings.get('board') === n ? 'on' : ''}" data-b="${n}" style="--l:${l};--d:${d}" aria-label="${n} board"></button>`).join('')}</div></div>
      ${tog('coords', 'Coordinates', 'Show a–h and 1–8 on the board')}
      <div class="setting"><div><b>Reduce motion</b><div class="small muted">Turns off piece and page animations</div></div><input class="toggle" type="checkbox" id="motion" ${settings.get('motion') === 'off' ? 'checked' : ''} aria-label="Reduce motion"></div>
      ${tog('sound', 'Sounds', 'Move, capture, check')}</section>
    <section class="card"><h2>Training</h2>
      <div class="setting"><div><b>Daily time</b><div class="small muted">Sessions are capped to this</div></div><select id="mins" style="width:110px">${[20, 30, 40, 60].map((m) => `<option ${settings.get('minutes') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Rest day</b><div class="small muted">No pressure, streak is safe</div></div><select id="rest" style="width:130px">${['Sunday', 'Saturday', 'Monday'].map((d) => `<option ${settings.get('restDay') === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Default mode</b><div class="small muted">Coach adds the Safety Check</div></div><div class="seg" id="mode"><button data-v="coach" class="${settings.get('mode') === 'coach' ? 'on' : ''}">Coach</button><button data-v="normal" class="${settings.get('mode') === 'normal' ? 'on' : ''}">Normal</button></div></div>
      <h2 style="margin-top:20px">Your data</h2><p class="small muted">Games, answers and timings are used only to drive training.</p>
      <div class="row"><button class="btn" id="exp">Export everything</button><button class="btn danger" id="del">Delete everything</button></div></section>
  </div>`;
  const seg = (id, key) => $$(`#${id} button`, root).forEach((b) => b.onclick = () => { settings.set(key, b.dataset.v); $$(`#${id} button`, root).forEach((x) => x.classList.toggle('on', x === b)); });
  seg('theme', 'theme'); seg('mode', 'mode');
  $$('[data-b]', root).forEach((b) => b.onclick = () => { settings.set('board', b.dataset.b); $$('[data-b]', root).forEach((x) => x.classList.toggle('on', x === b)); });
  $$('input[data-k]', root).forEach((i) => i.onchange = () => settings.set(i.dataset.k, i.checked));
  $('#motion', root).onchange = (e) => settings.set('motion', e.target.checked ? 'off' : 'on');
  $('#mins', root).onchange = (e) => settings.set('minutes', +e.target.value); $('#rest', root).onchange = (e) => settings.set('restDay', e.target.value);
  $('#exp', root).onclick = () => toast('Prototype: export would download a JSON file.');
  $('#del', root).onclick = () => modal('<h2>Delete everything?</h2><p class="muted">Prototype only — nothing is stored yet.</p><button class="btn" onclick="this.closest(\'.modal-bg\').remove()">OK</button>');
}
