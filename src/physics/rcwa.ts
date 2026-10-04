// Rigorous coupled-wave analysis (Fourier modal method) of 1D gratings (periodic in x, invariant in y), planar
// incidence, TE (Ey) or TM (Hy). Formulation: Moharam et al., JOSA A 12, 1068 (1995); Li's inverse rule for TM,
// JOSA A 13, 1870 (1996); scattering matrices with a zero-thickness gap medium (Rumpf) for stability.
// Conventions as in tmm.ts: ñ = n + ik, fields ∝ exp(i(kx x + kz z − ωt)); lengths normalized by k₀ = 2π/λ.
// Orders: kx_m = n₀ sin θ + m λ/Λ; the incident medium is taken lossless (Re ñ).
import type { C } from './complex.ts';
import * as X from './complex.ts';
import { add, cmat, diag, diagMulLeft, diagMulRight, eig, eye, inv, mul, mulVec, scale, solve, type CMat } from './cmat.ts';
import { nCos, type Polarization } from './tmm.ts';
import { asrFourier, asrGeometry, asrKnots, asrT, type AsrGeometry } from './asr.ts';
import { fffLayerS, fffMaxIndex, type FffPath, type FffProfile } from './rcwaFff.ts';

// x in units of the period, [0, 1); eps: a diagonal anisotropic segment (εxx, εyy, εzz) instead of n² (n is then √εxx,
// for display; validated against RETICOLO's diagonal anisotropy, planar and conical)
export type Segment = { from: number; to: number; n: C; eps?: [C, C, C] };
// The permittivity of a segment along x, y or z.
export const segEps = (s: Segment, axis: 0 | 1 | 2): C => (s.eps ? s.eps[axis] : X.mul(s.n, s.n));
// uniform (n), grating (segs) or homogeneous anisotropic (eps: 3×3 tensor, row-major; conical solver only); d in nm
// eps: an anisotropic tensor (Berreman); helix: the director turns by `twist` degrees about z from the top face (where the
// tensor is `eps`) to the bottom — solved exactly at normal incidence, else in `slices` uniform sublayers
// fff: a smooth-profile grating layer, integrated through its true profile (rcwaFff.ts) instead of a staircase;
// outline (drawing only, the field maps): its true outline, polylines [x0, t0, x1, t1, …] (x in periods, t: depth in the
// layer of thickness d nm, 0 = its top)
export type RcwaLayer = { d: number; n?: C; segs?: Segment[]; eps?: C[]; helix?: { twist: number; slices: number }; outline?: { d: number; lines: number[][] }; fff?: FffProfile };
export type Factorization = 'li' | 'laurent';

export type RcwaResult = {
  orders: number[];
  R: Float64Array; // diffraction efficiency of each order (reflected)
  T: Float64Array;
  Rtot: number;
  Ttot: number;
  r: [Float64Array, Float64Array]; // complex amplitudes of the reflected orders (u-field: Ey or Hy)
  t: [Float64Array, Float64Array];
};

// Fourier coefficients c_n = ∫₀¹ f(x) e^{−2πi n x} dx of a piecewise-constant function, n = −K … K.
export function fourier(segs: { from: number; to: number; v: C }[], K: number): [Float64Array, Float64Array] {
  const re = new Float64Array(2 * K + 1);
  const im = new Float64Array(2 * K + 1);
  for (let n = -K; n <= K; n++) {
    let sr = 0;
    let si = 0;
    for (const s of segs) {
      if (n === 0) {
        sr += s.v.re * (s.to - s.from);
        si += s.v.im * (s.to - s.from);
        continue;
      }
      // (e^{−2πi n b} − e^{−2πi n a}) / (−2πi n)
      const w = -2 * Math.PI * n;
      const dr = Math.cos(w * s.to) - Math.cos(w * s.from);
      const di = Math.sin(w * s.to) - Math.sin(w * s.from);
      // divide by (i w): (dr + i di)/(i w) = (di − i dr)/w
      const qr = di / w;
      const qi = -dr / w;
      sr += s.v.re * qr - s.v.im * qi;
      si += s.v.re * qi + s.v.im * qr;
    }
    re[n + K] = sr;
    im[n + K] = si;
  }
  return [re, im];
}

// Toeplitz matrix T_mn = c_{m−n} (m, n = 0 … M−1) from coefficients c_{−(M−1)} … c_{M−1}.
export function toeplitz(c: [Float64Array, Float64Array], M: number): CMat {
  const T = cmat(M);
  const K = M - 1;
  for (let m = 0; m < M; m++)
    for (let n = 0; n < M; n++) {
      T.re[m * M + n] = c[0][m - n + K];
      T.im[m * M + n] = c[1][m - n + K];
    }
  return T;
}

const sqrtBranch = (v: C): C => nCos(X.sqrt(v), X.c(0)); // √v with Im ≥ 0 (or Re > 0 when Im ≈ 0)

// Modes of a layer: W (u-field of each mode), V (v-field of each forward mode), kz.
// basis: W is not the identity (uniform media written in the ASR harmonics): no diagonal fast paths.
export type Modes = { W: CMat; V: CMat; kzRe: Float64Array; kzIm: Float64Array; uniform?: C; E?: CMat; A?: CMat; basis?: boolean };

// Adaptive spatial resolution of a solve (asr.ts): the mapping common to all the layers, the modes shared by every
// uniform medium (eigenvectors Wb of B, eigenvalues b: kz² = ε − b), the incident plane wave in u-harmonics and the
// projection P of u-harmonics onto the diffraction orders.
export type AsrCtx = { geo: AsrGeometry; Wb: CMat; bRe: Float64Array; bIm: Float64Array; inc: Vd; P: CMat };
const bCache = new Map<string, { Wb: CMat; bRe: Float64Array; bIm: Float64Array }>();
export function asrContext(layers: RcwaLayer[], kx: Float64Array, N: number, period: number, lam: number, eta: number, pol: Polarization): AsrCtx | undefined {
  if (!(eta > 0) || !N) return undefined;
  // anisotropic segments and smooth (FFF) layers are not written in the ASR harmonics: plain RCWA
  if (layers.some((L) => L.segs?.some((s) => s.eps) || L.fff)) return undefined;
  const segs = layers.slice(1, -1).flatMap((L) => (L.segs ? [L.segs] : []));
  if (!segs.length) return undefined;
  const pl = period / lam;
  const M = kx.length;
  // highest oscillation: (N + |pl·kx₀|)(1 + η) + N in the plane waves, 2N in the Fourier coefficients
  const geo = asrGeometry(asrKnots(segs), eta, Math.max(2 * N, (N + Math.abs(pl * kx[N])) * (1 + eta) + N) + 1);
  const key = `${pol}|${geo.key}|${Array.from(kx, (v) => v.toPrecision(15)).join(',')}`;
  let b = bCache.get(key);
  if (!b) {
    const zero = new Float64Array(M);
    const Ffi = inv(toeplitz(asrFourier(geo, M - 1, (f) => f), M));
    const inner = pol === 's' ? toeplitz(asrFourier(geo, M - 1, (f) => 1 / f), M) : Ffi;
    const B = mul(Ffi, diagMulRight(diagMulLeft(kx, zero, inner), kx, zero)); // TE [[f]]⁻¹Kx[[1/f]]Kx, TM [[f]]⁻¹Kx[[f]]⁻¹Kx
    const ev = eig(B);
    b = { Wb: ev.vec, bRe: ev.valRe, bIm: ev.valIm };
    if (bCache.size >= CACHE_MAX) bCache.delete(bCache.keys().next().value!);
    bCache.set(key, b);
  }
  const { T, Tf } = asrT(geo, kx, pl);
  const inc: Vd = [new Float64Array(M), new Float64Array(M)];
  for (let n = 0; n < M; n++) {
    inc[0][n] = T.re[n * M + N];
    inc[1][n] = T.im[n * M + N];
  }
  const P = cmat(M); // conjugate transpose of Tf
  for (let n = 0; n < M; n++)
    for (let m = 0; m < M; m++) {
      P.re[m * M + n] = Tf.re[n * M + m];
      P.im[m * M + n] = -Tf.im[n * M + m];
    }
  return { geo, ...b, inc, P };
}

const modeCache = new Map<string, Modes>();
const CACHE_MAX = 400;

export function layerModes(L: RcwaLayer, kx: Float64Array, pol: Polarization, fact: Factorization = 'li', asr?: AsrCtx): Modes {
  const M = kx.length;
  if (L.n) {
    const eps = X.mul(L.n, L.n);
    const kzRe = new Float64Array(M);
    const kzIm = new Float64Array(M);
    for (let m = 0; m < M; m++) {
      const q = nCos(L.n, X.c(kx[m]));
      kzRe[m] = q.re;
      kzIm[m] = q.im;
    }
    // V: TE −kz, TM kz/ε
    const W = eye(M);
    const vr = new Float64Array(M);
    const vi = new Float64Array(M);
    for (let m = 0; m < M; m++) {
      const q = X.c(kzRe[m], kzIm[m]);
      const v = pol === 's' ? X.mul(X.c(-1), q) : X.div(q, eps);
      vr[m] = v.re;
      vi[m] = v.im;
    }
    // with ASR: the modes of the truncated operator (kz² = ε − b, eigenvectors shared by every uniform medium)
    if (asr) {
      const qr = new Float64Array(M);
      const qi = new Float64Array(M);
      const ar = new Float64Array(M);
      const ai = new Float64Array(M);
      for (let j = 0; j < M; j++) {
        const q = sqrtBranch(X.sub(eps, X.c(asr.bRe[j], asr.bIm[j])));
        const v = pol === 's' ? X.mul(X.c(-1), q) : X.div(q, eps);
        [qr[j], qi[j], ar[j], ai[j]] = [q.re, q.im, v.re, v.im];
      }
      return { W: asr.Wb, V: diagMulRight(asr.Wb, ar, ai), kzRe: qr, kzIm: qi, uniform: L.n, basis: true };
    }
    return { W, V: diag(vr, vi), kzRe, kzIm, uniform: L.n };
  }
  // grating layer: the eigenmodes depend on the profile, the orders and the polarization, not on the thickness
  const key = `${pol}|${fact}|${asr ? `asr:${asr.geo.key}|` : ''}${Array.from(kx, (v) => v.toPrecision(15)).join(',')}|${L.segs!.map((s) => `${s.from},${s.to},${s.n.re},${s.n.im}${s.eps ? `,${s.eps.map((e) => `${e.re},${e.im}`).join(',')}` : ''}`).join(';')}`;
  const hit = modeCache.get(key);
  if (hit) return hit;
  // ε along x, y, z of every segment (equal for isotropic segments). TE: Ey sees εyy; TM: Ex (normal to the walls between
  // segments) εxx by the inverse rule, Ez (along the walls) εzz by Laurent's rule
  const epsAlong = (axis: 0 | 1 | 2) => L.segs!.map((s) => ({ from: s.from, to: s.to, v: segEps(s, axis) }));
  const segsEps = epsAlong(pol === 's' ? 1 : 0);
  const E = toeplitz(fourier(pol === 's' ? segsEps : epsAlong(2), M - 1), M);
  const Kx2 = diag(Array.from(kx, (v) => v * v));
  const zero = new Float64Array(M);
  const kxAkx = (A: CMat) => diagMulRight(diagMulLeft(kx, zero, A), kx, zero); // Kx A Kx
  let Om: CMat;
  let A: CMat | undefined;
  if (asr) {
    // ε on each interval of the mapping (the segment containing its middle); [[f]], [[1/f]], [[f ε]] in u
    const epsOf = (i: number): C => {
      const { a, b } = asr.geo.intervals[i];
      const mid = (((a + b) / 2) % 1 + 1) % 1;
      return (segsEps.find((s) => mid >= s.from && mid < s.to) ?? segsEps[segsEps.length - 1]).v;
    };
    const Ff = toeplitz(asrFourier(asr.geo, M - 1, (f) => f), M);
    const Ffe = toeplitz(asrFourier(asr.geo, M - 1, (f) => f, epsOf), M);
    const Ffi = inv(Ff);
    if (pol === 's') {
      const Fif = toeplitz(asrFourier(asr.geo, M - 1, (f) => 1 / f), M);
      Om = mul(Ffi, add(Ffe, kxAkx(Fif), -1)); // [[f]]⁻¹ ([[fε]] − Kx [[1/f]] Kx)
    } else {
      A = fact === 'li' ? toeplitz(fourier(segsEps.map((s) => ({ ...s, v: X.div(X.c(1), s.v) })), M - 1), M) : inv(E);
      // [[1/ε]]⁻¹ [[f]]⁻¹ ([[f]] − Kx [[fε]]⁻¹ Kx)
      Om = mul(fact === 'li' ? inv(A) : E, mul(Ffi, add(Ff, kxAkx(inv(Ffe)), -1)));
    }
  } else if (pol === 's') Om = add(E, Kx2, -1); // kz² = eig([[εyy]] − Kx²)
  else {
    // kz² = eig( [[1/εxx]]⁻¹ (I − Kx [[εzz]]⁻¹ Kx) ); Laurent rule: [[1/εxx]]⁻¹ → [[εxx]] (E is [[εzz]]: Ez in the fields)
    const Ei = inv(E);
    const inner = add(eye(M), diagMulRight(diagMulLeft(kx, new Float64Array(M), Ei), kx, new Float64Array(M)), -1);
    const Exx = L.segs!.some((s) => s.eps) ? toeplitz(fourier(segsEps, M - 1), M) : E;
    A = fact === 'li' ? toeplitz(fourier(segsEps.map((s) => ({ ...s, v: X.div(X.c(1), s.v) })), M - 1), M) : inv(Exx);
    Om = mul(fact === 'li' ? inv(A) : Exx, inner);
  }
  const ev = eig(Om);
  const kzRe = new Float64Array(M);
  const kzIm = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    const q = sqrtBranch(X.c(ev.valRe[m], ev.valIm[m]));
    kzRe[m] = q.re;
    kzIm[m] = q.im;
  }
  const W = ev.vec;
  const WQ = diagMulRight(W, kzRe, kzIm);
  const V = pol === 's' ? scale(WQ, -1) : mul(A!, WQ);
  const modes: Modes = { W, V, kzRe, kzIm, E, A };
  if (modeCache.size >= CACHE_MAX) modeCache.delete(modeCache.keys().next().value!);
  modeCache.set(key, modes);
  return modes;
}

// diag: every block is diagonal (uniform layers and the outer regions: the orders do not mix).
export type SMat = { S11: CMat; S12: CMat; S21: CMat; S22: CMat; diag?: boolean };

// false = dense algebra everywhere (the reference the fast paths are checked against).
export const RCWA_FAST = { on: true };

type Vd = [Float64Array, Float64Array];
const dg = (a: CMat): Vd => {
  const n = a.n;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = a.re[i * n + i];
    im[i] = a.im[i * n + i];
  }
  return [re, im];
};

// A ⋆ B of two diagonal S-matrices, order by order: f = 1/(1 − b₁₁a₂₂).
function starDD(A: SMat, B: SMat): SMat {
  const [a11, a12, a21, a22, b11, b12, b21, b22] = [A.S11, A.S12, A.S21, A.S22, B.S11, B.S12, B.S21, B.S22].map(dg);
  const n = a11[0].length;
  const out = [0, 1, 2, 3].map(() => [new Float64Array(n), new Float64Array(n)] as Vd);
  const at = (v: Vd, m: number) => X.c(v[0][m], v[1][m]);
  for (let m = 0; m < n; m++) {
    const f = X.div(X.c(1), X.sub(X.c(1), X.mul(at(b11, m), at(a22, m))));
    const vals = [
      X.add(at(a11, m), X.mul(X.mul(at(a12, m), f), X.mul(at(b11, m), at(a21, m)))),
      X.mul(X.mul(at(a12, m), f), at(b12, m)),
      X.mul(X.mul(at(b21, m), f), at(a21, m)),
      X.add(at(b22, m), X.mul(X.mul(at(b21, m), f), X.mul(at(a22, m), at(b12, m)))),
    ];
    vals.forEach((v, k) => {
      out[k][0][m] = v.re;
      out[k][1][m] = v.im;
    });
  }
  const [S11, S12, S21, S22] = out.map((v) => diag(v[0], v[1]));
  return { S11, S12, S21, S22, diag: true };
}

// A ⋆ B with B diagonal: products with B are row / column scalings.
function starFD(A: SMat, B: SMat): SMat {
  const n = A.S11.n;
  const I = eye(n);
  const [b11, b12, b21, b22] = [B.S11, B.S12, B.S21, B.S22].map(dg);
  const F = inv(add(I, diagMulLeft(b11[0], b11[1], A.S22), -1)); // (I − B11 A22)⁻¹
  const G = inv(add(I, diagMulRight(A.S22, b11[0], b11[1]), -1)); // (I − A22 B11)⁻¹
  const AF = mul(A.S12, F);
  const BG = diagMulLeft(b21[0], b21[1], G);
  return {
    S11: add(A.S11, mul(diagMulRight(AF, b11[0], b11[1]), A.S21)),
    S12: diagMulRight(AF, b12[0], b12[1]),
    S21: mul(BG, A.S21),
    S22: add(diag(b22[0], b22[1]), diagMulRight(mul(BG, A.S22), b12[0], b12[1])),
  };
}

// A ⋆ B with A diagonal.
function starDF(A: SMat, B: SMat): SMat {
  const n = A.S11.n;
  const I = eye(n);
  const [a11, a12, a21, a22] = [A.S11, A.S12, A.S21, A.S22].map(dg);
  const F = inv(add(I, diagMulRight(B.S11, a22[0], a22[1]), -1)); // (I − B11 A22)⁻¹
  const G = inv(add(I, diagMulLeft(a22[0], a22[1], B.S11), -1)); // (I − A22 B11)⁻¹
  const AF = diagMulLeft(a12[0], a12[1], F);
  const BG = mul(B.S21, G);
  return {
    S11: add(diag(a11[0], a11[1]), diagMulRight(mul(AF, B.S11), a21[0], a21[1])),
    S12: mul(AF, B.S12),
    S21: diagMulRight(BG, a21[0], a21[1]),
    S22: add(B.S22, mul(diagMulRight(BG, a22[0], a22[1]), B.S12)),
  };
}

// Redheffer star product A ⋆ B.
export function star(A: SMat, B: SMat): SMat {
  if (RCWA_FAST.on) {
    if (A.diag && B.diag) return starDD(A, B);
    if (B.diag) return starFD(A, B);
    if (A.diag) return starDF(A, B);
  }
  const n = A.S11.n;
  const I = eye(n);
  const F = inv(add(I, mul(B.S11, A.S22), -1)); // (I − B11 A22)⁻¹
  const G = inv(add(I, mul(A.S22, B.S11), -1)); // (I − A22 B11)⁻¹
  const AF = mul(A.S12, F);
  const BG = mul(B.S21, G);
  return {
    S11: add(A.S11, mul(mul(AF, B.S11), A.S21)),
    S12: mul(AF, B.S12),
    S21: mul(BG, A.S21),
    S22: add(B.S22, mul(mul(BG, A.S22), B.S12)),
  };
}

// Gap medium (zero thickness, kz = 1 for every order): W₀ = I, V₀ diagonal.
function gapVinv(kx: Float64Array, pol: Polarization): [Float64Array, Float64Array] {
  const M = kx.length;
  const r = new Float64Array(M);
  for (let m = 0; m < M; m++) r[m] = pol === 's' ? -1 : 1 + kx[m] * kx[m]; // V₀⁻¹: TE −1, TM ε_g/kz = 1 + kx²
  return [r, new Float64Array(M)];
}

// A smooth-profile (FFF) layer has no modes: placeholders here, its S-matrix from the integration (fff: true).
const fffModes = (M: number): Modes => ({ W: eye(M), V: eye(M), kzRe: new Float64Array(M), kzIm: new Float64Array(M) });
function fffPart(L: RcwaLayer, k0d: number, kx: Float64Array, pol: Polarization, vinv: [Float64Array, Float64Array]): LayerPart {
  const I = eye(kx.length);
  const z = new Float64Array(kx.length);
  const { S, path } = fffLayerS(L.fff!, k0d, kx, pol, vinv, fffMaxIndex(L.fff!), star);
  return { S, P: I, Mm: I, Xr: z, Xi: z, Dinv: I, Pinv: I, fff: path };
}
// fff: the integration of a smooth-profile layer (its slices and their S-matrices, for the fields)
export type LayerPart = ReturnType<typeof layerS> & { fff?: FffPath };

// S-matrix of a layer between two gap media. P = W + V₀⁻¹V, M = W − V₀⁻¹V, X = exp(i kz k₀ d).
function layerS(md: Modes, k0d: number, vinv: [Float64Array, Float64Array]): { S: SMat; P: CMat; Mm: CMat; Xr: Float64Array; Xi: Float64Array; Dinv: CMat; Pinv: CMat } {
  const n = md.W.n;
  const Xr = new Float64Array(n);
  const Xi = new Float64Array(n);
  for (let m = 0; m < n; m++) {
    const e = X.exp(X.mul(X.c(0, 1), X.c(md.kzRe[m] * k0d, md.kzIm[m] * k0d)));
    Xr[m] = e.re;
    Xi[m] = e.im;
  }
  if (md.uniform && !md.basis && RCWA_FAST.on) {
    // uniform layer: W = I, V diagonal → every matrix is diagonal, computed order by order
    const v = dg(md.V);
    const cols = Array.from({ length: 6 }, () => [new Float64Array(n), new Float64Array(n)] as Vd);
    for (let m = 0; m < n; m++) {
      const q = X.mul(X.c(vinv[0][m], vinv[1][m]), X.c(v[0][m], v[1][m]));
      const P = X.add(X.c(1), q);
      const Mm = X.sub(X.c(1), q);
      const Xm = X.c(Xr[m], Xi[m]);
      const Pinv = X.div(X.c(1), P);
      const MXPi = X.mul(X.mul(Mm, Xm), Pinv);
      const Dinv = X.div(X.c(1), X.sub(P, X.mul(X.mul(MXPi, Mm), Xm)));
      const PX = X.mul(P, Xm);
      const S11 = X.sub(X.mul(Mm, Dinv), X.mul(X.mul(PX, Dinv), MXPi));
      const S12 = X.sub(X.mul(PX, Dinv), X.mul(X.mul(Mm, Dinv), MXPi));
      [P, Mm, Pinv, Dinv, S11, S12].forEach((z, k) => {
        cols[k][0][m] = z.re;
        cols[k][1][m] = z.im;
      });
    }
    const [P, Mm, Pinv, Dinv, S11, S12] = cols.map((c) => diag(c[0], c[1]));
    return { S: { S11, S12, S21: S12, S22: S11, diag: true }, P, Mm, Xr, Xi, Dinv, Pinv };
  }
  const V0iV = diagMulLeft(vinv[0], vinv[1], md.V);
  const P = add(md.W, V0iV);
  const Mm = add(md.W, V0iV, -1);
  const Pinv = inv(P);
  const MX = diagMulRight(Mm, Xr, Xi);
  const MXPi = mul(MX, Pinv); // M X P⁻¹
  const D = add(P, diagMulRight(mul(MXPi, Mm), Xr, Xi), -1); // P − M X P⁻¹ M X
  const Dinv = inv(D);
  const PX = diagMulRight(P, Xr, Xi);
  const S11 = add(mul(Mm, Dinv), mul(mul(PX, Dinv), MXPi), -1);
  const S12 = add(mul(PX, Dinv), mul(mul(Mm, Dinv), MXPi), -1);
  return { S: { S11, S12, S21: S12, S22: S11 }, P, Mm, Xr, Xi, Dinv, Pinv };
}

// S-matrices of the semi-infinite regions (uniform media) against the gap.
function regionS(md: Modes, vinv: [Float64Array, Float64Array], side: 'ref' | 'trn'): SMat {
  if (RCWA_FAST.on && !md.basis) {
    // uniform region: diagonal, order by order
    const n = md.W.n;
    const v = dg(md.V);
    const cols = Array.from({ length: 4 }, () => [new Float64Array(n), new Float64Array(n)] as Vd);
    for (let m = 0; m < n; m++) {
      const q = X.mul(X.c(vinv[0][m], vinv[1][m]), X.c(v[0][m], v[1][m]));
      const P = X.add(X.c(1), q);
      const Mm = X.sub(X.c(1), q);
      const Pinv = X.div(X.c(1), P);
      const half = X.mul(X.c(0.5), X.sub(P, X.mul(X.mul(Mm, Pinv), Mm)));
      const vals =
        side === 'ref'
          ? [X.mul(X.c(-1), X.mul(Pinv, Mm)), X.mul(X.c(2), Pinv), half, X.mul(Mm, Pinv)]
          : [X.mul(Mm, Pinv), half, X.mul(X.c(2), Pinv), X.mul(X.c(-1), X.mul(Pinv, Mm))];
      vals.forEach((z, k) => {
        cols[k][0][m] = z.re;
        cols[k][1][m] = z.im;
      });
    }
    const [S11, S12, S21, S22] = cols.map((c) => diag(c[0], c[1]));
    return { S11, S12, S21, S22, diag: true };
  }
  const V0iV = diagMulLeft(vinv[0], vinv[1], md.V);
  const P = add(md.W, V0iV);
  const Mm = add(md.W, V0iV, -1);
  const Pinv = inv(P);
  const half = scale(add(P, mul(mul(Mm, Pinv), Mm), -1), 0.5);
  if (side === 'ref') return { S11: scale(mul(Pinv, Mm), -1), S12: scale(Pinv, 2), S21: half, S22: mul(Mm, Pinv) };
  return { S11: mul(Mm, Pinv), S12: half, S21: scale(Pinv, 2), S22: scale(mul(Pinv, Mm), -1) };
}

export const ordersOf = (N: number) => Array.from({ length: 2 * N + 1 }, (_, i) => i - N);

export function waveVectors(n0: number, thetaDeg: number, lam: number, period: number, N: number): Float64Array {
  const kx0 = n0 * Math.sin((thetaDeg * Math.PI) / 180);
  return Float64Array.from(ordersOf(N), (m) => kx0 + (m * lam) / period);
}

// The internal state needed for the fields: modes and S-matrices of every layer.
export type Solved = {
  kx: Float64Array;
  modes: Modes[];
  layerS: LayerPart[];
  Sref: SMat;
  Strn: SMat;
  vinv: [Float64Array, Float64Array];
  k0: number;
  result: RcwaResult;
};

// layers: incident medium, layers, exit medium (both media uniform).
// eta > 0: adaptive spatial resolution (asr.ts) with that strength.
export function rcwaSolve(layers: RcwaLayer[], period: number, lam: number, thetaDeg: number, pol: Polarization, N: number, fact: Factorization = 'li', eta = 0): Solved {
  const n0 = layers[0].n!;
  const inc = X.c(n0.re);
  const k0 = (2 * Math.PI) / lam;
  const kx = waveVectors(inc.re, thetaDeg, lam, period, N);
  const M = kx.length;
  const vinv = gapVinv(kx, pol);
  const asr = asrContext(layers, kx, N, period, lam, eta, pol);
  const modes = layers.map((L, i) => (L.fff ? fffModes(M) : layerModes(i === 0 ? { ...L, n: inc } : L, kx, pol, fact, asr)));
  const Sref = regionS(modes[0], vinv, 'ref');
  const Strn = regionS(modes[modes.length - 1], vinv, 'trn');
  const ls = layers.slice(1, -1).map((L, i) => (L.fff ? fffPart(L, k0 * L.d, kx, pol, vinv) : layerS(modes[i + 1], k0 * L.d, vinv)));
  // incident order m = 0, unit u-field amplitude
  let e0r: Float64Array = new Float64Array(M);
  let e0i: Float64Array = new Float64Array(M);
  e0r[N] = 1;
  // ASR: the incident plane wave (order 0, unit amplitude) in the modes of the incident medium
  if (asr) [e0r, e0i] = solve(modes[0].W, asr.inc[0], asr.inc[1]);
  let r: Vd;
  let t: Vd;
  if (RCWA_FAST.on) {
    const seq = foldDiagonal([Sref, ...ls.map((l) => l.S), Strn]);
    let S = seq[0];
    for (let i = 1; i < seq.length - 1; i++) S = star(S, seq[i]);
    [r, t] = seq.length > 1 ? starApply(S, seq[seq.length - 1], [e0r, e0i]) : [mulVec(S.S11, e0r, e0i), mulVec(S.S21, e0r, e0i)];
  } else {
    let S = Sref;
    for (const l of ls) S = star(S, l.S);
    S = star(S, Strn);
    r = mulVec(S.S11, e0r, e0i);
    t = mulVec(S.S21, e0r, e0i);
  }
  // ASR: from the modes of the outer media to the diffraction orders (u-harmonics, then the projection P)
  if (asr) {
    r = mulVec(asr.P, ...mulVec(modes[0].W, r[0], r[1]));
    t = mulVec(asr.P, ...mulVec(modes[modes.length - 1].W, t[0], t[1]));
  }
  // power flux of order m (plane wave kz of the order in the medium)
  const flux = (n: C, m: number) => {
    const q = nCos(n, X.c(kx[m]));
    return pol === 's' ? q.re : X.div(q, X.mul(n, n)).re;
  };
  const exitN = layers[layers.length - 1].n!;
  const f0 = flux(inc, N);
  const R = new Float64Array(M);
  const T = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    R[m] = ((r[0][m] ** 2 + r[1][m] ** 2) * flux(inc, m)) / f0;
    T[m] = ((t[0][m] ** 2 + t[1][m] ** 2) * Math.max(0, flux(exitN, m))) / f0;
  }
  const result: RcwaResult = { orders: ordersOf(N), R, T, Rtot: R.reduce((a, b) => a + b, 0), Ttot: T.reduce((a, b) => a + b, 0), r, t };
  return { kx, modes, layerS: ls, Sref, Strn, vinv, k0, result };
}

// Full S-matrix of a structure (every order in and out) for the in-plane wave vectors kx (normalized by k₀); the first
// medium is taken lossless (Re ñ) as in rcwaSolve. Used for the incoherent thick substrate.
export function rcwaSMatrix(layers: RcwaLayer[], kx: Float64Array, lam: number, pol: Polarization, fact: Factorization = 'li', asr?: AsrCtx) {
  const inc = X.c(layers[0].n!.re);
  const k0 = (2 * Math.PI) / lam;
  const vinv = gapVinv(kx, pol);
  const modes = layers.map((L, i) => (L.fff ? fffModes(kx.length) : layerModes(i === 0 ? { ...L, n: inc } : L, kx, pol, fact, asr)));
  const all = [regionS(modes[0], vinv, 'ref'), ...layers.slice(1, -1).map((L, i) => (L.fff ? fffPart(L, k0 * L.d, kx, pol, vinv) : layerS(modes[i + 1], k0 * L.d, vinv)).S), regionS(modes[modes.length - 1], vinv, 'trn')];
  const seq = RCWA_FAST.on ? foldDiagonal(all) : all;
  let S = seq[0];
  for (let i = 1; i < seq.length; i++) S = star(S, seq[i]);
  return { S, first: modes[0], last: modes[modes.length - 1] };
}

// Power flux along z per |u|² of order m in a uniform region (TE: Re kz, TM: Re kz/ε), 0 when evanescent.
export function orderFlux(md: Modes, pol: Polarization, m: number): number {
  const q = X.c(md.kzRe[m], md.kzIm[m]);
  const eps = X.mul(md.uniform!, md.uniform!);
  return Math.max(0, pol === 's' ? q.re : X.div(q, eps).re);
}

// Consecutive diagonal S-matrices (uniform layers, regions) combined first, order by order (⋆ is associative).
function foldDiagonal(seq: SMat[]): SMat[] {
  const out: SMat[] = [];
  for (const s of seq) {
    const last = out[out.length - 1];
    if (last?.diag && s.diag) out[out.length - 1] = starDD(last, s);
    else out.push(s);
  }
  return out;
}

// (A ⋆ B)₁₁ e and (A ⋆ B)₂₁ e without forming A ⋆ B: two linear solves instead of the inverses and products.
function starApply(A: SMat, B: SMat, e: Vd): [Vd, Vd] {
  const n = A.S11.n;
  const I = eye(n);
  const b11 = B.diag ? dg(B.S11) : null;
  const y = mulVec(A.S21, e[0], e[1]);
  const K1 = add(I, b11 ? diagMulLeft(b11[0], b11[1], A.S22) : mul(B.S11, A.S22), -1); // I − B11 A22
  const z = solve(K1, ...mulVec(B.S11, y[0], y[1]));
  const a = mulVec(A.S11, e[0], e[1]);
  const b = mulVec(A.S12, z[0], z[1]);
  const K2 = add(I, b11 ? diagMulRight(A.S22, b11[0], b11[1]) : mul(A.S22, B.S11), -1); // I − A22 B11
  const w = solve(K2, y[0], y[1]);
  return [[a[0].map((v, i) => v + b[0][i]), a[1].map((v, i) => v + b[1][i])], mulVec(B.S21, w[0], w[1])];
}

export const rcwaPoint = (layers: RcwaLayer[], period: number, lam: number, thetaDeg: number, pol: Polarization, N: number, fact: Factorization = 'li', eta = 0) =>
  rcwaSolve(layers, period, lam, thetaDeg, pol, N, fact, eta).result;
