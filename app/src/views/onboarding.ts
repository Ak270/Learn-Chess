// Onboarding (docs/backend/04 §1, docs/backend/10 §1.2, §5.1): welcome -> account -> import (background) -> rules check ->
// think-aloud baseline -> baseline report. Skippable with PGN paste. No rating question: self-rating is optional and untrusted.
import { Chess } from 'chess.js';
import rules from '../content/rulesCheck.json';
import think from '../content/thinkAloud.json';
import { cachedEngine, db, metrics, profile, store } from '../app';
import { Board } from '../components/BoardApi';
import { cfg } from '../config';
import { evidenceFromAttempt } from '../core/skills/derive';
import { chesscomImporter } from '../core/importers/chesscom';
import { lichessImporter } from '../core/importers/lichess';
import { pgnImporter } from '../core/importers/pgn';
import { winPctOf } from '../core/chess/eval';
import { scoreThinkAloud, summariseThinkAloud, type ThinkAloudRubric } from '../core/onboarding/thinkAloud';
import { runImport } from '../services/ImportService';
import { activeJobs, latestJob, onJobUpdate, startJob } from '../services/JobService';
import { reviews } from '../app';
import { $, $$, esc, toast } from '../shell/dom';
import { settings } from '../shell/settings';
import type { SkillId } from '../types/ids';
import type { Importer } from '../types/services';
import type { Profile } from '../types/model';
import { COLD_START_REVIEWED_GAMES } from '../services/MetricsService';

const STEPS = ['welcome', 'account', 'rules', 'think', 'report'] as const;
type Step = (typeof STEPS)[number];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const KIND_SKILL: Record<string, SkillId> = {
  hanging: 'piece_safety',
  fork: 'tactic_fork',
  threat: 'opponent_threats',
  quiet: 'candidate_moves',
  mate1: 'mate_patterns',
};

export async function render(root: HTMLElement, ctx: { args: string[] }) {
  let step: Step = (STEPS as readonly string[]).includes(ctx.args[0])
    ? (ctx.args[0] as Step)
    : ctx.args[0] === 'import'
      ? 'account'
      : 'welcome';
  const unsub: (() => void)[] = [];
  const draw = () => {
    unsub.splice(0).forEach((f) => f());
    root.innerHTML = `
    <div class="page-h"><div><h1>Welcome to Mentor</h1><p class="muted">A few minutes to set up. You can skip anything and come back later.</p></div>
      <div class="row">${STEPS.map((s, i) => `<span class="chip ${s === step ? 'green' : ''}" aria-current="${s === step}">${i + 1}</span>`).join('')}</div></div>
    <div id="job"></div><div id="stepbody"></div>`;
    jobBanner();
    ({ welcome, account, rules: rulesStep, think: thinkStep, report })[step]();
  };
  const go = (s: Step) => {
    step = s;
    history.replaceState(null, '', `#/onboarding/${s}`);
    draw();
  };

  function jobBanner() {
    const el = $('#job', root);
    const paint = () => {
      const j = latestJob();
      if (!j) {
        el.innerHTML = '';
        return;
      }
      const pct = j.total ? Math.round((j.done / j.total) * 100) : 5;
      el.innerHTML = `<section class="card" style="margin-bottom:12px"><div class="row"><b class="grow">${esc(j.label)}</b>${j.state === 'running' ? '<button class="btn small ghost" id="jc">Cancel</button>' : `<span class="chip ${j.state === 'done' ? 'green' : 'red'}">${j.state}</span>`}</div>
        <div class="small muted" style="margin:4px 0">${esc(j.stage)}${j.error ? ' · ' + esc(j.error) : ''}</div><div class="bar"><i style="width:${j.state === 'done' ? 100 : pct}%"></i></div></section>`;
      const c = $('#jc', el);
      if (c) c.onclick = () => j.cancel();
    };
    paint();
    unsub.push(onJobUpdate(paint) as () => void);
  }

  // ---- 1. welcome + expectations ----
  function welcome() {
    $('#stepbody', root).innerHTML = `
    <section class="card"><h2>What to expect</h2>
      <ul class="small" style="margin:8px 0 12px 18px;line-height:1.7">
        <li>Improvement is measured in months. <b>Mentor promises no timeline.</b></li>
        <li>Ratings are noisy. Short dips are normal, especially against stronger opponents.</li>
        <li>This is based on coaching practice, not proven trials. <b>Mentor measures whether it works for you</b> and shows the evidence with its uncertainty.</li>
        <li>Instead of only rating, we track blunders per 40 moves, missed threats, retention and calibration.</li>
        <li>Puzzle ratings run much higher than game ratings for most people. Do not chase them.</li>
        <li>Your games and answers stay on this device. Nothing is sent anywhere unless you add a Groq key.</li></ul>
      <button class="btn primary" id="next">Continue</button></section>`;
    $('#next', root).onclick = () => go('account');
  }

  // ---- 2. account, time budget, import ----
  async function account() {
    const prof = await profile.getOrCreate();
    const platform = prof.platformAccounts.chesscom
      ? 'chesscom'
      : prof.platformAccounts.lichess
        ? 'lichess'
        : 'chesscom';
    $('#stepbody', root).innerHTML = `
    <section class="card"><h2>Where are your games?</h2>
      <div class="setting"><label for="plat"><b>Platform</b></label><select id="plat" style="width:160px"><option value="chesscom" ${platform === 'chesscom' ? 'selected' : ''}>Chess.com</option><option value="lichess" ${platform === 'lichess' ? 'selected' : ''}>Lichess</option><option value="pgn">Paste or upload PGN</option></select></div>
      <div class="setting" id="userrow"><label for="user"><b>Username</b></label><input id="user" type="text" autocomplete="off" value="${esc(prof.platformAccounts.chesscom ?? prof.platformAccounts.lichess ?? '')}" style="width:220px"></div>
      <div id="pgnrow" hidden><label for="pgn"><b>PGN</b></label><textarea id="pgn" rows="5" placeholder="Paste PGN here, or choose a file"></textarea><input type="file" id="pgnfile" accept=".pgn,.txt" aria-label="PGN file">
        <div class="setting"><label for="pgnuser"><b>Your name in these games</b></label><input id="pgnuser" type="text" style="width:220px"></div></div>
      <div class="setting"><div><b>Daily time</b><div class="small muted">Sessions are capped to this</div></div><select id="mins" aria-label="Daily minutes" style="width:110px">${[15, 20, 30, 40, 60].map((m) => `<option ${prof.dailyMinutes === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Rest day</b><div class="small muted">No pressure, the streak is safe</div></div><select id="rest" aria-label="Rest day" style="width:130px">${DAYS.map((d, i) => `<option value="${i}" ${prof.restDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Your own rating guess (optional)</b><div class="small muted">Only a starting hint. Mentor never trusts it over your games.</div></div><input id="selfr" type="number" min="100" max="3000" style="width:110px" value="${prof.selfRating ?? ''}"></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="go">Import and review my games</button><button class="btn ghost" id="skip">Skip for now</button></div>
      <p class="small muted" id="err" role="alert"></p></section>`;
    const sync = () => {
      const pgn = ($('#plat', root) as HTMLSelectElement).value === 'pgn';
      $('#userrow', root).hidden = pgn;
      $('#pgnrow', root).hidden = !pgn;
    };
    $('#plat', root).onchange = sync;
    sync();
    ($('#pgnfile', root) as HTMLInputElement).onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) ($('#pgn', root) as HTMLTextAreaElement).value = await f.text();
    };
    $('#skip', root).onclick = () => go('rules');
    $('#go', root).onclick = async () => {
      const plat = ($('#plat', root) as HTMLSelectElement).value as 'chesscom' | 'lichess' | 'pgn';
      const user = ($('#user', root) as HTMLInputElement).value.trim();
      const pgnText = ($('#pgn', root) as HTMLTextAreaElement).value;
      const pgnUser = ($('#pgnuser', root) as HTMLInputElement).value.trim();
      const err = $('#err', root);
      if (plat !== 'pgn' && !user) return void (err.textContent = 'Please enter your username.');
      if (plat === 'pgn' && !pgnText.trim()) return void (err.textContent = 'Please paste or choose a PGN.');
      const minutes = +($('#mins', root) as HTMLSelectElement).value;
      const restDay = +($('#rest', root) as HTMLSelectElement).value as Profile['restDay'];
      const selfRating = +($('#selfr', root) as HTMLInputElement).value || undefined;
      await profile.update({
        dailyMinutes: minutes,
        restDay,
        selfRating,
        platformAccounts: plat === 'chesscom' ? { chesscom: user } : plat === 'lichess' ? { lichess: user } : {},
      });
      settings.set('minutes', minutes);
      settings.set('restDay', restDay);
      const importer: Importer =
        plat === 'chesscom' ? chesscomImporter() : plat === 'lichess' ? lichessImporter() : pgnImporter(pgnText);
      startImportAndReview(importer, plat === 'pgn' ? pgnUser : user);
      go('rules');
    };
  }

  function startImportAndReview(importer: Importer, username: string) {
    startJob('Importing and reviewing your games', '#/onboarding', async ({ signal, update }) => {
      update({ stage: 'Importing games' });
      const summary = await runImport(
        db,
        importer,
        { username: username || undefined, max: cfg.get<number>('import.onboardingGames'), signal },
        (n) => update({ stage: `Imported ${n} games`, done: 0, total: 0 }),
      );
      await db.kv.put({ key: 'onboarding.import', value: summary });
      const todo = [];
      for (const id of summary.ids) if (!(await reviews.isReviewed(id))) todo.push(id);
      for (let i = 0; i < todo.length && !signal.cancelled; i++) {
        update({ stage: `Reviewing game ${i + 1} of ${todo.length}`, done: i, total: todo.length });
        for await (const _p of reviews.reviewGame(todo[i], { signal })) void _p;
      }
      update({
        stage: summary.ids.length ? `Done: ${summary.ids.length} games` : 'No games found',
        done: todo.length,
        total: todo.length,
      });
    });
  }

  // ---- 3. rules check ----
  function rulesStep() {
    $('#stepbody', root).innerHTML = `
    <section class="card"><h2>Quick rules check</h2><p class="muted small">Eight short questions, no pressure. They tell Mentor which rules to explain first.</p>
      <form id="rc">${rules.questions
        .map(
          (q, i) =>
            `<fieldset style="border:0;padding:0;margin:14px 0"><legend><b>${i + 1}. ${esc(q.q)}</b></legend>${q.options
              .map(
                (o, j) =>
                  `<label style="display:block;margin:4px 0"><input type="radio" name="${q.id}" value="${j}" required> ${esc(o)}</label>`,
              )
              .join('')}</fieldset>`,
        )
        .join('')}
      <div class="row"><button class="btn primary">Check my answers</button><button type="button" class="btn ghost" id="skip">Skip</button></div></form><div id="rcres"></div></section>`;
    $('#skip', root).onclick = () => go('think');
    const t0 = Date.now();
    ($('#rc', root) as HTMLFormElement).onsubmit = async (e) => {
      e.preventDefault();
      const form = new FormData(e.target as HTMLFormElement);
      let right = 0;
      const lines: string[] = [];
      for (const q of rules.questions) {
        const ok = Number(form.get(q.id)) === q.answer;
        if (ok) right++;
        else lines.push(`<li><b>${esc(q.q)}</b><br>${esc(q.explain)}</li>`);
        const attempt = {
          at: Date.now(),
          context: 'rules_check' as const,
          correct: ok,
          hints: 0,
          ms: Math.round((Date.now() - t0) / rules.questions.length),
          skillTags: [q.skill as SkillId],
        };
        await store.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
      }
      $('#rcres', root).innerHTML =
        `<div class="coach-card ${right >= 7 ? 'good' : 'info'}" style="margin-top:12px"><h4>${right} of ${rules.questions.length} right</h4>
        ${lines.length ? `<div class="small">Worth knowing:<ul style="margin:6px 0 0 18px">${lines.join('')}</ul></div>` : '<div class="small">Great, the rules are solid.</div>'}
        <button class="btn primary small" id="cont" style="margin-top:10px">Continue</button></div>`;
      $('#cont', root).onclick = () => go('think');
    };
  }

  // ---- 4. think-aloud baseline ----
  function thinkStep() {
    let i = 0;
    const rubrics: ThinkAloudRubric[] = [];
    const showOne = () => {
      const pos = think.positions[i];
      $('#stepbody', root).innerHTML = `
      <section class="card"><div class="row"><h2 class="grow">What do you see? (${i + 1} of ${think.positions.length})</h2><button class="btn ghost small" id="skip">Skip this part</button></div>
        <p class="muted">${esc(pos.prompt)}</p>
        <div class="grid g2" style="align-items:start"><div><div id="tb"></div></div>
        <div><fieldset style="border:0;padding:0"><legend class="small muted">Tick what applies</legend>
          <label style="display:block"><input type="checkbox" id="c1"> I checked what their last move attacks or threatens</label>
          <label style="display:block"><input type="checkbox" id="c2"> I looked at checks and captures for both sides</label>
          <label style="display:block"><input type="checkbox" id="c3"> I asked what they could do after my move</label></fieldset>
          <label for="tx" class="small muted" style="display:block;margin-top:8px">In your own words (optional)</label><textarea id="tx" rows="3" placeholder="What do you see? What will you play? What could they do next?"></textarea>
          <p class="small muted" id="mv">Play your move on the board. You can undo and try others.</p>
          <div class="row"><button class="btn small" id="undo" disabled>Undo</button><button class="btn primary small" id="lock" disabled>Lock in this move</button></div></div></div></section>`;
      const chess = new Chess(pos.fen);
      const tried: string[] = [];
      let last = '';
      const t0 = Date.now();
      const board = new Board($('#tb', root), {
        chess,
        orientation: chess.turn(),
        interactive: (c) => c === chess.turn() && !last,
        onUserMove: (m) => {
          try {
            const mv = chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
            last = mv.lan;
            tried.push(mv.lan);
            board.applyMove(mv);
            ($('#undo', root) as HTMLButtonElement).disabled = false;
            ($('#lock', root) as HTMLButtonElement).disabled = false;
            $('#mv', root).textContent = `You chose ${mv.san}. Lock it in, or undo and try another.`;
            return true;
          } catch {
            return false;
          }
        },
      });
      $('#undo', root).onclick = () => {
        chess.undo();
        board.render();
        last = '';
        ($('#undo', root) as HTMLButtonElement).disabled = true;
        ($('#lock', root) as HTMLButtonElement).disabled = true;
        $('#mv', root).textContent = 'Play your move on the board.';
      };
      $('#skip', root).onclick = () => go('report');
      $('#lock', root).onclick = async () => {
        ($('#lock', root) as HTMLButtonElement).disabled = true;
        const ms = Date.now() - t0;
        let loss: number | undefined;
        try {
          const best = await cachedEngine.analyse(pos.fen, { depth: cfg.get<number>('engine.hint.depth'), multiPv: 1 });
          const after = await cachedEngine.analyse(chess.fen(), {
            depth: cfg.get<number>('engine.hint.depth'),
            multiPv: 1,
          });
          const bestWin = winPctOf(best.lines[0]);
          const playedWin = chess.isCheckmate() ? 100 : 100 - winPctOf(after.lines[0]);
          loss = Math.max(0, bestWin - playedWin);
        } catch {
          /* engine unavailable: found-best stays unknown */
        }
        const text = ($('#tx', root) as HTMLTextAreaElement).value;
        const rubric = scoreThinkAloud({
          kind: pos.kind as never,
          opponentThreatPresent: pos.opponentThreat,
          chips: {
            opponentThreat: ($('#c1', root) as HTMLInputElement).checked,
            checksCapturesThreats: ($('#c2', root) as HTMLInputElement).checked,
            checkedReply: ($('#c3', root) as HTMLInputElement).checked,
          },
          text,
          triedMoves: tried,
          winPctLoss: loss,
          timeToMoveMs: ms,
        });
        rubrics.push(rubric);
        const skill = KIND_SKILL[pos.kind];
        const attempt = {
          at: Date.now(),
          context: 'think_aloud' as const,
          fen: pos.fen,
          playedUci: last,
          correct: rubric.foundBestMove === true,
          hints: 0,
          ms,
          skillTags: [skill],
        };
        const saved = await store.recordAttempt(attempt, evidenceFromAttempt({ ...attempt, id: '' }));
        await db.kv.put({
          key: `thinkaloud:${saved.id}`,
          value: { attemptId: saved.id, positionId: pos.id, rubric, text },
        });
        if (++i < think.positions.length) showOne();
        else {
          const sum = summariseThinkAloud(rubrics);
          await db.kv.put({ key: 'onboarding.thinkaloud', value: { at: Date.now(), ...sum } });
          $('#stepbody', root).innerHTML =
            `<section class="card"><h2>Here is what we noticed</h2><p>${esc(sum.note)}</p><p class="small muted">These are observations, not grades.</p><button class="btn primary" id="cont">Continue</button></section>`;
          $('#cont', root).onclick = () => go('report');
        }
      };
    };
    showOne();
  }

  // ---- 5. baseline report ----
  async function report() {
    const draw2 = async () => {
      const b = await metrics.baseline(10);
      const games = await store.gamesNewestFirst(1000);
      const running = activeJobs().length > 0;
      const imp = (await db.kv.get('onboarding.import'))?.value as
        { skipped: Record<string, number>; skipMessages: string[] } | undefined;
      const ta = (await db.kv.get('onboarding.thinkaloud'))?.value as { note: string } | undefined;
      const body = $('#stepbody', root);
      if (!b.ready) {
        body.innerHTML = `<section class="card"><h2>Baseline report</h2>
          <p>${running ? 'Still reviewing your games…' : `Mentor needs at least ${COLD_START_REVIEWED_GAMES} reviewed games to describe your habits (you have ${b.n}).`}</p>
          ${imp && Object.keys(imp.skipped).length ? `<p class="small muted">Skipped games: ${esc(imp.skipMessages.join(' '))}</p>` : ''}
          ${running || b.n >= COLD_START_REVIEWED_GAMES ? '' : '<p class="small muted">Puzzle calibration for newer players arrives with the training milestone. Until then, importing or playing a few more games is the fastest way to start.</p>'}
          ${ta ? `<div class="coach-card info"><h4>Think-aloud</h4><div class="small">${esc(ta.note)}</div></div>` : ''}
          <div class="row"><button class="btn primary" id="fin">${games.length ? 'Go to Home' : 'Finish for now'}</button></div></section>`;
      } else {
        const top = Object.entries(b.motifs)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3);
        const ph = Object.entries(b.firstMistakePhase).sort((x, y) => y[1] - x[1])[0];
        body.innerHTML = `<section class="card"><h2>Baseline report</h2><p class="muted">Based on your last ${b.n} reviewed games. Treat these as a starting point, not a verdict.</p>
          <div class="grid g3" style="gap:8px">
            <div class="card flat"><div class="small muted">Blunders per 40 moves</div><div style="font-size:26px;font-weight:800">${b.blundersPer40.toFixed(1)}</div></div>
            <div class="card flat"><div class="small muted">Missed threats per game</div><div style="font-size:26px;font-weight:800">${b.missedThreatsPerGame.toFixed(1)}</div></div>
            <div class="card flat"><div class="small muted">Accuracy</div><div style="font-size:26px;font-weight:800">${Math.round(b.accuracy)}%</div></div></div>
          <h3 style="margin-top:14px">What shows up most</h3>
          <div class="row" style="flex-wrap:wrap;gap:6px">${top.length ? top.map(([k, n]) => `<span class="chip">${esc(k.replace(/[._]/g, ' '))} · ${n}</span>`).join('') : '<span class="muted small">No repeating pattern yet.</span>'}</div>
          ${ph && ph[1] ? `<p class="small" style="margin-top:10px">Your first big mistake most often comes in the <b>${ph[0]}</b>.</p>` : ''}
          ${b.medianMoveMs !== undefined ? `<p class="small">Typical time per move: about ${Math.round(b.medianMoveMs / 1000)} seconds.</p>` : '<p class="small muted">No clock data in these games, so time use cannot be described yet.</p>'}
          ${ta ? `<div class="coach-card info"><h4>Think-aloud</h4><div class="small">${esc(ta.note)}</div></div>` : ''}
          <div class="row" style="margin-top:12px"><button class="btn primary" id="fin">Go to Home</button></div></section>`;
      }
      $('#fin', root).onclick = async () => {
        await profile.markOnboardingDone();
        location.hash = '#/home';
      };
    };
    await draw2();
    unsub.push(onJobUpdate(() => void draw2()) as () => void);
  }

  draw();
  void $$;
  void toast;
  return () => unsub.splice(0).forEach((f) => f());
}
