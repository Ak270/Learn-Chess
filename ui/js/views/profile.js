import { user, profileExt, memories, misconceptions } from '../data.js';
import { $, $$, esc, toast, modal } from '../ui.js';

function icsDaily(time = '19:00') {
  const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const [h, m] = time.split(':');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mentor//Daily session//EN', 'BEGIN:VEVENT', `UID:mentor-daily-${stamp}@local`, `DTSTAMP:${stamp}T000000Z`,
    `DTSTART:${stamp}T${h}${m}00`, 'DURATION:PT40M', 'RRULE:FREQ=DAILY', 'SUMMARY:Chess session with Mentor', 'DESCRIPTION:Today\'s plan is waiting. Rest day: Sunday.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export function render(root) {
  root.innerHTML = `
  <div class="page-h"><div><h1>Your profile</h1><p class="muted">What Mentor knows about you, what it assumes, and what you can change.</p></div><span class="proto">Sample data</span></div>
  <div class="grid g2 stagger" style="align-items:start">
    <section class="card"><h2>About you</h2>
      <div class="setting"><div><b>Why do you play?</b></div><select id="mot" style="width:200px"><option>Understand the game</option><option>Win more</option><option>Beat a friend</option><option>Prove it to myself</option><option>Fun</option></select></div>
      <div class="setting"><div><b>Goal</b><div class="small muted">Rating goals are fine; behaviour goals are better.</div></div><input type="text" value="${esc(profileExt.goal)}" style="width:200px"></div>
      <div class="setting"><div><b>Pace</b><div class="small muted">How hard the plan pushes</div></div><div class="seg" id="pace"><button>Gentle</button><button class="on">Steady</button><button>Push</button></div></div>
      <div class="setting"><div><b>Ask before telling</b><div class="small muted">Mentor asks what you were thinking first. Turn off to get direct explanations.</div></div><input type="checkbox" class="toggle" ${profileExt.askBeforeTell ? 'checked' : ''} aria-label="Ask before telling"></div>
      <div class="setting"><div><b>I have a real board</b><div class="small muted">Unlocks offline tasks like calculating without moving pieces.</div></div><input type="checkbox" class="toggle" ${profileExt.ownBoard ? 'checked' : ''} aria-label="Real board"></div>
      <div class="setting"><div><b>Availability</b></div><span class="muted small">${profileExt.availability}</span></div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn" id="ics">📅 Add daily reminder (.ics)</button><button class="btn" id="rep">📄 Coach report</button></div>
    </section>
    <div class="grid" style="align-content:start">
      <section class="card"><h2>What Mentor knows about you</h2><p class="small muted">Each note needs at least 3 pieces of evidence. Dismiss anything that is wrong and it will never be used.</p>
        <div id="mem">${memories.map((m) => `<div class="coach-card" data-id="${m.id}"><div class="small">${esc(m.text)}</div><div class="row small muted" style="margin-top:6px"><span>${m.ev} data points · since ${m.since}</span><span class="grow"></span><button class="btn small ghost" data-dis>Not true</button></div></div>`).join('')}</div></section>
      <section class="card"><h2>Beliefs that may be costing you games</h2>
        ${misconceptions.map((m) => `<div class="coach-card ${m.status === 'active' ? 'warn' : 'info'}"><h4>"${esc(m.title)}" <span class="chip ${m.status === 'active' ? 'yellow' : ''}">${m.status}</span></h4><div class="small">${esc(m.truth)}</div><div class="small muted" style="margin-top:4px">Seen ${m.hits}× in your recent games</div></div>`).join('')}
        <a class="btn small" href="#/learn">Open the lesson that targets these</a></section>
      <section class="card" style="border-left:4px solid var(--info)"><h3>What to expect</h3>
        <p class="small">• Improvement is measured in months. Mentor makes <b>no promise</b> about how fast you reach ${user.goal}.</p>
        <p class="small">• Ratings are noisy. A dip after facing stronger players is normal.</p>
        <p class="small">• Mentor uses coaching practice, not proven trials, so it measures what works <b>for you</b> and shows the uncertainty.</p>
        <p class="small">• Puzzle ratings usually run far above game ratings. Do not chase them.</p></section>
    </div>
  </div>`;
  $$('[data-dis]', root).forEach((b) => b.onclick = () => { const c = b.closest('.coach-card'); c.style.transition = 'opacity .3s'; c.style.opacity = 0; setTimeout(() => c.remove(), 300); toast('Removed. Mentor will not use that note.'); });
  $('#ics', root).onclick = () => {
    const url = URL.createObjectURL(new Blob([icsDaily()], { type: 'text/calendar' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mentor-daily.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Calendar file downloaded (daily at 19:00).');
  };
  $('#rep', root).onclick = () => modal('<h2>Coach report</h2><p class="muted">The real build exports a printable page with your metrics (with uncertainty), top mistakes with board diagrams, and active notes, to share with a human coach or friend.</p><button class="btn" onclick="this.closest(\'.modal-bg\').remove()">OK</button>');
  $$('#pace button', root).forEach((b) => b.onclick = () => { $$('#pace button', root).forEach((x) => x.classList.toggle('on', x === b)); });
}
