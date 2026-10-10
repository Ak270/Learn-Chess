// Openings (docs/backend/08 §4, docs/backend/06 §3): repertoire drills with a "why", FSRS scheduling, left-book detection.
import { Chess } from 'chess.js';
import { db, srs, store } from '../app';
import { Board } from '../components/BoardApi';
import { cardsFor, leftBook, REPERTOIRES, steps, type LeftBook, type Repertoire } from '../core/openings/repertoire';
import { ulid } from '../data/ulid';
import { $, $$, esc, toast } from '../shell/dom';
import { confetti, sound } from '../shell/ui';
import type { Card } from '../types/model';

const lineId = (c: Card) => c.sourceRef?.lineId ?? '';

export async function render(root: HTMLElement, ctx: { args: string[] }) {
  const all = (await db.cards.filter((c) => c.kind === 'opening').toArray()) as Card[];
  if (ctx.args[0]) return drill(root, ctx.args[0], all);
  const now = Date.now();
  const games = await store.gamesNewestFirst(200);
  const reports: { g: (typeof games)[number]; lb: LeftBook }[] = [];
  for (const g of games) {
    try {
      const c = new Chess();
      c.loadPgn(g.pgn);
      const lb = leftBook(c.history(), g.playerColor);
      if (lb) reports.push({ g, lb });
    } catch {
      /* unreadable game: skip */
    }
  }
  const dev = new Map<string, { lb: LeftBook; n: number; example: string }>();
  for (const { g, lb } of reports) {
    const k = `${lb.repertoireId}:${lb.leftAt ?? 'o' + lb.oppDeviationAt}:${lb.played}`;
    const cur = dev.get(k);
    dev.set(k, { lb, n: (cur?.n ?? 0) + 1, example: cur?.example ?? g.id });
  }
  root.innerHTML = `
  <div class="page-h"><div><h1>Openings</h1><p class="muted">Ideas first, lines second. Every move has a reason, and you are asked for the move before you see it.</p></div></div>
  <p class="small muted" style="max-width:760px">These three starter lines come from what you already play. They are proposals: swap any of them whenever you like. Lines are common theory with Mentor's own wording and are marked "needs your review" until you say so.</p>
  <div class="grid g3 stagger">${REPERTOIRES.map((r) => {
    const cs = all.filter((c) => lineId(c).startsWith(r.id + ':'));
    const due = cs.filter((c) => c.state !== 'suspended' && c.srs.dueAt <= now).length;
    const mastered = cs.filter((c) => ((c.srs.fsrs as { reps?: number } | undefined)?.reps ?? 0) >= 2).length;
    const pct = cs.length ? Math.round((mastered / cs.length) * 100) : 0;
    return `<section class="card"><div class="row"><b class="grow">${esc(r.name)}</b><span class="chip ${r.side === 'w' ? '' : 'blue'}">${r.side === 'w' ? 'White' : 'Black'}</span></div>
      <p class="small muted" style="margin:6px 0">${esc(r.ideas[0].title)}: ${esc(r.ideas[0].text)}</p>
      <div class="bar" style="margin:8px 0"><i style="width:${pct}%"></i></div><div class="small muted">${cs.length ? `${due} due · ${pct}% steady` : 'No cards yet'}</div>
      <div class="row" style="margin-top:8px">${cs.length ? `<a class="btn primary small" href="#/openings/${r.id}">${due ? `Drill ${due} due` : 'Open line'}</a>` : `<button class="btn primary small" data-add="${r.id}">Add to my cards</button>`}</div></section>`;
  }).join('')}</div>
  <section class="card" style="margin-top:16px"><h2>Where you leave your book</h2>${
    dev.size
      ? [...dev.values()]
          .map(({ lb, n }) => {
            const rep = REPERTOIRES.find((r) => r.id === lb.repertoireId)!;
            return `<div class="coach-card info"><div class="small">${lb.leftAt !== undefined ? `Left your line at move ${Math.floor(lb.leftAt / 2) + 1} in <b>${n}</b> game${n > 1 ? 's' : ''} (you played ${esc(lb.played ?? '')}, the line has ${esc(lb.expected ?? '')}).` : `Your opponent left the line at move ${Math.floor((lb.oppDeviationAt ?? 0) / 2) + 1} in <b>${n}</b> game${n > 1 ? 's' : ''} (${esc(lb.played ?? '')}).`} <span class="muted">${esc(rep.name)}</span></div>${lb.leftAt !== undefined ? `<button class="btn small" data-mk="${lb.repertoireId}:${lb.leftAt}">Make a card for that position</button>` : ''}</div>`;
          })
          .join('')
      : '<p class="small muted">Import a few games and Mentor will show where they leave these lines.</p>'
  }</section>`;
  $$('[data-add]', root).forEach(
    (b) =>
      (b.onclick = async () => {
        const r = REPERTOIRES.find((x) => x.id === b.dataset.add)!;
        for (const c of cardsFor(r, Date.now())) await db.cards.put({ ...c, id: ulid() });
        toast('Cards added. A few are introduced each day.');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }),
  );
  $$('[data-mk]', root).forEach(
    (b) =>
      (b.onclick = async () => {
        const [rid, idx] = b.dataset.mk!.split(':');
        const r = REPERTOIRES.find((x) => x.id === rid)!;
        const s = steps(r)[+idx];
        const exists = all.some((c) => lineId(c) === `${rid}:${idx}`);
        if (exists) return toast('That position is already a card.');
        const [card] = cardsFor(r, Date.now()).filter((c) => c.sourceRef?.lineId === `${rid}:${s.idx}`);
        await db.cards.put({ ...card, id: ulid() });
        toast('Card made. Its reason is in the card.');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }),
  );
}

async function drill(root: HTMLElement, repId: string, all: Card[]) {
  const rep = REPERTOIRES.find((r) => r.id === repId) as Repertoire | undefined;
  if (!rep) {
    root.innerHTML = '<div class="page-h"><div><h1>Line not found</h1><a href="#/openings">Back</a></div></div>';
    return;
  }
  const now = Date.now();
  const due = all
    .filter((c) => lineId(c).startsWith(rep.id + ':') && c.state !== 'suspended' && c.srs.dueAt <= now)
    .sort((a, b) => a.srs.dueAt - b.srs.dueAt);
  if (!due.length) {
    root.innerHTML = `<div class="page-h"><div><a href="#/openings" class="muted small">← Openings</a><h1>${esc(rep.name)}</h1></div></div><section class="card"><h2>Nothing due</h2><p class="muted">Come back when a card is due. Cards return on a schedule that stretches as you remember them.</p>
      <h3>The line</h3><p class="small">${steps(rep)
        .map((s, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${s.node.san}`)
        .join(
          ' ',
        )}</p>${rep.ideas.map((i) => `<div class="coach-card info"><h4>${esc(i.title)}</h4><div class="small">${esc(i.text)}</div></div>`).join('')}</section>`;
    return;
  }
  let i = 0;
  const show = () => {
    if (i >= due.length) {
      confetti(40);
      location.hash = '#/openings';
      return;
    }
    const c = due[i];
    const st = steps(rep)[+lineId(c).split(':')[1]];
    const chess = new Chess(c.fen!);
    let tries = 0;
    let done = false;
    root.innerHTML = `<div class="page-h"><div><a href="#/openings" class="muted small">← Openings</a><h1>${esc(rep.name)}</h1></div><span class="chip">${i + 1} / ${due.length}</span></div>
      <div class="game" style="grid-template-columns:auto 1fr"><div id="bd" class="mid" style="--bs:min(520px,86vw)"></div>
      <div class="card" style="max-width:480px"><h2>What do you play?</h2><p class="muted small">${esc(chess.turn() === 'w' ? 'White' : 'Black')} to move. Think about the idea before you move.</p><div id="fb" aria-live="polite"></div><div id="grade"></div></div></div>`;
    const board = new Board($('#bd', root), {
      chess,
      orientation: rep.side,
      interactive: () => !done,
      onUserMove: (mv) => {
        const m = chess
          .moves({ verbose: true })
          .find((x) => x.from === mv.from && x.to === mv.to && (!x.promotion || x.promotion === (mv.promotion ?? 'q')));
        if (!m || done) return false;
        if (m.lan === st.uci) {
          chess.move(m);
          board.applyMove(m);
          done = true;
          sound('good');
          $('#fb', root).innerHTML =
            `<div class="coach-card"><h4>${esc(m.san)}</h4><div class="small">${esc(st.node.why)}</div></div>`;
          $('#grade', root).innerHTML =
            `<p class="small muted" style="margin-top:8px">How did that feel?</p><div class="row" role="group" aria-label="Grade"><button class="btn" data-g="hard">Hard</button><button class="btn" data-g="good">Good</button><button class="btn" data-g="easy">Easy</button></div>`;
          $$('[data-g]', root).forEach(
            (b) =>
              (b.onclick = async () => {
                const g = b.dataset.g!;
                await srs.grade(
                  c.id,
                  { correct: true, hints: g === 'hard' ? 1 : 0, ms: g === 'easy' ? 3000 : 12000 },
                  { context: 'drill', confidence: g === 'easy' ? 'sure' : 'unsure', pressedEasy: g === 'easy' },
                );
                i++;
                show();
              }),
          );
          return true;
        }
        tries++;
        sound('bad');
        chess.move(m);
        board.applyMove(m);
        setTimeout(() => {
          chess.undo();
          board.render();
        }, 600);
        if (tries >= 2) {
          done = true;
          board.setArrows([[st.uci.slice(0, 2), st.uci.slice(2, 4), 'green']]);
          $('#fb', root).innerHTML =
            `<div class="coach-card bad"><h4>The move was ${esc(st.node.san)}</h4><div class="small">${esc(st.node.why)}</div></div>`;
          $('#grade', root).innerHTML =
            `<button class="btn primary" id="again" style="margin-top:8px">Got it, next</button>`;
          $('#again', root).onclick = async () => {
            await srs.grade(c.id, { correct: false, hints: 0, ms: 15000 }, { context: 'drill' });
            i++;
            show();
          };
        } else
          $('#fb', root).innerHTML =
            `<div class="coach-card bad"><h4>Not that one</h4><div class="small">Think about the idea: ${esc(rep.ideas[0].text)}</div></div>`;
        return true;
      },
    });
  };
  show();
}
