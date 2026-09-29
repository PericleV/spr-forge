// Right-click menus of the canvas: add a node (with search) on the empty canvas, node actions on a node.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NODE_COLORS } from './nodeColors.ts';
import type { AppNode } from './types.ts';

export type MenuItem = { type: AppNode['type']; label: string; group: string };
// An entry of a node / selection menu; `colors` shows a row of swatches instead of a button.
export type MenuAction =
  | { label: string; onClick: () => void; danger?: boolean; kbd?: string }
  | { colors: string[]; current?: string; onPick: (c: string) => void };
export type MenuState =
  | { kind: 'pane'; x: number; y: number }
  | { kind: 'node'; x: number; y: number; nodeId: string; label: string }
  | { kind: 'selection'; x: number; y: number; ids: string[] };

// Keeps the menu inside the window.
const place = (x: number, y: number, w: number, h: number): CSSProperties => ({
  left: Math.max(4, Math.min(x, window.innerWidth - w - 4)),
  top: Math.max(4, Math.min(y, window.innerHeight - h - 4)),
});

export function ContextMenu(props: {
  menu: MenuState;
  items: MenuItem[];
  onAdd: (type: AppNode['type']) => void;
  title?: string;
  actions?: MenuAction[];
  onClose: () => void;
}) {
  const { menu, items, onAdd, title, actions = [], onClose } = props;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q) || i.type.includes(q)) : items;
  }, [items, query]);

  useEffect(() => {
    input.current?.focus();
    // a press or a wheel anywhere outside the menu closes it (capture phase: the canvas stops the bubbling)
    const close = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, { passive: true, capture: true });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  if (menu.kind !== 'pane') {
    return (
      <div className="ctx-menu" ref={box} style={place(menu.x, menu.y, 220, 60 + 30 * actions.length)} onContextMenu={(e) => e.preventDefault()}>
        <div className="ctx-title">{title}</div>
        {actions.map((a, k) =>
          'colors' in a ? (
            <div key={k} className="ctx-colors">
              {a.colors.map((c) => (
                <button key={c} className={`ctx-color${c === a.current ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => (a.onPick(c), onClose())} />
              ))}
            </div>
          ) : (
            <button key={k} className={a.danger ? 'danger' : ''} onClick={() => (a.onClick(), onClose())}>
              {a.label} {a.kbd && <span className="kbd">{a.kbd}</span>}
            </button>
          ),
        )}
      </div>
    );
  }

  const groups = [...new Set(shown.map((i) => i.group))];
  const add = (t: AppNode['type']) => {
    onAdd(t);
    onClose();
  };
  return (
    <div className="ctx-menu add" ref={box} style={place(menu.x, menu.y, 260, 420)} onContextMenu={(e) => e.preventDefault()}>
      <input
        ref={input}
        className="ctx-search"
        placeholder="Add node… (type to search)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(shown.length - 1, a + 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
          else if (e.key === 'Enter' && shown[active]) add(shown[active].type);
          else return;
          e.preventDefault();
        }}
      />
      <div className="ctx-list">
        {!shown.length && <div className="muted ctx-empty">No node matches “{query}”.</div>}
        {groups.map((g) => (
          <div key={g}>
            <div className="ctx-group">{g}</div>
            {shown
              .filter((i) => i.group === g)
              .map((i) => {
                const k = shown.indexOf(i);
                return (
                  <button
                    key={i.type}
                    className={k === active ? 'active' : ''}
                    style={{ '--node-color': NODE_COLORS[i.type] } as CSSProperties}
                    onMouseEnter={() => setActive(k)}
                    onClick={() => add(i.type)}
                  >
                    <i className="ctx-swatch" />
                    {i.label}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
