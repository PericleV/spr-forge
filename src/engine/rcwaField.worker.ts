// Worker of the RCWA field maps.
import { fieldMapOfJob } from './rcwaFieldCompute.ts';
import type { FieldJob, FieldMsg } from './rcwaFieldRun.ts';

const post = (m: FieldMsg) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<FieldJob>) => {
  try {
    post({ type: 'progress', p: 0.05 });
    const { map, period } = fieldMapOfJob(e.data);
    post({ type: 'done', map, period });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
