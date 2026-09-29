// Convergence check of Compute RCWA (N, 1.5 N, 2 N orders at a sample of grid points), run on demand in a worker.
// Results are kept here (not in the project file), keyed by the job key they were computed for.
import { useSyncExternalStore } from 'react';
import type { ConvRow } from './runRcwa.ts';
import type { TmmSpec } from './types.ts';

export type ConvJob = { spec: TmmSpec; points: number[]; Ns: number[] };
export type ConvMsg = { type: 'progress'; p: number } | { type: 'done'; rows: ConvRow[] } | { type: 'error'; message: string };
export type ConvState = {
  key: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  seconds: number;
  points: number;
  rows?: ConvRow[];
  message?: string;
};

const states = new Map<string, ConvState>();
const workers = new Map<string, Worker>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useConvRun = (id: string) => useSyncExternalStore(subscribe, () => states.get(id));

export function runConvergence(id: string, key: string, job: ConvJob) {
  workers.get(id)?.terminate();
  const w = new Worker(new URL('./rcwaConv.worker.ts', import.meta.url), { type: 'module' });
  workers.set(id, w);
  const t0 = Date.now();
  const base = { key, points: job.points.length };
  states.set(id, { ...base, status: 'running', progress: 0, seconds: 0 });
  emit();
  w.onmessage = (e: MessageEvent<ConvMsg>) => {
    const m = e.data;
    const seconds = (Date.now() - t0) / 1000;
    if (m.type === 'progress') states.set(id, { ...base, status: 'running', progress: m.p, seconds });
    else {
      w.terminate();
      workers.delete(id);
      states.set(id, m.type === 'done' ? { ...base, status: 'done', progress: 1, seconds, rows: m.rows } : { ...base, status: 'error', progress: 0, seconds, message: m.message });
    }
    emit();
  };
  w.postMessage(job);
}

export function stopConvergence(id: string) {
  workers.get(id)?.terminate();
  workers.delete(id);
  states.delete(id);
  emit();
}

// Largest change of R or T against the reference (the last row, most orders), per row.
export function convDeviation(rows: ConvRow[]): number[] {
  const ref = rows[rows.length - 1];
  return rows.map((r) => Math.max(0, ...r.R.map((v, i) => Math.abs(v - ref.R[i])), ...r.T.map((v, i) => Math.abs(v - ref.T[i]))));
}
