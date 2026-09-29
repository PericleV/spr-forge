// Grating structure on a thick incoherent substrate (RCWA). The front (incident medium … substrate) and the back
// (substrate … out medium) are coherent and computed by RCWA with the same orders kx_m; inside the substrate the
// orders add in power. With power-coupling matrices over the orders (|S|² × flux ratios):
//   x = (I − Ru·D·Rb·D)⁻¹ Td e₀    power going down just below the front (all passes)
//   R = Rt e₀ + Tu·D·Rb·D x         power leaving through the front, per order
//   T = Tb·D x                      power leaving through the back, per order
// Rt / Td: front seen from the incident side, Ru / Tu: front seen from the substrate, Rb / Tb: back seen from the
// substrate, D = diag(a_m), a_m = exp(−2 k₀ Im(ñ_s cos θ_m) d) the single-pass attenuation of order m (0 for orders
// evanescent in the substrate). As in the TMM thick substrate (run.ts), the interfaces use Re(ñ_s). With no grating
// (one order) this is exactly the TMM incoherent formula. Phases are not defined.
import { c, type C } from './complex.ts';
import * as X from './complex.ts';
import { cmat, mul, solve, type CMat } from './cmat.ts';
import { conicalSMatrix, type IncidentPol } from './rcwaConical.ts';
import { orderFlux, rcwaSMatrix, waveVectors, type Factorization, type RcwaLayer } from './rcwa.ts';
import { nCos, type Polarization } from './tmm.ts';

export type ThickResult = { R: Float64Array; T: Float64Array; Rtot: number; Ttot: number };

// Power coupling from order k (flux fFrom) to order m (flux fTo): |S_mk|² fTo_m / fFrom_k.
function power(S: CMat, fTo: number[], fFrom: number[]): number[][] {
  const n = S.n;
  return Array.from({ length: n }, (_, m) =>
    Array.from({ length: n }, (_, k) => (fTo[m] > 0 && fFrom[k] > 0 ? ((S.re[m * n + k] ** 2 + S.im[m * n + k] ** 2) * fTo[m]) / fFrom[k] : 0)),
  );
}

const matVec = (A: number[][], x: number[]) => A.map((row) => row.reduce((s, v, k) => s + v * x[k], 0));

// front: incident medium, front layers, substrate (its ñ gives the absorption); back: substrate, back layers, out.
export function rcwaThickPoint(
  front: RcwaLayer[],
  back: RcwaLayer[],
  dSub: number,
  period: number,
  lam: number,
  thetaDeg: number,
  pol: Polarization,
  N: number,
  fact: Factorization = 'li',
): ThickResult {
  const nS = front[front.length - 1].n!;
  const sub: RcwaLayer = { n: c(nS.re), d: 0 };
  const kx = waveVectors(front[0].n!.re, thetaDeg, lam, period, N);
  const M = kx.length;
  const F = rcwaSMatrix([...front.slice(0, -1), sub], kx, lam, pol, fact);
  const B = rcwaSMatrix([sub, ...back.slice(1)], kx, lam, pol, fact);
  const flux = (md: typeof F.first) => Array.from({ length: M }, (_, m) => orderFlux(md, pol, m));
  const [fi, fs, fo] = [flux(F.first), flux(F.last), flux(B.last)];
  const Rt = power(F.S.S11, fi, fi);
  const Td = power(F.S.S21, fs, fi);
  const Ru = power(F.S.S22, fs, fs);
  const Tu = power(F.S.S12, fi, fs);
  const Rb = power(B.S.S11, fs, fs);
  const Tb = power(B.S.S21, fo, fs);
  const k0 = (2 * Math.PI) / lam;
  const a = Array.from({ length: M }, (_, m) => (fs[m] > 0 ? Math.exp(-2 * k0 * nCos(nS, c(kx[m])).im * dSub) : 0));
  // K = I − Ru D Rb D
  const DRbD = Rb.map((row, m) => row.map((v, k) => a[m] * v * a[k]));
  const K = cmat(M);
  for (let m = 0; m < M; m++)
    for (let k = 0; k < M; k++) {
      let s = 0;
      for (let j = 0; j < M; j++) s += Ru[m][j] * DRbD[j][k];
      K.re[m * M + k] = (m === k ? 1 : 0) - s;
    }
  const d0 = Td.map((row) => row[N]);
  const x = Array.from(solve(K, d0, new Float64Array(M))[0]);
  const y = matVec(DRbD, x);
  const up = matVec(Tu, y);
  const R = Float64Array.from(Rt, (row, m) => row[N] + up[m]);
  const T = Float64Array.from(matVec(Tb, x.map((v, m) => a[m] * v)));
  return { R, T, Rtot: R.reduce((s, v) => s + v, 0), Ttot: T.reduce((s, v) => s + v, 0) };
}

// ---- Conical incidence (φ ≠ 0) on a thick substrate: the channels are (order, polarization) ----
// The front and back S-matrices (conicalSMatrix, tangential-E basis) are turned into TE / TM amplitudes per order
// (a = E·s, b = E·k̂t; the matrix T_m = [[−ŝx…]] is its own inverse), and into power couplings with the exact fluxes
// Re kz (TE) and Re(ε/kz) (TM) of each channel. Inside the substrate the two polarizations of an order share the
// attenuation a_m. Then the formula above over 2(2N+1) channels.
export type ThickConicalResult = ThickResult & { RTE: Float64Array; RTM: Float64Array; TTE: Float64Array; TTM: Float64Array };

export function rcwaThickConical(
  front: RcwaLayer[],
  back: RcwaLayer[],
  dSub: number,
  period: number,
  lam: number,
  thetaDeg: number,
  phiDeg: number,
  pol: IncidentPol,
  N: number,
  fact: Factorization = 'li',
): ThickConicalResult {
  if ([front[0], front[front.length - 1], back[back.length - 1]].some((L) => L.eps)) throw new Error('thick substrate: the media and the substrate must be isotropic');
  const nS = front[front.length - 1].n!;
  const sub: RcwaLayer = { n: c(nS.re), d: 0 };
  const n0 = front[0].n!.re;
  const ph = (phiDeg * Math.PI) / 180;
  const kt0 = n0 * Math.sin((thetaDeg * Math.PI) / 180);
  const kx = Float64Array.from({ length: 2 * N + 1 }, (_, i) => kt0 * Math.cos(ph) + ((i - N) * lam) / period);
  const ky = kt0 * Math.sin(ph);
  const M = kx.length;
  const F = conicalSMatrix([...front.slice(0, -1), sub], kx, ky, lam, fact);
  const B = conicalSMatrix([sub, ...back.slice(1)], kx, ky, lam, fact);
  // per order: ŝ = (−ûy, ûx), û = k̂t (the incident plane when kt = 0); channel k < M: TE of order k, k ≥ M: TM
  const u = Array.from(kx, (k) => {
    const kt = Math.hypot(k, ky);
    return kt > 1e-12 ? [k / kt, ky / kt] : [Math.cos(ph), Math.sin(ph)];
  });
  // amplitudes of the channels from tangential E: TE a = −ûy Ex + ûx Ey, TM b = ûx Ex + ûy Ey (T² = I)
  const toCh = (S: CMat): CMat => {
    const n = 2 * M;
    const Tm = cmat(n);
    for (let m = 0; m < M; m++) {
      const [ux, uy] = u[m];
      Tm.re[m * n + m] = -uy;
      Tm.re[m * n + M + m] = ux;
      Tm.re[(M + m) * n + m] = ux;
      Tm.re[(M + m) * n + M + m] = uy;
    }
    return mul(mul(Tm, S), Tm);
  };
  // flux of each channel per |amplitude|² in a medium: TE Re kz, TM Re(ε/kz); 0 when the order is evanescent there
  const flux = (n: C) => {
    const eps = X.mul(n, n);
    const kz = Array.from(kx, (k) => nCos(n, c(Math.hypot(k, ky))));
    const open = kz.map((q) => q.re > 1e-12);
    return [...kz.map((q, m) => (open[m] ? q.re : 0)), ...kz.map((q, m) => (open[m] ? Math.max(0, X.div(eps, q).re) : 0))];
  };
  const [fi, fs, fo] = [flux(c(n0)), flux(c(nS.re)), flux(back[back.length - 1].n!)];
  const [F11, F21, F22, F12, B11, B21] = [F.S11, F.S21, F.S22, F.S12, B.S11, B.S21].map(toCh);
  const Ru = power(F22, fs, fs);
  const Tu = power(F12, fi, fs);
  const Rb = power(B11, fs, fs);
  const Tb = power(B21, fo, fs);
  const k0 = (2 * Math.PI) / lam;
  const am = Array.from(kx, (k) => Math.exp(-2 * k0 * nCos(nS, c(Math.hypot(k, ky))).im * dSub));
  const a = Array.from({ length: 2 * M }, (_, i) => (fs[i] > 0 ? am[i % M] : 0));
  const n2 = 2 * M;
  const DRbD = Rb.map((row, m) => row.map((v, k) => a[m] * v * a[k]));
  const K = cmat(n2);
  for (let m = 0; m < n2; m++)
    for (let k = 0; k < n2; k++) {
      let s = 0;
      for (let j = 0; j < n2; j++) s += Ru[m][j] * DRbD[j][k];
      K.re[m * n2 + k] = (m === k ? 1 : 0) - s;
    }
  // the incident state in the channels (amplitudes per unit power): one channel for TE / TM, both for a Jones state —
  // coherent through the front (the powers of F·j), incoherent in the substrate
  const jv: C[] = new Array(n2).fill(c(0));
  if (pol === 's') jv[N] = c(1 / Math.sqrt(fi[N]));
  else if (pol === 'p') jv[M + N] = c(1 / Math.sqrt(fi[M + N]));
  else {
    const r = Math.PI / 180;
    jv[N] = X.mul(X.exp(c(0, pol.delta * r)), c(Math.sin(pol.psi * r) / Math.sqrt(fi[N])));
    jv[M + N] = c(Math.cos(pol.psi * r) / Math.sqrt(fi[M + N]));
  }
  const powerOf = (S: CMat, f: number[]) =>
    Array.from({ length: n2 }, (_, m) => {
      let re = 0;
      let im = 0;
      for (let k = 0; k < n2; k++) {
        re += S.re[m * n2 + k] * jv[k].re - S.im[m * n2 + k] * jv[k].im;
        im += S.re[m * n2 + k] * jv[k].im + S.im[m * n2 + k] * jv[k].re;
      }
      return (re * re + im * im) * f[m];
    });
  const d0 = powerOf(F21, fs);
  const x = Array.from(solve(K, d0, new Float64Array(n2))[0]);
  const up = matVec(Tu, matVec(DRbD, x));
  const r0 = powerOf(F11, fi);
  const Rch = r0.map((v, m) => v + up[m]);
  const Tch = matVec(Tb, x.map((v, m) => a[m] * v));
  const RTE = Float64Array.from(Rch.slice(0, M));
  const RTM = Float64Array.from(Rch.slice(M));
  const TTE = Float64Array.from(Tch.slice(0, M));
  const TTM = Float64Array.from(Tch.slice(M));
  const R = RTE.map((v, m) => v + RTM[m]);
  const T = TTE.map((v, m) => v + TTM[m]);
  return { R, T, RTE, RTM, TTE, TTM, Rtot: R.reduce((s, v) => s + v, 0), Ttot: T.reduce((s, v) => s + v, 0) };
}
