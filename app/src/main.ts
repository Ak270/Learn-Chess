import './styles/app.css';
import { $, esc } from './shell/dom';
import { loadSettings } from './shell/settings';
import * as settingsView from './views/settings';

type View = { render(root: HTMLElement, ctx: { args: string[] }): void | (() => void) | Promise<void | (() => void)> };

// Screens are migrated from ui/ one by one (docs/backend/08). Unmigrated ones show a placeholder.
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
const routes: Record<string, View> = { settings: settingsView };
const placeholder = (label: string): View => ({
  render(root) {
    root.innerHTML = `<div class="page-h"><div><h1>${esc(label)}</h1><p class="muted">Not built yet. This screen arrives in a later phase.</p></div></div>`;
  },
});

let cleanup: (() => void) | null = null;

function renderNav(active: string) {
  $('#nav').innerHTML = `<a class="logo" href="#/home"><i>♞</i>Mentor</a>${NAV.map(
    ([id, ic, label], i) =>
      `${i === 2 || i === 6 ? '<div class="nav-sep"></div>' : ''}<a class="nav-item ${id === active ? 'active' : ''}" href="#/${id}" ${id === active ? 'aria-current="page"' : ''}><span class="ic">${ic}</span><span class="lbl">${label}</span></a>`,
  ).join('')}`;
}

async function route() {
  const [id = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const known = NAV.find(([n]) => n === id);
  const name = known ? id : 'home';
  cleanup?.();
  cleanup = null;
  renderNav(name);
  const view = $('#view');
  view.innerHTML = '';
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';
  const v = routes[name] ?? placeholder(NAV.find(([n]) => n === name)![2]);
  cleanup = (await v.render(view, { args: rest })) || null;
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

await loadSettings();
if (navigator.storage?.persist)
  navigator.storage.persist().catch(() => {
    /* not granted: export reminder covers it */
  });
window.addEventListener('hashchange', route);
route();
