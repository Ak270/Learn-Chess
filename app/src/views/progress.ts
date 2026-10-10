// Progress (docs/backend/08 §4): behaviour first, rating second; uncertainty always shown; "not enough data" when sparse.
import { db, metrics } from '../app';
import { SKILL_DEFS, mastery, skillTitle } from '../core/planner/plan';
import { calibration } from '../core/test/dailyTest';
import { $$, esc } from '../shell/dom';
import { lineChart } from '../shell/ui';
import { COLD_START_REVIEWED_GAMES } from '../services/MetricsService';
import type { SkillState } from '../types/model';

const statusLabel = (s?: SkillState) =>
  !s || s.status === 'insufficient'
    ? 'Still learning about you'
    : {
        learning: 'Learning',
        solid: 'Solid',
        maintenance: 'Maintained',
        decaying: 'Needs a refresher',
        insufficient: '',
      }[s.status];

export async function render(root: HTMLElement) {
  const rg = (await metrics.reviewedGames(30)).reverse(); // oldest first
  const per40 = rg.map((x) => x.review.blundersPer40);
  const ratings = (await db.games.orderBy('startedAt').toArray())
    .filter((g) => g.playerRating)
    .slice(-40)
    .map((g) => g.playerRating as number);
  const skills = (await db.skills.toArray()).sort((a, b) => b.nEffTotal - a.nEffTotal);
  const motifPhase: Record<string, Record<string, number>> = {};
  for (const { game } of rg) {
    for (const p of await metrics.learnerPlies(game.id, game.playerColor))
      for (const m of p.motifs ?? [])
        if (m.role !== 'played' || m.id.startsWith('hanging')) {
          const row = (motifPhase[m.id.split('.')[0]] ??= { opening: 0, middlegame: 0, endgame: 0 });
          row[p.phase]++;
        }
  }
  const heatKeys = Object.keys(motifPhase).slice(0, 6);
  const maxHeat = Math.max(1, ...heatKeys.flatMap((k) => Object.values(motifPhase[k])));
  const cal = calibration((await db.attempts.where('context').equals('test').toArray()).slice(-100));
  const cards = await db.cards.toArray();
  const created = cards.filter((c) => c.kind === 'blunder');
  const cleared = created.filter((c) => c.state === 'cleared').length;
  const cold = rg.length < COLD_START_REVIEWED_GAMES;

  root.innerHTML = `
  <div class="page-h"><div><h1>Progress</h1><p class="muted">Behaviour first, rating second. Rating is slow and noisy; blunders and missed threats move first.</p></div></div>
  <div class="grid stagger">
    <div class="grid g2">
      <section class="card"><div class="row"><h2 class="grow">Blunders per 40 moves</h2></div>${per40.length >= 3 ? lineChart(per40, { color: '#fa412d', h: 170, labels: per40.map((_, i) => `G${i + 1}`), ariaLabel: 'Blunders per 40 moves by game' }) + (cold ? '<div class="small muted">Not enough games yet to call a trend (needs 5). The line is shown, but treat it as noise.</div>' : '<div class="small muted">Each point is one game. Short-term ups and downs are normal; look at the direction over 10 games.</div>') : '<p class="small muted">Not enough games yet.</p>'}</section>
      <section class="card"><div class="row"><h2 class="grow">Rating from your games</h2></div>${ratings.length >= 3 ? lineChart(ratings, { h: 170, ariaLabel: 'Your rating over imported games' }) : '<p class="small muted">Needs a few imported games with ratings.</p>'}<div class="small muted">An outcome, not the goal.</div></section>
    </div>
    <div class="grid g2">
      <section class="card"><h2>Skill profile</h2>${
        skills.length
          ? skills
              .map((s) => {
                const known = s.status !== 'insufficient';
                return `<div class="skillrow"><span>${esc(skillTitle(s.skill))}</span><div class="bar"><i style="width:${known ? Math.round(mastery(s) * 100) : 0}%"></i></div><span class="small muted">${known ? esc(statusLabel(s)) : `${Math.round(s.nEffTotal)}/6 data points`}</span></div>`;
              })
              .join('')
          : '<p class="small muted">Skill bars appear after your first practice or review.</p>'
      }<p class="small muted">Each bar combines concept, recognition, unaided success and real-game transfer, never a single quiz score. No percentage is shown until 6 data points exist.</p></section>
      <section class="card"><h2>Where mistakes happen</h2>${heatKeys.length ? `<div style="display:grid;grid-template-columns:100px repeat(3,1fr);gap:6px;align-items:center"><div></div>${['Opening', 'Middlegame', 'Endgame'].map((x) => `<div class="small muted" style="text-align:center">${x}</div>`).join('')}${heatKeys.map((k) => `<div class="small muted">${esc(k.replace(/_/g, ' '))}</div>` + ['opening', 'middlegame', 'endgame'].map((ph) => `<div title="${motifPhase[k][ph]} times" style="height:34px;border-radius:6px;display:grid;place-items:center;background:rgba(250,65,45,${(0.08 + (motifPhase[k][ph] / maxHeat) * 0.4).toFixed(2)})"><span class="small" style="color:var(--text)">${motifPhase[k][ph]}</span></div>`).join('')).join('')}</div>` : '<p class="small muted">Review a few games to see where mistakes cluster.</p>'}</section>
    </div>
    <div class="grid g3">
      <section class="card stat"><div class="small muted">Blunder Box cleared</div><div class="v">${created.length ? `${cleared}/${created.length}` : '—'}</div></section>
      <section class="card stat"><div class="small muted">"Sure" answers that were right</div><div class="v">${cal.sureRight !== undefined && cal.sureN >= 5 ? Math.round(cal.sureRight * 100) + '%' : '—'}</div><div class="small muted">${cal.sureN >= 5 ? `of ${cal.sureN} answers` : 'needs 5 test answers'}</div></section>
      <section class="card stat"><div class="small muted">Games reviewed</div><div class="v">${rg.length}</div></section>
    </div>
    <section class="card"><h2>Phase gate: Survive &amp; Aware → Tactical Vision</h2><p class="small muted">Decided from several signals together, never one score.</p>
      ${(() => {
        const last = rg.slice(-10);
        const b40 = last.length ? last.reduce((s, x) => s + x.review.blundersPer40, 0) / last.length : undefined;
        const first5 = rg.slice(0, 5);
        const base = first5.length ? first5.reduce((s, x) => s + x.review.blundersPer40, 0) / first5.length : undefined;
        const ps = skills.find((s) => s.skill === 'piece_safety');
        const ot = skills.find((s) => s.skill === 'opponent_threats');
        const ok = (s?: SkillState) => s?.status === 'solid' || s?.status === 'maintenance';
        const items = [
          [
            b40 !== undefined && (b40 <= 2 || (base !== undefined && b40 <= base * 0.65)),
            `Blunders per 40 moves at most 2.0, or down 35% from your start (${b40 !== undefined ? b40.toFixed(1) : '—'} now, ${base !== undefined ? base.toFixed(1) : '—'} at the start)`,
          ],
          [ok(ps) && ok(ot), 'Piece safety and opponent threats are solid'],
          [false, 'Threat statements unprompted in 70% of coach-mode moves (arrives with Play)'],
          [rg.length >= 10, `At least 10 reviewed games (${rg.length} so far)`],
        ];
        return `<div>${items.map(([done, t]) => `<div class="small">${done ? '✅' : '⬜'} ${esc(String(t))}</div>`).join('')}</div>`;
      })()}</section>
  </div>`;
  void SKILL_DEFS;
  void $$;
}
