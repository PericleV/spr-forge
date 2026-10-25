// The runs of the Python scripts, from the main thread: the evaluation asks for a run (a node, the digest of its code and
// data); the newest asked of every node waits a moment, then runs in the Python worker, one at a time; its result goes
// back to the engine. Stop ends the run under way (its node: “Stopped”).
// Code that came with a project from outside (a file, a link, a project kept in the browser whose code never ran here)
// runs only once it is allowed, as a notebook from elsewhere is trusted first: Python in this page could read the
// projects kept in the browser and send them away. The code allowed is kept by its digest (engine/python.ts codeDigest).
import { useSyncExternalStore } from 'react';
import { codeDigest, type PyJob, type PyResult } from '../engine/python.ts';
import type { PyReply, PyRequest } from './pyWorker.ts';

type Done = (id: string, r: PyResult) => void;
// allowed: the code of the project open may run (blocked: runs asked for and held)
export type PyState = { text: string; running: string | null; allowed: boolean; held: number };

let state: PyState = { text: '', running: null, allowed: true, held: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<PyState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
export const usePython = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );

let worker: Worker | null = null;
let busy: { id: string; job: PyJob; done: Done } | null = null;
const queue = new Map<string, { job: PyJob; done: Done; at: number }>();
// the digests already given back (a job asked again by every evaluation is not run twice)
const given = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const WAIT = 350;

const failed = (job: PyJob, message: string): PyResult => ({ key: job.key, run: job.run, outputs: [], skipped: [], console: '', error: { message }, figures: [], files: [], ms: 0 });

function start() {
  if (busy || !queue.size) return;
  const now = Date.now();
  const ready = [...queue].find(([, q]) => now - q.at >= WAIT);
  if (!ready) {
    if (!timer) timer = setTimeout(() => ((timer = null), start()), WAIT);
    return;
  }
  const [id, q] = ready;
  queue.delete(id);
  busy = { id, job: q.job, done: q.done };
  if (!worker) {
    worker = new Worker(new URL('./pyWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PyReply>) => {
      if (e.data.type === 'status') return set({ text: e.data.text });
      const b = busy;
      busy = null;
      set({ text: '', running: null });
      if (b && b.id === e.data.id) {
        given.set(b.id, e.data.result.key);
        b.done(b.id, e.data.result);
      }
      start();
    };
    worker.onerror = (e) => {
      const b = busy;
      busy = null;
      worker?.terminate();
      worker = null;
      set({ text: '', running: null });
      if (b) b.done(b.id, failed(b.job, `The Python worker failed: ${e.message || 'unknown error'}`));
      start();
    };
  }
  set({ running: id, text: 'Running' });
  worker.postMessage({ id, job: q.job } satisfies PyRequest);
}

// a run asked for a node: the newest of each node waits a moment, then runs (held while the project is not allowed)
const heldJobs = new Map<string, { job: PyJob; done: Done }>();
export function requestRun(id: string, job: PyJob, done: Done) {
  if (given.get(id) === job.key || (busy?.id === id && busy.job.key === job.key) || queue.get(id)?.job.key === job.key) return;
  if (!state.allowed) {
    heldJobs.set(id, { job, done });
    set({ held: heldJobs.size });
    return;
  }
  queue.set(id, { job, done, at: Date.now() });
  start();
}

// ---- which code may run ----
const TRUST_KEY = 'spr-flow:python-allowed';
const allowedDigests = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(TRUST_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
};
const keep = (digest: string) => {
  try {
    localStorage.setItem(TRUST_KEY, JSON.stringify([...allowedDigests().filter((x) => x !== digest), digest].slice(-500)));
  } catch {
    // storage unavailable: allowed for this visit
  }
};
let codesNow: string[] = [];
// a project opened: its code runs when it has none, when it is ours (fresh: an example, a new project) or when this code
// was allowed (or ran) here before
export function openProject(codes: string[], fresh: boolean) {
  codesNow = codes;
  heldJobs.clear();
  given.clear();
  const ok = fresh || !codes.some((c) => c.trim()) || allowedDigests().includes(codeDigest(codes));
  set({ allowed: ok, held: 0 });
}
// the code written here while allowed is ours: kept as allowed (the project opens again without asking)
export function codeChanged(codes: string[]) {
  codesNow = codes;
  if (state.allowed && codes.some((c) => c.trim())) keep(codeDigest(codes));
}
// the project open allowed to run its code (kept): the runs held start
export function allowProject() {
  keep(codeDigest(codesNow));
  set({ allowed: true, held: 0 });
  for (const [id, h] of heldJobs) queue.set(id, { ...h, at: 0 });
  heldJobs.clear();
  start();
}

// the run under way ended (its node gets “Stopped”), and those waiting dropped
export function stopPython() {
  const b = busy;
  busy = null;
  queue.clear();
  worker?.terminate();
  worker = null;
  set({ text: '', running: null });
  if (b) {
    given.set(b.id, b.job.key);
    b.done(b.id, failed(b.job, 'Stopped (the run did not end). Python starts again at the next run.'));
  }
}
