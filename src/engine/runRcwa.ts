// Evaluates an RCWA spec over the grid [...sweeps, λ, θ]: total R, T, A, phases of the zeroth orders and the efficiency
// of the orders −show … +show. Pure; runs in the TMM workers, the optimizer workers and the scripts.
import { c, type C } from '../physics/complex.ts';
import * as X from '../physics/complex.ts';
import { emaWithFiller, refractiveIndex } from '../physics/materials.ts';
import { rcwaSolve, type RcwaLayer } from '../physics/rcwa.ts';
import { rcwaConical } from '../physics/rcwaConical.ts';
import { biaxial, flipY, rotateZ, uniaxial } from '../physics/berreman.ts';
import { rcwaThickConical, rcwaThickPoint } from '../physics/rcwaThick.ts';
import type { Polarization } from '../physics/tmm.ts';
import { FFF_PROFILES, gratingFff, gratingOutline, gratingSlices, type GratingParams } from './grating.ts';
import type { Bound, FieldMeta, LayerSpec, TmmSpec } from './types.ts';
import { TMM_META } from './dataset.ts';
import { roughFff, roughPlan, sliceIndex, sliceTensor, tensorEma } from './rough.ts';

const at = <T,>(b: Bound<T>, dims: number[], idx: number[]) => {
  let k = 0;
  for (const s of b.s) k = k * dims[s] + idx[s];
  return b.v[k];
};

export const orderKey = (q: 'R' | 'T', m: number) => `${q}_${m < 0 ? 'm' : m > 0 ? 'p' : ''}${Math.abs(m)}`;
const sub = (m: number) => (m < 0 ? `−${-m}` : m > 0 ? `+${m}` : '0');

// The TE and TM parts (the polarization of the outgoing waves) of R and T (conical RCWA, Berreman 4×4).
export const polPartsMeta = (): FieldMeta[] => [
  ...(['R', 'T'] as const).flatMap((q) => (['TE', 'TM'] as const).map((p) => ({ key: `${q}_${p}`, label: `${q} into ${p} (all orders)`, short: `${q} ${p}`, unit: '', domain: [0, 1] as [number, number] }))),
  ...circPartsMeta(),
];
// The circular parts of R and T: helicity +1 (σ+) and −1 (σ−) of the outgoing waves.
export const circPartsMeta = (): FieldMeta[] =>
  (['R', 'T'] as const).flatMap((q) =>
    (['cp', 'cm'] as const).map((c) => ({ key: `${q}_${c}`, label: `${q} into ${c === 'cp' ? 'σ+ (helicity +1)' : 'σ− (helicity −1)'} (all orders)`, short: `${q} ${c === 'cp' ? 'σ+' : 'σ−'}`, unit: '', domain: [0, 1] as [number, number] })),
  );

// conical: also the TE and TM parts (the polarization of the diffracted waves) of R, T and of each order shown
export function rcwaMeta(show: number, conical = false): FieldMeta[] {
  const out: FieldMeta[] = [...TMM_META];
  for (const q of ['R', 'T'] as const)
    for (let m = -show; m <= show; m++)
      out.push({ key: orderKey(q, m), label: `${q} order ${sub(m)}`, short: `${q}(${sub(m)})`, unit: '', domain: [0, 1] });
  if (conical)
    for (const q of ['R', 'T'] as const)
      for (const p of ['TE', 'TM'] as const) {
        out.push({ key: `${q}_${p}`, label: `${q} into ${p} (all orders)`, short: `${q} ${p}`, unit: '', domain: [0, 1] });
        for (let m = -show; m <= show; m++)
          out.push({ key: `${orderKey(q, m)}_${p}`, label: `${q} order ${sub(m)}, ${p} part`, short: `${q}(${sub(m)}) ${p}`, unit: '', domain: [0, 1] });
      }
  if (conical) out.push(...circPartsMeta());
  // planar: the phase of every order shown (its E amplitude — TE: Ey, TM: Hy / n — as φr, φt of the zeroth order)
  else
    for (const q of ['R', 'T'] as const)
      for (let m = -show; m <= show; m++)
        out.push({ key: `${orderKey(q, m)}_ph`, label: `phase of ${q} order ${sub(m)}`, short: `φ ${q}(${sub(m)})`, unit: '°', domain: [-180, 180] });
  return out;
}

// Grating parameters of a layer at the sweep steps idx.
export function gratingAt(L: LayerSpec, dims: number[], idx: number[]): GratingParams<string> | null {
  if (!L.grating) return null;
  return {
    ...L.grating,
    period: L.bind.period ? at(L.bind.period, dims, idx) : L.grating.period,
    fill: L.bind.fill ? at(L.bind.fill, dims, idx) : L.grating.fill,
    fillTop: L.bind.fillTop ? at(L.bind.fillTop, dims, idx) : L.grating.fillTop,
  };
}

// owner: the index in the spec's list of the layer each solver layer comes from (sublayers of a profile, grating slices)
export type RcwaStructure = { layers: RcwaLayer[]; period: number; hasGrating: boolean; owner: number[] };

// The RCWA layers at sweep steps idx and wavelength lam (grating layers split into their slices); `list` = the
// front (default) or the back of a thick substrate (substrate, back layers, out medium). Smooth profiles (Compute RCWA
// „profiles: smooth (FFF)”): a trapezoid, sinus or blazed grating is one layer integrated through its true profile
// (physics/rcwaFff.ts) instead of its staircase slices; `outline`: its true outline (field maps).
export function rcwaLayersAt(spec: TmmSpec, idx: number[], lam: number, list: LayerSpec[] = spec.layers, outline = false): RcwaStructure {
  const dims = spec.sweeps;
  const fff = spec.rcwa?.profiles === 'fff';
  // `filler`: the pores of an effective-medium material hold this index (the neighbouring plain layer)
  const indexOf = (key: string, filler?: C): C => {
    const inst = spec.instances[key];
    const p = inst.p ? at(inst.p, dims, idx) : inst.p0;
    let n = filler ? emaWithFiller(inst.lib, spec.models, lam, filler, p) : refractiveIndex(inst.lib, spec.models, lam, p);
    if (inst.n) n = c(at(inst.n, dims, idx), n.im);
    const dn = (inst.dn ? at(inst.dn, dims, idx) : 0) + (inst.dn0 ?? 0) + (inst.dnS ? at(inst.dnS, dims, idx) : 0);
    if (dn) n = c(n.re + dn, n.im);
    return n;
  };
  let period = NaN;
  const out: RcwaLayer[] = [];
  const owner: number[] = [];
  const keys = list.map((L) => (L.bind.mat ? at(L.bind.mat, dims, idx) : L.mat));
  // the index of a plain layer, its pores filled by the neighbour when asked (a grating neighbour: the library filler)
  const plain = (i: number): C => {
    const fill = spec.instances[keys[i]].fill;
    const j = fill === 'prev' ? i - 1 : fill === 'next' ? i + 1 : -1;
    const nb = j >= 0 && j < list.length && !(j > 0 && j < list.length - 1 && list[j].grating) ? indexOf(keys[j]) : undefined;
    return indexOf(keys[i], nb);
  };
  const shiftOf = (L: LayerSpec) => L.dn + (L.bind.dn ? at(L.bind.dn, dims, idx) : 0);
  const emit = (L: LayerSpec, i: number, dPart?: number) => {
    const dn = shiftOf(L);
    const shifted = (n: C) => (dn ? X.add(n, c(dn)) : n);
    const d = dPart ?? (L.bind.d ? at(L.bind.d, dims, idx) : L.d);
    const g = i > 0 && i < list.length - 1 ? gratingAt(L, dims, idx) : null;
    const an = spec.instances[keys[i]].aniso;
    if (!g && an) {
      // anisotropic (Berreman): the tensor from the principal indices at λ and the orientation at the step; a director
      // profile (twist, tilt) → sublayers
      const own = spec.instances[keys[i]];
      const extra = (own.dn0 ?? 0) + (own.dnS ? at(own.dnS, dims, idx) : 0);
      const ns = an.comps.map((k) => {
        const n = shifted(indexOf(k));
        return extra ? X.add(n, c(extra)) : n;
      });
      const ang = an.angles.map((a, k) => (an.angleB[k] ? at(an.angleB[k]!, dims, idx) : a));
      // (a semi-infinite exit medium stays one region)
      // the twist at this step (a pitch: from the thickness), its sublayers
      const twist = L.lc ? (L.lc.pitch ? (360 * d) / L.lc.pitch : L.lc.twist) : 0;
      const S = L.lc && i > 0 && i < list.length - 1 ? Math.max(1, L.lc.autoSlices ? Math.max(20, Math.ceil(Math.abs(twist) / 4.5)) : L.lc.slices) : 1;
      // a pure twist (constant tilt): one helix layer (exact at normal incidence, sliced by the solver otherwise)
      if (L.lc && twist !== 0 && L.lc.tiltEnd === undefined && i > 0 && i < list.length - 1) {
        const eps = an.kind === 'uniaxial' ? uniaxial(ns[0], ns[1], ang[0], ang[1]) : biaxial(ns[0], ns[1], ns[2], ang[0], ang[1], ang[2]);
        // seen from the other side: the helix starts from the bottom face's orientation (turned), same sense
        out.push({ eps: L.flipZ ? flipY(rotateZ(eps, twist)) : eps, d, helix: { twist, slices: S } });
        owner.push(i);
        return;
      }
      const first = out.length;
      for (let j = 0; j < S; j++) {
        const f = (j + 0.5) / S;
        const turn = twist * f;
        const tilt = (a0: number) => (L.lc && L.lc.tiltEnd !== undefined ? a0 + (L.lc.tiltEnd - a0) * f : a0);
        const eps = an.kind === 'uniaxial' ? uniaxial(ns[0], ns[1], tilt(ang[0]), ang[1] + turn) : biaxial(ns[0], ns[1], ns[2], ang[0] + turn, tilt(ang[1]), ang[2]);
        out.push({ eps, d: d / S });
        owner.push(i);
      }
      // seen from the other side: the sublayers in reverse order, each tensor turned by π about y
      if (L.flipZ) out.splice(first, S, ...out.slice(first).reverse().map((q) => ({ ...q, eps: flipY(q.eps!) })));
      return;
    }
    if (!g) {
      out.push({ n: shifted(plain(i)), d });
      owner.push(i);
      return;
    }
    if (Number.isNaN(period)) period = g.period;
    else if (Math.abs(g.period - period) > 1e-9 * period) throw new Error(`the grating layers have different periods (${period} and ${g.period} nm)`);
    const ns = g.mats.map((k) => shifted(indexOf(k)));
    if (fff && FFF_PROFILES.includes(g.profile)) {
      if (d > 0) {
        out.push({ d, fff: gratingFff(g, d, (m) => ns[m] ?? ns[1]), ...(outline ? { outline: { d, lines: gratingOutline(g) } } : {}) });
        owner.push(i);
      }
      return;
    }
    for (const s of gratingSlices(g)) {
      if (!(s.h * d > 0)) continue;
      out.push({ d: s.h * d, segs: s.segs.map((q) => ({ from: q.from, to: q.to, n: ns[q.m] ?? ns[1] })) });
      owner.push(i);
    }
  };
  // rough interfaces: slices of pixels (RCWA, a cell of the grating period if there is one) or of an effective medium
  // (Berreman), between the flat parts of the layers
  const gp = list.map((L, i) => (i > 0 && i < list.length - 1 ? gratingAt(L, dims, idx) : null)).find((g) => g)?.period;
  const plan = roughPlan(list, dims, idx, gp, !spec.rcwa);
  if (!plan) list.forEach((L, i) => emit(L, i));
  else {
    const special = (i: number) => (i > 0 && i < list.length - 1 && !!list[i].grating) || !!spec.instances[keys[i]].aniso;
    const fullD = (i: number) => (i === 0 || i === list.length - 1 ? 0 : list[i].bind.d ? at(list[i].bind.d!, dims, idx) : list[i].d);
    const nOf = (m: number) => (shiftOf(list[m]) ? X.add(plain(m), c(shiftOf(list[m]))) : plain(m));
    let pixels = false;
    const zonesDone = new Set<number>();
    for (const it of plan.items) {
      if (it.kind === 'layer') {
        if (special(it.i) && Math.abs(it.d - fullD(it.i)) > 1e-9) throw new Error('a rough interface reaches a grating or an anisotropic layer');
        emit(list[it.i], it.i, special(it.i) ? undefined : it.d);
        continue;
      }
      if (it.mats.some(special)) throw new Error('a rough interface reaches a grating or an anisotropic layer');
      if (spec.rcwa && fff) {
        // the whole rough zone as one smooth (FFF) layer, its true outline the surfaces themselves
        pixels = true;
        if (zonesDone.has(it.zone)) continue;
        zonesDone.add(it.zone);
        const z = plan.zones[it.zone];
        const d = z.z1 - z.z0;
        const lines = z.S.map((s) => Array.from({ length: z.px + 1 }, (_, x) => [(x + 0.5) / z.px, (s[x % z.px] - z.z0) / d]).flat());
        out.push({ d, fff: roughFff(z, plan.cell, nOf), ...(outline ? { outline: { d, lines } } : {}) });
        owner.push(it.owner);
        continue;
      }
      if (spec.rcwa) {
        pixels = true;
        const ns = new Map(it.mats.map((m) => [m, nOf(m)]));
        out.push({ d: it.d, segs: it.segs.map((q) => ({ from: q.from, to: q.to, n: ns.get(q.m)! })) });
      } else out.push(tensorEma(it.ema) ? { eps: sliceTensor(it, nOf), d: it.d } : { n: sliceIndex(it, nOf), d: it.d });
      owner.push(it.owner);
    }
    if (pixels && Number.isNaN(period)) period = plan.cell;
  }
  return { layers: out, period: Number.isNaN(period) ? 1000 : period, hasGrating: !Number.isNaN(period), owner };
}

// The layering of rcwaLayersAt with material instance keys instead of indices (for drawings and profiles).
export type RegionSpec = { d: number; key?: string; segs?: { from: number; to: number; key: string }[] };
export function rcwaRegionsAt(spec: TmmSpec, idx: number[]): { incident: string; exit: string; layers: RegionSpec[] } {
  const dims = spec.sweeps;
  const matKey = (L: LayerSpec) => (L.bind.mat ? at(L.bind.mat, dims, idx) : L.mat);
  const layers: RegionSpec[] = [];
  const emit = (L: LayerSpec, dPart?: number) => {
    const d = dPart ?? (L.bind.d ? at(L.bind.d, dims, idx) : L.d);
    const g = gratingAt(L, dims, idx);
    if (!g) {
      layers.push({ d, key: matKey(L) });
      return;
    }
    for (const s of gratingSlices(g)) if (s.h * d > 0) layers.push({ d: s.h * d, segs: s.segs.map((q) => ({ from: q.from, to: q.to, key: g.mats[q.m] ?? g.mats[1] })) });
  };
  const list = spec.layers;
  const gp = list.map((L, i) => (i > 0 && i < list.length - 1 ? gratingAt(L, dims, idx) : null)).find((g) => g)?.period;
  const plan = roughPlan(list, dims, idx, gp);
  if (!plan) list.slice(1, -1).forEach((L) => emit(L));
  else
    for (const it of plan.items) {
      if (it.kind === 'slice') layers.push({ d: it.d, segs: it.segs.map((q) => ({ from: q.from, to: q.to, key: matKey(list[q.m]) })) });
      else if (it.i > 0 && it.i < list.length - 1) emit(list[it.i], list[it.i].grating ? undefined : it.d);
    }
  return { incident: matKey(spec.layers[0]), exit: matKey(spec.layers[spec.layers.length - 1]), layers };
}

// The finite layers of the structure at sweep steps idx as given (a grating is one layer, not its slices): thickness and
// material (none for a grating), top to bottom.
export function rcwaLayerList(spec: TmmSpec, idx: number[]): { d: number; key?: string }[] {
  const dims = spec.sweeps;
  return spec.layers.slice(1, -1).map((L) => {
    const d = L.bind.d ? at(L.bind.d, dims, idx) : L.d;
    return gratingAt(L, dims, idx) ? { d } : { d, key: L.bind.mat ? at(L.bind.mat, dims, idx) : L.mat };
  });
}

// The structure at sweep steps idx and wavelength lam: front, back of a thick substrate, common period, orders used.
type At = { st: RcwaStructure; bk: RcwaStructure | null; period: number; grating: boolean };
function structureAt(spec: TmmSpec, idx: number[], lam: number): At {
  const st = rcwaLayersAt(spec, idx, lam);
  // thick substrate: the back (substrate … out) is a second coherent part, with the same orders
  const bk = spec.back ? rcwaLayersAt(spec, idx, lam, spec.back.layers) : null;
  if (bk?.hasGrating && st.hasGrating && Math.abs(bk.period - st.period) > 1e-9 * st.period)
    throw new Error(`the front and back gratings have different periods (${st.period} and ${bk.period} nm)`);
  return { st, bk, period: st.hasGrating || !bk?.hasGrating ? st.period : bk.period, grating: st.hasGrating || !!bk?.hasGrating };
}

// TM transmission amplitude of the tangential H → TMM's of E: t_E = t_H n₀ / n_exit (n₀ real).
export const tmToE = (tH: C, n0: number, nExit: C): C => X.div(X.mul(tH, c(n0)), nExit);

// Rte … Ttm: the TE / TM parts of each order (conical incidence; planar: all in the incident polarization)
// phRm / phTm: the phase of every order (planar solver), NaN where the order carries no power
// r0 / t0: the complex amplitudes of the zeroth orders, as TMM's r and t (absent where the phases are not defined)
type PointResult = { R: number; T: number; phiR: number; phiT: number; r0?: C; t0?: C; Rm: Float64Array; Tm: Float64Array; phRm?: Float64Array; phTm?: Float64Array; Rte?: Float64Array; Rtm?: Float64Array; Tte?: Float64Array; Ttm?: Float64Array; Rcp?: Float64Array; Rcm?: Float64Array; Tcp?: Float64Array; Tcm?: Float64Array };
// One point with N orders (−N … N) when the structure has a grating (0 otherwise); φ ≠ 0: conical incidence.
function solvePoint(spec: TmmSpec, s: At, lam: number, theta: number, pol: Polarization, orders: number, phi = 0): PointResult {
  const N = s.grating ? orders : 0;
  // the phase of T as TMM's: TM amplitudes here are of the tangential H, TMM's of E (t_E = t_H n₀ / n_exit, n₀ real) —
  // they differ by arg(n_exit) for an absorbing exit medium
  const nx = s.st.layers[s.st.layers.length - 1].n;
  const tmShift = pol === 'p' && nx ? Math.atan2(nx.im, nx.re) : 0;
  const n0 = s.st.layers[0].n!.re;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const fact = spec.rcwa!.fact ?? 'li';
  const jones = spec.rcwa!.jones;
  const hasEps = s.st.layers.some((L) => L.eps) || !!s.bk?.layers.some((L) => L.eps);
  if (phi !== 0 || jones || hasEps) {
    const inc = jones ?? pol;
    if (s.bk) {
      const r = rcwaThickConical(s.st.layers, s.bk.layers, spec.back!.d, s.period, lam, theta, phi, inc, N, fact);
      // (incoherent in the plate: circular parts not defined)
      return { R: r.Rtot, T: r.Ttot, phiR: NaN, phiT: NaN, Rm: r.R, Tm: r.T, Rte: r.RTE, Rtm: r.RTM, Tte: r.TTE, Ttm: r.TTM, Rcp: new Float64Array(r.R.length).fill(NaN), Rcm: new Float64Array(r.R.length).fill(NaN), Tcp: new Float64Array(r.R.length).fill(NaN), Tcm: new Float64Array(r.R.length).fill(NaN) };
    }
    const r = rcwaConical(s.st.layers, s.period, lam, theta, phi, inc, N, fact);
    // the phases of the zeroth orders: the co-polarized amplitudes (as the planar u-field Ey or Hy); none for a Jones state
    const [ar, at] = pol === 's' ? [r.r0.te, r.t0.te] : [r.r0.tm, r.t0.tm];
    const amp = jones ? {} : { r0: ar, t0: pol === 's' ? at : nx ? tmToE(at, n0, nx) : undefined };
    return { R: r.Rtot, T: r.Ttot, phiR: jones ? NaN : Math.atan2(ar.im, ar.re), phiT: jones ? NaN : wrap(Math.atan2(at.im, at.re) - tmShift), ...amp, Rm: r.R, Tm: r.T, Rte: r.RTE, Rtm: r.RTM, Tte: r.TTE, Ttm: r.TTM, Rcp: r.RCP, Rcm: r.RCM, Tcp: r.TCP, Tcm: r.TCM };
  }
  if (s.bk) {
    const r = rcwaThickPoint(s.st.layers, s.bk.layers, spec.back!.d, s.period, lam, theta, pol, N, fact);
    return { R: r.Rtot, T: r.Ttot, phiR: NaN, phiT: NaN, Rm: r.R, Tm: r.T };
  }
  const r = rcwaSolve(s.st.layers, s.period, lam, theta, pol, N, fact, spec.rcwa!.asr ?? 0).result;
  // the phases of all the orders: TM transmitted orders as E (Hy / n_exit, the same shift as the zeroth order)
  const phRm = Float64Array.from(r.R, (e, m) => (e > 0 || m === N ? Math.atan2(r.r[1][m], r.r[0][m]) : NaN));
  const phTm = Float64Array.from(r.T, (e, m) => (e > 0 || m === N ? wrap(Math.atan2(r.t[1][m], r.t[0][m]) - tmShift) : NaN));
  const t0 = c(r.t[0][N], r.t[1][N]);
  return { R: r.Rtot, T: r.Ttot, phiR: phRm[N], phiT: phTm[N], r0: c(r.r[0][N], r.r[1][N]), t0: pol === 's' ? t0 : tmToE(t0, n0, nx!), Rm: r.R, Tm: r.T, phRm, phTm };
}

// Grid point k (flat index over [...sweeps, λ, θ]): sweep steps, λ, θ (with the angle offset) and polarization.
function gridPoint(spec: TmmSpec, k: number) {
  const nL = spec.lambda.length;
  const nT = spec.theta.length;
  const ti = k % nT;
  const li = Math.floor(k / nT) % nL;
  let rem = Math.floor(k / (nT * nL));
  const dims = spec.sweeps;
  const idx = dims.map(() => 0);
  for (let s = dims.length - 1; s >= 0; s--) {
    idx[s] = rem % dims[s];
    rem = Math.floor(rem / dims[s]);
  }
  const pol: Polarization = spec.polSweep !== undefined ? (idx[spec.polSweep] === 0 ? 'p' : 's') : spec.pol;
  const dTheta = spec.thetaOffset ? at(spec.thetaOffset, dims, idx) : 0;
  const phi = spec.phiBind ? at(spec.phiBind, dims, idx) : (spec.rcwa?.phi ?? 0);
  const orders = spec.ordersBind ? at(spec.ordersBind, dims, idx) : spec.rcwa!.orders;
  return { idx, lam: spec.lambda[li], theta: spec.theta[ti] + dTheta, pol, phi, orders };
}

// range: the points k0 … k1 − 1 of the grid only (the parts of a job computed by several workers), arrays of k1 − k0
export function runRcwa(spec: TmmSpec, onProgress?: (p: number) => void, range?: [number, number]): Record<string, Float64Array> {
  const opt = spec.rcwa!;
  const nL = spec.lambda.length;
  const nT = spec.theta.length;
  const dims = spec.sweeps;
  const combos = dims.reduce((p, n) => p * n, 1);
  const [k0, k1] = range ?? [0, combos * nL * nT];
  const size = k1 - k0;
  const keys = ['R', 'T', 'A', 'phiR', 'phiT', 'rRe', 'rIm', 'tRe', 'tIm'];
  const orders: [string, 'R' | 'T', number][] = [];
  for (const q of ['R', 'T'] as const) for (let m = -opt.show; m <= opt.show; m++) orders.push([orderKey(q, m), q, m]);
  const conical = !!opt.conical;
  const parts = conical ? (['TE', 'TM'] as const) : [];
  const out: Record<string, Float64Array> = Object.fromEntries(
    [...keys, ...orders.map((o) => o[0]), ...(conical ? [] : orders.map((o) => `${o[0]}_ph`)), ...parts.flatMap((p) => ['R', 'T'].flatMap((q) => [`${q}_${p}`, ...orders.filter((o) => o[1] === q).map((o) => `${o[0]}_${p}`)])), ...(conical ? ['R_cp', 'R_cm', 'T_cp', 'T_cm'] : [])].map((k) => [k, new Float64Array(size)]),
  );
  const toDeg = 180 / Math.PI;
  let reported = 0;
  let s: At | null = null;
  for (let kk = k0; kk < k1; kk++) {
    const k = kk - k0;
    const p = gridPoint(spec, kk);
    if (kk % nT === 0 || kk === k0) s = structureAt(spec, p.idx, p.lam); // the layers change with λ and the sweeps, not with θ
    const r = solvePoint(spec, s!, p.lam, p.theta, p.pol, p.orders, p.phi);
    const N = (r.Rm.length - 1) / 2;
    if (conical) {
      // the TE / TM parts; at φ = 0 (planar) everything stays in the incident polarization
      const zero = new Float64Array(r.Rm.length);
      const [Rte, Rtm, Tte, Ttm] = r.Rte ? [r.Rte, r.Rtm!, r.Tte!, r.Ttm!] : p.pol === 's' ? [r.Rm, zero, r.Tm, zero] : [zero, r.Rm, zero, r.Tm];
      const sum = (a: Float64Array) => a.reduce((x, y) => x + y, 0);
      [out.R_TE[k], out.R_TM[k], out.T_TE[k], out.T_TM[k]] = [sum(Rte), sum(Rtm), sum(Tte), sum(Ttm)];
      // circular parts (planar, linear TE / TM waves: half each)
      [out.R_cp[k], out.R_cm[k], out.T_cp[k], out.T_cm[k]] = r.Rcp ? [sum(r.Rcp), sum(r.Rcm!), sum(r.Tcp!), sum(r.Tcm!)] : [r.R / 2, r.R / 2, r.T / 2, r.T / 2];
      for (const [key, q, m] of orders) {
        const inside = Math.abs(m) <= N;
        out[`${key}_TE`][k] = inside ? (q === 'R' ? Rte : Tte)[N + m] : 0;
        out[`${key}_TM`][k] = inside ? (q === 'R' ? Rtm : Ttm)[N + m] : 0;
      }
    }
    out.R[k] = r.R;
    out.T[k] = r.T;
    out.A[k] = 1 - r.R - r.T;
    out.phiR[k] = r.phiR * toDeg;
    out.phiT[k] = r.phiT * toDeg;
    [out.rRe[k], out.rIm[k]] = r.r0 ? [r.r0.re, r.r0.im] : [NaN, NaN];
    [out.tRe[k], out.tIm[k]] = r.t0 ? [r.t0.re, r.t0.im] : [NaN, NaN];
    for (const [key, q, m] of orders) out[key][k] = Math.abs(m) <= N ? (q === 'R' ? r.Rm[N + m] : r.Tm[N + m]) : 0;
    if (!conical)
      for (const [key, q, m] of orders) {
        const ph = q === 'R' ? r.phRm : r.phTm;
        out[`${key}_ph`][k] = ph && Math.abs(m) <= N ? ph[N + m] * toDeg : NaN;
      }
    // per point: a single λ with many angles still moves the progress bar
    const done = (k + 1) / size;
    if (onProgress && done - reported >= 0.01) {
      reported = done;
      onProgress(done);
    }
  }
  return out;
}

// ---- Convergence check: R and T at a sample of grid points for several numbers of orders ----

export type ConvRow = { N: number; R: number[]; T: number[]; msPerPoint: number };

// Up to `count` grid points spread over the grid, plus the given extra points (e.g. the R dip and peak).
export function convergencePoints(size: number, count: number, extra: number[] = []): number[] {
  const pts = new Set(extra.filter((k) => k >= 0 && k < size));
  const n = Math.min(size, count);
  for (let i = 0; i < n; i++) pts.add(Math.round(((i + 0.5) * size) / n - 0.5));
  return [...pts].sort((a, b) => a - b);
}

// Largest number of Fourier orders N (2N + 1 harmonics). One point of a lamellar Au grating takes ~0.3 s at N = 60,
// ~0.8 s at 100, ~7 s at 200 and ~26 s at 300 (the eigenproblem grows as N³); metal gratings in TM may need N > 60.
export const MAX_ORDERS = 300;

// The orders compared: N, ⌈1.5 N⌉ and the reference 2N (at most MAX_ORDERS), at least 1 apart.
export const convergenceOrders = (N: number) => [...new Set([N, Math.ceil(1.5 * N), 2 * N].map((v) => Math.min(MAX_ORDERS, Math.max(1, v))))].sort((a, b) => a - b);

export function rcwaConvergence(spec: TmmSpec, points: number[], Ns: number[], onProgress?: (p: number) => void): ConvRow[] {
  const cost = Ns.map((n) => (2 * n + 1) ** 3);
  const total = cost.reduce((a, b) => a + b, 0) * points.length;
  let done = 0;
  return Ns.map((N, j) => {
    const t0 = performance.now();
    const R: number[] = [];
    const T: number[] = [];
    for (const k of points) {
      const p = gridPoint(spec, k);
      const r = solvePoint(spec, structureAt(spec, p.idx, p.lam), p.lam, p.theta, p.pol, N, p.phi);
      R.push(r.R);
      T.push(r.T);
      done += cost[j];
      onProgress?.(done / total);
    }
    return { N, R, T, msPerPoint: (performance.now() - t0) / points.length };
  });
}
