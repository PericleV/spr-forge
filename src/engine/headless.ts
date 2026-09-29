// Evaluates a graph to completion without React: TMM jobs are run inline until none are left.
// Used by the optimizer workers and by the check scripts.
import type { Edge } from '@xyflow/react';
import type { Library } from '../physics/library.ts';
import type { AppNode } from '../types.ts';
import { evaluateGraph, type Evaluation, type JobState } from './evaluate.ts';
import { metaOfSpec, runSpec } from './run.ts';

export function evaluateHeadless(nodes: AppNode[], edges: Edge[], lib: Library, state?: JobState): Evaluation {
  const st: JobState = state ?? { cache: new Map(), lastDone: new Map(), failed: new Map() };
  let ev = evaluateGraph(nodes, edges, st, lib);
  for (let pass = 0; pass < 6 && ev.jobs.length; pass++) {
    for (const job of ev.jobs) {
      const fields = runSpec(job.spec);
      st.cache.set(job.key, { key: job.key, spec: job.spec, axes: job.axes, fields, meta: metaOfSpec(job.spec), size: fields.R.length });
      st.lastDone.set(job.requester, job.key);
    }
    ev = evaluateGraph(nodes, edges, st, lib);
  }
  return ev;
}

// Sets the design variables to x (integers rounded) and returns the objectives' costs.
export function meritOf(
  nodes: AppNode[],
  edges: Edge[],
  lib: Library,
  variables: { id: string; integer: boolean }[],
  objectives: string[],
  x: number[],
): { merit: number; parts: number[]; residuals: number[] } {
  const value = new Map(variables.map((v, i) => [v.id, v.integer ? Math.round(x[i]) : x[i]]));
  const patched = nodes.map((n) => (n.type === 'variable' && value.has(n.id) ? ({ ...n, data: { ...n.data, value: value.get(n.id)! } } as AppNode) : n));
  const ev = evaluateHeadless(patched, edges, lib);
  const outs = objectives.map((id) => {
    const out = ev.results.get(id)?.outs.out;
    return out?.type === 'objective' && Number.isFinite(out.objective.cost) ? out.objective : null;
  });
  const parts = outs.map((o) => (o ? o.cost : Infinity));
  // Residuals for least squares: an objective without its own residuals contributes √cost (if cost ≥ 0).
  const residuals = outs.flatMap((o) => (!o ? [NaN] : o.residuals ?? [o.cost >= 0 ? Math.sqrt(o.cost) : NaN]));
  return { merit: parts.reduce((s, p) => s + p, 0), parts, residuals };
}
