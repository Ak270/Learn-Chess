import './styles/app.css';
import { $, esc } from './shell/dom';
import { loadSettings } from './shell/settings';
import { activeJobs, latestJob, onJobUpdate } from './services/JobService';
import { store } from './app';
import * as settingsView from './views/settings';
import * as homeView from './views/home';
import * as reviewView from './views/review';
import * as onboardingView from './views/onboarding';
import * as blundersView from './views/blunders';
import * as puzzlesView from './views/puzzles';
import * as learnView from './views/learn';
import * as sessionView from './views/session';
import * as profileView from './views/profile';
import * as progressView from './views/progress';
import * as playView from './views/play';
import { initTeacher } from './shell/teacher';

export interface ViewCtx {
  args: string[];
  query: URLSearchParams;
}
type View = { render(root: HTMLElement, ctx: ViewCtx): void | (() => void) | Promise<void | (() => void)> };

// Screens are migrated from ui/ one by one (docs/backend/08 §9). Unmigrated ones show a placeholder.
const NAV: [string, string, string][] = [
  ['home', '🏠', 'Home'],
  ['session', '📅', "Today's Session"],
  ['play', '♟️', 'Play'],
  ['puzzles', '🧩', 'Puzzles'],
  ['learn', '📚', 'Learn'],
  ['openings', '📖', 'Openings'],
  ['blunders', '📦', 'Blunder Box'],
  ['review', '🔍', 'Game Review'],
  ['progress', '📈', 'Progress'],
  ['profile', '🧑', 'My Profile'],
  ['settings', '⚙️', 'Settings'],
];
const routes: Record<string, View> = {
  home: homeView,
  review: reviewView,
  settings: settingsView,
  onboarding: onboardingView,
  blunders: blundersView,
  puzzles: puzzlesView,
  learn: learnView,
  session: sessionView,
  profile: profileView,
  progress: progressView,
  play: playView,
};
const placeholder = (label: string): View => ({
  render(root) {
    root.innerHTML = `<div class="page-h"><div><h1>${esc(label)}</h1><p class="muted">Not built yet. This screen arrives in a later milestone.</p></div></div>`;
  },
});

let cleanup: (() => void) | null = null;

async function renderNav(active: string) {
  const due = (await store.dueCards(Date.now(), 99)).length;
  const j = latestJob();
  const running = activeJobs().length > 0;
  $('#nav').innerHTML = `<a class="logo" href="#/home"><i>♞</i>Mentor</a>${NAV.map(
    ([id, ic, label], i) =>
      `${i === 2 || i === 6 ? '<div class="nav-sep"></div>' : ''}<a class="nav-item ${id === active ? 'active' : ''}" href="#/${id}" ${id === active ? 'aria-current="page"' : ''}><span class="ic">${ic}</span><span class="lbl">${label}</span>${id === 'blunders' && due ? `<span class="pill">${due}</span>` : ''}</a>`,
  ).join('')}${
    j
      ? `<a class="nav-item" href="${j.link ?? '#/home'}" aria-live="polite"><span class="ic">${running ? '⏳' : '✔'}</span><span class="lbl small">${esc(j.stage)}</span></a>`
      : ''
  }`;
}

async function route() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [id = '', ...rest] = path.split('/');
  const known = NAV.find(([n]) => n === id) || id === 'onboarding';
  const name = known ? id : 'home';
  cleanup?.();
  cleanup = null;
  await renderNav(name);
  const view = $('#view');
  view.innerHTML = '';
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';
  const v = routes[name] ?? placeholder(NAV.find(([n]) => n === name)![2]);
  cleanup = (await v.render(view, { args: rest, query: new URLSearchParams(qs) })) || null;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

await loadSettings();
if (navigator.storage?.persist)
  navigator.storage.persist().catch(() => {
    /* not granted: export reminder covers it */
  });
window.addEventListener('hashchange', route);
onJobUpdate(() => void renderNav(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home'));
route();
initTeacher();
