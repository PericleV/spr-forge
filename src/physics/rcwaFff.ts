// Smooth-profile grating layers by the differential method with fast Fourier factorization (FFF): the profile is not cut
// into a staircase; the field equations are integrated in z through ε(x, z) with the normal-vector factorization
//   D = Q E,  Q = [[ε]] + ([[1/ε]]⁻¹ − [[ε]]) [[N Nᵀ]]   (tangential E: Laurent's rule, normal D: the inverse rule)
// 1D (N = (Nx, 0, Nz), z-independent for a single-valued profile): Qxx = [[ε]][[Nz²]] + [[1/ε]]⁻¹[[Nx²]],
// Qzz = [[ε]][[Nx²]] + [[1/ε]]⁻¹[[Nz²]], Qxz = Qzx = ([[1/ε]]⁻¹ − [[ε]])[[NxNz]] (vertical walls, N = x̂: Li's rules).
// E. Popov and M. Nevière, JOSA A 17, 1773 (2000); E. Popov (ed.), Gratings: Theory and Numeric Applications, 2nd ed.
// (Institut Fresnel, 2014), ch. 7, eqs. (7.20), (7.41), (7.44); integration as there: S-matrix propagation over a few
// slices (stability), the implicit single-step scheme (7.135) F(j+1) = [I − h/2 A(j+1)]⁻¹ [I + h/2 A(j)] F(j) in each.
// Conventions as rcwa.ts: lengths normalized by k₀, fields ∝ exp(i(kx x + kz z)), z down into the structure, h = η₀H;
// the tangential state F = [u; v]: TM [Hy; Ex], TE [Ey; Hx] (the u- and v-fields of rcwa.ts).
import * as X from './complex.ts';
import { add, cmat, diagMulLeft, diagMulRight, eye, inv, mul, mulVec, solve, solveMat, type CMat } from './cmat.ts';
import { fourier, toeplitz, type Segment, type SMat } from './rcwa.ts';
import type { Polarization } from './tmm.ts';

// The normal of the profile over the period, piecewise constant (x in periods; any sign: only products count).
export type NormalSeg = { from: number; to: number; nx: number; nz: number };
// A smooth-profile layer: the materials across the period at depth t (0 = top, 1 = bottom) and the normal field.
// steps: integration points through the layer (absent: automatic); key: identifies the profile (caches)
export type FffProfile = { segsAt: (t: number) => Segment[]; normals: NormalSeg[]; steps?: number; key: string };

// Toeplitz matrices of Nx², Nz², NxNz (the profile's, once per layer and number of orders).
const nnCache = new Map<string, { xx: CMat; zz: CMat; xz: CMat }>();
function normalMatrices(p: FffProfile, M: number) {
  const key = `${p.key}|${M}`;
  const hit = nnCache.get(key);
  if (hit) return hit;
  const T = (f: (s: NormalSeg) => number) => {
    const segs = p.normals.map((s) => {
      const n2 = s.nx * s.nx + s.nz * s.nz || 1;
      return { from: s.from, to: s.to, v: X.c(f(s) / n2) };
    });
    return toeplitz(fourier(segs, M - 1), M);
  };
  const out = { xx: T((s) => s.nx * s.nx), zz: T((s) => s.nz * s.nz), xz: T((s) => s.nx * s.nz) };
  if (nnCache.size > 50) nnCache.delete(nnCache.keys().next().value!);
  nnCache.set(key, out);
  return out;
}

// A 2M × 2M matrix from four M × M blocks.
function blocks(a11: CMat, a12: CMat, a21: CMat, a22: CMat): CMat {
  const M = a11.n;
  const out = cmat(2 * M);
  const put = (b: CMat, r0: number, c0: number) => {
    for (let i = 0; i < M; i++) {
      const o = (r0 + i) * 2 * M + c0;
      out.re.set(b.re.subarray(i * M, (i + 1) * M), o);
      out.im.set(b.im.subarray(i * M, (i + 1) * M), o);
    }
  };
  put(a11, 0, 0);
  put(a12, 0, M);
  put(a21, M, 0);
  put(a22, M, M);
  return out;
}
function block(a: CMat, r: 0 | 1, c: 0 | 1): CMat {
  const M = a.n / 2;
  const out = cmat(M);
  for (let i = 0; i < M; i++) {
    const o = (r * M + i) * 2 * M + c * M;
    out.re.set(a.re.subarray(o, o + M), i * M);
    out.im.set(a.im.subarray(o, o + M), i * M);
  }
  return out;
}

// [[ε]] at depth t, and for TM the factorized Qxx, Qxz (= Qzx) and Qzz⁻¹.
function fffQ(p: FffProfile, t: number, M: number, pol: Polarization) {
  const segs = p.segsAt(t);
  const E = toeplitz(fourier(segs.map((s) => ({ from: s.from, to: s.to, v: X.mul(s.n, s.n) })), M - 1), M);
  if (pol === 's') return { E };
  const nn = normalMatrices(p, M);
  const Ainv = inv(toeplitz(fourier(segs.map((s) => ({ from: s.from, to: s.to, v: X.div(X.c(1), X.mul(s.n, s.n)) })), M - 1), M)); // [[1/ε]]⁻¹
  const Qxx = add(mul(E, nn.zz), mul(Ainv, nn.xx));
  const Qzz = add(mul(E, nn.xx), mul(Ainv, nn.zz));
  const Qxz = mul(add(Ainv, E, -1), nn.xz);
  return { E, Qxx, Qxz, Zi: inv(Qzz), Ainv, nn, segs };
}

// The parts of A(z) that do not depend on kx (the angle of incidence): TE [[ε]]; TM Qzz⁻¹, Qxz Qzz⁻¹, Qzz⁻¹ Qzx and
// Qxx − Qxz Qzz⁻¹ Qzx. Kept per profile object (one per wavelength and structure) and depth, for the next angles of the
// same structure; at most CACHE_BYTES in all (oldest entries dropped first).
type Parts = { E?: CMat; Zi?: CMat; QZ?: CMat; ZQ?: CMat; a12?: CMat };
const CACHE_BYTES = 192 * 2 ** 20;
const partsCache = new Map<string, Parts>();
let cacheBytes = 0;
const profileIds = new WeakMap<FffProfile, number>();
let nextProfileId = 1;
function partsAt(p: FffProfile, t: number, M: number, pol: Polarization): Parts {
  let id = profileIds.get(p);
  if (id === undefined) profileIds.set(p, (id = nextProfileId++));
  const key = `${id}|${t}|${M}|${pol}`;
  const hit = partsCache.get(key);
  if (hit) return hit;
  const q = fffQ(p, t, M, pol);
  let parts: Parts;
  if (pol === 's') parts = { E: q.E };
  else {
    const { Qxx, Qxz, Zi } = q as Required<typeof q>;
    const ZQ = mul(Zi, Qxz); // Qzz⁻¹ Qzx (Qzx = Qxz)
    parts = { Zi, QZ: mul(Qxz, Zi), ZQ, a12: add(Qxx, mul(Qxz, ZQ), -1) };
  }
  const bytes = Object.values(parts).length * M * M * 16;
  if (bytes <= CACHE_BYTES) {
    while (cacheBytes + bytes > CACHE_BYTES && partsCache.size) {
      const [k0, v0] = partsCache.entries().next().value!;
      cacheBytes -= Object.values(v0).length * M * M * 16;
      partsCache.delete(k0);
    }
    partsCache.set(key, parts);
    cacheBytes += bytes;
  }
  return parts;
}

// The system matrix A(z) of dF/dz = A F (normalized z) at depth t.
// TM: F = [Hy; Ex],  Hy′ = i[−Qxz Qzz⁻¹ Kx Hy + (Qxx − Qxz Qzz⁻¹ Qzx) Ex],  Ex′ = i[(I − Kx Qzz⁻¹ Kx) Hy − Kx Qzz⁻¹ Qzx Ex]
// TE: F = [Ey; Hx],  Ey′ = −i Hx,  Hx′ = i(Kx² − [[ε]]) Ey
export function fffSystem(p: FffProfile, t: number, kx: Float64Array, pol: Polarization): CMat {
  const M = kx.length;
  const zero = new Float64Array(M);
  const I = eye(M);
  const iS = (a: CMat) => ({ n: a.n, re: a.im.map((v) => -v), im: a.re.slice() }); // i·a
  const q = partsAt(p, t, M, pol);
  if (pol === 's') {
    const kx2 = diagMulRight(diagMulLeft(kx, zero, I), kx, zero);
    return blocks(cmat(M), iS(scaleM(I, -1)), iS(add(kx2, q.E!, -1)), cmat(M));
  }
  // from the cached parts: only products with the diagonal Kx (M² work)
  const a11 = scaleM(diagMulRight(q.QZ!, kx, zero), -1); // −Qxz Qzz⁻¹ Kx
  const a21 = add(I, diagMulLeft(kx, zero, diagMulRight(q.Zi!, kx, zero)), -1); // I − Kx Qzz⁻¹ Kx
  const a22 = scaleM(diagMulLeft(kx, zero, q.ZQ!), -1); // −Kx Qzz⁻¹ Qzx
  return iS(blocks(a11, q.a12!, a21, a22));
}
const scaleM = (a: CMat, s: number): CMat => ({ n: a.n, re: a.re.map((v) => v * s), im: a.im.map((v) => v * s) });


// S-matrix of a transfer matrix between two gap media (W₀ = I, V₀ = diag(1/vinv)): the amplitudes c = G⁻¹F with
// G = [[I, I], [V₀, −V₀]]; [c⁺_b; c⁻_b] = Tg [c⁺_a; c⁻_a] → S11 = −T22⁻¹T21, S12 = T22⁻¹, S21 = T11 − T12T22⁻¹T21,
// S22 = T12 T22⁻¹ (as the layers of rcwa.ts: side 1 = top).
export function transferToS(T: CMat, vinv: [Float64Array, Float64Array]): SMat {
  const M = T.n / 2;
  const v0 = Array.from(vinv[0], (r, m) => X.div(X.c(1), X.c(r, vinv[1][m])));
  const [v0r, v0i] = [Float64Array.from(v0, (z) => z.re), Float64Array.from(v0, (z) => z.im)];
  const I = eye(M);
  const V0 = diagMulLeft(v0r, v0i, I);
  const Vi = diagMulLeft(vinv[0], vinv[1], I);
  const G = blocks(I, I, V0, scaleM(V0, -1));
  const Gi = scaleM(blocks(I, Vi, I, scaleM(Vi, -1)), 0.5);
  const Tg = mul(Gi, mul(T, G));
  const [T11, T12, T21, T22] = [block(Tg, 0, 0), block(Tg, 0, 1), block(Tg, 1, 0), block(Tg, 1, 1)];
  const T22i = inv(T22);
  const T22iT21 = mul(T22i, T21);
  return { S11: scaleM(T22iT21, -1), S12: T22i, S21: add(T11, mul(T12, T22iT21), -1), S22: mul(T12, T22i) };
}

// Stability (S-matrix propagation): a slice is closed — turned into an S-matrix and joined by the Redheffer product —
// as soon as its transfer matrix grows past GROWTH (the evanescent orders, and the large eigenvalues of a metal's
// Q_zz⁻¹, grow exponentially through the integration).
const GROWTH = 1e3;
const maxAbs = (a: CMat) => {
  let m = 0;
  for (let i = 0; i < a.re.length; i++) m = Math.max(m, Math.abs(a.re[i]), Math.abs(a.im[i]));
  return m;
};
// The integration of a layer, kept for its fields: the steps and the slices (steps j0 … j1, each with its S-matrix).
export type FffPath = { p: FffProfile; k0d: number; steps: number; kx: Float64Array; pol: Polarization; slices: { j0: number; j1: number; S: SMat }[] };

// S-matrix of a smooth-profile layer of normalized thickness k0d; steps: integration points through it (default: 8 per
// unit of k₀d times the largest |kx| / 4, at least 64).
export function fffLayerS(p: FffProfile, k0d: number, kx: Float64Array, pol: Polarization, vinv: [Float64Array, Float64Array], nMax: number, star: (a: SMat, b: SMat) => SMat): { S: SMat; path: FffPath } {
  const kmax = Math.max(...Array.from(kx, Math.abs)) + nMax;
  const steps = Math.max(1, p.steps ?? Math.max(64, Math.ceil(8 * k0d * Math.max(1, kmax / 4))));
  const h = k0d / steps;
  const I = eye(2 * kx.length);
  let S: SMat | null = null;
  let T = I;
  let j0 = 0;
  const slices: FffPath['slices'] = [];
  let A0 = fffSystem(p, 0, kx, pol);
  for (let j = 1; j <= steps; j++) {
    const A1 = fffSystem(p, j / steps, kx, pol);
    const C = add(I, scaleM(A0, h / 2));
    T = solveMat(add(I, scaleM(A1, h / 2), -1), j - 1 === j0 ? C : mul(C, T)); // the first step of a slice: T = I
    A0 = A1;
    if (j === steps || maxAbs(T) > GROWTH) {
      const Ss = transferToS(T, vinv);
      slices.push({ j0, j1: j, S: Ss });
      S = S ? star(S, Ss) : Ss;
      T = I;
      j0 = j;
    }
  }
  return { S: S!, path: { p, k0d, steps, kx, pol, slices } };
}

type Vec = [Float64Array, Float64Array];
// One step of the scheme from depth ta to tb applied to the state F.
function stepTo(path: FffPath, ta: number, tb: number, F: Vec): Vec {
  const h = (tb - ta) * path.k0d;
  if (h === 0) return F;
  const I = eye(2 * path.kx.length);
  const R = add(I, scaleM(fffSystem(path.p, ta, path.kx, path.pol), h / 2));
  return solve(add(I, scaleM(fffSystem(path.p, tb, path.kx, path.pol), h / 2), -1), ...mulVec(R, F[0], F[1]));
}

// The state F at every step j0 … j1 of a slice, integrated from the state at its top (within a slice the growth stays
// below GROWTH: forward integration is stable there).
export function fffMarch(path: FffPath, k: number, Ftop: Vec): Vec[] {
  const { j0, j1 } = path.slices[k];
  const out: Vec[] = [Ftop];
  for (let j = j0; j < j1; j++) out.push(stepTo(path, j / path.steps, (j + 1) / path.steps, out[out.length - 1]));
  return out;
}

// TM: E at a point from continuous quantities — E = E_T + N D_N / ε(x), the harmonics of E_T = (I − [[NN]]) E and of
// N D_N = [[1/ε]]⁻¹ [[NN]] E (the two terms of Q E): their sums converge without the ringing of the discontinuous Ex
// (vertical walls: Ex = Dx / ε as the eigenmode maps).
export type FffE = { xT: Vec; xN: Vec; zT: Vec; zN: Vec; eps: (x: number) => X.C };

// The harmonics at local depth t of the layer from the marched states of its slice k: u, v and w (TM: Ez = Qzz⁻¹(−Kx Hy
// − Qzx Ex) from Dz = −Kx Hy; TE: Hz = Kx Ey); TM also the parts of E for its pointwise reconstruction.
export function fffFieldAt(path: FffPath, k: number, states: Vec[], t: number): { u: Vec; v: Vec; w: Vec; e?: FffE } {
  const { j0, j1 } = path.slices[k];
  const M = path.kx.length;
  const j = Math.min(j1 - 1, Math.max(j0, Math.floor(t * path.steps)));
  const F = stepTo(path, j / path.steps, t, states[j - j0]);
  const u: Vec = [F[0].slice(0, M), F[1].slice(0, M)];
  const v: Vec = [F[0].slice(M), F[1].slice(M)];
  const kx = path.kx;
  if (path.pol === 's') return { u, v, w: [u[0].map((a, m) => a * kx[m]), u[1].map((a, m) => a * kx[m])] };
  const q = fffQ(path.p, t, M, 'p') as Required<ReturnType<typeof fffQ>>;
  const qe = mulVec(q.Qxz, v[0], v[1]);
  const rhs: Vec = [u[0].map((a, m) => -kx[m] * a - qe[0][m]), u[1].map((a, m) => -kx[m] * a - qe[1][m])];
  const w = mulVec(q.Zi, rhs[0], rhs[1]);
  const plus = (a: Vec, b: Vec, s = 1): Vec => [a[0].map((x, m) => x + s * b[0][m]), a[1].map((x, m) => x + s * b[1][m])];
  const nEx = plus(mulVec(q.nn.xx, v[0], v[1]), mulVec(q.nn.xz, w[0], w[1])); // [[NN]] E, x row
  const nEz = plus(mulVec(q.nn.xz, v[0], v[1]), mulVec(q.nn.zz, w[0], w[1])); // z row
  const segs = q.segs;
  const eps = (x: number) => {
    const f = ((x % 1) + 1) % 1;
    const s = segs.find((g) => f >= g.from && f < g.to) ?? segs[segs.length - 1];
    return X.mul(s.n, s.n);
  };
  return { u, v, w, e: { xT: plus(v, nEx, -1), zT: plus(w, nEz, -1), xN: mulVec(q.Ainv, nEx[0], nEx[1]), zN: mulVec(q.Ainv, nEz[0], nEz[1]), eps } };
}

// The largest |n| of a profile (sampled at a few depths), for the growth estimate.
export function fffMaxIndex(p: FffProfile): number {
  let m = 1;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) for (const s of p.segsAt(t)) m = Math.max(m, Math.sqrt(X.abs2(s.n)));
  return m;
}
