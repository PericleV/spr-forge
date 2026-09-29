// Filter design worker: runs needle / deep search / gradual evolution / refinement off the UI thread. Deep search and the
// design cleaner refine their candidates in parallel in sub-workers made by the page (workers inside workers are not
// available in every browser), reached through the MessagePorts of the start message.
import { runDesign, type Design, type DesignProblem, type DesignSettings, type Progress, type RefinePool, type RefineResult } from './design.ts';
import type { RefineReply, RefineTask } from './refine.worker.ts';

export type DesignMsg = { type: 'start'; problem: DesignProblem; start: Design; settings: DesignSettings; ports?: MessagePort[] } | { type: 'stop' } | { type: 'pool-failed' };
export type DesignProgress = { type: 'progress'; progress: Progress };
export type DesignDone = { type: 'done'; progress?: Progress; error?: string };

type Pool = RefinePool & { fail: (why: string) => void };

let stop = false;
let pool: Pool | undefined;

// One task per free sub-worker at a time (deep search keeps at most `size` candidates in flight).
function makePool(ports: MessagePort[]): Pool | undefined {
  if (ports.length < 2) return undefined;
  const pending = new Map<number, { resolve: (r: RefineResult) => void; reject: (e: Error) => void }>();
  const sent: (DesignProblem | null)[] = ports.map(() => null); // the problem each sub-worker holds
  const idle = ports.map((_, k) => k);
  let next = 0;
  let broken = false;
  ports.forEach((port, k) => {
    port.onmessage = (e: MessageEvent<RefineReply>) => {
      const task = pending.get(e.data.id);
      pending.delete(e.data.id);
      idle.push(k);
      if (!task) return;
      if (e.data.result) task.resolve(e.data.result);
      else task.reject(new Error(e.data.error ?? 'no result'));
    };
  });
  return {
    get size() {
      return broken ? 0 : ports.length;
    },
    refine: (problem, cand, iterations, best) =>
      new Promise((resolve, reject) => {
        const k = broken ? undefined : idle.pop();
        if (k === undefined) return reject(new Error(broken ? 'pool unavailable' : 'no free sub-worker'));
        const id = next++;
        pending.set(id, { resolve, reject });
        const task: RefineTask = { id, cand, iterations, best, problem: sent[k] === problem ? undefined : problem };
        sent[k] = problem;
        ports[k].postMessage(task);
      }),
    // a sub-worker failed (or the run was stopped): the tasks in flight are dropped, the pool is no longer used
    fail: (why) => {
      broken = true;
      for (const t of pending.values()) t.reject(new Error(why));
      pending.clear();
    },
  };
}

self.onmessage = async (e: MessageEvent<DesignMsg>) => {
  const m = e.data;
  if (m.type === 'stop' || m.type === 'pool-failed') {
    if (m.type === 'stop') stop = true;
    pool?.fail(m.type === 'stop' ? 'stopped' : 'a sub-worker failed');
    return;
  }
  stop = false;
  pool = makePool(m.ports ?? []);
  let last = 0;
  try {
    const result = await runDesign(
      m.problem,
      m.start,
      m.settings,
      (p) => {
        const now = Date.now();
        if (now - last < 150) return; // at most ~7 updates per second
        last = now;
        self.postMessage({ type: 'progress', progress: p } satisfies DesignProgress);
      },
      // yielding lets the 'stop' message in
      { stopped: () => stop, tick: () => new Promise((r) => setTimeout(r, 0)), pool },
    );
    self.postMessage({ type: 'done', progress: result } satisfies DesignDone);
  } catch (err) {
    self.postMessage({ type: 'done', error: err instanceof Error ? err.message : String(err) } satisfies DesignDone);
  }
};
