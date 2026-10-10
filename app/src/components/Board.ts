// Interactive animated chessboard. Owns DOM only; the caller owns the chess.js game.
// @ts-nocheck -- ported from the prototype; typing it is tracked in docs/DECISIONS.md (T1).
import { Chess } from 'chess.js';

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';

export class Board {
  /**
   * @param {HTMLElement} el container
   * @param {object} o { chess, orientation, interactive:(color)=>bool, onUserMove:({from,to,promotion})=>boolean,
   *                     coords, animate, highlights }
   */
  constructor(el, o = {}) {
    this.el = el;
    this.chess = o.chess || new Chess();
    this.orientation = o.orientation || 'w';
    this.interactive = o.interactive || (() => true);
    this.onUserMove = o.onUserMove || (() => false);
    this.coords = o.coords !== false;
    this.animate = o.animate !== false;
    this.lastMove = null;
    this.marks = {}; // square -> {text, cls}
    this.arrows = [];
    this.userArrows = [];
    this.selected = null;
    this.pieces = new Map(); // square -> element
    this.build();
    this.render();
  }

  build() {
    this.el.classList.add('board');
    this.el.innerHTML = `
      <div class="b-squares"></div><div class="b-hl"></div><div class="b-dots"></div>
      <div class="b-pieces"></div><svg class="b-arrows" viewBox="0 0 800 800"></svg>
      <div class="b-coords"></div><div class="b-promo" hidden></div>`;
    this.$sq = this.el.querySelector('.b-squares');
    this.$hl = this.el.querySelector('.b-hl');
    this.$dots = this.el.querySelector('.b-dots');
    this.$pieces = this.el.querySelector('.b-pieces');
    this.$arrows = this.el.querySelector('.b-arrows');
    this.$coords = this.el.querySelector('.b-coords');
    this.$promo = this.el.querySelector('.b-promo');
    this.drawSquares();
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // --- geometry -----------------------------------------------------------
  xy(sq) {
    const f = FILES.indexOf(sq[0]),
      r = 8 - +sq[1];
    return this.orientation === 'w' ? [f, r] : [7 - f, 7 - r];
  }
  sqAt(clientX, clientY) {
    const b = this.el.getBoundingClientRect();
    let f = Math.floor(((clientX - b.left) / b.width) * 8);
    let r = Math.floor(((clientY - b.top) / b.height) * 8);
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    if (this.orientation === 'b') {
      f = 7 - f;
      r = 7 - r;
    }
    return FILES[f] + (8 - r);
  }
  place(el, sq) {
    const [x, y] = this.xy(sq);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  }

  drawSquares() {
    let h = '';
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) h += `<i class="${(r + f) % 2 ? 'dk' : 'lt'}"></i>`;
    this.$sq.innerHTML = h;
    let c = '';
    for (let i = 0; i < 8; i++) {
      const rank = this.orientation === 'w' ? 8 - i : i + 1;
      const file = this.orientation === 'w' ? FILES[i] : FILES[7 - i];
      c += `<span class="cr ${i % 2 ? 'dk' : 'lt'}" style="top:${i * 12.5}%">${rank}</span>`;
      c += `<span class="cf ${i % 2 ? 'lt' : 'dk'}" style="left:${i * 12.5}%">${file}</span>`;
    }
    // coordinate colours alternate against square colour
    this.$coords.innerHTML = this.coords ? c : '';
  }

  setOrientation(o) {
    this.orientation = o;
    this.drawSquares();
    this.render(false);
  }
  flip() {
    this.setOrientation(this.orientation === 'w' ? 'b' : 'w');
  }

  // --- rendering ----------------------------------------------------------
  pieceEl(p) {
    const e = document.createElement('div');
    e.className = `piece ${p.color} t-${p.type}`;
    e.dataset.type = p.type;
    e.dataset.color = p.color;
    e.textContent = GLYPH[p.type] + '︎';
    return e;
  }

  render(animated = false) {
    // full redraw (used on load, undo, orientation change)
    this.$pieces.innerHTML = '';
    this.pieces.clear();
    for (const row of this.chess.board())
      for (const p of row) {
        if (!p) continue;
        const e = this.pieceEl(p);
        this.place(e, p.square);
        this.$pieces.appendChild(e);
        this.pieces.set(p.square, e);
      }
    this.drawOverlays();
  }

  /** Animate a move that was already played on this.chess (move = chess.js verbose move). */
  applyMove(m, { animate = this.animate } = {}) {
    const moving = this.pieces.get(m.from);
    if (!moving) {
      this.lastMove = m;
      this.render();
      return;
    }
    // captured piece (en passant captures on a different square)
    const capSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
    const captured = m.captured ? this.pieces.get(capSq) : null;
    if (captured) {
      this.pieces.delete(capSq);
      captured.classList.add('captured');
      setTimeout(() => captured.remove(), animate ? 260 : 0);
    }
    this.pieces.delete(m.from);
    moving.classList.toggle('no-anim', !animate);
    moving.style.zIndex = 5;
    this.place(moving, m.to);
    this.pieces.set(m.to, moving);
    // castling rook
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1];
      const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
      const rook = this.pieces.get(rf + rank);
      if (rook) {
        rook.classList.toggle('no-anim', !animate);
        this.place(rook, rt + rank);
        this.pieces.delete(rf + rank);
        this.pieces.set(rt + rank, rook);
      }
    }
    if (m.promotion) {
      setTimeout(
        () => {
          moving.textContent = GLYPH[m.promotion] + '︎';
          moving.className = `piece ${m.color} t-${m.promotion} promoted`;
        },
        animate ? 150 : 0,
      );
    }
    setTimeout(
      () => {
        moving.style.zIndex = '';
      },
      animate ? 220 : 0,
    );
    this.lastMove = m;
    this.selected = null;
    this.drawOverlays();
  }

  // --- overlays -----------------------------------------------------------
  drawOverlays() {
    let hl = '';
    const sqStyle = (sq) => {
      const [x, y] = this.xy(sq);
      return `left:${x * 12.5}%;top:${y * 12.5}%`;
    };
    if (this.lastMove)
      for (const s of [this.lastMove.from, this.lastMove.to]) hl += `<b class="hl last" style="${sqStyle(s)}"></b>`;
    if (this.selected) hl += `<b class="hl sel" style="${sqStyle(this.selected)}"></b>`;
    if (this.chess.inCheck()) {
      const king = this.chess
        .board()
        .flat()
        .find((p) => p && p.type === 'k' && p.color === this.chess.turn());
      if (king) hl += `<b class="hl check" style="${sqStyle(king.square)}"></b>`;
    }
    for (const [sq, mk] of Object.entries(this.marks)) {
      const [x, y] = this.xy(sq);
      hl += `<b class="hl ${mk.cls || ''}" style="${sqStyle(sq)}"><em class="badge" style="${mk.badgeColor ? 'background:' + mk.badgeColor : ''}">${mk.text || ''}</em></b>`;
    }
    this.$hl.innerHTML = hl;
    // legal move dots
    let d = '';
    if (this.selected) {
      for (const m of this.chess.moves({ square: this.selected, verbose: true })) {
        d += `<b class="dot ${m.captured ? 'cap' : ''}" style="${sqStyle(m.to)}"></b>`;
      }
    }
    this.$dots.innerHTML = d;
    this.drawArrows();
  }

  setMarks(marks) {
    this.marks = marks || {};
    this.drawOverlays();
  }
  setArrows(arrows) {
    this.arrows = arrows || [];
    this.drawArrows();
  }
  setLastMove(m) {
    this.lastMove = m;
    this.drawOverlays();
  }

  drawArrows() {
    const all = [...this.arrows, ...this.userArrows];
    const c = (sq) => {
      const [x, y] = this.xy(sq);
      return [x * 100 + 50, y * 100 + 50];
    };
    let s = '';
    const colors = new Set(all.map((a) => a[2] || 'green'));
    s +=
      '<defs>' +
      [...colors]
        .map(
          (k) =>
            `<marker id="ah-${k}" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" class="ar-${k}"/></marker>`,
        )
        .join('') +
      '</defs>';
    for (const [a, b, k = 'green'] of all) {
      const [x1, y1] = c(a),
        [x2, y2] = c(b);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const sx = x2 - ((x2 - x1) / len) * 28,
        sy = y2 - ((y2 - y1) / len) * 28;
      if (a === b) {
        s += `<circle cx="${x1}" cy="${y1}" r="44" class="ar-ring ar-${k}-s" />`;
        continue;
      }
      s += `<line x1="${x1}" y1="${y1}" x2="${sx}" y2="${sy}" class="ar-line ar-${k}-s" marker-end="url(#ah-${k})"/>`;
    }
    this.$arrows.innerHTML = s;
  }

  // --- input --------------------------------------------------------------
  onDown(e) {
    if (e.target.closest('.b-promo')) return;
    const sq = this.sqAt(e.clientX, e.clientY);
    if (!sq) return;
    if (e.button === 2) {
      this.startArrow(e, sq);
      return;
    }
    if (e.button !== 0) return;
    this.userArrows = [];
    this.drawArrows();
    const piece = this.chess.get(sq);
    const mine = piece && piece.color === this.chess.turn() && this.interactive(piece.color);
    if (this.selected && this.selected !== sq) {
      if (this.tryMove(this.selected, sq)) return;
    }
    if (mine) {
      this.selected = sq;
      this.drawOverlays();
      this.startDrag(e, sq);
    } else {
      this.selected = null;
      this.drawOverlays();
    }
  }

  startDrag(e, from) {
    const el = this.pieces.get(from);
    if (!el) return;
    const rect = this.el.getBoundingClientRect();
    const size = rect.width / 8;
    let moved = false;
    const startX = e.clientX,
      startY = e.clientY;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      if (!moved) {
        moved = true;
        el.classList.add('dragging', 'no-anim');
      }
      const x = ev.clientX - rect.left - size / 2,
        y = ev.clientY - rect.top - size / 2;
      el.style.transform = `translate(${(x / size) * 100}%, ${(y / size) * 100}%)`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      el.classList.remove('dragging');
      const to = this.sqAt(ev.clientX, ev.clientY);
      const ok = to && to !== from && this.tryMove(from, to, true);
      if (!ok) {
        el.classList.remove('no-anim');
        this.place(el, from);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  startArrow(e, from) {
    const move = () => {};
    const up = (ev) => {
      window.removeEventListener('pointerup', up);
      const to = this.sqAt(ev.clientX, ev.clientY);
      if (!to) return;
      const i = this.userArrows.findIndex((a) => a[0] === from && a[1] === to);
      if (i >= 0) this.userArrows.splice(i, 1);
      else this.userArrows.push([from, to, ev.shiftKey ? 'red' : 'green']);
      this.drawArrows();
    };
    window.addEventListener('pointerup', up);
  }

  /** returns true if a move was started (even if waiting on promotion choice) */
  tryMove(from, to, dropped = false) {
    const moves = this.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!moves.length) return false;
    if (moves[0].promotion) {
      this.askPromotion(from, to, moves[0].color, dropped);
      return true;
    }
    const ok = this.onUserMove({ from, to });
    if (ok === false) return false;
    const el = this.pieces.get(from);
    if (dropped && el) el.classList.remove('no-anim');
    return true;
  }

  askPromotion(from, to, color, dropped) {
    const [x] = this.xy(to);
    const down = this.xy(to)[1] === 0; // promotion at top edge => list goes downward
    this.$promo.hidden = false;
    this.$promo.innerHTML = ['q', 'n', 'r', 'b']
      .map((t) => `<button data-p="${t}" class="piece ${color}" style="left:${x * 12.5}%">${GLYPH[t]}\uFE0E</button>`)
      .join('');
    // vertical stack from edge
    [...this.$promo.children].forEach((b, i) => {
      b.style.top = `${down ? i * 12.5 : (7 - i) * 12.5}%`;
    });
    const cancel = (ev) => {
      if (ev.target.closest('.b-promo button')) return;
      this.$promo.hidden = true;
      document.removeEventListener('pointerdown', cancel, true);
      this.render();
    };
    setTimeout(() => document.addEventListener('pointerdown', cancel, true), 0);
    this.$promo.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      this.$promo.hidden = true;
      document.removeEventListener('pointerdown', cancel, true);
      const ok = this.onUserMove({ from, to, promotion: b.dataset.p });
      if (ok === false) this.render();
    };
  }
}

export const glyph = (t) => GLYPH[t] + '︎';
