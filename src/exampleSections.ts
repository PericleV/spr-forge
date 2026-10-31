// The examples by subject and heading (the examples menu, the Welcome gallery) and the search over them.
export type ExampleInfo = { group: string; sub?: string; name: string; desc: string };
type Indexed = { ex: ExampleInfo; i: number };
export type ExampleSection = { group: string; subs: { sub: string; items: Indexed[] }[]; count: number };

// the examples by subject, then by heading (in the order of the list; those without a heading first)
export function sectionsOf(examples: ExampleInfo[], keep: (ex: ExampleInfo) => boolean = () => true): ExampleSection[] {
  const out: ExampleSection[] = [];
  examples.forEach((ex, i) => {
    if (!keep(ex)) return;
    let s = out.find((q) => q.group === ex.group);
    if (!s) out.push((s = { group: ex.group, subs: [], count: 0 }));
    const sub = ex.sub ?? '';
    let b = s.subs.find((q) => q.sub === sub);
    if (!b) s.subs[sub ? 'push' : 'unshift']((b = { sub, items: [] }));
    b.items.push({ ex, i });
    s.count++;
  });
  return out;
}

// (the search: every word in the name, the line or the heading — not the subject, whose words would bring all its
// examples; without accents, any case)
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const matches = (q: string) => {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return (ex: ExampleInfo) => {
    const text = fold(`${ex.name} ${ex.desc} ${ex.sub ?? ''}`);
    return words.every((w) => text.includes(w));
  };
};
