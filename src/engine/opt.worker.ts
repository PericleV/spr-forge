// Optimizer evaluation worker: holds a snapshot of the graph and scores candidate variable vectors.
import type { Edge } from '@xyflow/react';
import { makeLibrary, type Library } from '../physics/library.ts';
import type { MaterialDef } from '../physics/materials.ts';
import type { AppNode } from '../types.ts';
import { meritOf } from './headless.ts';

export type OptInit = {
  type: 'init';
  nodes: AppNode[];
  edges: Edge[];
  materials: MaterialDef[];
  variables: { id: string; integer: boolean }[];
  objectives: string[];
};
export type OptEval = { type: 'eval'; id: number; xs: number[][]; residuals?: boolean };
export type OptResult =
  | { type: 'result'; id: number; merits: number[]; parts: number[][]; residuals?: number[][] }
  | { type: 'error'; id: number; message: string };

let setup: { nodes: AppNode[]; edges: Edge[]; lib: Library; variables: OptInit['variables']; objectives: string[] } | null = null;

self.onmessage = (e: MessageEvent<OptInit | OptEval>) => {
  const m = e.data;
  if (m.type === 'init') {
    setup = { nodes: m.nodes, edges: m.edges, lib: makeLibrary(m.materials), variables: m.variables, objectives: m.objectives };
    return;
  }
  try {
    if (!setup) throw new Error('worker not initialized');
    const s = setup;
    const res = m.xs.map((x) => meritOf(s.nodes, s.edges, s.lib, s.variables, s.objectives, x));
    const out: OptResult = {
      type: 'result',
      id: m.id,
      merits: res.map((r) => r.merit),
      parts: res.map((r) => r.parts),
      residuals: m.residuals ? res.map((r) => r.residuals) : undefined,
    };
    self.postMessage(out);
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) } satisfies OptResult);
  }
};
