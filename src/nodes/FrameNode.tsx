// Group frame: a named, coloured box behind a group of nodes (its children, which move with it). Only its title bar
// takes the mouse (drag, select, double-click to rename); the inside lets clicks through to the nodes and connections.
import { useState, type CSSProperties } from 'react';
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react';
import { FRAME_COLORS } from '../nodeColors.ts';
import type { AppNode, FrameNode } from '../types.ts';
import { editCaption, useEditingCaption } from './captionStore.ts';

// Mounted when the renaming starts (a double click, or right after “Group…”).
function NameEditor({ id, name }: { id: string; name: string }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const [text, setText] = useState(name);
  const save = () => {
    updateNodeData(id, { name: text.trim() || 'Group' });
    editCaption(null);
  };
  return (
    <input
      className="nodrag"
      autoFocus
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') editCaption(null);
        e.stopPropagation();
      }}
    />
  );
}

export function FrameNodeView({ id, data, selected }: NodeProps<FrameNode>) {
  const editing = useEditingCaption() === id;
  const color = data.color || FRAME_COLORS[0];
  return (
    <div className="group-frame" style={{ '--frame-color': color } as CSSProperties}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={80} color={color} />
      <div className="frame-header" onDoubleClick={() => editCaption(id)} title="Double-click to rename; right-click for colour / ungroup">
        {editing ? <NameEditor id={id} name={data.name} /> : data.name || 'Group'}
      </div>
    </div>
  );
}
