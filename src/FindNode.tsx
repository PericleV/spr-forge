// Find a node (Ctrl+F): a search over the node titles, labels and names; the chosen node is centred and selected.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { nodeColor, nodeTitle } from './nodeColors.ts';
import type { AppNode } from './types.ts';

// What a node is called on the canvas: its type, its label (caption) and its own name, if any.
function describe(n: AppNode): { title: string; extra: string } {
  const d = n.data as { caption?: string; name?: string; title?: string; label?: string };
  const extra = [d.caption, d.name, d.title, d.label].filter((s): s is string => typeof s === 'string' && !!s.trim());
  return { title: nodeTitle(n), extra: [...new Set(extra)].join(' · ') };
}

export function FindNode({ onClose }: { onClose: () => void }) {
  const { getNodes, getInternalNode, setCenter, setNodes } = useReactFlow<AppNode>();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const all = useMemo(() => getNodes().filter((n) => n.type !== 'frame'), [getNodes]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all
      .map((n) => ({ n, ...describe(n) }))
      .filter((r) => words.every((w) => `${r.title} ${r.extra}`.toLowerCase().includes(w)))
      .slice(0, 50);
  }, [all, q]);
  const go = (n: AppNode) => {
    const i = getInternalNode(n.id);
    if (i) {
      const w = i.measured.width ?? 300;
      const h = i.measured.height ?? 200;
      setCenter(i.internals.positionAbsolute.x + w / 2, i.internals.positionAbsolute.y + Math.min(h / 2, 250), { zoom: 1 });
    }
    setNodes((ns) => ns.map((x) => (x.selected !== (x.id === n.id) ? { ...x, selected: x.id === n.id } : x)));
    onClose();
  };
  return (
    <div className="find-node" onKeyDown={(e) => e.stopPropagation()}>
      <input
        ref={input}
        className="nodrag"
        value={q}
        placeholder="Find a node: type, label or name…"
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, list.length - 1));
          else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
          else if (e.key === 'Enter' && list[sel]) go(list[sel].n);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setTimeout(onClose, 150)}
      />
      <div className="find-list">
        {!list.length && <div className="muted">No node matches.</div>}
        {list.map((r, i) => (
          <button key={r.n.id} className={i === sel ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.n)} onMouseEnter={() => setSel(i)}>
            <span className="find-dot" style={{ background: nodeColor(r.n) }} />
            <b>{r.title}</b>
            {r.extra && <span className="muted"> · {r.extra}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
