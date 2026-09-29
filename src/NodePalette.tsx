// The nodes, in a panel on the left of the canvas: sections that fold, a search field; a node is dragged onto the
// canvas (dropped where the mouse is) or clicked (added in the middle of the view). The panel folds to a thin strip.
import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import type { AppNode } from './types.ts';

export type PaletteItem = { type: AppNode['type']; label: string; help?: string; color: string };
export type PaletteGroup = { name: string; color: string; items: PaletteItem[] };

export const DRAG_TYPE = 'application/x-sprforge-node';
const KEY = 'spr-flow:palette';

type State = { open: boolean; folded: string[] };
const load = (): State => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<State>;
    return { open: s.open !== false, folded: Array.isArray(s.folded) ? s.folded : [] };
  } catch {
    return { open: true, folded: [] };
  }
};
const save = (s: State) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the layout is simply not remembered */
  }
};

export function NodePalette({ groups, onAdd }: { groups: PaletteGroup[]; onAdd: (type: AppNode['type']) => void }) {
  const [state, setState] = useState<State>(load);
  const [query, setQuery] = useState('');
  const update = (patch: Partial<State>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    });
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => groups.map((g) => ({ ...g, items: q ? g.items.filter((i) => i.label.toLowerCase().includes(q) || g.name.toLowerCase().includes(q) || i.type.includes(q)) : g.items })).filter((g) => g.items.length),
    [groups, q],
  );
  const drag = (e: DragEvent, type: AppNode['type']) => {
    e.dataTransfer.setData(DRAG_TYPE, type);
    e.dataTransfer.effectAllowed = 'move';
  };

  if (!state.open)
    return (
      <aside className="palette folded">
        <button className="palette-toggle" title="Show the nodes" onClick={() => update({ open: true })}>
          »
        </button>
        <span className="palette-vertical">Nodes</span>
      </aside>
    );
  return (
    <aside className="palette">
      <div className="palette-head">
        <strong>Nodes</strong>
        <button className="palette-toggle" title="Hide the panel (more room for the canvas)" onClick={() => update({ open: false })}>
          «
        </button>
      </div>
      <input className="palette-search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
      <div className="palette-list">
        {shown.map((g) => {
          const folded = !q && state.folded.includes(g.name);
          return (
            <section key={g.name}>
              <button
                className="palette-group"
                style={{ color: g.color }}
                aria-expanded={!folded}
                onClick={() => update({ folded: folded ? state.folded.filter((x) => x !== g.name) : [...state.folded, g.name] })}
              >
                <span className="chev">{folded ? '▸' : '▾'}</span> {g.name}
              </button>
              {!folded &&
                g.items.map((i) => (
                  <button
                    key={i.type}
                    className="palette-item"
                    draggable
                    onDragStart={(e) => drag(e, i.type)}
                    onClick={() => onAdd(i.type)}
                    title={`${i.help ?? i.label}\n\nDrag onto the canvas, or click to add it in the middle of the view.`}
                    style={{ '--node-color': i.color } as CSSProperties}
                  >
                    {i.label}
                  </button>
                ))}
            </section>
          );
        })}
        {!shown.length && <div className="muted palette-empty">No node matches “{query}”.</div>}
      </div>
      <div className="hint palette-foot">Drag a node onto the canvas, or click it. Right-click on the canvas: the same list.</div>
    </aside>
  );
}
