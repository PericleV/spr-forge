// Runs graph evaluation on logical changes and executes TMM jobs in web workers.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { Library } from '../physics/library.ts';
import type { AppNode } from '../types.ts';
import { metaOfSpec } from './run.ts';
import { evaluateGraph, type JobState } from './evaluate.ts';
import { runJob } from './computePool.ts';
import type { Dataset, Fields, NodeResult, TmmJob } from './types.ts';

// The results kept (to go back to an earlier input without recomputing), by their memory: every array of every result
const MAX_CACHE_BYTES = 768e6;
const MAX_CACHE_ENTRIES = 40;
const bytesOf = (d: Dataset) => Object.values(d.fields).reduce((a, f) => a + f.byteLength, 0);

export type JobProgress = { p: number; seconds: number };
// reset: a project was loaded (its node ids may repeat: no "previous result" of another project)
export type JobControl = { run: (requester: string, key: string) => void; stop: (requester: string) => void; reset: () => void };
export type EngineState = { results: Map<string, NodeResult>; progress: Record<string, JobProgress>; control: JobControl };

const noControl: JobControl = { run: () => {}, stop: () => {}, reset: () => {} };
export const EngineContext = createContext<EngineState>({ results: new Map(), progress: {}, control: noControl });
export const useNodeResult = (id: string) => useContext(EngineContext).results.get(id);
export const useProgress = (id: string) => useContext(EngineContext).progress[id]?.p;
export const useJobProgress = (id: string) => useContext(EngineContext).progress[id];
export const useJobControl = () => useContext(EngineContext).control;

// View-only node data (plot settings, drawing style) does not affect evaluation.
const VIEW_ONLY = new Set(['plot', 'compare', 'draw', 'optimizer', 'info', 'frame']);
// The label above a node and its collapsed state are view-only too.
const logical = (d: Record<string, unknown>) => {
  if (!('caption' in d) && !('collapsed' in d)) return d;
  const { caption: _c, collapsed: _k, ...rest } = d;
  return rest;
};
// An Info node's title and text feed Combine notes: they count once the note is connected (typing in a free note
// does not re-evaluate the graph); its colour and size never do, nor the size of Combine notes.
export const logicalKey = (nodes: AppNode[], edges: Edge[]) => {
  const linked = new Set(edges.map((e) => e.source));
  return JSON.stringify([
    nodes.map((n) => [
      n.id,
      n.type,
      // The optimizer's outputs depend only on its stored runs and output choices — and, for the layer-sequence
      // algorithm, on its settings and best structure (not on its convergence history).
      n.type === 'optimizer'
        ? [
            n.data.runs.map((r) => [r.id, r.values, r.front?.length]),
            n.data.outputRun,
            n.data.outputPoint,
            n.data.outputCompute,
            n.data.live,
            n.data.algorithm === 'layerga' ? { ...n.data.layerGa, history: undefined, mean: undefined, lineage: undefined } : null,
          ]
        : n.type === 'info'
          ? linked.has(n.id)
            ? [n.data.title, n.data.text]
            : null
          : n.type === 'notes'
            ? [n.data.name, n.data.count]
            : VIEW_ONLY.has(n.type)
              ? null
              : logical(n.data),
    ]),
    edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
  ]);
};

function store(s: JobState, job: TmmJob, fields: Fields, seconds: number) {
  s.cache.delete(job.key);
  s.cache.set(job.key, { key: job.key, spec: job.spec, axes: job.axes, fields, meta: metaOfSpec(job.spec), size: fields.R.length, seconds });
  s.lastDone.set(job.requester, job.key);
  s.failed.delete(job.requester);
  // Evict oldest entries, never ones currently shown by a node.
  const pinned = new Set(s.lastDone.values());
  let total = 0;
  for (const d of s.cache.values()) total += bytesOf(d);
  for (const [k, d] of s.cache) {
    if (total <= MAX_CACHE_BYTES && s.cache.size <= MAX_CACHE_ENTRIES) break;
    if (pinned.has(k)) continue;
    s.cache.delete(k);
    total -= bytesOf(d);
  }
}

export function useEngine(nodes: AppNode[], edges: Edge[], lib: Library): EngineState {
  const [jobState] = useState<JobState>(() => ({ cache: new Map(), lastDone: new Map(), failed: new Map(), armed: new Map() }));
  const running = useRef(new Map<string, { key: string; cancel: () => void }>());
  const [version, setVersion] = useState(0);
  const [progress, setProgress] = useState<Record<string, JobProgress>>({});
  // Run arms the job key (kept in memory only: a loaded project does not start RCWA by itself); Stop disarms it and the
  // next evaluation no longer asks for the job, so its worker is terminated.
  const control = useMemo<JobControl>(
    () => ({
      run: (requester, key) => {
        jobState.armed!.set(requester, key);
        jobState.failed.delete(requester);
        setVersion((v) => v + 1);
      },
      stop: (requester) => {
        jobState.armed!.delete(requester);
        setVersion((v) => v + 1);
      },
      reset: () => {
        jobState.armed!.clear();
        jobState.lastDone.clear();
        jobState.failed.clear();
        setVersion((v) => v + 1);
      },
    }),
    [jobState],
  );

  const key = logicalKey(nodes, edges);
  const evaluation = useMemo(
    () => evaluateGraph(nodes, edges, jobState, lib),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, version, jobState, lib],
  );

  useEffect(() => {
    const run = running.current;
    for (const r of [...jobState.lastDone.keys()]) if (!evaluation.requesters.has(r)) jobState.lastDone.delete(r);
    for (const r of [...(jobState.armed?.keys() ?? [])]) if (!evaluation.requesters.has(r)) jobState.armed!.delete(r);

    const wanted = new Map(evaluation.jobs.map((j) => [j.requester, j]));
    for (const [req, r] of run) {
      if (wanted.get(req)?.key === r.key) continue;
      r.cancel();
      run.delete(req);
    }
    // each job on the cores of the compute pool (cut into parts when it is large enough)
    for (const job of evaluation.jobs) {
      if (run.has(job.requester)) continue;
      const t0 = Date.now();
      const finish = () => {
        run.delete(job.requester);
        setProgress((p) => {
          const next = { ...p };
          delete next[job.requester];
          return next;
        });
        setVersion((v) => v + 1);
      };
      const handle = runJob(
        job.spec,
        (p) => setProgress((q) => ({ ...q, [job.requester]: { p, seconds: (Date.now() - t0) / 1000 } })),
        (fields) => {
          store(jobState, job, fields, (Date.now() - t0) / 1000);
          finish();
        },
        (message) => {
          jobState.failed.set(job.requester, { key: job.key, message });
          finish();
        },
      );
      run.set(job.requester, { key: job.key, cancel: handle.cancel });
    }
  }, [evaluation, jobState]);

  useEffect(() => {
    const run = running.current;
    return () => {
      for (const r of run.values()) r.cancel();
      run.clear();
    };
  }, []);

  return useMemo(() => ({ results: evaluation.results, progress, control }), [evaluation, progress, control]);
}
