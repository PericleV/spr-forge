// Connection line: curved (bezier) or orthogonal (right angles, rounded corners), with an optional arrow at its middle
// showing the direction of the data. Outputs are on the right of a node, inputs on the left.
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export type EdgeShape = 'curved' | 'orthogonal';
export type FlowEdgeData = { arrow?: boolean; shape?: EdgeShape };

type P = [number, number];

// Right-angle route from an output (right side) to an input (left side).
function orthoRoute(sx: number, sy: number, tx: number, ty: number): { pts: P[]; mid: P; dir: P } {
  const gap = 20;
  if (tx >= sx + 2 * gap) {
    const cx = (sx + tx) / 2;
    const pts: P[] = [[sx, sy], [cx, sy], [cx, ty], [tx, ty]];
    return Math.abs(ty - sy) > 16 ? { pts, mid: [cx, (sy + ty) / 2], dir: [0, Math.sign(ty - sy)] } : { pts, mid: [cx, sy], dir: [1, 0] };
  }
  // the input is behind the output: go around
  const my = Math.abs(ty - sy) > 40 ? (sy + ty) / 2 : Math.max(sy, ty) + 60;
  const pts: P[] = [[sx, sy], [sx + gap, sy], [sx + gap, my], [tx - gap, my], [tx - gap, ty], [tx, ty]];
  return { pts, mid: [(sx + tx) / 2, my], dir: [-1, 0] };
}

// Polyline with rounded corners.
function rounded(pts: P[], radius = 8): string {
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, c, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const l2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) {
      d += ` L ${c[0]},${c[1]}`;
      continue;
    }
    const a: P = [c[0] - ((c[0] - p[0]) / l1) * r, c[1] - ((c[1] - p[1]) / l1) * r];
    const b: P = [c[0] + ((n[0] - c[0]) / l2) * r, c[1] + ((n[1] - c[1]) / l2) * r];
    d += ` L ${a[0]},${a[1]} Q ${c[0]},${c[1]} ${b[0]},${b[1]}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last[0]},${last[1]}`;
}

// Direction of the bezier drawn by React Flow (Right → Left handles) at its middle (t = 0.5): control points
// (sx + o, sy) and (tx − o, ty) with o = d/2 for d = tx − sx ≥ 0, else 6.25·√(−d).
function bezierDir(sx: number, sy: number, tx: number, ty: number): P {
  const d = tx - sx;
  const o = d >= 0 ? 0.5 * d : 0.25 * 25 * Math.sqrt(-d);
  return [d - o, ty - sy];
}

export function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, interactionWidth, selected } = props;
  const data = props.data as FlowEdgeData | undefined;
  let path: string;
  let mid: P;
  let dir: P;
  if (data?.shape === 'orthogonal') {
    const r = orthoRoute(sourceX, sourceY, targetX, targetY);
    path = rounded(r.pts);
    mid = r.mid;
    dir = r.dir;
  } else {
    const [p, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    path = p;
    mid = [lx, ly];
    dir = bezierDir(sourceX, sourceY, targetX, targetY);
  }
  const angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const color = (style?.stroke as string | undefined) ?? 'var(--muted)';
  const w = Number(style?.strokeWidth ?? 2);
  const s = 4 + 1.6 * w; // arrow size follows the line width
  return (
    <>
      {selected && <path className="flow-halo" d={path} strokeWidth={w + 9} />}
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {data?.arrow && (
        <path
          className="flow-arrow"
          d={`M ${s},0 L ${-s * 0.8},${-s * 0.75} L ${-s * 0.4},0 L ${-s * 0.8},${s * 0.75} Z`}
          transform={`translate(${mid[0]} ${mid[1]}) rotate(${angle})`}
          fill={color}
          stroke="var(--panel)"
          strokeWidth={1}
        />
      )}
    </>
  );
}
