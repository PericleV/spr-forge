import { runSpec, type PointRange } from './run.ts';
import type { Fields, TmmSpec } from './types.ts';

// A worker of the compute pool (engine/computePool.ts): it keeps the specs of the jobs it works on and computes their parts
// (the points of `range`; without a range the whole job, group delay included), one at a time.
export type WorkerIn =
  | { type: 'spec'; job: number; spec: TmmSpec }
  | { type: 'part'; job: number; range?: PointRange }
  | { type: 'forget'; job: number };
export type WorkerMsg =
  | { type: 'progress'; p: number }
  | { type: 'done'; fields: Fields }
  | { type: 'error'; message: string };

const specs = new Map<number, TmmSpec>();
const post = (m: WorkerMsg, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === 'spec') specs.set(m.job, m.spec);
  else if (m.type === 'forget') specs.delete(m.job);
  else
    try {
      const spec = specs.get(m.job);
      if (!spec) throw new Error('the job of this part is unknown to the worker');
      const fields = runSpec(spec, (p) => post({ type: 'progress', p }), m.range);
      post({ type: 'done', fields }, Object.values(fields).map((a) => a.buffer));
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};
