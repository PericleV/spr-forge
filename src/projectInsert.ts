// A project dropped on a canvas that has nodes goes in beside them: its nodes and connections with new ids (the references
// to them in the node data follow: curves, formula terms, the variables of the optimizer runs …), its top-left corner where
// it was dropped; its own materials added, one whose id is taken by a different material renamed (its nodes follow).
import type { Edge } from '@xyflow/react';
import { BUILTINS } from './physics/library.ts';
import type { MaterialDef } from './physics/materials.ts';
import type { Project } from './project.ts';
import type { AppNode } from './types.ts';

type XY = { x: number; y: number };
export type Placed = {
  nodes: AppNode[]; // selected, after the ones of the canvas
  edges: Edge[];
  materials: MaterialDef[]; // to add to the user's materials
  top: string[]; // the nodes not in a frame (to group)
  frames: boolean; // the project has frames of its own (frames are one level: it is not grouped again)
};

const BUILTIN_IDS = new Set(BUILTINS.map((b) => b.id));
const shortId = () => crypto.randomUUID().slice(0, 8);

// Materials: every string that is the id of a material renamed (ids as 'user-…', not words of the data) takes the new one.
function withMaterials<T>(v: T, map: Map<string, string>): T {
  if (!map.size) return v;
  if (typeof v === 'string') return (map.get(v) ?? v) as T;
  if (Array.isArray(v)) return v.map((x) => withMaterials(x, map)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withMaterials(x, map)])) as T;
  return v;
}

// Nodes: only the fields that name other nodes (the ids of the examples are words — 'map', 'field', 'zones' — that the data
// use too): a node id, or 'id:handle' / 'id#i' / 'back:id#i' (the first id in it).
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
function withNodes(data: Rec, map: Map<string, string>): Rec {
  const ref = (s: unknown) => {
    if (typeof s !== 'string') return s;
    const m = /^(back:)?([^:#]+)(.*)$/.exec(s);
    const to = m && map.get(m[2]);
    return to ? `${m[1] ?? ''}${to}${m[3]}` : s;
  };
  const keys = (r: unknown) => (isRec(r) ? Object.fromEntries(Object.entries(r).map(([k, x]) => [ref(k) as string, x])) : r);
  const list = (a: unknown) => (Array.isArray(a) ? a.map(ref) : a);
  const each = (a: unknown, f: (x: Rec) => Rec) => (Array.isArray(a) ? a.map((x) => (isRec(x) ? f(x) : x)) : a);
  const d: Rec = { ...data };
  // Compare: curves and the sources seen; Objective: terms; Tolerance: criteria
  if ('curves' in d) d.curves = each(d.curves, (c) => ('src' in c ? { ...c, src: ref(c.src) } : c));
  if ('seen' in d) d.seen = list(d.seen);
  if ('terms' in d) d.terms = each(d.terms, (t) => ('source' in t ? { ...t, source: ref(t.source) } : t));
  if ('criteria' in d) d.criteria = each(d.criteria, (t) => ('source' in t ? { ...t, source: ref(t.source) } : t));
  // Merge: labels by source; Custom data: names by 'source:handle'; Draw: labels by layer key
  if (isRec(d.labels)) d.labels = keys(d.labels);
  if ('aliases' in d) d.aliases = keys(d.aliases);
  if ('overrides' in d) d.overrides = keys(d.overrides);
  // Optimization Engine: its runs (values by variable), the variables kept fixed, the live point, the Compute to re-run,
  // the objectives of Adam's two stages
  if ('runs' in d) d.runs = each(d.runs, (r) => ({ ...r, values: keys(r.values), start: keys(r.start), names: keys(r.names) }));
  if ('disabled' in d) d.disabled = list(d.disabled);
  if ('live' in d) d.live = keys(d.live);
  if ('outputCompute' in d) d.outputCompute = ref(d.outputCompute);
  if (isRec(d.params) && isRec(d.params.adam)) d.params = { ...d.params, adam: { ...d.params.adam, stage1Obj: list(d.params.adam.stage1Obj), stage2Obj: list(d.params.adam.stage2Obj) } };
  return withSweepAxes(d, map);
}
// the axis of a Sweep is 'sweep:<its id>' wherever the data name an axis (X / Y of a plot, the steps held fixed, along …)
function withSweepAxes<T>(v: T, map: Map<string, string>): T {
  const axis = (s: string) => {
    const to = s.startsWith('sweep:') ? map.get(s.slice(6)) : undefined;
    return to ? `sweep:${to}` : s;
  };
  if (typeof v === 'string') return axis(v) as T;
  if (Array.isArray(v)) return v.map((x) => withSweepAxes(x, map)) as T;
  if (isRec(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [axis(k), withSweepAxes(x, map)])) as T;
  return v;
}

export function placeProject(p: Project, userMaterials: MaterialDef[], at: XY): Placed {
  const map = new Map<string, string>();
  for (const n of p.nodes) map.set(n.id, `${n.type}-${shortId()}`);
  // materials: the same one kept once; a different one under a taken id gets the next free id and a numbered name
  const matMap = new Map<string, string>();
  const taken = new Map(userMaterials.map((m) => [m.id, m]));
  const materials: MaterialDef[] = [];
  for (const m of p.materials) {
    if (BUILTIN_IDS.has(m.id)) continue;
    const same = taken.get(m.id);
    if (same && JSON.stringify(same) === JSON.stringify(m)) continue;
    if (!same) {
      materials.push(m);
      taken.set(m.id, m);
      continue;
    }
    let k = 2;
    while (taken.has(`${m.id}-${k}`)) k++;
    const id = `${m.id}-${k}`;
    matMap.set(m.id, id);
    const def = { ...m, id, name: `${m.name} (${k})` };
    materials.push(def);
    taken.set(id, def);
  }
  // the top-left corner of the nodes not in a frame goes where the project was dropped
  const top = p.nodes.filter((n) => !n.parentId);
  const x0 = Math.min(...top.map((n) => n.position.x));
  const y0 = Math.min(...top.map((n) => n.position.y));
  const nodes = p.nodes.map((n) => {
    const id = map.get(n.id)!;
    const position = n.parentId ? n.position : { x: n.position.x - x0 + at.x, y: n.position.y - y0 + at.y };
    return { ...n, id, position, data: withMaterials(withNodes(n.data, map), matMap), ...(n.parentId ? { parentId: map.get(n.parentId) } : {}), selected: true } as AppNode;
  });
  const edges = p.edges.flatMap((e): Edge[] => {
    const [source, target] = [map.get(e.source), map.get(e.target)];
    if (!source || !target) return [];
    return [{ ...e, id: `e-${source}-${e.sourceHandle ?? ''}-${target}-${e.targetHandle ?? ''}`, source, target }];
  });
  return { nodes, edges, materials: withMaterials(materials, matMap), top: top.map((n) => map.get(n.id)!), frames: p.nodes.some((n) => n.type === 'frame') };
}
