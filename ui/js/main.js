import { $, $$, settings, toast, esc } from './ui.js';
import * as home from './views/home.js';
import * as play from './views/play.js';
import * as review from './views/review.js';
import * as puzzles from './views/puzzles.js';
import * as learn from './views/learn.js';
import * as openings from './views/openings.js';
import * as blunders from './views/blunders.js';
import * as progress from './views/progress.js';
import * as session from './views/session.js';
import * as settingsView from './views/settings.js';
import * as profile from './views/profile.js';
import { user, blunderCards } from './data.js';

const routes = { home, play, review, puzzles, learn, openings, blunders, progress, session, profile, settings: settingsView };
const NAV = [
  ['home', '🏠', 'Home'], ['session', '📅', "Today's Session"], ['play', '♟️', 'Play'], ['puzzles', '🧩', 'Puzzles'],
  ['learn', '📚', 'Learn'], ['openings', '📖', 'Openings'], ['blunders', '📦', 'Blunder Box'], ['review', '🔍', 'Game Review'],
  ['progress', '📈', 'Progress'], ['profile', '🧑', 'My Profile'], ['settings', '⚙️', 'Settings'],
];
let cleanup = null;

function renderNav(active) {
  const due = blunderCards.filter((c) => c.nextDue === 'Today').length;
  $('#nav').innerHTML = `
    <a class="logo" href="#/home"><i>♞</i>Mentor</a>
    ${NAV.map(([id, ic, label], i) => `${i === 2 || i === 6 ? '<div class="nav-sep"></div>' : ''}
      <a class="nav-item ${id === active ? 'active' : ''}" href="#/${id}" ${id === active ? 'aria-current="page"' : ''}>
        <span class="ic">${ic}</span><span class="lbl">${label}</span>${id === 'blunders' && due ? `<span class="pill">${due}</span>` : ''}</a>`).join('')}
    <div class="nav-foot"><div class="avatar">🧑</div><div><div style="font-weight:700">${esc(user.name)}</div><div class="small muted">${user.rating} → goal ${user.goal}</div></div></div>`;
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [id, ...rest] = hash.split('/');
  const name = routes[id] ? id : 'home';
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  renderNav(name);
  const view = $('#view');
  view.innerHTML = '';
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
  cleanup = (await routes[name].render(view, { args: rest })) || null;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

// ---- teacher drawer (global "Ask Mentor") -----------------------------------
const replies = {
  default: "Good question. In the real build I answer from your own games and verified engine facts. Try: 'why did I lose?', 'what should I practise?' or 'explain forks'.",
  lose: "Your last loss turned on move 11: the knight went to h4 and the queen on f6 could take it. The habit to practise is checking what the opponent's queen sees before moving a knight.",
  practise: "Today: 8 hanging-piece drills, then one slow game with the Safety Check on. Your Blunder Box has 2 cards due.",
  fork: "A fork is one move that attacks two things at once. Knights are the usual culprits because enemy pieces cannot attack back along the same line.",
};
function teacherInit() {
  const t = $('#teacher');
  const open = () => {
    t.hidden = false;
    t.innerHTML = `<header><div class="avatar" style="background:var(--accent);color:var(--accent-ink)">♞</div><div class="grow"><b>Mentor</b><div class="small muted">Prototype replies only</div></div><button class="btn small ghost" id="t-close" aria-label="Close">✕</button></header>
      <div class="msgs" id="t-msgs"><div class="mentor-bubble"><div class="avatar">♞</div><div class="bubble">Hi! Ask me about your games, a position or what to practise next.</div></div></div>
      <footer><button class="btn small ghost" data-q="Why did I lose?">Why did I lose?</button><button class="btn small ghost" data-q="What should I practise?">What should I practise?</button><button class="btn small ghost" data-q="Explain forks">Explain forks</button>
      <form id="t-form" class="row" style="width:100%"><input type="text" id="t-in" placeholder="Ask Mentor…" autocomplete="off"><button class="btn primary small">Send</button></form></footer>`;
    const msgs = $('#t-msgs');
    const ask = (q) => {
      msgs.insertAdjacentHTML('beforeend', `<div class="mentor-bubble"><div class="bubble me">${esc(q)}</div></div>`);
      const typing = document.createElement('div'); typing.className = 'mentor-bubble';
      typing.innerHTML = '<div class="avatar">♞</div><div class="bubble typing"><i></i><i></i><i></i></div>'; msgs.appendChild(typing); msgs.scrollTop = 1e6;
      const l = q.toLowerCase();
      const r = l.includes('lose') ? replies.lose : l.includes('practi') ? replies.practise : l.includes('fork') ? replies.fork : replies.default;
      setTimeout(() => { typing.querySelector('.bubble').classList.remove('typing'); typing.querySelector('.bubble').textContent = r; msgs.scrollTop = 1e6; }, 900);
    };
    $$('[data-q]', t).forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
    $('#t-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#t-in').value.trim(); if (v) { ask(v); $('#t-in').value = ''; } });
    $('#t-close').addEventListener('click', () => { t.hidden = true; });
  };
  $('#teacher-fab').addEventListener('click', () => (t.hidden ? open() : (t.hidden = true)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') t.hidden = true; });
}
teacherInit();
if (!location.hash) toast('UI prototype: all data is placeholder', 'warn', 4000);
