export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  [...root.querySelectorAll(sel)] as T[];
export const esc = (t: unknown) =>
  String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function toast(msg: string, kind = '', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function modal(
  html: string,
  {
    onMount,
    dismissable = true,
  }: { onMount?: (bg: HTMLElement, close: () => void) => void; dismissable?: boolean } = {},
) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => bg.remove();
  if (dismissable)
    bg.addEventListener('pointerdown', (e) => {
      if (e.target === bg) close();
    });
  $('#modal-root').appendChild(bg);
  onMount?.(bg, close);
  return close;
}
