// Evaluates a TmmSpec over the full grid [...sweeps, lambda, theta]. Pure; runs in the worker and in scripts.
import { c, type C } from '../physics/complex.ts';
import { emaWithFiller, refractiveIndex } from '../physics/materials.ts';
import { nCos, tmmPoint, type Layer, type Polarization } from '../physics/tmm.ts';
import type { Bound, Fields, TmmSpec } from './types.ts';
import { polPartsMeta, rcwaLayersAt, rcwaMeta, runRcwa } from './runRcwa.ts';
import { rcwaConical } from '../physics/rcwaConical.ts';
import { rcwaThickConical } from '../physics/rcwaThick.ts';
import { TMM_META } from './dataset.ts';

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
export function layersAt(spec: TmmSpec, idx: number[], lam: number, list = spec.layers): Layer[] {
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
  const nan = { phir: NaN, phit: NaN };
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

// TMM, Berreman 4×4 (anisotropic layers, a Jones state) or RCWA, by the spec.
export function runSpec(spec: TmmSpec, onProgress?: (p: number) => void): Fields {
  return (spec.rcwa ? runRcwa(spec, onProgress) : spec.b4 ? runBerreman(spec, onProgress) : runTmm(spec, onProgress)) as Fields;
}

// Field descriptions of a result.
export const metaOfSpec = (spec: TmmSpec) => (spec.rcwa ? rcwaMeta(spec.rcwa.show, !!spec.rcwa.conical) : spec.b4 ? [...TMM_META, ...polPartsMeta()] : TMM_META);

// Compute TMM through the Berreman 4×4 method: the layers of rcwaLayersAt (anisotropic ones as tensors) solved for the
// zeroth order by the conical solver (azimuth φ, a TE / TM or Jones incident state), the thick substrate by channels.
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
export function runBerreman(spec: TmmSpec, onProgress?: (p: number) => void): Fields {
  const size = specSize(spec);
  const keys = ['R', 'T', 'A', 'phiR', 'phiT', 'R_TE', 'R_TM', 'T_TE', 'T_TM', 'R_cp', 'R_cm', 'T_cp', 'T_cm'];
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
      const lam = spec.lambda[li];
      const st = rcwaLayersAt(spec, idx, lam);
      const bk = spec.back ? rcwaLayersAt(spec, idx, lam, spec.back.layers) : null;
      const base = (combo * nL + li) * nT;
      for (let ti = 0; ti < nT; ti++) {
        const th = spec.theta[ti] + dTheta;
        const k = base + ti;
        if (bk) {
          const r = rcwaThickConical(st.layers, bk.layers, spec.back!.d, 1000, lam, th, phi, inc, 0);
          [out.R[k], out.T[k], out.R_TE[k], out.R_TM[k], out.T_TE[k], out.T_TM[k]] = [r.Rtot, r.Ttot, r.RTE[0], r.RTM[0], r.TTE[0], r.TTM[0]];
          // (incoherent in the plate: the powers of the TE / TM channels add, the circular parts are not defined)
          out.phiR[k] = out.phiT[k] = out.R_cp[k] = out.R_cm[k] = out.T_cp[k] = out.T_cm[k] = NaN;
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
        }
        out.A[k] = 1 - out.R[k] - out.T[k];
      }
      const done = (combo * nL + li + 1) / (combos * nL);
      if (onProgress && done - reported >= 0.02) {
        reported = done;
        onProgress(done);
      }
    }
  }
  return out as unknown as Fields;
}

export function runTmm(spec: TmmSpec, onProgress?: (p: number) => void): Fields {
  const size = specSize(spec);
  const out: Fields = {
    R: new Float64Array(size),
    T: new Float64Array(size),
    A: new Float64Array(size),
    phiR: new Float64Array(size),
    phiT: new Float64Array(size),
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
      const lam = spec.lambda[li];
      const layers = layersAt(spec, idx, lam);
      const back = spec.back ? layersAt(spec, idx, lam, spec.back.layers) : null;
      const base = (combo * nL + li) * nT;
      for (let ti = 0; ti < nT; ti++) {
        const th = spec.theta[ti] + dTheta;
        const p = back ? incoherentPoint(layers, back, spec.back!.d, lam, th, pol) : tmmPoint(layers, lam, th, pol);
        out.R[base + ti] = p.R;
        out.T[base + ti] = p.T;
        out.A[base + ti] = p.A;
        out.phiR[base + ti] = p.phir * toDeg;
        out.phiT[base + ti] = p.phit * toDeg;
      }
      const done = (combo * nL + li + 1) / (combos * nL);
      if (onProgress && done - reported >= 0.02) {
        reported = done;
        onProgress(done);
      }
    }
  }
  return out;
}
