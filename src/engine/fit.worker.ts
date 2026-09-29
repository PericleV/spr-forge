// Worker of the Fit node: the least-squares fits run here, off the UI thread (a coupled-oscillator fit tries several
// starts, a batch fits every curve of a dataset — both can take seconds).
import type { FitComponent, FitParam, ModelCtx } from './fitmodels.ts';
import { fitDispersion, fitSpectrum, paramId, type DispersionData } from './fitrun.ts';
import { COMPONENTS } from './fitmodels.ts';

export type FitTask =
  | { type: 'spectrum'; comps: FitComponent[]; xs: number[]; ys: number[]; ctx: ModelCtx }
  | { type: 'dispersion'; params: Record<string, FitParam>; data: DispersionData; ctx: ModelCtx }
  // every curve (`lines`, in the order of the dataset), each fit starting from the result of the previous one
  | { type: 'batch'; comps: FitComponent[]; xs: number[]; lines: number[][]; ctx: ModelCtx };

export type BatchResult = { ids: string[]; values: number[][]; r2: number[] };
export type FitOut =
  | { type: 'progress'; done: number; total: number }
  | { type: 'spectrum'; result: ReturnType<typeof fitSpectrum> }
  | { type: 'dispersion'; result: ReturnType<typeof fitDispersion> }
  | { type: 'batch'; result: BatchResult }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<FitTask>) => {
  const t = e.data;
  const post = (m: FitOut) => self.postMessage(m);
  try {
    if (t.type === 'spectrum') post({ type: 'spectrum', result: fitSpectrum(t.comps, t.xs, t.ys, t.ctx) });
    else if (t.type === 'dispersion') post({ type: 'dispersion', result: fitDispersion(t.params, t.data, t.ctx) });
    else {
      const ids = t.comps.flatMap((c) => COMPONENTS[c.type].params.map((p) => paramId(c.id, p.key)));
      const values: number[][] = [];
      const r2: number[] = [];
      let comps = t.comps;
      let last = 0;
      t.lines.forEach((ys, k) => {
        const r = fitSpectrum(comps, t.xs, ys, t.ctx);
        comps = r.comps;
        const flat = Object.fromEntries(comps.flatMap((c) => Object.entries(c.params).map(([n, p]) => [paramId(c.id, n), p.value])));
        values[k] = ids.map((i) => flat[i]);
        r2[k] = r.stats.r2;
        const now = Date.now();
        if (now - last > 100) {
          last = now;
          post({ type: 'progress', done: k + 1, total: t.lines.length });
        }
      });
      post({ type: 'batch', result: { ids, values, r2 } });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
