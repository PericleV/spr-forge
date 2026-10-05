// Rough interfaces: a random height profile h(x) over a periodic cell (after T. Treebupachatsakul et al., Sensors 21,
// 6164 (2021), method of Byun et al.: white noise low-pass filtered in Fourier space), scaled to a given RMS or
// peak-to-peak height. The rough zone is cut into horizontal slices; each slice is, at every x, the material above or
// below the surface. The same slices serve both solvers: RCWA takes their segments (a pixel grating), TMM and Berreman
// an effective medium of their material fractions (Bruggeman, Maxwell-Garnett or Looyenga).
// Several rough interfaces: the zones that overlap (a thin film) are cut together, three or more materials per slice. A
// film thinner than the sum of the RMS heights of its two interfaces follows the interface on its incident side (the
// second interface copies the shape of the first, with its own height); a thicker film has its own profile.
// Compute TMM (and Berreman) can describe a zone by its statistics instead of one realization: `tmm` = 'ensemble' takes
// the heights of a Gaussian distribution (its quantiles: the fraction of a material at depth z is Φ(z/σ), no seed, the
// limit of an infinite cell), 'ramp' a uniform distribution (fractions linear in z over 2√3 σ); RCWA always computes
// the profile of the seed. A slice mixes its materials by Bruggeman, Maxwell-Garnett, Looyenga, linearly in n, or
// anisotropically (a tensor, through Berreman). The two Wiener bounds: 'wiener' = horizontal laminae (a very gentle
// surface: ε_xx = ε_yy = Σ f ε, ε_zz = (Σ f/ε)⁻¹ — to first order the roughness is invisible) and 'aniso' = vertical walls
// (columnar roughness, the quasi-static limit of RCWA's staircase: ε_xx = (Σ f/ε)⁻¹ across the profile, ε_yy = ε_zz =
// Σ f ε). 'shape': between them, a Bruggeman medium per axis with the depolarization factors of the features, height σ
// (the RMS) and half-width cl: Σ f (ε_i − ε)/(ε + L (ε_i − ε)) = 0 (L = 0: the arithmetic mean, L = 1: the harmonic one,
// 1/3: Bruggeman). A 1D profile has ridges (elliptic cylinders along y, q = σ/cl: L_x = q/(1 + q), L_y = 0,
// L_z = 1/(1 + q)); a 2D surface bumps (spheroids, L_z of a spheroid of axis ratio q, L_x = L_y = (1 − L_z)/2). Against
// RCWA of the smooth 1D profile (scripts/bench-rough.ts) the 1D shape medium gives the SPR dip of rough gold within
// 0.1° (0.6° at RMS 5 nm), a rough TiO₂ film within 2·10⁻³ in R, with no fitted parameter; the dip is too shallow on
// gold (R min 2–3× too high); plain Bruggeman overstates gentle roughness on metals 2–7×.
import * as X from '../physics/complex.ts';
import { c, type C } from '../physics/complex.ts';
import type { EmaMethod } from '../physics/materials.ts';
import type { SliceSeg } from './grating.ts';
import type { Segment } from '../physics/rcwa.ts';
import type { FffProfile, NormalSeg } from '../physics/rcwaFff.ts';
import type { Bound, LayerSpec } from './types.ts';

export type RoughParams = {
  kind: 'rms' | 'pp'; // what `size` is: the RMS height or the peak-to-peak height (nm)
  size: number;
  cl: number; // correlation length (nm): the autocorrelation exp(−r²/cl²)
  cell: number; // length of the periodic cell (nm)
  px: number; // points of the profile over the cell
  seed: number; // the random realization
  slices: number; // slices of the rough zone
  ema: RoughEma; // effective medium of a slice (TMM, Berreman)
  tmm?: RoughTmm; // how TMM sees the zone (absent: the profile of the seed)
  // correlation with the rough interface before it (incident side; e.g. a film replicating its substrate): 0 … 1, the
  // shape ρ·(that one) + √(1 − ρ²)·(own); absent: automatic (a film thinner than RMS₁ + RMS₂ is conformal, ρ = 1)
  corr?: number;
  surf?: '1d' | '2d'; // 'shape' medium: the features of a 1D profile (ridges, absent) or of a 2D surface (bumps)
};
export type RoughEma = EmaMethod | 'aniso' | 'wiener' | 'shape';
// slice media that are tensors (Compute TMM then runs Berreman)
export const tensorEma = (e: RoughEma | undefined) => e === 'aniso' || e === 'wiener' || e === 'shape';
export type RoughTmm = 'profile' | 'ensemble' | 'ramp';
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

// The inverse of the standard normal distribution function (P. J. Acklam's rational approximation, relative error
// 1.15e-9).
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const cc = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const dd = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((cc[0] * q + cc[1]) * q + cc[2]) * q + cc[3]) * q + cc[4]) * q + cc[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// The heights of a distribution as a profile (unit RMS, zero mean): its n quantiles, in an order fixed by `k` (a
// permutation; interfaces with different k are uncorrelated). Gaussian ('ensemble') or uniform ('ramp').
export const STAT_POINTS = 4096;
const statShapes = new Map<string, Float64Array>();
export function statShape(kind: 'ensemble' | 'ramp', k: number, n = STAT_POINTS): Float64Array {
  const key = `${kind}|${k}|${n}`;
  const hit = statShapes.get(key);
  if (hit) return hit;
  const q = Float64Array.from({ length: n }, (_, i) => (kind === 'ramp' ? 2 * ((i + 0.5) / n) - 1 : normInv((i + 0.5) / n)));
  let ss = 0;
  for (const v of q) ss += v * v;
  const rms = Math.sqrt(ss / n);
  for (let i = 0; i < n; i++) q[i] /= rms;
  // a deterministic shuffle (Fisher–Yates with the generator of the profiles)
  let a = (k * 2654435761 + 12345) >>> 0 || 1;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(u() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  statShapes.set(key, q);
  return q;
}

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
  | { kind: 'slice'; d: number; owner: number; mats: number[]; frac: number[]; segs: SliceSeg[]; ema: RoughEma; zone: number; shape?: { q: number; surf: '1d' | '2d' } };
// A rough zone: depths z0 … z1 (nm from the top of the first finite layer), its surfaces k0 … k1 sampled at px points over the
// cell (the smooth FFF profile is the line through them); below surface k lies layer k + 1 of the list.
export type RoughZone = { z0: number; z1: number; k0: number; k1: number; S: Float64Array[]; px: number };
// notes: a thin film made conformal (layer: its index in the list), a film pinched off
export type Plan = { items: PlanItem[]; cell: number; notes: { layer?: number; text: string }[]; zones: RoughZone[] };

const plans = new WeakMap<LayerSpec[], Map<string, Plan | null>>();

// The layering of `list` (incident medium, finite layers, exit medium) at the sweep steps idx, or null without rough
// interfaces. `cellFixed`: the period of a grating in the structure (the cell of the roughness then). `stat`: for Compute
// TMM / Berreman (interfaces described by their statistics take them; RCWA: false, always the profile).
export function roughPlan(list: LayerSpec[], dims: number[], idx: number[], cellFixed?: number, stat = false): Plan | null {
  if (!list.some((L) => L.rough?.length)) return null;
  let memo = plans.get(list);
  if (!memo) plans.set(list, (memo = new Map()));
  const key = `${idx.join(',')}|${cellFixed ?? ''}|${stat}`;
  if (memo.has(key)) return memo.get(key)!;
  const plan = makePlan(list, dims, idx, cellFixed, stat);
  if (memo.size > 256) memo.delete(memo.keys().next().value!);
  memo.set(key, plan);
  return plan;
}

function makePlan(list: LayerSpec[], dims: number[], idx: number[], cellFixed?: number, stat = false): Plan {
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
  if (!par.some((p) => p)) return { items: list.map((_, i) => ({ kind: 'layer', i, d: d[i] })), cell: cellFixed ?? 1000, notes, zones: [] };
  const cell = cellFixed ?? par.find((p) => p)!.cell;
  const statOf = (p: RoughParams | null) => (stat && p && p.tmm && p.tmm !== 'profile' ? p.tmm : null);
  const px = Math.max(...par.map((p) => (statOf(p) ? STAT_POINTS : p ? Math.round(p.px) : 0)));
  // unit shapes: an own realization per interface (or the quantiles of its distribution); a thin film's second
  // interface copies the first one's shape
  const shape: (Float64Array | null)[] = par.map((p, k) => {
    const s = statOf(p);
    return p ? resample(s ? statShape(s, k) : roughShape(p.px, p.cl / cell, p.seed), px) : null;
  });
  const rmsOf = (k: number) => (par[k] ? (par[k]!.kind === 'rms' ? par[k]!.size : par[k]!.size / (statsOf(shape[k]!).pp || 1)) : 0);
  const corrOf = (k: number) => {
    const r = par[k]?.corr;
    return r !== undefined && Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : undefined;
  };
  for (let k = 1; k < nI; k++) {
    const rho = corrOf(k);
    if (rho === undefined || !par[k] || !par[k - 1]) continue;
    // a partly replicated shape, back to zero mean and unit RMS
    const a = shape[k - 1]!;
    const b = shape[k]!;
    const s = Float64Array.from(a, (v, x) => rho * v + Math.sqrt(1 - rho * rho) * b[x]);
    const m = s.reduce((p, v) => p + v, 0) / s.length;
    const rr = Math.sqrt(s.reduce((p, v) => p + (v - m) ** 2, 0) / s.length) || 1;
    shape[k] = s.map((v) => (v - m) / rr);
  }
  for (let k = 1; k < nI; k++)
    if (par[k] && par[k - 1] && corrOf(k) === undefined && d[k] <= rmsOf(k - 1) + rmsOf(k)) {
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
      items.push(...sliceGroup(groups[gi], S, par, px, gi, rmsOf));
      continue;
    }
    // the layer containing depth m (outside the finite layers: nothing, the media are semi-infinite)
    for (let j = 1; j < n - 1; j++) if (m > z[j - 1] && m < z[j]) push(j, b - a);
  }
  // zones reaching above the first finite layer or below the last one
  for (let gi = 0; gi < groups.length; gi++) if (!done.has(gi)) items.push(...sliceGroup(groups[gi], S, par, px, gi, rmsOf));
  items.push({ kind: 'layer', i: n - 1, d: 0 });
  return { items, cell, notes, zones: groups.map((g) => ({ ...g, S: S.slice(g.k0, g.k1 + 1), px })) };
}

// Nearest-point resampling of a periodic profile to n points.
const resample = (h: Float64Array, n: number) => (h.length === n ? h : Float64Array.from({ length: n }, (_, i) => h[Math.floor((i * h.length) / n)]));

type Group = { k0: number; k1: number; z0: number; z1: number };
function sliceGroup(g: Group, S: Float64Array[], par: (RoughParams | null)[], px: number, zone: number, rmsOf: (k: number) => number): PlanItem[] {
  const members = par.slice(g.k0, g.k1 + 1).filter((p): p is RoughParams => !!p);
  // the features of the zone (its first rough interface): height σ over half-width cl
  const k0 = par.findIndex((p, k) => k >= g.k0 && k <= g.k1 && !!p);
  const shape = k0 >= 0 ? { q: rmsOf(k0) / Math.max(1e-9, par[k0]!.cl), surf: par[k0]!.surf ?? ('1d' as const) } : undefined;
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
    out.push({ kind: 'slice', d: h, owner, mats, frac, segs, ema, zone, ...(ema === 'shape' && shape ? { shape } : {}) });
  }
  return out;
}

// The smooth (FFF) profile of a rough zone: each surface the line through its points (pixel centres, periodic); at depth
// t the layers between the crossings, exactly; the normal from the slope of the first surface of the zone (exact for one
// surface and for a conformal film of equal height). n(k): refractive index of layer k of the list.
export function roughFff(z: RoughZone, cell: number, n: (k: number) => C): FffProfile {
  const { px, S, k0 } = z;
  const depth = z.z1 - z.z0;
  const xc = (i: number) => (i + 0.5) / px;
  const segsAt = (t: number): Segment[] => {
    const zz = z.z0 + Math.min(1, Math.max(0, t)) * depth;
    const cuts: number[] = [0, 1];
    for (const s of S)
      for (let i = -1; i < px; i++) {
        const [a, b] = [s[(i + px) % px], s[(i + 1) % px]];
        if ((a - zz) * (b - zz) < 0) {
          const x = xc(i) + ((zz - a) / (b - a)) / px;
          if (x > 0 && x < 1) cuts.push(x);
        }
      }
    cuts.sort((p, q) => p - q);
    // the layer at x: below every surface above zz (surfaces interpolated linearly)
    const at = (x: number) => {
      const u = x * px - 0.5;
      const i = Math.floor(u);
      const f = u - i;
      let L = k0;
      S.forEach((s, j) => {
        const h = (1 - f) * s[((i % px) + px) % px] + f * s[(((i + 1) % px) + px) % px];
        if (h <= zz) L = k0 + j + 1;
      });
      return L;
    };
    const out: Segment[] = [];
    let last = -1;
    for (let k = 0; k + 1 < cuts.length; k++) {
      if (!(cuts[k + 1] > cuts[k] + 1e-12)) continue;
      const L = at((cuts[k] + cuts[k + 1]) / 2);
      if (L === last) out[out.length - 1].to = cuts[k + 1];
      else out.push({ from: cuts[k], to: cuts[k + 1], n: n(L) });
      last = L;
    }
    return out;
  };
  // the normal of each linear piece of the first surface (−dz/dx, 1), dz/dx in nm/nm
  const s0 = S[0];
  const normals: NormalSeg[] = [];
  for (let i = -1; i < px; i++) {
    const slope = (s0[(i + 1) % px] - s0[(i + px) % px]) / (cell / px);
    const [a, b] = [Math.max(0, xc(i)), Math.min(1, xc(i + 1))];
    if (b > a) normals.push({ from: a, to: b, nx: -slope, nz: 1 });
  }
  let hash = 0;
  S.forEach((s) => s.forEach((v, i) => (hash = (hash * 31 + Math.round(v * 1e6) + i) % 2147483647)));
  return { segsAt, normals, key: `rough|${z.z0}|${z.z1}|${px}|${cell}|${hash}|${Array.from({ length: S.length + 1 }, (_, j) => `${n(k0 + j).re},${n(k0 + j).im}`).join(';')}` };
}

// ---- effective medium of a slice ----

// ε of a mixture: fractions f of the permittivities e (Bruggeman: the root with Im ε ≥ 0 by Newton from the Looyenga
// value; Maxwell-Garnett: the material with the largest fraction as host; linear: n = Σ f n).
export function emaMix(method: EmaMethod, e: C[], f: number[]): C {
  if (e.length === 1) return e[0];
  if (method === 'linear') {
    let n = c(0);
    e.forEach((ei, i) => (n = X.add(n, X.mul(c(f[i]), X.sqrt(ei)))));
    return X.mul(n, n);
  }
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

// The index of a slice from the indices of its materials (an anisotropic slice on a scalar path: the mean of its
// principal values, ε_xx + 2 ε_zz over 3 — Compute TMM takes the tensor through Berreman).
export function sliceIndex(it: Extract<PlanItem, { kind: 'slice' }>, n: (m: number) => C): C {
  if (tensorEma(it.ema)) {
    const t = sliceTensor(it, n);
    return X.sqrt(X.div(X.add(t[0], X.mul(c(2), t[8])), c(3)));
  }
  return X.sqrt(emaMix(it.ema as EmaMethod, it.mats.map((m) => X.mul(n(m), n(m))), it.frac));
}

// The depolarization factors (x, y, z) of the features: ridges of a 1D profile (elliptic cylinders along y) or bumps of a
// 2D surface (spheroids), height over half-width q.
export function shapeFactors(q: number, surf: '1d' | '2d'): [number, number, number] {
  if (surf === '1d') return [q / (1 + q), 0, 1 / (1 + q)];
  let Lz = 1 / 3;
  if (Math.abs(q - 1) > 1e-6) {
    if (q < 1) {
      // oblate (flat bumps): along the short axis z
      const e = Math.sqrt(1 - q * q);
      Lz = (1 / (e * e)) * (1 - (Math.sqrt(1 - e * e) / e) * Math.asin(e));
    } else {
      // prolate (needles): along the long axis z
      const e = Math.sqrt(1 - 1 / (q * q));
      Lz = ((1 - e * e) / (e * e)) * ((1 / (2 * e)) * Math.log((1 + e) / (1 - e)) - 1);
    }
  }
  return [(1 - Lz) / 2, (1 - Lz) / 2, Lz];
}

// Bruggeman with a depolarization factor L: Σ f (ε_i − ε)/(ε + L (ε_i − ε)) = 0.
export function brugL(e: C[], f: number[], L: number): C {
  let x = c(0);
  e.forEach((ei, i) => (x = X.add(x, X.mul(c(f[i]), ei))));
  if (L < 1e-12) return x;
  if (e.length === 2) {
    // (1 − L) x² − b x − L A B = 0, b = (1 − L)(f₁A + f₂B) − L (f₁B + f₂A); the root with Im ≥ 0
    const [A, B] = e;
    const [f1, f2] = f;
    const b = X.sub(X.mul(c(1 - L), X.add(X.mul(c(f1), A), X.mul(c(f2), B))), X.mul(c(L), X.add(X.mul(c(f1), B), X.mul(c(f2), A))));
    if (1 - L < 1e-12) return X.div(X.mul(A, B), X.add(X.mul(c(f1), B), X.mul(c(f2), A)));
    const disc = X.sqrt(X.add(X.mul(b, b), X.mul(c(4 * (1 - L) * L), X.mul(A, B))));
    const r1 = X.div(X.add(b, disc), c(2 * (1 - L)));
    const r2 = X.div(X.sub(b, disc), c(2 * (1 - L)));
    return r1.im >= r2.im ? r1 : r2;
  }
  // three or more materials: continuation in L from the arithmetic mean (L = 0, exact), Newton at every step
  const steps = Math.max(1, Math.ceil(L / 0.02));
  for (let s = 1; s <= steps; s++) {
    const l = (L * s) / steps;
    for (let it = 0; it < 50; it++) {
      let F = c(0);
      let dF = c(0);
      e.forEach((ei, i) => {
        const den = X.add(x, X.mul(c(l), X.sub(ei, x)));
        F = X.add(F, X.mul(c(f[i]), X.div(X.sub(ei, x), den)));
        dF = X.sub(dF, X.mul(c(f[i]), X.div(ei, X.mul(den, den))));
      });
      const st = X.div(F, dF);
      x = X.sub(x, st);
      if (Math.hypot(st.re, st.im) < 1e-14 * Math.hypot(x.re, x.im)) break;
    }
  }
  return x.im < 0 ? X.conj(x) : x;
}

// The tensor of an anisotropic slice (row-major 3×3).
export function sliceTensor(it: Extract<PlanItem, { kind: 'slice' }>, n: (m: number) => C): C[] {
  let inv = c(0);
  let avg = c(0);
  it.mats.forEach((m, i) => {
    const e = X.mul(n(m), n(m));
    inv = X.add(inv, X.div(c(it.frac[i]), e));
    avg = X.add(avg, X.mul(c(it.frac[i]), e));
  });
  const z = c(0);
  const harm = X.div(c(1), inv);
  if (it.ema === 'shape') {
    const e = it.mats.map((m) => X.mul(n(m), n(m)));
    const [lx, ly, lz] = shapeFactors(it.shape?.q ?? 1, it.shape?.surf ?? '1d');
    return [brugL(e, it.frac, lx), z, z, z, brugL(e, it.frac, ly), z, z, z, brugL(e, it.frac, lz)];
  }
  // 'wiener': horizontal laminae (a gentle surface: the interfaces nearly flat): ε_xx = ε_yy = Σ f ε, ε_zz = (Σ f/ε)⁻¹
  return it.ema === 'wiener' ? [avg, z, z, z, avg, z, z, z, harm] : [harm, z, z, z, avg, z, z, z, avg];
}
