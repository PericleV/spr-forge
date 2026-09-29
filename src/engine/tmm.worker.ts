import { runSpec } from './run.ts';
import type { Fields, TmmSpec } from './types.ts';

export type WorkerMsg =
  | { type: 'progress'; p: number }
  | { type: 'done'; fields: Fields }
  | { type: 'error'; message: string };

const post = (m: WorkerMsg, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

self.onmessage = (e: MessageEvent<TmmSpec>) => {
  try {
    const fields = runSpec(e.data, (p) => post({ type: 'progress', p }));
    post({ type: 'done', fields }, Object.values(fields).map((a) => a.buffer));
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
