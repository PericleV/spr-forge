// Rough interfaces: a random height profile h(x) over a periodic cell (after T. Treebupachatsakul et al., Sensors 21,
// 6164 (2021), method of Byun et al.: white noise low-pass filtered in Fourier space), scaled to a given RMS or
// peak-to-peak height. The rough zone is cut into horizontal slices; each slice is, at every x, the material above or
// below the surface. The same slices serve both solvers: RCWA takes their segments (a pixel grating), TMM and Berreman
// an effective medium of their material fractions (Bruggeman, Maxwell-Garnett or Looyenga).
// Several rough interfaces: the zones that overlap (a thin film) are cut together, three or more materials per slice. A
// film thinner than the sum of the RMS heights of its two interfaces follows the interface on its incident side (the
// second interface copies the shape of the first, with its own height); a thicker film has its own profile.
import * as X from '../physics/complex.ts';
import { c, type C } from '../physics/complex.ts';
import type { EmaMethod } from '../physics/materials.ts';
import type { Bound, LayerSpec } from './types.ts';

export type RoughParams = {
  kind: 'rms' | 'pp'; // what `size` is: the RMS height or the peak-to-peak height (nm)
  size: number;
  cl: number; // correlation length (nm): the autocorrelation exp(−r²/cl²)
  cell: number; // length of the periodic cell (nm)
  px: number; // points of the profile over the cell
  seed: number; // the random realization
  slices: number; // slices of the rough zone
  ema: EmaMethod; // effective medium of a slice (TMM, Berreman)
};
// On a layer: its top or bottom interface is rough; per-step values of the swept parameters.
export type RoughSpec = RoughParams & { side: 'top' | 'bottom'; bind: { size?: Bound<number>; cl?: Bound<number>; seed?: Bound<number> } };

const at = <T,>(b: Bound<T>, dims: number[], idx: number[]) => {
  let k = 0;
  for (const s of b.s) k = k * dims[s] + idx[s];
  return b.v[k];
};

// ---- the profile ----

// Deterministic generator (mulberry32) and Gaussian numbers (Box–Muller).
function rng(seed: number) {
  let a = (Math.round(seed) * 2654435761) >>> 0 || 1;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
}

const shapes = new Map<string, Float64Array>();
// A unit profile (zero mean, RMS 1) of `px` points over one period: white noise filtered by exp(−(π cl f)²/2) (the
// square root of the power spectrum of a Gaussian autocorrelation exp(−r²/cl²)); cl in units of the cell.
export function roughShape(px: number, cl: number, seed: number): Float64Array {
  const key = `${px}|${cl}|${seed}`;
  const hit = shapes.get(key);
  if (hit) return hit;
  const n = Math.max(4, Math.round(px));
  const g = rng(seed);
  const w = Float64Array.from({ length: n }, () => g());
  // DFT, filter, inverse DFT (n up to a few thousand: direct sums with a cosine / sine table)
  const cs = Float64Array.from({ length: n }, (_, k) => Math.cos((2 * Math.PI * k) / n));
  const sn = Float64Array.from({ length: n }, (_, k) => Math.sin((2 * Math.PI * k) / n));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const fr = f <= n / 2 ? f : f - n; // cycles per cell
    const filt = Math.exp(-((Math.PI * cl * fr) ** 2) / 2);
    if (filt < 1e-12) continue;
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const k = (f * j) % n;
      sr += w[j] * cs[k];
      si -= w[j] * sn[k];
    }
    re[f] = sr * filt;
    im[f] = si * filt;
  }
  const h = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let f = 0; f < n; f++) {
      if (re[f] === 0 && im[f] === 0) continue;
      const k = (f * j) % n;
      s += re[f] * cs[k] - im[f] * sn[k];
    }
    h[j] = s / n;
  }
  const mean = h.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (let j = 0; j < n; j++) {
    h[j] -= mean;
    ss += h[j] * h[j];
  }
  const rms = Math.sqrt(ss / n) || 1;
  for (let j = 0; j < n; j++) h[j] /= rms;
  if (shapes.size > 64) shapes.delete(shapes.keys().next().value!);
  shapes.set(key, h);
  return h;
}

export const statsOf = (h: ArrayLike<number>) => {
  let ss = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < h.length; i++) {
    ss += h[i] * h[i];
    lo = Math.min(lo, h[i]);
    hi = Math.max(hi, h[i]);
  }
  return { rms: Math.sqrt(ss / h.length), pp: hi - lo, min: lo, max: hi };
};

// The lag (in points) where the autocorrelation of a periodic profile falls to 1/e (its correlation length for a
// Gaussian autocorrelation exp(−r²/cl²)); linear interpolation between the points.
export function corrLength(h: ArrayLike<number>): number {
  const n = h.length;
  let c0 = 0;
  for (let i = 0; i < n; i++) c0 += h[i] * h[i];
  let prev = 1;
  for (let lag = 1; lag < n / 2; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += h[i] * h[(i + lag) % n];
    const r = s / c0;
    if (r < 1 / Math.E) return lag - 1 + (prev - 1 / Math.E) / (prev - r);
    prev = r;
  }
  return NaN;
}

// The profile (nm) of a unit shape scaled to the RMS or the peak-to-peak height.
export function scaledProfile(shape: Float64Array, kind: 'rms' | 'pp', size: number): Float64Array {
  const f = kind === 'rms' ? size : size / (statsOf(shape).pp || 1);
  return shape.map((v) => v * f);
}

// The parameters of a rough layer at the sweep steps idx.
export function roughAt(r: RoughSpec, dims: number[], idx: number[]): RoughParams {
  return {
    ...r,
    size: r.bind.size ? at(r.bind.size, dims, idx) : r.size,
    cl: r.bind.cl ? at(r.bind.cl, dims, idx) : r.cl,
    seed: r.bind.seed ? at(r.bind.seed, dims, idx) : r.seed,
  };
}

// ---- the layering: flat parts of the layers and slices of the rough zones ----

export type PlanItem =
  | { kind: 'layer'; i: number; d: number } // (a part of) layer i of the list, flat
  | { kind: 'slice'; d: number; owner: number; mats: number[]; frac: number[]; segs: { from: number; to: number; m: number }[]; ema: EmaMethod };
// notes: a thin film made conformal (layer: its index in the list), a film pinched off
export type Plan = { items: PlanItem[]; cell: number; notes: { layer?: number; text: string }[] };

const plans = new WeakMap<LayerSpec[], Map<string, Plan | null>>();

// The layering of `list` (incident medium, finite layers, exit medium) at the sweep steps idx, or null without rough
// interfaces. `cellFixed`: the period of a grating in the structure (the cell of the roughness then).
export function roughPlan(list: LayerSpec[], dims: number[], idx: number[], cellFixed?: number): Plan | null {
  if (!list.some((L) => L.rough?.length)) return null;
  let memo = plans.get(list);
  if (!memo) plans.set(list, (memo = new Map()));
  const key = `${idx.join(',')}|${cellFixed ?? ''}`;
  if (memo.has(key)) return memo.get(key)!;
  const plan = makePlan(list, dims, idx, cellFixed);
  if (memo.size > 256) memo.delete(memo.keys().next().value!);
  memo.set(key, plan);
  return plan;
}

function makePlan(list: LayerSpec[], dims: number[], idx: number[], cellFixed?: number): Plan {
  const n = list.length;
  const notes: Plan['notes'] = [];
  const d = list.map((L, i) => (i === 0 || i === n - 1 ? 0 : L.bind.d ? at(L.bind.d, dims, idx) : L.d));
  // interface k lies between list[k] and list[k + 1], at depth zk (0 = top of the first finite layer)
  const nI = n - 1;
  const z = new Float64Array(nI);
  for (let k = 1; k < nI; k++) z[k] = z[k - 1] + d[k];
  // the rough parameters of each interface (the layer below's top, or the layer above's bottom)
  const par: (RoughParams | null)[] = Array.from({ length: nI }, (_, k) => {
    const up = k > 0 ? list[k].rough?.find((r) => r.side === 'bottom') : undefined;
    const dn = k + 1 < n - 1 ? list[k + 1].rough?.find((r) => r.side === 'top') : undefined;
    const r = up ?? dn;
    return r ? roughAt(r, dims, idx) : null;
  });
  if (!par.some((p) => p)) return { items: list.map((_, i) => ({ kind: 'layer', i, d: d[i] })), cell: cellFixed ?? 1000, notes };
  const cell = cellFixed ?? par.find((p) => p)!.cell;
  const px = Math.max(...par.map((p) => (p ? Math.round(p.px) : 0)));
  // unit shapes: an own realization per interface; a thin film's second interface copies the first one's shape
  const shape: (Float64Array | null)[] = par.map((p) => (p ? resample(roughShape(p.px, p.cl / cell, p.seed), px) : null));
  const rmsOf = (k: number) => (par[k] ? (par[k]!.kind === 'rms' ? par[k]!.size : par[k]!.size / (statsOf(shape[k]!).pp || 1)) : 0);
  for (let k = 1; k < nI; k++)
    if (par[k] && par[k - 1] && d[k] <= rmsOf(k - 1) + rmsOf(k)) {
      shape[k] = shape[k - 1];
      notes.push({ layer: k, text: `${d[k].toFixed(1)} nm, thinner than the RMS heights of its two interfaces: its second interface follows the first (conformal film)` });
    }
  // the surfaces z_k(x); flat interfaces constant; a surface never above the one before it (pinched films)
  const S: Float64Array[] = Array.from({ length: nI }, (_, k) => (par[k] ? scaledProfile(shape[k]!, par[k]!.kind, par[k]!.size).map((v) => z[k] + v) : new Float64Array(px).fill(z[k])));
  let pinched = false;
  for (let k = 1; k < nI; k++)
    for (let x = 0; x < px; x++)
      if (S[k][x] < S[k - 1][x]) {
        S[k][x] = S[k - 1][x];
        pinched = true;
      }
  if (pinched) notes.push({ text: 'a rough surface reaches the next interface: the film is pinched off there (zero thickness)' });
  // zones: interfaces whose surfaces overlap in depth are cut together
  const span = S.map((s) => statsOf(s));
  const groups: { k0: number; k1: number; z0: number; z1: number }[] = [];
  for (let k = 0; k < nI; k++) {
    if (!(span[k].max > span[k].min + 1e-9)) continue;
    const g = groups[groups.length - 1];
    if (g && span[k].min < g.z1 - 1e-12) {
      g.k1 = k;
      g.z1 = Math.max(g.z1, span[k].max);
      g.z0 = Math.min(g.z0, span[k].min);
    } else groups.push({ k0: k, k1: k, z0: span[k].min, z1: span[k].max });
  }
  // a flat interface inside a zone belongs to it (and the zones it joins)
  for (const g of groups)
    for (let k = 0; k < nI; k++)
      if (span[k].min >= g.z0 - 1e-12 && span[k].max <= g.z1 + 1e-12) {
        g.k0 = Math.min(g.k0, k);
        g.k1 = Math.max(g.k1, k);
      }
  const items: PlanItem[] = [{ kind: 'layer', i: 0, d: 0 }];
  // flat parts of the layers between the zones, in depth order
  const cuts = [...new Set([...z, ...groups.flatMap((g) => [g.z0, g.z1])])].sort((a, b) => a - b);
  const done = new Set<number>();
  const push = (i: number, dd: number) => {
    const last = items[items.length - 1];
    if (last.kind === 'layer' && last.i === i) last.d += dd;
    else items.push({ kind: 'layer', i, d: dd });
  };
  for (let c0 = 0; c0 < cuts.length - 1; c0++) {
    const [a, b] = [cuts[c0], cuts[c0 + 1]];
    if (!(b > a + 1e-12)) continue;
    const m = (a + b) / 2;
    const gi = groups.findIndex((g) => m > g.z0 && m < g.z1);
    if (gi >= 0) {
      if (done.has(gi)) continue;
      done.add(gi);
      items.push(...sliceGroup(groups[gi], S, par, px));
      continue;
    }
    // the layer containing depth m (outside the finite layers: nothing, the media are semi-infinite)
    for (let j = 1; j < n - 1; j++) if (m > z[j - 1] && m < z[j]) push(j, b - a);
  }
  // zones reaching above the first finite layer or below the last one
  for (let gi = 0; gi < groups.length; gi++) if (!done.has(gi)) items.push(...sliceGroup(groups[gi], S, par, px));
  items.push({ kind: 'layer', i: n - 1, d: 0 });
  return { items, cell, notes };
}

// Nearest-point resampling of a periodic profile to n points.
const resample = (h: Float64Array, n: number) => (h.length === n ? h : Float64Array.from({ length: n }, (_, i) => h[Math.floor((i * h.length) / n)]));

function sliceGroup(g: { k0: number; k1: number; z0: number; z1: number }, S: Float64Array[], par: (RoughParams | null)[], px: number): PlanItem[] {
  const members = par.slice(g.k0, g.k1 + 1).filter((p): p is RoughParams => !!p);
  const N = Math.max(1, members.reduce((s, p) => s + Math.max(1, Math.round(p.slices)), 0));
  const ema = members[0]?.ema ?? 'bruggeman';
  const h = (g.z1 - g.z0) / N;
  const out: PlanItem[] = [];
  for (let s = 0; s < N; s++) {
    const zc = g.z0 + (s + 0.5) * h;
    // at each x: the material of the layer between the surfaces around zc
    const mat = new Int32Array(px);
    for (let x = 0; x < px; x++) {
      let L = g.k0;
      for (let k = g.k0; k <= g.k1; k++) if (S[k][x] <= zc) L = k + 1;
      mat[x] = L;
    }
    const count = new Map<number, number>();
    const segs: { from: number; to: number; m: number }[] = [];
    for (let x = 0; x < px; x++) {
      count.set(mat[x], (count.get(mat[x]) ?? 0) + 1);
      const last = segs[segs.length - 1];
      if (last && last.m === mat[x]) last.to = (x + 1) / px;
      else segs.push({ from: x / px, to: (x + 1) / px, m: mat[x] });
    }
    const mats = [...count.keys()].sort((a, b) => a - b);
    const frac = mats.map((m) => count.get(m)! / px);
    const owner = mats[frac.indexOf(Math.max(...frac))];
    out.push({ kind: 'slice', d: h, owner, mats, frac, segs, ema });
  }
  return out;
}

// ---- effective medium of a slice ----

// ε of a mixture: fractions f of the permittivities e (Bruggeman: the root with Im ε ≥ 0 by Newton from the Looyenga
// value; Maxwell-Garnett: the material with the largest fraction as host).
export function emaMix(method: EmaMethod, e: C[], f: number[]): C {
  if (e.length === 1) return e[0];
  const loo = () => {
    let s = c(0);
    e.forEach((ei, i) => (s = X.add(s, X.mul(c(f[i]), cbrt(ei)))));
    return X.mul(s, X.mul(s, s));
  };
  if (method === 'looyenga') return loo();
  if (method === 'maxwell-garnett') {
    const h = f.indexOf(Math.max(...f));
    const eh = e[h];
    // (ε − εh)/(ε + 2εh) = Σ f_i (ε_i − εh)/(ε_i + 2εh) = q  →  ε = εh (1 + 2q)/(1 − q)
    let q = c(0);
    e.forEach((ei, i) => {
      if (i !== h) q = X.add(q, X.mul(c(f[i]), X.div(X.sub(ei, eh), X.add(ei, X.mul(c(2), eh)))));
    });
    return X.div(X.mul(eh, X.add(c(1), X.mul(c(2), q))), X.sub(c(1), q));
  }
  // Bruggeman: F(ε) = Σ f_i (ε_i − ε)/(ε_i + 2ε) = 0
  let x = loo();
  for (let it = 0; it < 60; it++) {
    let F = c(0);
    let dF = c(0);
    e.forEach((ei, i) => {
      const den = X.add(ei, X.mul(c(2), x));
      F = X.add(F, X.mul(c(f[i]), X.div(X.sub(ei, x), den)));
      // d/dε [(ε_i − ε)/(ε_i + 2ε)] = −3 ε_i / (ε_i + 2ε)²
      dF = X.sub(dF, X.mul(c(3 * f[i]), X.div(ei, X.mul(den, den))));
    });
    const step = X.div(F, dF);
    x = X.sub(x, step);
    if (Math.hypot(step.re, step.im) < 1e-14 * Math.hypot(x.re, x.im)) break;
  }
  return x.im < 0 ? X.conj(x) : x;
}

const cbrt = (z: C): C => {
  const r = Math.cbrt(Math.hypot(z.re, z.im));
  const a = Math.atan2(z.im, z.re) / 3;
  return c(r * Math.cos(a), r * Math.sin(a));
};

// The index of a slice from the indices of its materials.
export const sliceIndex = (it: Extract<PlanItem, { kind: 'slice' }>, n: (m: number) => C): C =>
  X.sqrt(emaMix(it.ema, it.mats.map((m) => X.mul(n(m), n(m))), it.frac));
