// Runs optimizations off the UI thread: a pool of workers scores candidates, the algorithm itself (cheap)
// runs here between batches. One run per Optimizer node; state is exposed with useRunState.
import { useSyncExternalStore } from 'react';
import type { Edge } from '@xyflow/react';
import type { MaterialDef } from '../physics/materials.ts';
import type { AppNode, OptimizerData, OptimizerRun } from '../types.ts';
import {
  adam,
  differentialEvolution,
  genetic,
  levenbergMarquardtBatch,
  mergeParams,
  nelderMead,
  nsga2,
  particleSwarm,
  simulatedAnnealing,
  Tracker,
  type AlgoParams,
  type Box,
  type Control,
  type EvalResult,
  type FrontPoint,
  type Progress,
} from './optimize.ts';
import type { OptEval, OptInit, OptResult } from './opt.worker.ts';

export type RunStatus = 'idle' | 'running' | 'paused' | 'done' | 'stopped' | 'error';
export type RunState = {
  status: RunStatus;
  phase: string;
  iteration: number;
  evaluations: number;
  best: number;
  bestX: number[];
  bestParts: number[];
  history: number[];
  started: number;
  elapsed: number; // s
  message?: string;
  variables: { id: string; name: string }[];
  objectives: string[]; // names, in the order of bestParts / front costs
  front?: FrontPoint[]; // multi-objective runs
  snapshot: string; // key of the graph the run started from
};

const states = new Map<string, RunState>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const setState = (id: string, patch: Partial<RunState>) => {
  const prev = states.get(id);
  if (prev) states.set(id, { ...prev, ...patch });
  emit();
};

export const useRunState = (id: string) => useSyncExternalStore(subscribe, () => states.get(id));

type Controller = { stop: boolean; paused: boolean; resume?: () => void; pool: Pool };
const controllers = new Map<string, Controller>();

// Worker pool: every worker holds the same graph snapshot; a batch is split evenly between them.
class Pool {
  private workers: Worker[];
  private nextId = 0;
  private waiting = new Map<number, (r: OptResult) => void>();
  constructor(size: number, init: OptInit) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./opt.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<OptResult>) => {
        this.waiting.get(e.data.id)?.(e.data);
        this.waiting.delete(e.data.id);
      };
      w.postMessage(init);
      return w;
    });
  }
  async evaluate(xs: number[][], residuals = false): Promise<EvalResult> {
    const n = this.workers.length;
    const chunk = Math.ceil(xs.length / n);
    const jobs = this.workers.flatMap((w, i) => {
      const part = xs.slice(i * chunk, (i + 1) * chunk);
      if (!part.length) return [];
      const id = this.nextId++;
      return [
        new Promise<OptResult>((resolve) => {
          this.waiting.set(id, resolve);
          w.postMessage({ type: 'eval', id, xs: part, residuals } satisfies OptEval);
        }),
      ];
    });
    const res = await Promise.all(jobs);
    const bad = res.find((r) => r.type === 'error');
    if (bad && bad.type === 'error') throw new Error(bad.message);
    return {
      merits: res.flatMap((r) => (r.type === 'result' ? r.merits : [])),
      parts: res.flatMap((r) => (r.type === 'result' ? r.parts : [])),
      residuals: residuals ? res.flatMap((r) => (r.type === 'result' ? (r.residuals ?? []) : [])) : undefined,
    };
  }
  terminate() {
    this.workers.forEach((w) => w.terminate());
  }
}

// Algorithm settings of a node: stored values over the defaults (lr / starts of Adam kept from older projects).
export const paramsOf = (d: OptimizerData): AlgoParams => mergeParams({ ...d.params, adam: { lr: d.lr, starts: d.starts, ...d.params?.adam } });

export type StartArgs = {
  nodeId: string;
  nodes: AppNode[]; // snapshot: the objectives and everything upstream
  edges: Edge[];
  materials: MaterialDef[];
  variables: { id: string; name: string; value: number; min: number; max: number; integer: boolean }[];
  objectives: string[];
  objectiveNames: string[];
  settings: OptimizerData;
  snapshot: string;
  // the end of a run: its record (null: an error or no point evaluated) — one update of the node, so nothing else
  // written at the same moment can overwrite it
  onFinish: (run: OptimizerRun | null) => void;
};

export function startRun(a: StartArgs) {
  if (controllers.has(a.nodeId)) return;
  const size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  const pool = new Pool(size, {
    type: 'init',
    nodes: a.nodes,
    edges: a.edges,
    materials: a.materials,
    variables: a.variables.map((v) => ({ id: v.id, integer: v.integer })),
    objectives: a.objectives,
  });
  const c: Controller = { stop: false, paused: false, pool };
  controllers.set(a.nodeId, c);
  const started = Date.now();
  states.set(a.nodeId, {
    status: 'running',
    phase: 'starting',
    iteration: 0,
    evaluations: 0,
    best: Infinity,
    bestX: a.variables.map((v) => v.value),
    bestParts: [],
    history: [],
    started,
    elapsed: 0,
    variables: a.variables.map((v) => ({ id: v.id, name: v.name })),
    objectives: a.objectiveNames,
    snapshot: a.snapshot,
  });
  emit();

  const box: Box = { lo: a.variables.map((v) => v.min), hi: a.variables.map((v) => v.max), integer: a.variables.map((v) => v.integer) };
  const tracker = new Tracker((xs, residuals) => pool.evaluate(xs, residuals), box);
  let last = 0;
  let lastIteration = 0; // reports are throttled; the final state still shows the last iteration
  const ctl: Control = {
    stopped: () => c.stop,
    waitIfPaused: () => (c.paused ? new Promise<void>((resolve) => (c.resume = resolve)) : Promise.resolve()),
    report: (p: Progress) => {
      lastIteration = p.iteration;
      const now = Date.now();
      if (now - last < 100 && p.iteration > 1) return; // at most ~10 UI updates per second
      last = now;
      setState(a.nodeId, {
        phase: p.phase,
        iteration: p.iteration,
        evaluations: p.evaluations,
        best: p.best,
        bestX: p.bestX,
        bestParts: p.bestParts,
        history: p.history.slice(),
        front: p.front ?? states.get(a.nodeId)?.front,
        elapsed: (now - started) / 1000,
      });
    },
  };
  const s = a.settings;
  const x0 = a.variables.map((v) => Math.min(v.max, Math.max(v.min, v.value)));
  (async () => {
    try {
      const P = paramsOf(s);
      const pop = { iterations: s.iterations, population: s.population, seed: s.seed };
      let front: FrontPoint[] | undefined;
      if (s.algorithm === 'adam') {
        // two stages: masks over the objectives (in the order of their costs)
        const maskOf = (ids: string[]) => a.objectives.map((id) => ids.includes(id));
        const { stage1Iter, stage1Lr, stage1Obj, stage2Obj, ...rest } = P.adam;
        await adam(
          tracker,
          box,
          x0,
          { iterations: s.iterations, seed: s.seed, ...rest, stage1: stage1Iter > 0 ? { iterations: stage1Iter, lr: stage1Lr, mask: maskOf(stage1Obj) } : undefined, stage2Mask: stage2Obj.length ? maskOf(stage2Obj) : undefined },
          ctl,
        );
      }
      else if (s.algorithm === 'de') await differentialEvolution(tracker, box, x0, { ...pop, ...P.de }, ctl);
      else if (s.algorithm === 'ga') await genetic(tracker, box, x0, { ...pop, ...P.ga }, ctl);
      else if (s.algorithm === 'pso') await particleSwarm(tracker, box, x0, { ...pop, ...P.pso }, ctl);
      else if (s.algorithm === 'nsga2') front = await nsga2(tracker, box, x0, { ...pop, ...P.nsga2 }, ctl);
      else if (s.algorithm === 'lm') await levenbergMarquardtBatch(tracker, box, x0, { iterations: s.iterations, ...P.lm }, ctl);
      else if (s.algorithm === 'sa') await simulatedAnnealing(tracker, box, x0, { iterations: s.iterations, seed: s.seed, ...P.sa }, ctl);
      else await nelderMead(tracker, box, x0, { iterations: s.iterations, ...P.nm }, ctl);
      if (front) setState(a.nodeId, { front });
      if (s.polish && !['nm', 'lm', 'nsga2'].includes(s.algorithm) && !c.stop && tracker.bestX.length)
        await nelderMead(tracker, box, tracker.bestX, { iterations: Math.max(50, 20 * box.lo.length), step: 0.02 }, ctl, 'Polish (Nelder-Mead)');
      finish(c.stop ? 'stopped' : 'done');
    } catch (err) {
      finish('error', err instanceof Error ? err.message : String(err));
    }
  })();

  function finish(status: RunStatus, message?: string) {
    pool.terminate();
    controllers.delete(a.nodeId);
    const elapsed = (Date.now() - started) / 1000;
    setState(a.nodeId, {
      status,
      message,
      best: tracker.best,
      bestX: tracker.bestX,
      bestParts: tracker.bestParts,
      history: tracker.history.slice(),
      evaluations: tracker.evaluations,
      elapsed,
      iteration: lastIteration,
    });
    if (status === 'error' || !tracker.bestX.length) a.onFinish(null);
    else
      a.onFinish({
        id: Math.random().toString(36).slice(2, 8),
        algorithm: s.algorithm,
        started,
        seconds: elapsed,
        evaluations: tracker.evaluations,
        merit: tracker.best,
        values: Object.fromEntries(a.variables.map((v, i) => [v.id, tracker.bestX[i]])),
        start: Object.fromEntries(a.variables.map((v) => [v.id, v.value])),
        names: Object.fromEntries(a.variables.map((v) => [v.id, v.name])),
        history: downsample(tracker.history, 400),
        stopped: status === 'stopped',
        objectives: a.objectiveNames,
        front: states.get(a.nodeId)?.front?.slice(0, 300),
      });
  }
}

const downsample = (h: number[], n: number) => (h.length <= n ? h.slice() : Array.from({ length: n }, (_, i) => h[Math.round((i * (h.length - 1)) / (n - 1))]));

export function pauseRun(id: string) {
  const c = controllers.get(id);
  if (!c) return;
  c.paused = true;
  setState(id, { status: 'paused' });
}

export function resumeRun(id: string) {
  const c = controllers.get(id);
  if (!c) return;
  c.paused = false;
  c.resume?.();
  c.resume = undefined;
  setState(id, { status: 'running' });
}

export function stopRun(id: string) {
  const c = controllers.get(id);
  if (!c) return;
  c.stop = true;
  if (c.paused) resumeRun(id);
}
