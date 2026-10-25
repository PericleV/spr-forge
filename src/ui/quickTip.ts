// The hints of the app: every `title` shown in a tooltip of the app's own (in place of the browser's: slow, plain,
// unreadable when long), after a short wait, beside the element under the mouse (or reached with the keyboard). Its
// first sentence as its head, the rest under it, smaller (a list of choices: a line each); a few lines of text kept
// apart. The title is moved to data-tip the first time (so the browser shows nothing); an element whose title changes
// gives it again, moved again.
const WAIT = 350;
let box: HTMLDivElement | null = null;
let timer = 0;
let shownFor: Element | null = null;

// the element whose hint is meant: the nearest with a title (or one already moved)
function tipOf(t: EventTarget | null): HTMLElement | null {
  if (!(t instanceof Element)) return null;
  const el = t.closest('[title], [data-tip]');
  if (!(el instanceof HTMLElement)) return null;
  const now = el.getAttribute('title');
  if (now !== null) {
    if (now.trim()) el.dataset.tip = now;
    else delete el.dataset.tip;
    el.removeAttribute('title');
  }
  return el.dataset.tip ? el : null;
}

// its head (the first sentence, when the text is long) and the rest
function parts(text: string): { head: string; rest: string[] } {
  const paras = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const first = paras[0] ?? '';
  if (first.length > 110) {
    // a list of choices (“Spectrum: …; PSD: …; …”): a line each
    const items = first.split(/;\s+(?=[^;]{1,40}:\s)/);
    if (items.length >= 3) return { head: items[0], rest: [...items.slice(1), ...paras.slice(1)] };
    // else its first sentence as the head
    const m = /^(.{24,}?[.!?])\s+(\S.*)$/s.exec(first);
    if (m) return { head: m[1], rest: [m[2], ...paras.slice(1)] };
  }
  return { head: first, rest: paras.slice(1) };
}

function show(el: HTMLElement) {
  const text = el.dataset.tip;
  if (!text || !el.isConnected) return;
  box ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'quick-tip', role: 'tooltip' });
  const { head, rest } = parts(text);
  box.replaceChildren();
  const h = document.createElement('div');
  h.className = 'quick-tip-head';
  h.textContent = head;
  box.appendChild(h);
  for (const r of rest) {
    const p = document.createElement('div');
    p.className = 'quick-tip-more';
    p.textContent = r;
    box.appendChild(p);
  }
  // below the element, else above it; inside the window
  box.style.left = '0px';
  box.style.top = '0px';
  box.classList.add('on');
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const x = Math.min(Math.max(6, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 6);
  const below = r.bottom + 6 + b.height < window.innerHeight;
  box.style.left = `${Math.round(x)}px`;
  box.style.top = `${Math.round(below ? r.bottom + 6 : Math.max(6, r.top - b.height - 6))}px`;
  shownFor = el;
}
function hide() {
  window.clearTimeout(timer);
  box?.classList.remove('on');
  shownFor = null;
}
function soon(el: HTMLElement | null) {
  window.clearTimeout(timer);
  if (!el) return hide();
  if (el === shownFor) return;
  hide();
  timer = window.setTimeout(() => show(el), WAIT);
}

export function installQuickTips() {
  document.addEventListener('pointerover', (e) => soon(tipOf(e.target)), true);
  document.addEventListener(
    'pointerout',
    (e) => {
      // (left for an element that is not inside the one with the hint)
      const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest('[data-tip], [title]') : null;
      if (!to) hide();
    },
    true,
  );
  document.addEventListener('focusin', (e) => {
    const el = tipOf(e.target);
    if (el && (e.target as HTMLElement).matches?.(':focus-visible')) soon(el);
  });
  document.addEventListener('focusout', hide);
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'scroll'] as const) document.addEventListener(ev, hide, { capture: true, passive: true });
}
