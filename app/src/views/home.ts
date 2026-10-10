// Home (docs/backend/08 §4). Real data only: no placeholders. Cold-start rules apply (no percentages before 5 reviewed games).
import { db, metrics, profile, store, reviews } from '../app';
import { $$, esc } from '../shell/dom';
import { countUp, lineChart } from '../shell/ui';
import { mistakeFacts } from '../core/chess/facts';
import { COLD_START_REVIEWED_GAMES } from '../services/MetricsService';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export async function render(root: HTMLElement) {
  const games = await store.gamesNewestFirst(200);
  const prof = await profile.get();
  const done = await profile.onboardingDone();
  if (!games.length || !done) {
    root.innerHTML = `
    <div class="page-h"><div><h1>${greeting()}</h1><p class="muted">Welcome to Mentor.</p></div></div>
    <section class="hero"><div class="grow"><h2 style="font-size:24px">Meet your first mistake</h2>
      <p class="muted" style="color:inherit;opacity:.8">Import your games and Mentor will find the first mistake that really mattered, work out why it happened, and turn it into practice.</p>
      <a class="btn primary big" href="#/onboarding">${games.length ? 'Finish setting up' : 'Import your games'}</a></div></section>`;
    return;
  }

  const stats = await metrics.homeStats();
  const reviewed = await metrics.reviewedGames(8);
  const unreviewed = games.filter((g) => !g.reviewedAt);
  const ratings = games
    .filter((g) => g.playerRating && g.startedAt)
    .slice(0, 40)
    .reverse()
    .map((g) => g.playerRating as number);
  const recent = await Promise.all(
    games.slice(0, 5).map(async (g) => {
      const r = await reviews.getReview(g.id);
      const m = r?.firstMeaningfulPly
        ? (await store.mistakesForGame(g.id)).find((x) => x.isFirstMeaningful)
        : undefined;
      const p = m ? await db.plies.get([g.id, m.ply]) : undefined;
      return { g, r, m, facts: m && p ? mistakeFacts(m, p) : undefined };
    }),
  );
  const dueCards = await store.dueCards(Date.now(), 99);
  const note = (
    await db.journal
      .orderBy('at')
      .reverse()
      .filter((j) => j.kind === 'teacher_note')
      .first()
  )?.body;

  const statCard = (
    label: string,
    value: number | undefined,
    prev: number | undefined,
    unit: string,
    lowerBetter: boolean,
  ) => {
    if (value === undefined)
      return `<div class="card stat"><div class="small muted">${label}</div><div class="v">—</div><div class="small muted">Not enough games yet</div></div>`;
    const better = prev === undefined ? undefined : lowerBetter ? value < prev : value > prev;
    return `<div class="card stat"><div class="small muted">${label}</div><div class="v"><span data-n="${value}" data-d="1">0</span>${unit}</div>
      ${prev === undefined ? '<div class="small muted">First measurement</div>' : `<div class="delta ${better ? 'up' : 'dn'}">${better ? '▲ improving' : '▼ slipping'} <span class="muted">(was ${prev.toFixed(1)}${unit})</span></div>`}</div>`;
  };

  root.innerHTML = `
  <div class="page-h"><div><h1>${greeting()}${prof?.displayName && prof.displayName !== 'Learner' ? ', ' + esc(prof.displayName) : ''}</h1>
    <p class="muted">${games.length} games imported · ${reviewed.length ? 'focus: ' + (await focusLabel()) : 'ready to review'}</p></div></div>
  <div class="grid stagger">
    <section class="hero">
      <div class="grow"><h2 style="font-size:24px">${unreviewed.length ? `${unreviewed.length} game${unreviewed.length > 1 ? 's' : ''} waiting for review` : dueCards.length ? `${dueCards.length} Blunder Box card${dueCards.length > 1 ? 's' : ''} due` : 'You are up to date'}</h2>
        <p class="muted" style="color:inherit;opacity:.8">${unreviewed.length ? 'The best time to review is soon after you play.' : 'Daily sessions arrive with the training milestone.'}</p>
        <a class="btn primary big" href="${unreviewed.length ? '#/review' : dueCards.length ? '#/blunders' : '#/review'}">${unreviewed.length ? 'Review games' : dueCards.length ? 'Open Blunder Box' : 'Open game list'}</a></div>
    </section>
    <div class="grid g4">
      ${
        stats.ready
          ? statCard('Blunders per 40 moves', stats.blundersPer40, stats.blundersPer40Prev, '', true)
          : `<div class="card stat"><div class="small muted">Blunders per 40 moves</div><div class="v">—</div><div class="small muted">Still learning about you (${stats.n}/${COLD_START_REVIEWED_GAMES})</div></div>`
      }
      <div class="card stat"><div class="small muted">Games reviewed</div><div class="v"><span data-n="${reviewed.length}" data-d="0">0</span></div><div class="small muted">of ${games.length} imported</div></div>
      <div class="card stat"><div class="small muted">Blunder Box due</div><div class="v"><span data-n="${dueCards.length}" data-d="0">0</span></div><div class="small muted">cards waiting</div></div>
    </div>
    <div class="grid g2">
      <section class="card"><div class="row"><h2 class="grow">Rating from your games</h2></div>
        ${ratings.length >= 3 ? `${lineChart(ratings, { h: 120, ariaLabel: 'Your rating over your imported games' })}<div class="small muted" style="margin-top:4px">Rating is an outcome, not the goal. Behaviour metrics matter more.</div>` : '<p class="muted small">Needs a few more imported games with ratings.</p>'}</section>
      <section class="card" style="border-left:4px solid var(--accent)"><h3>💬 Note from Mentor</h3>${note ? `<p class="small">${esc(note)}</p>` : '<p class="small muted">Your first note appears after your first training day.</p>'}</section>
    </div>
    <section class="card"><div class="row"><h2 class="grow">Recent games & first meaningful mistake</h2><a class="btn small ghost" href="#/review">All games</a></div>
      <div class="glist">${recent
        .map(({ g, r, facts }) => {
          const win = (g.result === '1-0') === (g.playerColor === 'w') && g.result !== '1/2-1/2';
          const res = g.result === '1/2-1/2' ? 'D' : win ? 'W' : 'L';
          return `<a class="it" href="#/review/${g.id}" style="text-decoration:none;color:inherit"><span class="res ${res === 'W' ? 'win' : res === 'L' ? 'loss' : ''}">${res}</span>
          <div class="grow"><b>vs ${esc(g.playerColor === 'w' ? g.black : g.white)}</b> <span class="muted small">· ${g.startedAt ? new Date(g.startedAt).toLocaleDateString() : ''}${r ? ` · accuracy ${Math.round(r.accuracy)}%` : ''}</span>
          <div class="small muted">${facts ? esc(facts.summary) : r ? 'No single big mistake stood out.' : 'Not reviewed yet'}</div></div></a>`;
        })
        .join('')}</div></section>
  </div>`;
  requestAnimationFrame(() => $$('[data-n]', root).forEach((e) => countUp(e, +e.dataset.n!, { dec: +e.dataset.d! })));
}

async function focusLabel(): Promise<string> {
  const b = await metrics.baseline(10);
  if (!b.ready) return 'Piece safety (default until we know more)';
  const top = Object.entries(b.motifs).sort((x, y) => y[1] - x[1])[0];
  return top ? top[0].replace(/[._]/g, ' ') : 'Piece safety';
}
