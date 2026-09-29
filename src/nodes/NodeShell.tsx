// Frame of every node: a coloured title bar with the node type (colour of its section), an optional free label above
// the node, a collapse button (only the title bar is shown, the connections stay attached to its sides) and an error
// mark. The node's own view is the body under the bar.
/* eslint-disable react/only-export-components -- withShell (a component factory) lives with its parts */
import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { editCaption, useEditingCaption } from './captionStore.ts';
import { useNodeResult } from '../engine/engine.ts';
import { nodeColor, nodeTitle, textOn } from '../nodeColors.ts';
import type { AppNode } from '../types.ts';
import { ErrorBoundary } from '../ErrorBoundary.tsx';
import { NODE_HELP } from '../help.ts';

// Editor of the label, mounted when the editing starts (so it starts from the current text).
function CaptionEditor({ id, caption }: { id: string; caption?: string }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const [text, setText] = useState(caption ?? '');
  const save = () => {
    updateNodeData(id, { caption: text.trim() || undefined });
    editCaption(null);
  };
  return (
    <input
      className="nodrag node-caption editing"
      autoFocus
      value={text}
      placeholder="label (empty = none)"
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

function Caption({ id, caption }: { id: string; caption?: string }) {
  if (useEditingCaption() === id) return <CaptionEditor id={id} caption={caption} />;
  return caption ? (
    <div className="node-caption" title="Double-click to edit the label" onDoubleClick={() => editCaption(id)}>
      {caption}
    </div>
  ) : null;
}

export function withShell<P extends NodeProps<AppNode>>(View: ComponentType<P>) {
  function Shell(props: P) {
    const { id, type, data } = props;
    const node = { id, type, data } as AppNode;
    const { updateNodeData } = useReactFlow<AppNode>();
    const updateInternals = useUpdateNodeInternals();
    const result = useNodeResult(id);
    const collapsed = !!data.collapsed;
    // the handles move to the title bar and back: the connections must follow
    useEffect(() => updateInternals(id), [collapsed, id, updateInternals]);
    const color = nodeColor(node);
    const errors = result?.errors ?? [];
    const [help, setHelp] = useState(false);
    return (
      <div className={`node-shell${collapsed ? ' collapsed' : ''}${errors.length ? ' has-error' : ''}`} style={{ '--node-color': color, '--node-text': textOn(color) } as CSSProperties}>
        <Caption id={id} caption={data.caption} />
        <div className="node-header" onDoubleClick={() => editCaption(id)} title="Double-click: label above the node">
          <span className="node-header-title">{nodeTitle(node)}</span>
          {errors.length > 0 && (
            <span className="node-err-dot" title={errors.join('\n')}>
              ●
            </span>
          )}
          <button className="nodrag node-collapse node-help-btn" title={`What this node does: ${NODE_HELP[type as AppNode['type']] ?? ''}`} onClick={() => setHelp((h) => !h)} onDoubleClick={(e) => e.stopPropagation()}>
            ?
          </button>
          <button
            className="nodrag node-collapse"
            title={collapsed ? 'Expand' : 'Collapse to the title bar'}
            onClick={() => updateNodeData(id, { collapsed: !collapsed || undefined })}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
        {help && !collapsed && <div className="node-help">{NODE_HELP[type as AppNode['type']]}</div>}
        <ErrorBoundary
          resetKey={data}
          fallback={(e, reset) => (
            <div className="node view-error">
              <div className="msg err">This node could not be drawn: {e.message}</div>
              <div className="hint">The rest of the graph keeps working. Change a setting of the node, or retry.</div>
              <button className="nodrag" onClick={reset}>Retry</button>
            </div>
          )}
        >
          <View {...props} />
        </ErrorBoundary>
      </div>
    );
  }
  Shell.displayName = `Shell(${View.displayName ?? View.name})`;
  return Shell;
}
