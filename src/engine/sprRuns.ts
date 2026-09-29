// Genetic algorithm over layer sequences (Optimization Engine, algorithm 'layerga'): the runs (one per node) in a worker.
import { useSyncExternalStore } from 'react';
import type { LayerGaData } from '../types.ts';
import type { SprProblem, SprProgress, SprSettings } from './sprDesign.ts';
import type { SprMsg, SprOut } from './sprDesign.worker.ts';

export const layerGaSettings = (d: LayerGaData): SprSettings => ({ population: d.population, generations: d.generations, elite: d.elite, mutation: d.mutation, seed: d.seed });

export type SprRunState = {
  status: 'running' | 'done' | 'stopped' | 'error';
  phase: SprProgress['phase'];
  generation: number;
  generations: number;
  tried: number;
  found: number; // structures of the first population found so far
  best: number;
  feasible: number;
  evaluations: number;
  history: number[];
  mean: number[];
  scatter: { x: number[]; y: number[] }; // fitness of every member of every population (generation, fitness)
  message?: string;
  started: number;
  elapsed: number;
};

const states = new Map<string, SprRunState>();
const stopping = new Set<string>(); // runs asked to stop (their end is 'stopped', not 'done')
const workers = new Map<string, Worker>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSprRun = (id: string) => useSyncExternalStore(subscribe, () => states.get(id));

export function startSprRun(id: string, problem: SprProblem, settings: SprSettings, onProgress: (p: SprProgress, final: boolean) => void) {
  if (workers.has(id)) return;
  const w = new Worker(new URL('./sprDesign.worker.ts', import.meta.url), { type: 'module' });
  workers.set(id, w);
  const started = Date.now();
  let state: SprRunState = { status: 'running', phase: 'initial', generation: 0, generations: settings.generations, tried: 0, found: 0, best: NaN, feasible: 0, evaluations: 0, history: [], mean: [], scatter: { x: [], y: [] }, started, elapsed: 0 };
  const set = (s: SprRunState) => {
    state = s;
    states.set(id, s);
    emit();
  };
  set(state);
  const update = (m: Extract<SprOut, { populations: unknown }>, status: SprRunState['status']) => {
    const x = [...state.scatter.x];
    const y = [...state.scatter.y];
    for (const pop of m.populations)
      for (const f of pop.fitness) {
        x.push(pop.generation);
        y.push(f);
      }
    const p = m.progress;
    set({
      ...state,
      status,
      ...(p ? { phase: p.phase, generation: p.generation, tried: p.tried, found: p.population.length, best: p.best?.ev.fitness ?? NaN, feasible: p.feasible, evaluations: p.evaluations, history: p.history, mean: p.mean } : {}),
      scatter: { x, y },
      elapsed: (Date.now() - started) / 1000,
    });
  };
  const end = () => {
    w.terminate();
    workers.delete(id);
  };
  w.onerror = (e) => {
    e.preventDefault();
    end();
    set({ ...state, status: 'error', message: e.message || 'The worker stopped unexpectedly.', elapsed: (Date.now() - started) / 1000 });
  };
  w.onmessage = (e: MessageEvent<SprOut>) => {
    const m = e.data;
    if (m.type === 'progress') {
      update(m, 'running');
      if (m.progress.best && m.progress.phase === 'evolve') onProgress(m.progress, false);
      return;
    }
    end();
    if (m.error) {
      update(m, 'error');
      set({ ...state, message: m.error });
      return;
    }
    update(m, stopping.has(id) ? 'stopped' : 'done');
    stopping.delete(id);
    if (m.progress?.best) onProgress(m.progress, true);
  };
  w.postMessage({ type: 'start', problem, settings } satisfies SprMsg);
}

export function stopSprRun(id: string) {
  const w = workers.get(id);
  if (!w) return;
  stopping.add(id);
  w.postMessage({ type: 'stop' } satisfies SprMsg);
}
