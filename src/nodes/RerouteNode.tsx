// Reroute: a point on a connection, to route connections clearly; drag the dot to move it, connect at its small ports
// (left: in, right: out). It passes on what reaches it; its colour is the colour of that type.
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import { PORT_COLORS, PORT_LABELS, sourcePort } from '../engine/ports.ts';
import type { AppNode, RerouteNode } from '../types.ts';

export function RerouteNodeView({ id, selected }: NodeProps<RerouteNode>) {
  const type = useStore((s) => {
    const n = s.nodeLookup.get(id);
    return n ? sourcePort(n as unknown as AppNode, 'out', { node: (x) => s.nodeLookup.get(x) as unknown as AppNode | undefined, edges: s.edges }) : null;
  });
  const color = type ? PORT_COLORS[type] : 'var(--muted)';
  return (
    <div className={`reroute${selected ? ' selected' : ''}`} style={{ background: color }} title={`Reroute · ${type ? PORT_LABELS[type] : 'not connected'}`}>
      <Handle type="target" position={Position.Left} id="in" className="reroute-handle" style={{ background: color }} />
      <Handle type="source" position={Position.Right} id="out" className="reroute-handle" style={{ background: color }} />
    </div>
  );
}
