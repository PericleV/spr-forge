// Sub-worker of the filter design (deep search in parallel). Made by the page, it gets a MessagePort to the design
// worker and refines the candidate designs sent through it, one per task.
import { refineCandidate, type Design, type DesignProblem, type RefineResult } from './design.ts';

// problem: sent with the first task and whenever it changes
export type RefineTask = { id: number; problem?: DesignProblem; cand: Design; iterations: number; best: number[] | null };
export type RefineReply = { id: number; result?: RefineResult; error?: string };

let problem: DesignProblem | null = null;

self.onmessage = (e: MessageEvent<{ port: MessagePort }>) => {
  const port = e.data.port;
  port.onmessage = async (ev: MessageEvent<RefineTask>) => {
    const t = ev.data;
    if (t.problem) problem = t.problem;
    try {
      if (!problem) throw new Error('refine task without a problem');
      port.postMessage({ id: t.id, result: await refineCandidate(problem, t.cand, t.iterations, t.best) } satisfies RefineReply);
    } catch (err) {
      port.postMessage({ id: t.id, error: err instanceof Error ? err.message : String(err) } satisfies RefineReply);
    }
  };
};
