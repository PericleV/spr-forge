// Evaluates a TmmSpec over the full grid [...sweeps, lambda, theta]. Pure; runs in the worker and in scripts.
import { c, type C } from '../physics/complex.ts';
import { emaWithFiller, refractiveIndex } from '../physics/materials.ts';
import { nCos, tmmPoint, type Layer, type Polarization } from '../physics/tmm.ts';
import type { Bound, Fields, LayerSpec, TmmSpec } from './types.ts';
import { polPartsMeta, rcwaLayersAt, rcwaMeta, runRcwa, tmToE } from './runRcwa.ts';
import { rcwaConical } from '../physics/rcwaConical.ts';
import { rcwaThickConical } from '../physics/rcwaThick.ts';
import { GD_META, TMM_META } from './dataset.ts';
import { roughPlan, sliceIndex } from './rough.ts';

export const specSize = (spec: TmmSpec) =>
  spec.sweeps.reduce((p, n) => p * n, 1) * spec.lambda.length * spec.theta.length;

// Value of a swept property at the sweep steps `idx` (one index per sweep).
// The azimuth φ at a sweep step (Berreman / RCWA).
export const phiAt = (spec: TmmSpec, idx: number[]) => (spec.phiBind ? at(spec.phiBind, spec.sweeps, idx) : (spec.b4?.phi ?? spec.rcwa?.phi ?? 0));
const at = <T,>(b: Bound<T>, dims: number[], idx: number[]) => {
  let k = 0;
  for (const s of b.s) k = k * dims[s] + idx[s];
  return b.v[k];
};

export const polAt = (spec: TmmSpec, idx: number[]): Polarization =>
  spec.polSweep !== undefined ? (idx[spec.polSweep] === 0 ? 'p' : 's') : spec.pol;

// Concrete layers (index and thickness) at sweep steps `idx` and wavelength `lam`.
export const layersAt = (spec: TmmSpec, idx: number[], lam: number, list = spec.layers): Layer[] => layersOwned(spec, idx, lam, list).layers;

// The same with, for each layer, the index in `list` of the layer it comes from: rough interfaces become slices of an
// effective medium (the most abundant material owns a slice), the rest of the layers around them stays flat.
export function layersOwned(spec: TmmSpec, idx: number[], lam: number, list = spec.layers): { layers: Layer[]; owner: number[] } {
  const base = plainLayersAt(spec, idx, lam, list);
  const plan = roughPlan(list, spec.sweeps, idx);
  if (!plan) return { layers: base, owner: base.map((_, j) => j) };
  const layers: Layer[] = [];
  const owner: number[] = [];
  for (const it of plan.items) {
    layers.push(it.kind === 'layer' ? { n: base[it.i].n, d: it.d } : { n: sliceIndex(it, (m) => base[m].n), d: it.d });
    owner.push(it.kind === 'layer' ? it.i : it.owner);
  }
  return { layers, owner };
}

function plainLayersAt(spec: TmmSpec, idx: number[], lam: number, list: LayerSpec[]): Layer[] {
  // one evaluation of each material instance (the layers of a stack share a few materials)
  const memo = new Map<string, C>();
  const indexOf = (key: string): C => memo.get(key) ?? memo.set(key, indexOfRaw(key)).get(key)!;
  // `filler`: the pores of an effective-medium material hold this index (the neighbouring layer)
  const indexOfRaw = (key: string, filler?: C): C => {
    const inst = spec.instances[key];
    const p = inst.p ? at(inst.p, spec.sweeps, idx) : inst.p0;
    let n = filler ? emaWithFiller(inst.lib, spec.models, lam, filler, p) : refractiveIndex(inst.lib, spec.models, lam, p);
    if (inst.n) n = c(at(inst.n, spec.sweeps, idx), n.im);
    const dn = (inst.dn ? at(inst.dn, spec.sweeps, idx) : 0) + (inst.dn0 ?? 0) + (inst.dnS ? at(inst.dnS, spec.sweeps, idx) : 0);
    if (dn) n = c(n.re + dn, n.im);
    return n;
  };
  const keys = list.map((L) => (L.bind.mat ? at(L.bind.mat, spec.sweeps, idx) : L.mat));
  return list.map((L, i) => {
    const fill = spec.instances[keys[i]].fill;
    const j = fill === 'prev' ? i - 1 : fill === 'next' ? i + 1 : -1;
    let n = j >= 0 && j < list.length ? indexOfRaw(keys[i], indexOf(keys[j])) : indexOf(keys[i]);
    const dn = L.dn + (L.bind.dn ? at(L.bind.dn, spec.sweeps, idx) : 0);
    if (dn) n = c(n.re + dn, n.im);
    return { n, d: L.bind.d ? at(L.bind.d, spec.sweeps, idx) : L.d };
  });
}

// Coated thick plate: the coatings are coherent, the substrate is not (its thickness ≫ coherence length). The
// intensities of the multiple passes through the substrate add up:
//   R = R_f + T_f·T_f′·R_b·a² / (1 − R_f′·R_b·a²),  T = T_f·T_b·a / (1 − R_f′·R_b·a²),  a = exp(−2 k₀ Im(ñ_s cos θ_s) d)
// (f = front coating seen from the incident side, f′ = from the substrate side, b = back coating seen from the substrate).
// The interfaces use Re(ñ_s); the substrate absorption enters through a. Phases are not defined (NaN).
export function incoherentPoint(front: Layer[], back: Layer[], dSub: number, lam: number, thetaDeg: number, pol: Polarization) {
  const nS = front[front.length - 1].n;
  const sub = c(nS.re);
  const kx = front[0].n.re * Math.sin((thetaDeg * Math.PI) / 180);
  const nan = { phir: NaN, phit: NaN, rRe: NaN, rIm: NaN, tRe: NaN, tIm: NaN };
  const f = tmmPoint([...front.slice(0, -1), { n: sub, d: 0 }], lam, thetaDeg, pol);
  if (kx >= sub.re) return { R: f.R, T: 0, A: 1 - f.R, ...nan }; // no propagating wave in the substrate
  const thS = (Math.asin(kx / sub.re) * 180) / Math.PI;
  const fr = tmmPoint([{ n: sub, d: 0 }, ...front.slice(1, -1).reverse(), front[0]], lam, thS, pol);
  const b = tmmPoint([{ n: sub, d: 0 }, ...back.slice(1)], lam, thS, pol);
  const qs = nCos(nS, c(kx));
  const a = Math.exp(-2 * ((2 * Math.PI) / lam) * qs.im * dSub);
  const den = 1 - fr.R * b.R * a * a;
  const R = f.R + (f.T * fr.T * b.R * a * a) / den;
  const T = (f.T * b.T * a) / den;
  return { R, T, A: 1 - R - T, ...nan };
}

// A part of the grid: the points k0 … k1 − 1 of the flat index over [...sweeps, λ, θ] (θ fastest). The parts of a job are
// computed by several workers and joined (engine/computePool.ts).
export type PointRange = [number, number];

// TMM, Berreman 4×4 (anisotropic layers, a Jones state) or RCWA, by the spec; the group delay added when λ is a range.
// With `range`, only those points (arrays of k1 − k0 values) and no group delay: it needs whole λ lines, the joined result
// gets it from withGroupDelay.
export function runSpec(spec: TmmSpec, onProgress?: (p: number) => void, range?: PointRange): Fields {
  const r = range ?? [0, specSize(spec)];
  const f = (spec.rcwa ? runRcwa(spec, onProgress, r) : spec.b4 ? runBerreman(spec, onProgress, r) : runTmm(spec, onProgress, r)) as Fields;
  return range ? f : withGroupDelay(spec, f);
}

// The group delay and its dispersion added to the fields of the whole grid (when λ has 3 values or more).
export function withGroupDelay(spec: TmmSpec, f: Fields): Fields {
  if (hasGroupDelay(spec)) Object.assign(f, groupDelay(spec, f));
  return f;
}

// Field descriptions of a result.
const baseMeta = (spec: TmmSpec) => (spec.rcwa ? rcwaMeta(spec.rcwa.show, !!spec.rcwa.conical) : spec.b4 ? [...TMM_META, ...polPartsMeta()] : TMM_META);
export const metaOfSpec = (spec: TmmSpec) => (hasGroupDelay(spec) ? [...baseMeta(spec), ...GD_META] : baseMeta(spec));

export const hasGroupDelay = (spec: TmmSpec) => spec.lambda.length >= 3;
const C_NM_FS = 299.792458; // speed of light, nm / fs

// Group delay GD = dφ/dω (fs) and its dispersion GDD = d²φ/dω² (fs²) of r and t — the exp(−iωt) convention of the
// solvers (an absorbing medium has Im n > 0), so a delay τ adds ωτ to the phase — from the phase unwrapped along λ at
// every other grid point, by the quadratic through three neighbouring wavelengths (non-uniform steps in ω allowed). The
// phase must not jump by π between two wavelengths (a fine λ step); NaN phases (incoherent substrate, Jones) give NaN.
export function groupDelay(spec: TmmSpec, f: Record<string, Float64Array>): Record<string, Float64Array> {
  const nL = spec.lambda.length;
  const nT = spec.theta.length;
  const combos = f.R.length / (nL * nT);
  const w = spec.lambda.map((l) => (2 * Math.PI * C_NM_FS) / l); // rad / fs
  const out: Record<string, Float64Array> = {};
  for (const [ph, gd, gdd] of [['phiR', 'GDR', 'GDDR'], ['phiT', 'GDT', 'GDDT']] as const) {
    const G = (out[gd] = new Float64Array(f.R.length).fill(NaN));
    const D = (out[gdd] = new Float64Array(f.R.length).fill(NaN));
    const src = f[ph];
    if (!src) continue;
    const p = new Float64Array(nL);
    for (let c = 0; c < combos; c++)
      for (let t = 0; t < nT; t++) {
        const at = (i: number) => (c * nL + i) * nT + t;
        // unwrap along λ
        for (let i = 0; i < nL; i++) {
          const v = (src[at(i)] * Math.PI) / 180;
          if (i === 0 || !Number.isFinite(p[i - 1])) p[i] = v;
          else p[i] = v + 2 * Math.PI * Math.round((p[i - 1] - v) / (2 * Math.PI));
        }
        for (let i = 0; i < nL; i++) {
          const j = Math.min(nL - 3, Math.max(0, i - 1));
          const [x0, x1, x2] = [w[j], w[j + 1], w[j + 2]];
          const [f0, f1, f2] = [p[j], p[j + 1], p[j + 2]];
          if (![f0, f1, f2].every(Number.isFinite)) continue;
          const [a, b, cc] = [f0 / ((x0 - x1) * (x0 - x2)), f1 / ((x1 - x0) * (x1 - x2)), f2 / ((x2 - x0) * (x2 - x1))];
          const x = w[i];
          G[at(i)] = a * (2 * x - x1 - x2) + b * (2 * x - x0 - x2) + cc * (2 * x - x0 - x1);
          D[at(i)] = 2 * (a + b + cc);
        }
      }
  }
  return out;
}

// Compute TMM through the Berreman 4×4 method: the layers of rcwaLayersAt (anisotropic ones as tensors) solved for the
// zeroth order by the conical solver (azimuth φ, a TE / TM or Jones incident state), the thick substrate by channels.
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
export function runBerreman(spec: TmmSpec, onProgress?: (p: number) => void, range: PointRange = [0, specSize(spec)]): Fields {
  const [k0, k1] = range;
  const size = k1 - k0;
  const keys = ['R', 'T', 'A', 'phiR', 'phiT', 'rRe', 'rIm', 'tRe', 'tIm', 'R_TE', 'R_TM', 'T_TE', 'T_TM', 'R_cp', 'R_cm', 'T_cp', 'T_cm'];
  const out = Object.fromEntries(keys.map((k) => [k, new Float64Array(size)])) as unknown as Record<string, Float64Array>;
  const nL = spec.lambda.length;
  const nT = spec.theta.length;
  const dims = spec.sweeps;
  const combos = dims.reduce((p, n) => p * n, 1);
  const idx = dims.map(() => 0);
  const toDeg = 180 / Math.PI;
  const b4 = spec.b4!;
  let reported = 0;
  for (let combo = 0; combo < combos; combo++) {
    for (let s = dims.length - 1, rem = combo; s >= 0; s--) {
      idx[s] = rem % dims[s];
      rem = Math.floor(rem / dims[s]);
    }
    const pol = polAt(spec, idx);
    const inc = b4.jones ?? pol;
    const dTheta = spec.thetaOffset ? at(spec.thetaOffset, dims, idx) : 0;
    const phi = spec.phiBind ? at(spec.phiBind, dims, idx) : b4.phi;
    for (let li = 0; li < nL; li++) {
      const base = (combo * nL + li) * nT;
      if (base + nT <= k0 || base >= k1) continue; // a row outside the range
      const lam = spec.lambda[li];
      const st = rcwaLayersAt(spec, idx, lam);
      const bk = spec.back ? rcwaLayersAt(spec, idx, lam, spec.back.layers) : null;
      for (let ti = Math.max(0, k0 - base); ti < Math.min(nT, k1 - base); ti++) {
        const th = spec.theta[ti] + dTheta;
        const k = base + ti - k0;
        if (bk) {
          const r = rcwaThickConical(st.layers, bk.layers, spec.back!.d, 1000, lam, th, phi, inc, 0);
          [out.R[k], out.T[k], out.R_TE[k], out.R_TM[k], out.T_TE[k], out.T_TM[k]] = [r.Rtot, r.Ttot, r.RTE[0], r.RTM[0], r.TTE[0], r.TTM[0]];
          // (incoherent in the plate: the powers of the TE / TM channels add, the circular parts are not defined)
          out.phiR[k] = out.phiT[k] = out.R_cp[k] = out.R_cm[k] = out.T_cp[k] = out.T_cm[k] = NaN;
          out.rRe[k] = out.rIm[k] = out.tRe[k] = out.tIm[k] = NaN;
        } else {
          const r = rcwaConical(st.layers, 1000, lam, th, phi, inc, 0);
          [out.R[k], out.T[k], out.R_TE[k], out.R_TM[k], out.T_TE[k], out.T_TM[k]] = [r.Rtot, r.Ttot, r.RTE[0], r.RTM[0], r.TTE[0], r.TTM[0]];
          [out.R_cp[k], out.R_cm[k], out.T_cp[k], out.T_cm[k]] = [r.RCP[0], r.RCM[0], r.TCP[0], r.TCM[0]];
          // the phases of the co-polarized zeroth orders (none for a Jones state)
          const [ar, at2] = pol === 's' ? [r.r0.te, r.t0.te] : [r.r0.tm, r.t0.tm];
          out.phiR[k] = b4.jones ? NaN : Math.atan2(ar.im, ar.re) * toDeg;
          // TM: the conical amplitude is that of the tangential H; TMM's of E (t_E = t_H n₀ / n_exit, n₀ real)
          // (an anisotropic exit medium: no TE / TM amplitude, the phase is NaN)
          const nx = st.layers[st.layers.length - 1].n;
          const shift = pol === 'p' && nx ? Math.atan2(nx.im, nx.re) : 0;
          out.phiT[k] = b4.jones ? NaN : wrap180((Math.atan2(at2.im, at2.re) - shift) * toDeg);
          const tE = b4.jones ? null : pol === 'p' ? (nx ? tmToE(at2, st.layers[0].n!.re, nx) : null) : at2;
          [out.rRe[k], out.rIm[k]] = b4.jones ? [NaN, NaN] : [ar.re, ar.im];
          [out.tRe[k], out.tIm[k]] = tE ? [tE.re, tE.im] : [NaN, NaN];
        }
        out.A[k] = 1 - out.R[k] - out.T[k];
      }
      const done = (Math.min(base + nT, k1) - k0) / size;
      if (onProgress && done - reported >= 0.02) {
        reported = done;
        onProgress(done);
      }
    }
  }
  return out as unknown as Fields;
}

export function runTmm(spec: TmmSpec, onProgress?: (p: number) => void, range: PointRange = [0, specSize(spec)]): Fields {
  const [k0, k1] = range;
  const size = k1 - k0;
  const out: Fields = {
    R: new Float64Array(size),
    T: new Float64Array(size),
    A: new Float64Array(size),
    phiR: new Float64Array(size),
    phiT: new Float64Array(size),
    rRe: new Float64Array(size),
    rIm: new Float64Array(size),
    tRe: new Float64Array(size),
    tIm: new Float64Array(size),
  };
  const nL = spec.lambda.length;
  const nT = spec.theta.length;
  const dims = spec.sweeps;
  const combos = dims.reduce((p, n) => p * n, 1);
  const idx = dims.map(() => 0);
  const toDeg = 180 / Math.PI;
  let reported = 0;

  for (let combo = 0; combo < combos; combo++) {
    for (let s = dims.length - 1, rem = combo; s >= 0; s--) {
      idx[s] = rem % dims[s];
      rem = Math.floor(rem / dims[s]);
    }
    const pol = polAt(spec, idx);
    const dTheta = spec.thetaOffset ? at(spec.thetaOffset, dims, idx) : 0;
    for (let li = 0; li < nL; li++) {
      const base = (combo * nL + li) * nT;
      if (base + nT <= k0 || base >= k1) continue; // a row outside the range
      const lam = spec.lambda[li];
      const layers = layersAt(spec, idx, lam);
      const back = spec.back ? layersAt(spec, idx, lam, spec.back.layers) : null;
      for (let ti = Math.max(0, k0 - base); ti < Math.min(nT, k1 - base); ti++) {
        const th = spec.theta[ti] + dTheta;
        const p = back ? incoherentPoint(layers, back, spec.back!.d, lam, th, pol) : tmmPoint(layers, lam, th, pol);
        const k = base + ti - k0;
        out.R[k] = p.R;
        out.T[k] = p.T;
        out.A[k] = p.A;
        out.phiR[k] = p.phir * toDeg;
        out.phiT[k] = p.phit * toDeg;
        out.rRe[k] = p.rRe;
        out.rIm[k] = p.rIm;
        out.tRe[k] = p.tRe;
        out.tIm[k] = p.tIm;
      }
      const done = (Math.min(base + nT, k1) - k0) / size;
      if (onProgress && done - reported >= 0.02) {
        reported = done;
        onProgress(done);
      }
    }
  }
  return out;
}
