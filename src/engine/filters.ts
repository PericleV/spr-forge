// Filter designer: presets, the target samples, the start designs and the run of a design in a worker.
import { useSyncExternalStore } from 'react';
import type { FilterBand, FilterData } from '../types.ts';
import { MATERIAL_LETTERS, nAtRef, parseFormula, type Design, type DesignLayer, type DesignProblem, type DesignSettings, type Progress } from './design.ts';
import type { DesignDone, DesignMsg, DesignProgress } from './design.worker.ts';

export type Preset = Exclude<FilterData['preset'], 'custom'>;

export const PRESETS: Record<Preset, { label: string; lmin: number; lmax: number; bands: FilterBand[]; lambdaRef: number; start: Pick<FilterData, 'start' | 'startPeriods' | 'startMat' | 'startD'>; note: string }> = {
  ar: {
    label: 'Anti-reflection',
    lmin: 400, lmax: 750, lambdaRef: 550,
    bands: [{ lo: 450, hi: 700, q: 'R', value: 0, weight: 1 }],
    start: { start: 'layer', startPeriods: 4, startMat: 1, startD: 100 },
    note: 'R → 0 over the visible; start from one low-index layer.',
  },
  longpass: {
    label: 'Long-pass edge',
    lmin: 400, lmax: 800, lambdaRef: 460,
    bands: [{ lo: 400, hi: 520, q: 'T', value: 0, weight: 1 }, { lo: 580, hi: 800, q: 'T', value: 1, weight: 1 }],
    start: { start: 'qw', startPeriods: 6, startMat: 0, startD: 100 },
    note: 'Blocks short wavelengths; start from a quarter-wave stack centred in the stop band.',
  },
  shortpass: {
    label: 'Short-pass edge',
    lmin: 400, lmax: 800, lambdaRef: 690,
    bands: [{ lo: 400, hi: 580, q: 'T', value: 1, weight: 1 }, { lo: 640, hi: 800, q: 'T', value: 0, weight: 1 }],
    start: { start: 'qw', startPeriods: 6, startMat: 0, startD: 100 },
    note: 'Blocks long wavelengths.',
  },
  bandpass: {
    label: 'Band-pass',
    lmin: 400, lmax: 800, lambdaRef: 550,
    bands: [{ lo: 400, hi: 490, q: 'T', value: 0, weight: 1 }, { lo: 530, hi: 570, q: 'T', value: 1, weight: 2 }, { lo: 610, hi: 800, q: 'T', value: 0, weight: 1 }],
    start: { start: 'qw', startPeriods: 5, startMat: 0, startD: 100 },
    note: 'A pass band between two stop bands (needs many layers).',
  },
  notch: {
    label: 'Notch (band-stop)',
    lmin: 400, lmax: 800, lambdaRef: 550,
    bands: [{ lo: 400, hi: 500, q: 'T', value: 1, weight: 1 }, { lo: 535, hi: 565, q: 'T', value: 0, weight: 2 }, { lo: 600, hi: 800, q: 'T', value: 1, weight: 1 }],
    start: { start: 'qw', startPeriods: 6, startMat: 0, startD: 100 },
    note: 'Reflects a narrow band, transmits the rest.',
  },
  mirror: {
    label: 'Broadband mirror',
    lmin: 400, lmax: 800, lambdaRef: 560,
    bands: [{ lo: 450, hi: 680, q: 'R', value: 1, weight: 1 }],
    start: { start: 'qw', startPeriods: 8, startMat: 0, startD: 100 },
    note: 'High reflection over a wide band.',
  },
};

export const FILTER_DEFAULTS: FilterData = {
  name: '',
  preset: 'longpass',
  bands: PRESETS.longpass.bands,
  lmin: 400,
  lmax: 800,
  step: 5,
  targetQ: 'T',
  angles: '0',
  pol: 'unpolarized',
  materials: 2,
  thick: false,
  dSub: 1,
  sides: 'front',
  minD: 5,
  maxD: 1000,
  maxLayers: 40,
  maxTotal: 4000,
  algorithm: 'needle',
  iterations: 30,
  needleStep: 5,
  lambdaRef: 460,
  ...PRESETS.longpass.start,
  design: { front: [], back: [] },
  merit: NaN,
  history: [],
};

// Start design for a run.
export function startDesign(d: FilterData, p: DesignProblem): Design {
  const cur = d.design;
  const nL = p.mats.length;
  const qw = (m: number) => d.lambdaRef / 4 / nAtRef(p, m, d.lambdaRef);
  const make = (): DesignLayer[] => {
    if (d.start === 'bare') return [];
    if (d.start === 'layer') return [{ m: Math.min(nL - 1, Math.max(0, d.startMat)), d: d.startD }];
    if (d.start === 'formula') {
      const f = parseFormula(d.formula ?? '', MATERIAL_LETTERS.slice(0, nL));
      return typeof f === 'string' ? [] : f.map((x) => ({ m: x.m, d: x.q * qw(x.m) }));
    }
    // quarter-wave stack H L H L … (materials 0 and 1)
    return Array.from({ length: 2 * Math.max(1, d.startPeriods) }, (_, i) => ({ m: i % 2, d: qw(i % 2) }));
  };
  if (d.start === 'current') return { front: cur.front.filter((L) => L.m < nL), back: cur.back.filter((L) => L.m < nL) };
  return { front: p.sides.includes('front') ? make() : cur.front.filter((L) => L.m < nL), back: p.sides.includes('back') ? make() : cur.back.filter((L) => L.m < nL) };
}

// ---- Runs (one per Filter node), in a worker ----

// threads: the sub-workers refining in parallel (deep search, design cleaner), 0 = sequential
export type DesignRunState = { status: 'running' | 'done' | 'stopped' | 'error'; phase: string; iteration: number; merit: number; history: number[]; historyD: number[]; layers: number; message?: string; started: number; elapsed: number; threads: number };

const states = new Map<string, DesignRunState>();
const workers = new Map<string, Worker>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useDesignRun = (id: string) => useSyncExternalStore(subscribe, () => states.get(id));

// Deep search and the design cleaner refine their candidates side by side in sub-workers: made here (workers inside
// workers are not available in every browser), each connected to the design worker by a MessageChannel. Two cores are
// left to the page and the design worker.
function makeRefiners(settings: DesignSettings, onFail: () => void): { workers: Worker[]; ports: MessagePort[] } {
  const size = settings.algorithm === 'deep' || settings.algorithm === 'clean' ? Math.min(8, (navigator.hardwareConcurrency || 2) - 2) : 0;
  const workers: Worker[] = [];
  const ports: MessagePort[] = [];
  if (size < 2) return { workers, ports };
  try {
    for (let k = 0; k < size; k++) {
      const r = new Worker(new URL('./refine.worker.ts', import.meta.url), { type: 'module' });
      r.onerror = (e) => {
        e.preventDefault();
        onFail();
      };
      workers.push(r);
      const ch = new MessageChannel();
      r.postMessage({ port: ch.port2 }, [ch.port2]);
      ports.push(ch.port1);
    }
  } catch {
    workers.forEach((r) => r.terminate());
    return { workers: [], ports: [] };
  }
  return { workers, ports };
}

export function startDesignRun(id: string, problem: DesignProblem, start: Design, settings: DesignSettings, onProgress: (p: Progress, final: boolean) => void) {
  if (workers.has(id)) return;
  const w = new Worker(new URL('./design.worker.ts', import.meta.url), { type: 'module' });
  workers.set(id, w);
  let threads = 0;
  const refiners = makeRefiners(settings, () => {
    if (!threads) return;
    threads = 0; // the run goes on sequentially
    w.postMessage({ type: 'pool-failed' } satisfies DesignMsg);
  });
  threads = refiners.workers.length;
  const started = Date.now();
  states.set(id, { status: 'running', phase: 'starting', iteration: 0, merit: NaN, history: [], historyD: [], layers: 0, started, elapsed: 0, threads });
  emit();
  const update = (p: Progress, status: DesignRunState['status']) => {
    states.set(id, {
      status,
      phase: p.phase,
      iteration: p.iteration,
      merit: p.merit,
      history: p.history,
      historyD: p.historyD,
      layers: p.design.front.length + p.design.back.length,
      started,
      elapsed: (Date.now() - started) / 1000,
      threads,
    });
    emit();
  };
  const end = () => {
    w.terminate();
    refiners.workers.forEach((r) => r.terminate());
    workers.delete(id);
  };
  const failed = (message: string) => {
    end();
    const s = states.get(id)!;
    states.set(id, { ...s, status: 'error', message, elapsed: (Date.now() - started) / 1000 });
    emit();
  };
  // the design worker itself cannot start or breaks (an error it did not catch)
  w.onerror = (e) => {
    e.preventDefault();
    failed(e.message || 'The design worker stopped unexpectedly.');
  };
  w.onmessage = (e: MessageEvent<DesignProgress | DesignDone>) => {
    const m = e.data;
    if (m.type === 'progress') {
      update(m.progress, 'running');
      onProgress(m.progress, false);
    } else {
      if (m.error) failed(m.error);
      else {
        end();
        update(m.progress!, m.progress!.phase === 'stopped' ? 'stopped' : 'done');
        onProgress(m.progress!, true);
      }
    }
  };
  w.postMessage({ type: 'start', problem, start, settings, ports: refiners.ports } satisfies DesignMsg, refiners.ports);
}

export function stopDesignRun(id: string) {
  workers.get(id)?.postMessage({ type: 'stop' } satisfies DesignMsg);
}
