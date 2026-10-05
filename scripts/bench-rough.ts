// Benchmark (not part of check:tmm, ~15 min): the TMM roughness models (ensemble, every slice medium) against Compute
// RCWA with the smooth profile (FFF, N = 40, mean of 3 seeds) — rough gold under water (SPR dip) and a rough TiO₂ film
// (R at 450 / 550 / 700 nm). Run: node scripts/bench-rough.ts. Results of 2026-10-04 in docs/ROADMAP.md.
import { makeLibrary } from '../src/physics/library.ts';
import { evaluateHeadless } from '../src/engine/headless.ts';
import { materialData, RCWA_DEFAULTS, ROUGH_DEFAULTS } from '../src/defaults.ts';
import type { Dataset } from '../src/engine/types.ts';
import type { AppNode } from '../src/types.ts';

const E = (s: string, t: string, h: string, sh = 'out') => ({ id: `${s}-${sh}-${t}-${h}`, source: s, sourceHandle: sh, target: t, targetHandle: h });
const P = { x: 0, y: 0 };
type Case = { inc: string; film: string; d: number; exit: string; side: 'top' | 'bottom'; lam: number[]; th: number[]; pol: 'p' | 's' };
function graph(cs: Case, rough: Record<string, unknown>, method: 'tmm' | 'rcwa', seeds?: string, orders = 40) {
  const nodes: AppNode[] = [
    { id: 'inc', type: 'material', position: P, data: materialData(cs.inc) },
    { id: 'fm', type: 'material', position: P, data: materialData(cs.film) },
    { id: 'ex', type: 'material', position: P, data: materialData(cs.exit) },
    { id: 'L', type: 'layer', position: P, data: { label: 'film', thickness: cs.d, layers2D: 1 } },
    { id: 'r', type: 'rough', position: P, data: { ...ROUGH_DEFAULTS, side: cs.side, ...rough } },
    { id: 'st', type: 'combine', position: P, data: { name: '', count: 1 } },
    { id: 'wl', type: 'param', position: P, data: cs.lam.length === 1 ? { quantity: 'lambda', mode: 'constant', value: cs.lam[0], min: 300, max: 2000, step: 1 } : { quantity: 'lambda', mode: 'range', value: cs.lam[0], min: cs.lam[0], max: cs.lam[1], step: cs.lam[2] } },
    { id: 'th', type: 'param', position: P, data: cs.th.length === 1 ? { quantity: 'theta', mode: 'constant', value: cs.th[0], min: 0, max: 89, step: 1 } : { quantity: 'theta', mode: 'range', value: cs.th[0], min: cs.th[0], max: cs.th[1], step: cs.th[2] } },
    method === 'tmm'
      ? { id: 'c', type: 'compute', position: P, data: { name: 'c', polarization: cs.pol } }
      : { id: 'c', type: 'rcwa', position: P, data: { ...RCWA_DEFAULTS, name: 'c', orders, show: 0, profiles: 'fff', polarization: cs.pol } },
    ...(seeds ? [{ id: 'sd', type: 'sweep', position: P, data: { name: 'seed', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: seeds } } as AppNode] : []),
  ] as AppNode[];
  const edges = [E('fm', 'L', 'mat'), E('L', 'r', 'in'), E('inc', 'st', 'incident'), E('r', 'st', 'item-0'), E('ex', 'st', 'exit'), E('st', 'c', 'stack'), E('wl', 'c', 'lambda'), E('th', 'c', 'theta'), ...(seeds ? [E('sd', 'r', 'seed')] : [])];
  const res = evaluateHeadless(nodes, edges, makeLibrary([])).results.get('c')!;
  if (res.errors.length) throw new Error(res.errors.join('; '));
  return (res.outs.out as { dataset: Dataset }).dataset;
}
// R averaged over the first axis when it is the seed sweep
function meanR(ds: Dataset) {
  const free = ds.axes.find((a) => a.id === 'theta' && a.values.length > 1) ?? ds.axes.find((a) => a.id === 'lambda')!;
  const n = free.values.length;
  const k = ds.size / n;
  return { x: free.values, R: Array.from({ length: n }, (_, i) => Array.from({ length: k }, (_, j) => ds.fields.R[j * n + i]).reduce((a, v) => a + v, 0) / k) };
}
function dip(x: number[], R: number[]) {
  let b = 1;
  for (let i = 1; i < R.length - 1; i++) if (R[i] < R[b]) b = i;
  const [y0, y1, y2] = [R[b - 1], R[b], R[b + 1]];
  const h = x[b + 1] - x[b];
  const den = y0 - 2 * y1 + y2;
  const off = den > 0 ? (0.5 * (y0 - y2)) / den : 0;
  return { x: x[b] + off * h, R: y1 - 0.25 * (y0 - y2) * off };
}
const EMAS = ['shape', 'shape2d', 'bruggeman', 'maxwell-garnett', 'looyenga', 'linear', 'wiener', 'aniso'] as const;
const t0 = performance.now();

// 1. rough gold / water (SPR, BK7, 633 nm, TM)
const spr: Case = { inc: 'BK7', film: 'Au', d: 50, exit: 'Water', side: 'bottom', lam: [633], th: [66, 84, 0.02], pol: 'p' };
const flat = dip(...(Object.values(meanR(graph(spr, { size: 0 }, 'tmm'))) as [number[], number[]]));
console.log(`SPR flat: ${flat.x.toFixed(3)}° R ${flat.R.toFixed(4)}`);
for (const [size, cl] of [[1, 15], [3, 15], [3, 40], [5, 40]]) {
  const rough = { size, cl, cell: 300, px: 600, slices: 20 };
  const rc = meanR(graph({ ...spr, th: [69, 78, 0.25] }, { ...rough, tmm: 'profile' }, 'rcwa', '1, 2, 3'));
  const R = dip(rc.x, rc.R);
  const row = [`RCWA ${R.x.toFixed(2)}° ${R.R.toFixed(3)}`];
  for (const ema of EMAS) {
    const m = meanR(graph(spr, { ...rough, ema: ema === 'shape2d' ? 'shape' : ema, surf: ema === 'shape2d' ? '2d' : '1d', tmm: 'ensemble' }, 'tmm'));
    const q = dip(m.x, m.R);
    row.push(`${ema} ${q.x.toFixed(2)}° ${q.R.toFixed(3)}`);
  }
  console.log(`Au RMS ${size} cl ${cl}: ${row.join(' | ')}  [${((performance.now() - t0) / 1000).toFixed(0)} s]`);
}

// 2. a rough TiO2 film on glass in air, normal incidence, R at 450 / 550 / 700 nm
const diel: Case = { inc: 'Air', film: 'TiO2', d: 120, exit: 'BK7', side: 'top', lam: [400, 800, 50], th: [0], pol: 'p' };
for (const size of [3, 8]) {
  const rough = { size, cl: 20, cell: 300, px: 600, slices: 20 };
  const rc = meanR(graph(diel, { ...rough, tmm: 'profile' }, 'rcwa', '1, 2, 3', 20));
  const pick = (m: { x: number[]; R: number[] }) => [450, 550, 700].map((l) => m.R[m.x.indexOf(l)].toFixed(4)).join('/');
  const row = [`RCWA ${pick(rc)}`];
  for (const ema of EMAS) row.push(`${ema} ${pick(meanR(graph(diel, { ...rough, ema: ema === 'shape2d' ? 'shape' : ema, surf: ema === 'shape2d' ? '2d' : '1d', tmm: 'ensemble' }, 'tmm')))}`);
  console.log(`TiO2 top RMS ${size}: R(450/550/700) ${row.join(' | ')}  flat ${pick(meanR(graph(diel, { size: 0 }, 'tmm')))}`);
}
