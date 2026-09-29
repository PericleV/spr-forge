// Checks of the formatted notes (Info) and Combine notes (run by check-tmm.ts).
import { applyMark, noteMarkdown, noteText, parseInline, parseNote, SHOW_FORMATTING, toPlain, type Mark } from '../src/notes/markup.ts';
import { logicalKey } from '../src/engine/engine.ts';
import { makeLibrary } from '../src/physics/library.ts';
import { evaluateHeadless } from '../src/engine/headless.ts';
import { sourcePort, targetAccepts } from '../src/engine/ports.ts';
import { EXAMPLES, INFO_DEFAULTS, NOTES_DEFAULTS } from '../src/examples.ts';
import type { AppNode } from '../src/types.ts';

{
  const fails: string[] = [];
  const styleOf = (s: string) =>
    parseInline(s)
      .map((x) => `${x.text}[${['b', 'i', 's', 'u'].filter((k) => x.style[k as 'b']).join('')}${x.style.color ?? ''}]`)
      .join('');
  const expect = (src: string, want: string) => {
    const got = styleOf(src);
    if (got !== want) fails.push(`${JSON.stringify(src)} → ${got}, expected ${want}`);
  };
  // (1) the markers, nesting, and what is not a marker
  expect('**bold** and *it*', 'bold[b] and []it[i]');
  expect('~~gone~~ <u>under</u>', 'gone[s] []under[u]');
  expect('<span style="color:#c00000">red **bold**</span> x', 'red [#c00000]bold[b#c00000] x[]');
  expect('***both***', 'both[bi]');
  expect('*a **b** c*', 'a [i]b[bi] c[i]');
  expect('n_o = 1.54, θ_c and n_e', 'n_o = 1.54, θ_c and n_e[]');
  expect('2 * 3 * 4', '2 * 3 * 4[]');
  expect('**unclosed and *also', '**unclosed and *also[]');
  expect(String.raw`a \*not\* b \\ c`, String.raw`a *not* b \ c[]`);
  expect('<u>open only', '<u>open only[]');
  // (2) headings, plain text
  const lines = parseNote('# Title\ntext **b**\n###### deep\n####### not');
  if (lines.map((l) => l.heading).join() !== '1,0,6,0') fails.push(`headings ${lines.map((l) => l.heading)}`);
  if (toPlain('# Title\n**b** ~~s~~ <u>u</u> <span style="color:#0a0">c</span>') !== 'Title\nb s u c') fails.push(`plain: ${toPlain('# Title\n**b** ~~s~~ <u>u</u> <span style="color:#0a0">c</span>')}`);
  // (3) the notes of every example are shown exactly as written (no accidental formatting)
  let notes = 0;
  for (const ex of EXAMPLES)
    for (const n of ex.make().nodes)
      if (n.type === 'info') {
        notes++;
        const text = n.data.text;
        if (toPlain(text) !== text.replace(/^#{1,6} /gm, '') || parseNote(text).some((l) => l.spans.some((s) => Object.keys(s.style).length))) fails.push(`example note changed: ${ex.name}`);
      }
  // (4) the toolbar: wrap, nest, unwrap back to the original, colours replaced / removed, spaces kept outside
  const t0 = 'the quick brown fox';
  let r = { text: t0, start: 4, end: 9 };
  for (const m of ['b', 'i', 's', 'u'] as Mark[]) r = applyMark(r.text, r.start, r.end, m);
  if (styleOf(r.text) !== 'the []quick[bisu] brown fox[]') fails.push(`all marks: ${r.text}`);
  for (const m of ['u', 's', 'i', 'b'] as Mark[]) r = applyMark(r.text, r.start, r.end, m);
  if (r.text !== t0) fails.push(`unwrap: ${r.text}`);
  r = applyMark(t0, 4, 9, 'color', '#00aa00');
  r = applyMark(r.text, r.start, r.end, 'color', '#0000ff');
  if (styleOf(r.text) !== 'the []quick[#0000ff] brown fox[]') fails.push(`colour change: ${r.text}`);
  r = applyMark(r.text, r.start, r.end, 'color', '#0000ff');
  if (r.text !== t0) fails.push(`colour removed: ${r.text}`);
  r = applyMark(t0, 3, 10, 'b'); // " quick " selected: the spaces stay outside
  if (r.text !== 'the **quick** brown fox') fails.push(`spaces: ${r.text}`);
  r = applyMark(t0, 4, 4, 'i'); // no selection: the markers inserted, the cursor between them
  if (r.text !== 'the **quick brown fox' || r.start !== 5) fails.push(`empty selection: ${r.text} ${r.start}`);
  // (5) the ports
  const node = (type: string) => ({ id: 'x', type, position: { x: 0, y: 0 }, data: {} }) as unknown as AppNode;
  if (!(sourcePort(node('info')) === 'note' && sourcePort(node('notes')) === 'note' && targetAccepts(node('notes'), 'item-2').includes('note') && !targetAccepts(node('plot'), 'in').includes('note')))
    fails.push('ports');
  // (6) through the graph: Info → Combine notes (nested), the slots' order, an empty slot skipped; the exports
  const P = { x: 0, y: 0 };
  const info = (id: string, title: string, text: string) => ({ id, type: 'info', position: P, data: { ...INFO_DEFAULTS, title, text } });
  const nodes = [
    info('a', 'Setup', 'Kretschmann, **Ag** 50 nm'),
    info('b', 'Result', 'dip at *43.2°*\n# detail\n<u>check</u>'),
    info('c', '', 'untitled text'),
    { id: 'inner', type: 'notes', position: P, data: { ...NOTES_DEFAULTS, name: 'Part 2', count: 2 } },
    { id: 'doc', type: 'notes', position: P, data: { ...NOTES_DEFAULTS, name: 'Report', count: 4 } },
  ] as unknown as AppNode[];
  const E = (s: string, t: string, h: string) => ({ id: `${s}-${t}-${h}`, source: s, sourceHandle: 'out', target: t, targetHandle: h });
  const edges = [E('b', 'doc', 'item-0'), E('a', 'doc', 'item-2'), E('inner', 'doc', 'item-3'), E('c', 'inner', 'item-0')];
  const ev = evaluateHeadless(nodes, edges, makeLibrary([]));
  const out = ev.results.get('doc')!.outs.out;
  if (out?.type !== 'note') fails.push('Combine notes: no output');
  else {
    const md = noteMarkdown(out.doc);
    const wantMd = '# Report\n\n## Result\n\ndip at *43.2°*\n### detail\n<u>check</u>\n\n## Setup\n\nKretschmann, **Ag** 50 nm\n\n## Part 2\n\nuntitled text';
    if (md !== wantMd) fails.push(`markdown:\n${md}`);
    // plain text with the formatting read (markers removed) and — formatting hidden, the default — as written
    const txt = noteText(out.doc, 1, false);
    const wantTxt = 'Report\n======\n\nResult\n------\n\ndip at 43.2°\ndetail\ncheck\n\nSetup\n-----\n\nKretschmann, Ag 50 nm\n\nPart 2\n------\n\nuntitled text';
    if (txt !== wantTxt) fails.push(`text:\n${txt}`);
    const raw = noteText(out.doc);
    const wantRaw = 'Report\n======\n\nResult\n------\n\ndip at *43.2°*\n# detail\n<u>check</u>\n\nSetup\n-----\n\nKretschmann, **Ag** 50 nm\n\nPart 2\n------\n\nuntitled text';
    if (SHOW_FORMATTING || raw !== wantRaw) fails.push(`text as written:\n${raw}`);
    const items = (ev.results.get('doc')!.info as { items: (string | null)[] }).items;
    if (JSON.stringify(items) !== JSON.stringify(['Result', null, 'Setup', 'Part 2'])) fails.push(`slots ${JSON.stringify(items)}`);
  }
  // (7) the engine re-evaluates when a connected note's title or text changes — not for a free note, nor for a colour or a
  // size (the bug: Info was view-only, so Combine notes kept the old text)
  const key = (ns: AppNode[]) => logicalKey(ns, edges as never);
  const k0 = key(nodes);
  const change = (list: AppNode[], id: string, patch: object) => list.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n));
  const free = [...nodes, info('z', 'Free', 'loose') as unknown as AppNode];
  const keyOk =
    key(change(nodes, 'a', { text: 'changed' })) !== k0 &&
    key(change(nodes, 'a', { title: 'Renamed' })) !== k0 &&
    key(change(nodes, 'a', { color: '#123456', width: 500, height: 400 })) === k0 &&
    key(change(nodes, 'doc', { width: 600, height: 500 })) === k0 &&
    key(change(nodes, 'doc', { name: 'Other' })) !== k0 &&
    key(change(free, 'z', { text: 'typed' })) === key(free);
  if (!keyOk) fails.push('re-evaluation key');
  if (fails.length) throw new Error(`notes:\n${fails.join('\n')}`);
  console.log(
    `formatted notes: bold / italic / struck / underlined / coloured spans, nesting (***), headings; "_" and "2 * 3" untouched, escapes; the ${notes} example notes shown unchanged; toolbar wrap / nest / unwrap / colour change and removal; ` +
      `Combine notes through the graph: slots in order, an empty one skipped, nested sections; .md and .txt (as written: formatting hidden) exports as expected; a connected note's edit re-evaluates, a free note / colour / size does not`,
  );
}
