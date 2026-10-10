// Lesson viewer (docs/backend/06 §4.1): text / board / interactive / check steps. Ported from ui/js/views/learn.js.
import { Chess } from 'chess.js';
import { Board } from './BoardApi';
import type { Lesson, Step } from '../core/content/validate';
import { esc } from '../shell/dom';
import { confetti, sound } from '../shell/ui';

export function mountLesson(root: HTMLElement, lesson: Lesson, o: { onDone?: () => void; backHref?: string } = {}) {
  let s = 0;
  let solved = false;
  let checked = false;
  const total = lesson.steps.length;

  const paint = () => {
    const st: Step = lesson.steps[s];
    const needsAction = (st.type === 'interactive' && !solved) || (st.type === 'check' && !checked);
    const fen = st.type === 'board' || st.type === 'interactive' ? st.fen : undefined;
    root.innerHTML = `
    <div class="page-h"><div>${o.backHref ? `<a href="${o.backHref}" class="muted small">← Back</a>` : ''}<h1>${esc(lesson.title)}</h1></div><div class="row"><span class="chip">${s + 1} / ${total}</span></div></div>
    <div class="bar" style="max-width:640px;margin-bottom:16px"><i style="width:${((s + 1) / total) * 100}%"></i></div>
    <div class="game" style="grid-template-columns:${fen ? 'auto 1fr' : '1fr'}">${fen ? '<div id="bd" class="mid" style="--bs:min(520px,86vw)"></div>' : ''}
      <div class="card" style="max-width:520px"><h2>${esc(st.type === 'text' ? st.title : st.type === 'check' ? 'Quick check' : st.type === 'board' ? 'Look at the board' : 'Your turn')}</h2>
        ${st.type === 'text' || st.type === 'board' ? `<p>${esc(st.body)}</p>` : st.type === 'interactive' ? '<p>Drag or click the piece, then its target square.</p>' : `<p><b>${esc(st.q)}</b></p>${st.options.map((op, i) => `<label style="display:block;margin:6px 0"><input type="radio" name="opt" value="${i}"> ${esc(op)}</label>`).join('')}<button class="btn small" id="chk">Check my answer</button>`}
        <div id="fb" aria-live="polite"></div>
        <div class="row" style="margin-top:16px"><button class="btn" id="prev" ${s === 0 ? 'disabled' : ''}>Back</button><button class="btn primary" id="next" ${needsAction ? 'disabled' : ''}>${s === total - 1 ? 'Finish lesson' : 'Next'}</button></div></div></div>`;
    const fb = root.querySelector('#fb') as HTMLElement;
    const next = root.querySelector('#next') as HTMLButtonElement;
    if (fen && (st.type === 'board' || st.type === 'interactive')) {
      const chess = new Chess(fen);
      const board = new Board(root.querySelector('#bd') as HTMLElement, {
        chess,
        orientation: chess.turn(),
        interactive: () => st.type === 'interactive' && !solved,
        onUserMove: (mv) => {
          if (st.type !== 'interactive') return false;
          const m = chess
            .moves({ verbose: true })
            .find(
              (x) => x.from === mv.from && x.to === mv.to && (!x.promotion || x.promotion === (mv.promotion ?? 'q')),
            );
          if (!m) return false;
          if (!st.solution.includes(m.lan)) {
            sound('bad');
            fb.innerHTML = `<div class="coach-card bad"><h4>Not that one</h4><div class="small">${esc(st.wrong.default)}</div></div>`;
            return false;
          }
          chess.move(m);
          board.applyMove(m);
          solved = true;
          sound('good');
          confetti(25);
          fb.innerHTML = `<div class="coach-card"><h4>✅ ${esc(m.san)}</h4><div class="small">${esc(st.onSuccess)}</div></div>`;
          next.disabled = false;
          return true;
        },
      });
      if (st.type === 'board' && st.arrows) board.setArrows(st.arrows as never);
    }
    const chkBtn = root.querySelector('#chk') as HTMLButtonElement | null;
    if (chkBtn && st.type === 'check')
      chkBtn.onclick = () => {
        const v = root.querySelector<HTMLInputElement>('input[name=opt]:checked');
        if (!v) return;
        const ok = Number(v.value) === st.answer;
        checked = ok;
        fb.innerHTML = `<div class="coach-card ${ok ? '' : 'bad'}"><h4>${ok ? '✅ Right' : 'Not quite'}</h4><div class="small">${ok ? esc(st.why) : 'Think about it once more, then try again.'}</div></div>`;
        next.disabled = !ok;
      };
    (root.querySelector('#prev') as HTMLElement).onclick = () => {
      s--;
      solved = checked = false;
      paint();
    };
    next.onclick = () => {
      if (s === total - 1) {
        o.onDone?.();
        return;
      }
      s++;
      solved = checked = false;
      paint();
    };
  };
  paint();
}
