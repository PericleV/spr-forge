// RCWA field maps: computed on demand (Run) in a worker. The results are kept here (not in the project file) and read
// by the graph evaluator; a node shows a result only when its key matches the current inputs.
import { useSyncExternalStore } from 'react';
import type { FieldMap, FieldPart, FieldQuantity } from '../physics/rcwaField.ts';
import type { Polarization } from '../physics/tmm.ts';
import type { TmmSpec } from './types.ts';

export type FieldJob = {
  spec: TmmSpec;
  idx: number[]; // sweep steps
  lam: number;
  theta: number;
  phi?: number; // azimuth (degrees, conical incidence when ≠ 0)
  jones?: { psi: number; delta: number }; // an incident Jones state instead of `pol`
  pol: Polarization;
  quantity: FieldQuantity;
  part: FieldPart;
  periods: number;
  nx: number;
  nz: number;
  zIn: number;
  zOut: number;
};
export type FieldMsg = { type: 'progress'; p: number } | { type: 'done'; map: FieldMap; period: number } | { type: 'error'; message: string };

export const fieldResults = new Map<string, { key: string; map: FieldMap; period: number }>();

type RunState = { status: 'running' | 'done' | 'error'; progress: number; message?: string; seconds: number };
const states = new Map<string, RunState>();
const workers = new Map<string, Worker>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useFieldRun = (id: string) => useSyncExternalStore(subscribe, () => states.get(id));

export function runFieldMap(id: string, key: string, job: FieldJob, onDone: () => void) {
  workers.get(id)?.terminate();
  const w = new Worker(new URL('./rcwaField.worker.ts', import.meta.url), { type: 'module' });
  workers.set(id, w);
  const t0 = Date.now();
  states.set(id, { status: 'running', progress: 0, seconds: 0 });
  emit();
  w.onmessage = (e: MessageEvent<FieldMsg>) => {
    const m = e.data;
    if (m.type === 'progress') {
      states.set(id, { status: 'running', progress: m.p, seconds: (Date.now() - t0) / 1000 });
      emit();
      return;
    }
    w.terminate();
    workers.delete(id);
    if (m.type === 'done') {
      fieldResults.set(id, { key, map: m.map, period: m.period });
      states.set(id, { status: 'done', progress: 1, seconds: (Date.now() - t0) / 1000 });
      onDone();
    } else states.set(id, { status: 'error', progress: 0, message: m.message, seconds: (Date.now() - t0) / 1000 });
    emit();
  };
  w.postMessage(job);
}

export function stopFieldMap(id: string) {
  workers.get(id)?.terminate();
  workers.delete(id);
  states.delete(id);
  emit();
}
