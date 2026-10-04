// Electromagnetic field of a conical-incidence RCWA solution (rcwaConical.ts) on an x–z grid in the plane y = 0: all six
// components. As in the planar maps (rcwaField.ts) the mode amplitudes of every layer follow from the scattering
// matrices of the parts above and below it; the tangential fields (Ex, Ey | hx, hy) are the modes, the normal ones
//   hz = Kx Ey − ky Ex,   Ez = −[[ε]]⁻¹ (Kx hy − ky hx)
// and Ex, discontinuous across the ridge walls, is rebuilt from Dx = [[1/ε]]⁻¹ Ex (continuous) divided by ε(x).
// h = η₀H (normalized fields); |E|², |H|² are given relative to the incident wave.
import * as X from './complex.ts';
import type { C } from './complex.ts';
import { add, eye, inv, mul, mulVec, type CMat } from './cmat.ts';
import { segEps, star, type RcwaLayer, type SMat } from './rcwa.ts';
import type { ConicalSolved } from './rcwaConical.ts';
import { mapGrid, mapOutlines, sigmaFactors, type FieldMap, type FieldMapOpts, type FieldPart } from './rcwaField.ts';
import type { Polarization } from './tmm.ts';

type Vec = [Float64Array, Float64Array];
const addV = (a: Vec, b: Vec, s = 1): Vec => [a[0].map((v, i) => v + s * b[0][i]), a[1].map((v, i) => v + s * b[1][i])];
const scaleV = (a: Vec, k: number): Vec => [a[0].map((v) => v * k), a[1].map((v) => v * k)];
// exp(i kz z) of every mode
const phases = (kz: C[], z: number): Vec => {
  const r = new Float64Array(kz.length);
  const i = new Float64Array(kz.length);
  kz.forEach((q, m) => {
    const e = X.exp(X.c(-q.im * z, q.re * z));
    r[m] = e.re;
    i[m] = e.im;
  });
  return [r, i];
};
const mulDiag = (d: Vec, x: Vec): Vec => [d[0].map((v, m) => v * x[0][m] - d[1][m] * x[1][m]), d[0].map((v, m) => v * x[1][m] + d[1][m] * x[0][m])];
const diagOf = (re: Float64Array, im: Float64Array): CMat => {
  const n = re.length;
  const m = eye(n);
  for (let k = 0; k < n; k++) {
    m.re[k * n + k] = re[k];
    m.im[k * n + k] = im[k];
  }
  return m;
};

// The six components at every point of a line (x values) at one depth: harmonics of the region, summed over the orders.
export type Fields6 = { Ex: C; Ey: C; Ez: C; Hx: C; Hy: C; Hz: C };

// Tangential fields (e = [Ex; Ey], h = [hx; hy], 2M harmonics) of every region as functions of the local depth (k₀z).
export function conicalRegions(sol: ConicalSolved, layers: RcwaLayer[]) {
  const { modes, parts, Sref, Strn, k0, e0, r, t } = sol;
  const n = e0[0].length;
  const nIn = layers.length - 2;
  const I = eye(n);
  const left: SMat[] = [Sref];
  for (let j = 0; j < nIn; j++) left.push(star(left[j], parts[j].S));
  const right: SMat[] = new Array(nIn + 1);
  right[nIn] = Strn;
  for (let j = nIn - 1; j >= 0; j--) right[j] = star(parts[j].S, right[j + 1]);
  type Region = { d: number; at: (z: number) => { e: Vec; h: Vec } };
  const regions: Region[] = [];
  // incident side (z < 0): e = e₀ e^{i kz z} + r e^{−i kz z}, h = V (forward − backward)
  const m0 = modes[0];
  regions.push({
    d: 0,
    at: (z) => {
      const f = mulDiag(phases(m0.kz, z), e0);
      const b = mulDiag(phases(m0.kz, -z), r);
      return { e: addV(f, b), h: mulVec(m0.V, ...addV(f, b, -1)) };
    },
  });
  for (let j = 0; j < nIn; j++) {
    const L = parts[j];
    const md = modes[j + 1];
    const SL = left[j];
    const SR = right[j];
    const aP = mulVec(mul(inv(add(I, mul(SL.S22, SR.S11), -1)), SL.S21), e0[0], e0[1]);
    const Sr = right[j + 1];
    const bM = mulVec(mul(mul(inv(add(I, mul(Sr.S11, L.S.S22), -1)), Sr.S11), L.S.S21), aP[0], aP[1]);
    const MXPi = mul(mul(L.Mm, diagOf(L.Xr, L.Xi)), L.Pinv);
    const cP = mulVec(L.Dinv, ...addV(scaleV(aP, 2), mulVec(MXPi, ...(scaleV(bM, 2) as Vec)), -1));
    const cM = mulVec(L.Dinv, ...addV(scaleV(bM, 2), mulVec(MXPi, ...(scaleV(aP, 2) as Vec)), -1));
    const d = layers[j + 1].d * k0;
    regions.push({
      d,
      at: (z) => {
        const f = mulDiag(phases(md.kz, z), cP);
        const b = mulDiag(phases(md.kz, d - z), cM);
        return { e: mulVec(md.W, ...addV(f, b)), h: mulVec(md.V, ...addV(f, b, -1)) };
      },
    });
  }
  const mT = modes[modes.length - 1];
  regions.push({
    d: Infinity,
    at: (z) => {
      const e = mulDiag(phases(mT.kz, z), t);
      return { e, h: mulVec(mT.V, e[0], e[1]) };
    },
  });
  return regions;
}

// The six components along x at local depth zl (k₀z) of region `reg` (0 = incident medium, 1 … = layers, last = exit).
// sig: weights of the harmonics (Gibbs smoothing, sigmaFactors), none = 1
export function conicalFieldsAt(sol: ConicalSolved, layers: RcwaLayer[], period: number, regions: ReturnType<typeof conicalRegions>, reg: number, zl: number, xs: number[], sig?: Float64Array): Fields6[] {
  const { kx, ky, k0, modes } = sol;
  const M = kx.length;
  const { e, h } = regions[reg].at(zl);
  const L = layers[reg];
  const md = modes[reg];
  const part = (v: Vec, from: number): Vec => [v[0].slice(from, from + M), v[1].slice(from, from + M)];
  const [ex, ey, hx, hy] = [part(e, 0), part(e, M), part(h, 0), part(h, M)];
  // hz = Kx Ey − ky Ex;  q = Kx hy − ky hx (Ez = −[[ε]]⁻¹ q)
  const lin = (a: Vec, ka: (m: number) => number, b: Vec, kb: (m: number) => number): Vec => [a[0].map((v, m) => ka(m) * v - kb(m) * b[0][m]), a[1].map((v, m) => ka(m) * v - kb(m) * b[1][m])];
  const hz = lin(ey, (m) => kx[m], ex, () => ky);
  const q = lin(hy, (m) => kx[m], hx, () => ky);
  let ez: Vec;
  let dx: Vec | null = null;
  if (L.segs && md.Ei && md.Ainv) {
    const t = mulVec(md.Ei, q[0], q[1]);
    ez = scaleV(t, -1);
    dx = mulVec(md.Ainv, ex[0], ex[1]);
  } else {
    const w = X.div(X.c(-1), md.eps!);
    ez = [q[0].map((v, m) => v * w.re - q[1][m] * w.im), q[0].map((v, m) => v * w.im + q[1][m] * w.re)];
  }
  const epsAt = (x: number): C => {
    const f = (((x / period) % 1) + 1) % 1;
    const s = L.segs!.find((g) => f >= g.from && f < g.to) ?? L.segs![L.segs!.length - 1];
    return segEps(s, 0); // Ex = Dx / εxx
  };
  return xs.map((x) => {
    const sums = [ex, ey, ez, hx, hy, hz, ...(dx ? [dx] : [])].map(() => [0, 0]);
    for (let m = 0; m < M; m++) {
      const ph = sig ? X.mul(X.c(sig[m]), X.exp(X.c(0, kx[m] * k0 * x))) : X.exp(X.c(0, kx[m] * k0 * x));
      [ex, ey, ez, hx, hy, hz, ...(dx ? [dx] : [])].forEach((v, k) => {
        sums[k][0] += v[0][m] * ph.re - v[1][m] * ph.im;
        sums[k][1] += v[0][m] * ph.im + v[1][m] * ph.re;
      });
    }
    const [Ex, Ey, Ez, Hx, Hy, Hz] = sums.map(([a, b]) => X.c(a, b));
    return { Ex: dx ? X.div(X.c(sums[6][0], sums[6][1]), epsAt(x)) : Ex, Ey, Ez, Hx, Hy, Hz };
  });
}

// The map of one quantity (|E|² and |H|² relative to the incident wave: TE E₀ = 1, h₀ = n₀; TM h₀ = 1, E₀ = 1/n₀).
export function conicalFieldMap(
  sol: ConicalSolved,
  layers: RcwaLayer[],
  period: number,
  pol: Polarization,
  opts: FieldMapOpts,
): FieldMap {
  const regions = conicalRegions(sol, layers);
  const nIn = layers.length - 2;
  const total = layers.slice(1, -1).reduce((s, L) => s + L.d, 0);
  const { xs, zs } = mapGrid(opts, period, total);
  const bounds: number[] = [0];
  for (const L of layers.slice(1, -1)) bounds.push(bounds[bounds.length - 1] + L.d);
  const outlines = mapOutlines(layers, bounds, period);
  void pol;
  const [e0n, h0n] = [sol.inc.E2, sol.inc.H2];
  const comp = (w: C, p: FieldPart) => (p === 'abs' ? Math.hypot(w.re, w.im) : p === 're' ? w.re : p === 'im' ? w.im : (Math.atan2(w.im, w.re) * 180) / Math.PI);
  const values = new Float64Array(opts.nx * opts.nz);
  const sig = opts.sigma ? sigmaFactors(sol.kx.length, opts.sigma) : undefined;
  zs.forEach((z, iz) => {
    let reg = 0;
    let zl = z * sol.k0;
    if (z >= 0) {
      let j = 0;
      while (j < nIn && z >= bounds[j + 1]) j++;
      reg = j < nIn ? j + 1 : nIn + 1;
      zl = (z - bounds[Math.min(j, nIn)]) * sol.k0;
    }
    conicalFieldsAt(sol, layers, period, regions, reg, zl, xs, sig).forEach((f, ix) => {
      const q = opts.quantity;
      values[iz * xs.length + ix] =
        q === 'E2' ? (X.abs2(f.Ex) + X.abs2(f.Ey) + X.abs2(f.Ez)) / e0n : q === 'H2' ? (X.abs2(f.Hx) + X.abs2(f.Hy) + X.abs2(f.Hz)) / h0n : comp(f[q], opts.part);
    });
  });
  return { xs, zs, values, boundaries: bounds, outlines };
}
