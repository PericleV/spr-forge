// Worker of the Compute RCWA convergence check.
import type { ConvJob, ConvMsg } from './rcwaConvRun.ts';
import { rcwaConvergence } from './runRcwa.ts';

const post = (m: ConvMsg) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<ConvJob>) => {
  const j = e.data;
  try {
    let last = 0;
    const rows = rcwaConvergence(j.spec, j.points, j.Ns, (p) => {
      if (p - last >= 0.01) {
        last = p;
        post({ type: 'progress', p });
      }
    });
    post({ type: 'done', rows });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
