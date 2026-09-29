// Combine notes: the notes of its slots, in order, as one document; preview and export (.md, .txt).
import { useEffect } from 'react';
import { NodeResizer, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { NotesInfo } from '../engine/evaluate.ts';
import { fileName, noteMarkdown, noteText, SHOW_FORMATTING } from '../notes/markup.ts';
import { DocPreview, NoteText } from '../notes/NoteText.tsx';
import { download } from '../plot/export.ts';
import type { AppNode, NotesData, NotesNode } from '../types.ts';
import { Messages, OutPort, Port } from './ui.tsx';

export function NotesNodeView({ id, data, selected }: NodeProps<NotesNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const set = (patch: Partial<NotesData>) => updateNodeData(id, patch);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [id, data.count, updateNodeInternals]);
  const result = useNodeResult(id);
  const info = result?.info as NotesInfo | undefined;
  const out = result?.outs.out;
  const doc = out?.type === 'note' ? out.doc : undefined;
  const md = doc ? noteMarkdown(doc) : '';
  const setCount = (n: number) => {
    if (n < 1 || n > 30) return;
    if (n < data.count) setEdges((eds) => eds.filter((e) => !(e.target === id && e.targetHandle === `item-${data.count - 1}`)));
    set({ count: n });
  };
  return (
    <div className={`node node-notes${data.height ? ' sized' : ''}`} style={{ ...(data.width ? { width: data.width } : {}), ...(data.height ? { height: data.height } : {}) }}>
      {/* resizable like an Info node: the preview takes the room */}
      <NodeResizer isVisible={selected} minWidth={260} minHeight={220} onResize={(_, p) => set({ width: p.width, height: Math.max(180, p.height - 32) })} />
      <label>
        Title
        <input className="nodrag" value={data.name} placeholder="(none)" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="section">Notes (top → bottom)</div>
      {Array.from({ length: data.count }, (_, i) => (
        <div className="port-row" key={i}>
          <Port kind="target" id={`item-${i}`} port="note" />
          <span className="role">{i + 1}</span>
          {info?.items[i] ? <span className="val">{info.items[i]}</span> : <span className="val muted">empty</span>}
        </div>
      ))}
      <div className="row btns">
        <button className="nodrag" onClick={() => setCount(data.count - 1)}>− note</button>
        <button className="nodrag" onClick={() => setCount(data.count + 1)}>+ note</button>
      </div>
      <div className="note-preview nodrag nowheel">
        {!doc || !md ? <span className="muted">Connect Info nodes (or other Combine notes).</span> : SHOW_FORMATTING ? <NoteText text={md} /> : <DocPreview doc={doc} />}
      </div>
      <div className="row btns">
        <button className="nodrag" disabled={!doc} title={SHOW_FORMATTING ? 'Markdown: the formatting kept (colour and underline as inline HTML)' : 'Markdown: each note’s title a heading, the texts as written'} onClick={() => doc && download(`${md}\n`, fileName(data.name, 'md'), 'text/markdown')}>
          Export .md
        </button>
        <button className="nodrag" disabled={!doc} title={SHOW_FORMATTING ? 'Plain text: the formatting removed, titles underlined' : 'Plain text: the titles underlined, the texts as written'} onClick={() => doc && download(`${noteText(doc)}\n`, fileName(data.name, 'txt'), 'text/plain')}>
          Export .txt
        </button>
      </div>
      <Messages result={result} />
      <OutPort label="note" port="note" />
    </div>
  );
}
