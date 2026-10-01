// Compute TMM / RCWA jobs on several cores. A job's grid is cut into small contiguous ranges of points (parts); the parts
// of all the running jobs wait in one queue, and a pool of persistent workers (every core but one, kept for the interface)
// takes them one by one — the load balances itself, and warm workers do not compile the code again for every part. Each
// worker gets a job's spec once; the parts are joined here and the group delay added at the end (it needs whole λ lines).
// A worker idle for a minute is closed.
import { specSize, withGroupDelay, type PointRange } from './run.ts';
import type { Fields, TmmSpec } from './types.ts';
import type { WorkerIn, WorkerMsg } from './tmm.worker.ts';

export const computeSlots = () => Math.max(1, (globalThis.navigator?.hardwareConcurrency || 4) - 1);

// How many parts a job is cut into: up to 4 per slot (balance), each with enough work. Measured: TMM ≈ 0.2–0.3 µs per
// point and layer, Berreman 4×4 some 30× more — a part holds ≥ 3·10⁵ point-layers (≈ 0.1 s); RCWA takes milliseconds to
// seconds per point — down to one point per part. (On an 8-core laptop with 16 threads RCWA gains up to ~4×: the clock
// drops with every core busy and hyper-threading adds little to matrix algebra.)
export function partsFor(spec: TmmSpec, slots: number): number {
  const size = specSize(spec);
  const most = Math.min(size, 4 * slots);
  if (spec.rcwa) return Math.max(1, most);
  const layers = [...spec.layers, ...(spec.back?.layers ?? [])].reduce((a, L) => a + (L.lc ? L.lc.slices : 1) + (L.rough ? 10 : 0), 0);
  const units = size * layers * (spec.b4 ? 30 : 1);
  return Math.max(1, Math.min(most, Math.floor(units / 3e5)));
}

// The ranges of n parts of nearly the same size.
export const splitRange = (size: number, n: number): PointRange[] =>
  Array.from({ length: n }, (_, i) => [Math.floor((i * size) / n), Math.floor(((i + 1) * size) / n)] as PointRange).filter(([a, b]) => b > a);

// The parts joined into the arrays of the whole grid (each part: arrays of its own points).
export function joinParts(spec: TmmSpec, parts: { range: PointRange; fields: Fields }[]): Fields {
  const size = specSize(spec);
  const out: Record<string, Float64Array> = {};
  for (const key of Object.keys(parts[0].fields)) {
    const a = (out[key] = new Float64Array(size));
    for (const p of parts) a.set((p.fields as Record<string, Float64Array>)[key], p.range[0]);
  }
  return withGroupDelay(spec, out as Fields);
}

type Job = {
  id: number;
  spec: TmmSpec;
  size: number;
  parts: Part[];
  left: number;
  cancelled: boolean;
  reported: number;
  onProgress: (p: number) => void;
  onDone: (fields: Fields) => void;
  onError: (message: string) => void;
};
type Part = { job: Job; range?: PointRange; p: number; fields?: Fields };
type Slot = { w: Worker; part?: Part; specs: Set<number>; idle?: ReturnType<typeof setTimeout> };

const IDLE_MS = 60_000;
const queue: Part[] = [];
const slots: Slot[] = [];
let nextJob = 1;

const send = (s: Slot, m: WorkerIn) => s.w.postMessage(m);

function spawn(): Slot {
  const s: Slot = { w: new Worker(new URL('./tmm.worker.ts', import.meta.url), { type: 'module' }), specs: new Set() };
  s.w.onmessage = (e: MessageEvent<WorkerMsg>) => onMessage(s, e.data);
  s.w.onerror = (e) => {
    e.preventDefault();
    const job = s.part?.job;
    drop(s);
    if (job) fail(job, e.message || 'worker error');
    pump();
  };
  slots.push(s);
  return s;
}

// a worker closed (crashed, idle, or busy with a cancelled job)
function drop(s: Slot) {
  clearTimeout(s.idle);
  s.w.terminate();
  slots.splice(slots.indexOf(s), 1);
}

function pump() {
  while (queue.length) {
    const s = slots.find((x) => !x.part) ?? (slots.length < computeSlots() ? spawn() : undefined);
    if (!s) return;
    const part = queue.shift()!;
    clearTimeout(s.idle);
    s.part = part;
    if (!s.specs.has(part.job.id)) {
      send(s, { type: 'spec', job: part.job.id, spec: part.job.spec });
      s.specs.add(part.job.id);
    }
    send(s, { type: 'part', job: part.job.id, ...(part.range ? { range: part.range } : {}) });
  }
}

function onMessage(s: Slot, m: WorkerMsg) {
  const part = s.part;
  if (!part) return;
  const { job } = part;
  if (m.type === 'progress') {
    part.p = m.p;
    // the job's progress: the parts weighted by their points, reported in steps of ½ %
    const p = job.parts.reduce((a, q) => a + q.p * (q.range ? q.range[1] - q.range[0] : job.size), 0) / job.size;
    if (p - job.reported >= 0.005) {
      job.reported = p;
      job.onProgress(p);
    }
    return;
  }
  s.part = undefined;
  s.idle = setTimeout(() => {
    if (!s.part) drop(s);
  }, IDLE_MS);
  if (m.type === 'error') fail(job, m.message);
  else {
    part.p = 1;
    part.fields = m.fields;
    if (--job.left === 0) {
      forget(job);
      try {
        job.onDone(job.parts.length === 1 ? m.fields : joinParts(job.spec, job.parts.map((q) => ({ range: q.range!, fields: q.fields! }))));
      } catch (err) {
        job.onError(err instanceof Error ? err.message : String(err));
      }
    }
  }
  pump();
}

// the workers drop the job's spec
function forget(job: Job) {
  for (const s of slots)
    if (s.specs.delete(job.id)) send(s, { type: 'forget', job: job.id });
}

function fail(job: Job, message: string) {
  if (job.cancelled) return;
  cancelJob(job);
  job.onError(message);
}

function cancelJob(job: Job) {
  job.cancelled = true;
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].job === job) queue.splice(i, 1);
  // a worker in the middle of one of its parts cannot be interrupted: it is closed (a new one starts when needed)
  for (const s of [...slots]) if (s.part?.job === job) drop(s);
  forget(job);
  pump();
}

// Runs a job; cancel() stops its parts (nothing is reported after it).
export function runJob(spec: TmmSpec, onProgress: (p: number) => void, onDone: (fields: Fields) => void, onError: (message: string) => void): { cancel: () => void; parts: number } {
  const size = specSize(spec);
  const n = partsFor(spec, computeSlots());
  const job: Job = { id: nextJob++, spec, size, parts: [], left: 0, cancelled: false, reported: 0, onProgress, onDone, onError };
  // one part: the whole job in one worker (which adds the group delay itself)
  job.parts = n === 1 ? [{ job, p: 0 }] : splitRange(size, n).map((range) => ({ job, range, p: 0 }));
  job.left = job.parts.length;
  queue.push(...job.parts);
  pump();
  return { cancel: () => cancelJob(job), parts: job.parts.length };
}
