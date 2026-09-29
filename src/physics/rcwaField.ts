// Electromagnetic field of an RCWA solution on an x–z grid. The amplitudes of the modes of every layer follow from
// the scattering matrices (left part and right part of the structure around the layer); the field of each order is
// then summed over x. TM: Ex is rebuilt from Dx = [[1/ε]]⁻¹ Ex (continuous across the x interfaces) divided by ε(x),
// which avoids the Gibbs ringing of Ex at the ridge walls.
import * as X from './complex.ts';
import type { C } from './complex.ts';
import { add, eye, inv, mul, mulVec, type CMat } from './cmat.ts';
import { star, type RcwaLayer, type SMat, type Solved } from './rcwa.ts';
import type { Polarization } from './tmm.ts';

export type FieldQuantity = 'E2' | 'H2' | 'Ex' | 'Ey' | 'Ez' | 'Hx' | 'Hy' | 'Hz';
export type FieldPart = 'abs' | 're' | 'im' | 'phase';

export type FieldMap = {
  xs: number[]; // nm
  zs: number[]; // nm, 0 = top of the first layer
  values: Float64Array; // row-major [z][x]
  boundaries: number[]; // z of the interfaces
  outlines: { z0: number; z1: number; xs: number[] }[]; // x (nm, within one period) of the material walls of each slice
};

type Vec = [Float64Array, Float64Array];
const addV = (a: Vec, b: Vec, s = 1): Vec => [a[0].map((v, i) => v + s * b[0][i]), a[1].map((v, i) => v + s * b[1][i])];
const scaleV = (a: Vec, k: number): Vec => [a[0].map((v) => v * k), a[1].map((v) => v * k)];

// Harmonic amplitudes (u, v) of every region at local depth z (normalized, k₀z).
type Region = { d: number; at: (z: number) => { u: Vec; v: Vec } };

function diagPhase(kzRe: Float64Array, kzIm: Float64Array, z: number): Vec {
  // exp(i kz z)
  const r = new Float64Array(kzRe.length);
  const i = new Float64Array(kzRe.length);
  for (let m = 0; m < kzRe.length; m++) {
    const e = X.exp(X.c(-kzIm[m] * z, kzRe[m] * z));
    r[m] = e.re;
    i[m] = e.im;
  }
  return [r, i];
}
const mulDiag = (d: Vec, x: Vec): Vec => [d[0].map((v, m) => v * x[0][m] - d[1][m] * x[1][m]), d[0].map((v, m) => v * x[1][m] + d[1][m] * x[0][m])];

export function fieldMap(
  sol: Solved,
  layers: RcwaLayer[],
  period: number,
  pol: Polarization,
  opts: { quantity: FieldQuantity; part: FieldPart; periods: number; nx: number; nz: number; zIn: number; zOut: number },
): FieldMap {
  const { kx, modes, layerS: ls, Sref, Strn, k0 } = sol;
  const M = kx.length;
  const N = (M - 1) / 2;
  const nIn = layers.length - 2;
  const e0: Vec = [new Float64Array(M), new Float64Array(M)];
  e0[0][N] = 1;
  const r = sol.result.r;
  const t = sol.result.t;

  // S of the parts left and right of every interior layer
  const left: SMat[] = [Sref];
  for (let j = 0; j < nIn; j++) left.push(star(left[j], ls[j].S));
  const right: SMat[] = new Array(nIn + 1);
  right[nIn] = Strn;
  for (let j = nIn - 1; j >= 0; j--) right[j] = star(ls[j].S, right[j + 1]);
  const I = eye(M);
  const regions: Region[] = [];
  // reflection region (z < 0): u_m = δ_m0 e^{i kz z} + r_m e^{−i kz z}
  const md0 = modes[0];
  const V0d: Vec = [new Float64Array(M), new Float64Array(M)];
  for (let m = 0; m < M; m++) {
    V0d[0][m] = md0.V.re[m * M + m];
    V0d[1][m] = md0.V.im[m * M + m];
  }
  regions.push({
    d: 0,
    at: (z) => {
      const f = mulDiag(diagPhase(md0.kzRe, md0.kzIm, z), e0);
      const b = mulDiag(diagPhase(md0.kzRe, md0.kzIm, -z), r);
      return { u: addV(f, b), v: mulDiag(V0d, addV(f, b, -1)) };
    },
  });
  for (let j = 0; j < nIn; j++) {
    const L = ls[j];
    const md = modes[j + 1];
    // a⁺ at the left of layer j, b⁻ at its right
    const SL = left[j];
    const SR = right[j];
    const aP = mulVec(mul(inv(add(I, mul(SL.S22, SR.S11), -1)), SL.S21), e0[0], e0[1]);
    const Sr = right[j + 1];
    const bM = mulVec(mul(mul(inv(add(I, mul(Sr.S11, L.S.S22), -1)), Sr.S11), L.S.S21), aP[0], aP[1]);
    const MXPi = mul(mul(L.Mm, diagFromX(L.Xr, L.Xi)), L.Pinv);
    const cP = mulVec(L.Dinv, ...addV(scaleV(aP, 2), mulVec(MXPi, ...scaleV(bM, 2) as Vec), -1));
    const cM = mulVec(L.Dinv, ...addV(scaleV(bM, 2), mulVec(MXPi, ...scaleV(aP, 2) as Vec), -1));
    const d = layers[j + 1].d * k0;
    regions.push({
      d,
      at: (z) => {
        const f = mulDiag(diagPhase(md.kzRe, md.kzIm, z), cP);
        const b = mulDiag(diagPhase(md.kzRe, md.kzIm, d - z), cM);
        return { u: mulVec(md.W, ...addV(f, b)), v: mulVec(md.V, ...addV(f, b, -1)) };
      },
    });
  }
  // transmission region: u_m = t_m e^{i kz (z − z_end)}
  const mdT = modes[modes.length - 1];
  const VTd: Vec = [new Float64Array(M), new Float64Array(M)];
  for (let m = 0; m < M; m++) {
    VTd[0][m] = mdT.V.re[m * M + m];
    VTd[1][m] = mdT.V.im[m * M + m];
  }
  regions.push({
    d: Infinity,
    at: (z) => {
      const u = mulDiag(diagPhase(mdT.kzRe, mdT.kzIm, z), t);
      return { u, v: mulDiag(VTd, u) };
    },
  });

  // grid
  const total = layers.slice(1, -1).reduce((s, L) => s + L.d, 0);
  const xs = Array.from({ length: opts.nx }, (_, i) => (i / (opts.nx - 1)) * opts.periods * period);
  const zs = Array.from({ length: opts.nz }, (_, k) => -opts.zIn + (k / (opts.nz - 1)) * (opts.zIn + total + opts.zOut));
  const bounds: number[] = [0];
  for (const L of layers.slice(1, -1)) bounds.push(bounds[bounds.length - 1] + L.d);
  const phase = xs.map((x) => Array.from(kx, (k) => X.exp(X.c(0, k * k0 * x))));
  const eps0 = X.mul(X.c(layers[0].n!.re), X.c(layers[0].n!.re));
  const values = new Float64Array(opts.nx * opts.nz);
  const outlines: FieldMap['outlines'] = [];
  layers.slice(1, -1).forEach((L, j) => {
    if (L.segs) outlines.push({ z0: bounds[j], z1: bounds[j + 1], xs: L.segs.map((s) => s.from * period).filter((x) => x > 0) });
  });

  // per-layer helpers for the TM Ex / Ez and the ε(x) profile
  const aux = layers.map((L, idx) => {
    const md = modes[idx];
    if (!L.segs) {
      const eps = X.mul(L.n!, L.n!);
      return { eps: () => eps, Ainv: null as CMat | null, EinvKx: null as CMat | null, epsU: eps };
    }
    const epsAt = (x: number): C => {
      const f = ((x / period) % 1 + 1) % 1;
      const s = L.segs!.find((q) => f >= q.from && f < q.to) ?? L.segs![L.segs!.length - 1];
      return X.mul(s.n, s.n);
    };
    if (pol === 's' || !md.E || !md.A) return { eps: epsAt, Ainv: null, EinvKx: null, epsU: null };
    const Einv = inv(md.E);
    const Kx = eye(M);
    for (let m = 0; m < M; m++) Kx.re[m * M + m] = kx[m];
    return { eps: epsAt, Ainv: inv(md.A), EinvKx: mul(Einv, Kx), epsU: null };
  });

  const comp = (w: C, part: FieldPart) =>
    part === 'abs' ? Math.hypot(w.re, w.im) : part === 're' ? w.re : part === 'im' ? w.im : (Math.atan2(w.im, w.re) * 180) / Math.PI;
  const sumX = (h: Vec, ix: number): C => {
    let sr = 0;
    let si = 0;
    const ph = phase[ix];
    for (let m = 0; m < M; m++) {
      sr += h[0][m] * ph[m].re - h[1][m] * ph[m].im;
      si += h[0][m] * ph[m].im + h[1][m] * ph[m].re;
    }
    return X.c(sr, si);
  };

  zs.forEach((z, iz) => {
    // region and local depth (normalized)
    let reg = 0;
    let zl = z * k0;
    if (z >= 0) {
      let j = 0;
      while (j < nIn && z >= bounds[j + 1]) j++;
      reg = j < nIn ? j + 1 : nIn + 1;
      zl = (z - bounds[Math.min(j, nIn)]) * k0;
    }
    const { u, v } = regions[reg].at(zl);
    const lay = layers[reg === 0 ? 0 : reg === nIn + 1 ? layers.length - 1 : reg];
    const a = aux[reg === 0 ? 0 : reg === nIn + 1 ? layers.length - 1 : reg];
    // harmonics of the other components
    const kxV = (h: Vec): Vec => [h[0].map((val, m) => val * kx[m]), h[1].map((val, m) => val * kx[m])];
    let hz: Vec | null = null; // TE: Hz = Kx Ey
    let ez: Vec | null = null; // TM: Ez = −[[ε]]⁻¹ Kx Hy
    let dx: Vec | null = null; // TM: Dx harmonics (grating) for Ex = Dx / ε
    if (pol === 's') hz = kxV(u);
    else {
      if (a.EinvKx) {
        const e = mulVec(a.EinvKx, u[0], u[1]);
        ez = [e[0].map((val) => -val), e[1].map((val) => -val)];
        dx = mulVec(a.Ainv!, v[0], v[1]);
      } else {
        const k = kxV(u);
        const inv2 = X.div(X.c(-1), a.epsU!);
        ez = [k[0].map((val, m) => val * inv2.re - k[1][m] * inv2.im), k[0].map((val, m) => val * inv2.im + k[1][m] * inv2.re)];
      }
    }
    for (let ix = 0; ix < xs.length; ix++) {
      const U = sumX(u, ix);
      const Vv = dx ? X.div(sumX(dx, ix), a.eps(xs[ix])) : sumX(v, ix);
      let val: number;
      if (pol === 's') {
        // Ey = U, Hx = V, Hz
        const Hz = sumX(hz!, ix);
        if (opts.quantity === 'E2') val = X.abs2(U);
        else if (opts.quantity === 'H2') val = (X.abs2(Vv) + X.abs2(Hz)) / eps0.re;
        else if (opts.quantity === 'Ey') val = comp(U, opts.part);
        else if (opts.quantity === 'Hx') val = comp(Vv, opts.part);
        else if (opts.quantity === 'Hz') val = comp(Hz, opts.part);
        else val = 0;
      } else {
        // Hy = U, Ex = V, Ez
        const Ez = sumX(ez!, ix);
        if (opts.quantity === 'E2') val = (X.abs2(Vv) + X.abs2(Ez)) * eps0.re;
        else if (opts.quantity === 'H2') val = X.abs2(U);
        else if (opts.quantity === 'Hy') val = comp(U, opts.part);
        else if (opts.quantity === 'Ex') val = comp(Vv, opts.part);
        else if (opts.quantity === 'Ez') val = comp(Ez, opts.part);
        else val = 0;
      }
      values[iz * xs.length + ix] = val;
    }
    void lay;
  });
  return { xs, zs, values, boundaries: bounds, outlines };
}

function diagFromX(re: Float64Array, im: Float64Array): CMat {
  const n = re.length;
  const m = eye(n);
  for (let i = 0; i < n; i++) {
    m.re[i * n + i] = re[i];
    m.im[i * n + i] = im[i];
  }
  return m;
}
