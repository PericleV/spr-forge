// Group frames: a frame node is the parent of the grouped nodes (React Flow sub-flows: the children's positions are
// relative to the frame, the frame comes before them in the node list). One level only.
import type { AppNode, FrameNode } from './types.ts';

type XY = { x: number; y: number };
const PAD = 30;
const HEADER = 44; // room for the frame's title

export function absolutePosition(n: AppNode, byId: Map<string, AppNode>): XY {
  const p = n.parentId ? byId.get(n.parentId) : undefined;
  return p ? { x: p.position.x + n.position.x, y: p.position.y + n.position.y } : n.position;
}

const sizeOf = (n: AppNode) => ({ w: n.measured?.width ?? n.width ?? 300, h: n.measured?.height ?? n.height ?? 200 });

// Takes nodes out of their frame (absolute positions again).
function detachAll(nodes: AppNode[], which: (n: AppNode) => boolean): AppNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((n) => (n.parentId && which(n) ? ({ ...n, parentId: undefined, extent: undefined, position: absolutePosition(n, byId) } as AppNode) : n));
}

// A new frame around the given nodes (frames themselves are not grouped); the nodes become its children.
export function groupNodes(nodes: AppNode[], ids: string[], name: string, color: string): { nodes: AppNode[]; frameId: string | null } {
  const set = new Set(ids);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const members = nodes.filter((n) => set.has(n.id) && n.type !== 'frame');
  if (!members.length) return { nodes, frameId: null };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of members) {
    const p = absolutePosition(n, byId);
    const { w, h } = sizeOf(n);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + w);
    y1 = Math.max(y1, p.y + h);
  }
  const frameId = `frame-${crypto.randomUUID().slice(0, 8)}`;
  const origin = { x: x0 - PAD, y: y0 - HEADER - PAD };
  const frame: FrameNode = {
    id: frameId,
    type: 'frame',
    position: origin,
    width: x1 - x0 + 2 * PAD,
    height: y1 - y0 + HEADER + 2 * PAD,
    data: { name, color },
    selected: false,
  };
  const moved = nodes.map((n) => {
    if (!set.has(n.id) || n.type === 'frame') return n;
    const p = absolutePosition(n, byId);
    return { ...n, parentId: frameId, extent: undefined, selected: false, position: { x: p.x - origin.x, y: p.y - origin.y } } as AppNode;
  });
  // the parent must come before its children
  return { nodes: [frame, ...moved], frameId };
}

// Removes a frame and keeps its nodes where they are.
export function ungroup(nodes: AppNode[], frameId: string): AppNode[] {
  return detachAll(nodes, (n) => n.parentId === frameId).filter((n) => n.id !== frameId);
}

// Takes the given nodes out of their frames.
export function removeFromGroup(nodes: AppNode[], ids: string[]): AppNode[] {
  const set = new Set(ids);
  return detachAll(nodes, (n) => set.has(n.id));
}

// Frames about to be deleted let their nodes go first (the nodes stay unless they were selected for deletion too).
export function releaseChildren(nodes: AppNode[], frameIds: Set<string>, keep: (n: AppNode) => boolean): AppNode[] {
  return detachAll(nodes, (n) => !!n.parentId && frameIds.has(n.parentId) && keep(n));
}
