// Starts a Fit task in its own worker (one worker per task, closed when it ends or is stopped): the page stays
// responsive during the fit.
import type { FitOut, FitTask } from './fit.worker.ts';

export type FitJob = { promise: Promise<Exclude<FitOut, { type: 'progress' }>>; stop: () => void };

export function runFit(task: FitTask, onProgress?: (done: number, total: number) => void): FitJob {
  const w = new Worker(new URL('./fit.worker.ts', import.meta.url), { type: 'module' });
  let stop = () => {};
  const promise = new Promise<Exclude<FitOut, { type: 'progress' }>>((resolve) => {
    const end = (m: Exclude<FitOut, { type: 'progress' }>) => {
      w.terminate();
      resolve(m);
    };
    stop = () => end({ type: 'error', message: 'stopped' });
    w.onmessage = (e: MessageEvent<FitOut>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.done, m.total);
      else end(m);
    };
    w.onerror = (e) => end({ type: 'error', message: e.message || 'The fit worker failed.' });
  });
  w.postMessage(task);
  return { promise, stop: () => stop() };
}
