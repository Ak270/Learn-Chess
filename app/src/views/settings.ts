import { $, $$, toast, modal, esc } from '../shell/dom';
import { settings } from '../shell/settings';
import { db } from '../data/db';
import { deleteAll, exportAll, importAll } from '../data/exportImport';
import { buildPackage } from '../core/ai/package';
import { AiFailure, createGroqProvider } from '../core/ai/providers';
import { verifyText } from '../core/ai/verify';

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
  </div>
  <section class="card" style="margin-top:16px;max-width:980px"><h2>This device</h2>
    <div class="setting"><div><b>Storage</b><div class="small muted" id="stor">Checking…</div></div><button class="btn small" id="persist">Keep my data</button></div>
    <div class="setting"><div><b>Analysis engine</b><div class="small muted">Stockfish 19 (lite, single thread) runs in a worker on this device. Cross-origin isolation: <span id="coi"></span></div></div></div>
    <div class="setting"><div><b>Groq connection</b><div class="small muted" id="gstat">Add a key above, then test it. The test sends one tiny, fixed message, nothing about your games.</div></div><button class="btn small" id="gtest">Test Groq key</button></div>
    <div class="setting"><div><b>Import a backup</b><div class="small muted">A file made by "Export everything". Merges by id; nothing is lost.</div></div><input type="file" id="imp" accept=".json" aria-label="Backup file"></div>
    <div class="setting"><div><b>Start onboarding again</b><div class="small muted">Does not delete anything.</div></div><button class="btn small" id="reon">Reset onboarding</button></div>
  </section>`;
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
  $('#exp', root).onclick = async () => {
    const file = await exportAll(db);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    a.download = `mentor-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    await db.kv.put({ key: 'export.last', value: Date.now() });
    toast('Exported. The Groq key is not included.');
  };
  $('#del', root).onclick = () =>
    modal(
      `<h2>Delete everything?</h2><p class="muted">This removes your games, answers, settings and the Groq key stored in this browser. It cannot be undone.</p>
     <div class="row"><button class="btn danger" id="del-yes">Delete everything</button><button class="btn" id="del-no">Cancel</button></div>`,
      {
        onMount: (bg, close) => {
          $('#del-no', bg).onclick = close;
          $('#del-yes', bg).onclick = async () => {
            await deleteAll(db);
            location.reload();
          };
        },
      },
    );
  const stor = $('#stor', root);
  void (async () => {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    stor.textContent = est
      ? `${((est.usage ?? 0) / 1048576).toFixed(1)} MB used of about ${Math.round((est.quota ?? 0) / 1048576)} MB. ${persisted ? 'The browser will keep it.' : 'The browser may clear it if space runs low, so export a backup now and then.'}`
      : 'Storage information is not available in this browser.';
  })();
  $('#coi', root).textContent =
    typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? 'on' : 'off (single thread)';
  $('#persist', root).onclick = async () =>
    toast(
      (await navigator.storage?.persist?.())
        ? 'Your data is now marked to keep.'
        : 'The browser did not grant it. Install the app or export regularly.',
    );
  $('#gtest', root).onclick = async () => {
    const out = $('#gstat', root);
    const key = settings.get('groqKey');
    if (!key) return void (out.textContent = 'Add a Groq key first.');
    out.textContent = 'Testing…';
    const pkg = buildPackage({
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playedSan: 'e4',
      playedUci: 'e2e4',
      replySans: ['e5'],
      moveNo: 1,
    });
    try {
      const text = await createGroqProvider({
        getKey: () => settings.get('groqKey'),
        getModel: () => settings.get('groqModel'),
      }).explainWithNote(pkg);
      const v = verifyText(text, pkg);
      out.textContent = v.ok
        ? 'Connected. Groq answered and the answer passed the fact check.'
        : 'Connected, but the test answer failed the fact check (that is the checker doing its job). Wording will fall back to built-in text when it happens.';
    } catch (e) {
      const f = e as AiFailure;
      out.textContent =
        f.reason === 'rate-limit'
          ? 'Groq says to slow down. Try again in a minute.'
          : f.reason === 'http'
            ? `Groq answered ${f.status}. Check the key and the model name.`
            : f.reason === 'network'
              ? 'Could not reach Groq. Built-in wording stays on.'
              : 'The test did not work.';
    }
  };
  ($('#imp', root) as HTMLInputElement).onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const r = await importAll(db, JSON.parse(await f.text()));
      toast(`Imported ${r.rows} records.`);
    } catch (err) {
      toast((err as Error).message, 'warn', 5000);
    }
  };
  $('#reon', root).onclick = async () => {
    await db.kv.delete('onboarding.done');
    location.hash = '#/onboarding';
  };
}
