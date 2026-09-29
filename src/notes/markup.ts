// Formatted notes: a small Markdown subset, stored as plain text (so it exports to .md unchanged and old notes stay as
// they were). **bold**, *italic*, ~~strikethrough~~, <u>underline</u>, <span style="color:#rrggbb">colour</span>, \*
// (a literal marker), and "# " … "###### " headings at a line start. "_" is never a marker: notes are full of n_o, θ_c.
// Emphasis markers follow the Markdown rule: an opening one is followed by a non-space, a closing one preceded by one,
// so "2 * 3 * 4" stays as it is. Pure (no DOM): the note view, the Combine notes node and the checks use it.

// The formatting (toolbar, formatted view, markers read in exports) is hidden for now: notes are
// plain text, exported as written. The code stays, switched on by this flag.
export const SHOW_FORMATTING = false;

export type Style = { b?: boolean; i?: boolean; s?: boolean; u?: boolean; color?: string };
export type Span = { text: string; style: Style };
export type Line = { heading: number; spans: Span[] }; // heading: 0, or the level 1–6

type Tok =
  | { k: 'text'; v: string }
  | { k: 'b' | 'i' | 's'; v: string; open: boolean; close: boolean }
  | { k: 'uo' | 'uc' | 'cc'; v: string }
  | { k: 'co'; v: string; color: string };

const COLOR_OPEN = /^<span style="color:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*;?">/;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ k: 'text', v: text });
    text = '';
  };
  const space = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    if (src[i] === '\\' && i + 1 < src.length && '*~<\\#'.includes(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    // "***": bold and italic together — opening as ** then *, closing as * then ** (so they nest)
    if (rest.startsWith('***') && src[i + 3] !== '*') {
      flush();
      const [before, after] = [src[i - 1], src[i + 3]];
      const [open, close] = [!space(after), !space(before)];
      const parts = close && !open ? ['*', '**'] : ['**', '*'];
      for (const p of parts) out.push({ k: p === '**' ? 'b' : 'i', v: p, open, close });
      i += 3;
      continue;
    }
    const delim = rest.startsWith('**') ? '**' : rest.startsWith('~~') ? '~~' : src[i] === '*' ? '*' : '';
    if (delim) {
      flush();
      const before = src[i - 1];
      const after = src[i + delim.length];
      out.push({ k: delim === '**' ? 'b' : delim === '~~' ? 's' : 'i', v: delim, open: !space(after), close: !space(before) });
      i += delim.length;
      continue;
    }
    const tag = rest.startsWith('<u>') ? '<u>' : rest.startsWith('</u>') ? '</u>' : rest.startsWith('</span>') ? '</span>' : '';
    if (tag) {
      flush();
      out.push({ k: tag === '<u>' ? 'uo' : tag === '</u>' ? 'uc' : 'cc', v: tag });
      i += tag.length;
      continue;
    }
    const m = COLOR_OPEN.exec(rest);
    if (m) {
      flush();
      out.push({ k: 'co', v: m[0], color: m[1] });
      i += m[0].length;
      continue;
    }
    text += src[i];
    i++;
  }
  flush();
  return out;
}

// Inline spans of one piece of text: markers paired, unpaired ones kept as text.
export function parseInline(src: string): Span[] {
  const toks = tokenize(src);
  // the role of each paired marker; an opener left inside a closed pair without its own closer stays text
  const role = new Map<number, 'open' | 'close'>();
  const stack: number[] = [];
  const closeAt = (j: number, want: Tok['k']) => {
    const at = stack.map((q) => toks[q].k).lastIndexOf(want);
    if (at < 0) return false;
    role.set(stack[at], 'open');
    role.set(j, 'close');
    stack.length = at;
    return true;
  };
  toks.forEach((t, j) => {
    if (t.k === 'b' || t.k === 'i' || t.k === 's') {
      if (!(t.close && closeAt(j, t.k)) && t.open) stack.push(j);
    } else if (t.k === 'uo' || t.k === 'co') stack.push(j);
    else if (t.k === 'uc') closeAt(j, 'uo');
    else if (t.k === 'cc') closeAt(j, 'co');
  });
  const spans: Span[] = [];
  const cnt = { b: 0, i: 0, s: 0, u: 0 };
  const colors: string[] = [];
  const push = (v: string) => {
    const style: Style = {};
    if (cnt.b) style.b = true;
    if (cnt.i) style.i = true;
    if (cnt.s) style.s = true;
    if (cnt.u) style.u = true;
    if (colors.length) style.color = colors[colors.length - 1];
    const last = spans[spans.length - 1];
    if (last && JSON.stringify(last.style) === JSON.stringify(style)) last.text += v;
    else spans.push({ text: v, style });
  };
  toks.forEach((t, j) => {
    const r = role.get(j);
    if (t.k === 'text' || !r) return push(t.v);
    const d = r === 'open' ? 1 : -1;
    if (t.k === 'b' || t.k === 'i' || t.k === 's') cnt[t.k] += d;
    else if (t.k === 'uo' || t.k === 'uc') cnt.u += d;
    else if (t.k === 'co') colors.push(t.color);
    else colors.pop();
  });
  return spans.filter((s) => s.text);
}

// The lines of a note: a heading marker at a line start, then the inline spans.
export function parseNote(src: string): Line[] {
  return src.split('\n').map((line) => {
    const h = /^(#{1,6}) (.*)$/.exec(line);
    return h ? { heading: h[1].length, spans: parseInline(h[2]) } : { heading: 0, spans: parseInline(line) };
  });
}

// Plain text: the markers removed (headings keep their text).
export const toPlain = (src: string): string =>
  parseNote(src)
    .map((l) => l.spans.map((s) => s.text).join(''))
    .join('\n');

// ---- the toolbar: a marker around the selection (or removed if the selection is already wrapped in it) ----

export type Mark = 'b' | 'i' | 's' | 'u' | 'color';
const MARKERS: Record<Exclude<Mark, 'color'>, [string, string]> = { b: ['**', '**'], i: ['*', '*'], s: ['~~', '~~'], u: ['<u>', '</u>'] };

export function applyMark(text: string, start: number, end: number, mark: Mark, color = '#c00000'): { text: string; start: number; end: number } {
  // spaces at the edges of the selection stay outside (a marker next to a space would not pair)
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  const [open, close] = mark === 'color' ? [`<span style="color:${color}">`, '</span>'] : MARKERS[mark];
  // already wrapped (a colour: any colour): unwrap — or, for a colour, change it
  const before = text.slice(0, start);
  const after = text.slice(end);
  const colorBefore = /<span style="color:\s*[^"]*">$/.exec(before);
  if (mark === 'color' && colorBefore && after.startsWith('</span>')) {
    const inner = text.slice(start, end);
    const b = before.slice(0, colorBefore.index);
    const same = colorBefore[0] === open;
    const t = same ? b + inner + after.slice(7) : b + open + inner + after;
    const s = same ? b.length : b.length + open.length;
    return { text: t, start: s, end: s + inner.length };
  }
  if (mark !== 'color' && before.endsWith(open) && after.startsWith(close) && !(mark === 'i' && before.endsWith('**') && !before.endsWith('***'))) {
    const s = start - open.length;
    return { text: before.slice(0, s) + text.slice(start, end) + after.slice(close.length), start: s, end: s + (end - start) };
  }
  return { text: before + open + text.slice(start, end) + close + after, start: start + open.length, end: end + open.length };
}

// ---- documents: notes combined (Combine notes) ----

export type NoteDoc = { title: string; body: string; children: NoteDoc[] };

// Markdown: each note's title a heading (its level = the depth), the body as it is (headings inside a body shifted below it).
export function noteMarkdown(n: NoteDoc, depth = 1): string {
  const parts: string[] = [];
  const level = Math.min(6, depth);
  if (n.title.trim()) parts.push(`${'#'.repeat(level)} ${n.title.trim()}`);
  const shift = n.title.trim() ? level : level - 1;
  const body = n.body
    .split('\n')
    .map((l) => l.replace(/^(#{1,6}) /, (_, h: string) => `${'#'.repeat(Math.min(6, h.length + shift))} `))
    .join('\n')
    .trimEnd();
  if (body.trim()) parts.push(body);
  for (const c of n.children) {
    const md = noteMarkdown(c, n.title.trim() ? depth + 1 : depth);
    if (md) parts.push(md);
  }
  return parts.join('\n\n');
}

// Plain text: titles underlined (= at the top level, - below), the bodies without markers (raw: as written).
export function noteText(n: NoteDoc, depth = 1, raw = !SHOW_FORMATTING): string {
  const parts: string[] = [];
  const t = n.title.trim();
  if (t) parts.push(`${t}\n${(depth === 1 ? '=' : '-').repeat(Math.max(3, [...t].length))}`);
  const body = (raw ? n.body : toPlain(n.body)).trimEnd();
  if (body.trim()) parts.push(body);
  for (const c of n.children) {
    const s = noteText(c, t ? depth + 1 : depth, raw);
    if (s) parts.push(s);
  }
  return parts.join('\n\n');
}

// A file name from a title.
export const fileName = (title: string, ext: string) => `${(title.trim() || 'notes').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)}.${ext}`;
