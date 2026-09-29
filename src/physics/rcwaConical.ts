// RCWA of 1D gratings (periodic in x, invariant in y) under conical incidence: the plane of incidence makes the azimuth
// φ with the grating vector (x), so the wave vector has k_y = n₀ sin θ sin φ ≠ 0 and TE and TM are coupled. The modes of
// each layer are those of the 2(2N+1) system of the tangential fields (Ex, Ey | hx, hy), h = η₀H:
//   e′ = i P h,  h′ = i Q e  (′ = d/d(k₀z)),  kz² = eig(P Q)
//   P = [[Kx ε⁻¹ ky, I − Kx ε⁻¹ Kx], [ky ε⁻¹ ky − I, −ky ε⁻¹ Kx]]   (ε⁻¹ = [[ε]]⁻¹: Ez, tangential to the x-interfaces)
//   Q = [[−ky Kx, Kx² − [[ε]]], [[[1/ε]]⁻¹ − ky², ky Kx]]           (Li's inverse rule for Ex, normal to them; Laurent for Ey)
// Moharam, Grann, Pommet & Gaylord, JOSA A 12, 1077 (1995); L. Li, JOSA A 13, 1870 (1996) and JOSA A 14, 2758 (1997).
// Scattering matrices through a zero-thickness gap medium (kz = 1 in every order), as the planar solver (rcwa.ts).
// Conventions as rcwa.ts / tmm.ts: fields ∝ exp(i(kx x + ky y + kz z − ωt)), lengths normalized by k₀, the incident
// medium lossless (Re ñ). TE / TM of every plane wave: s = ẑ × k̂t (E along s: TE; H along s: TM), k̂t = (kx, ky)/|kt|
// (the plane of incidence of the incident wave when kt = 0) — the definitions of RETICOLO (res2: efficiency_TE / _TM).
// At φ = 0 the system splits into the planar TE and TM problems of rcwa.ts (checked in check:tmm).
import type { C } from './complex.ts';
import * as X from './complex.ts';
import { add, cmat, diagMulLeft, diagMulRight, eig, eye, inv, mul, mulVec, scale, type CMat } from './cmat.ts';
import { fourier, ordersOf, RCWA_FAST, star, toeplitz, type Factorization, type RcwaLayer, type SMat } from './rcwa.ts';
import { blockApply, blockLayerS, blockRegionS, starBB, toDense, type B2, type BlockS } from './rcwaBlocks.ts';
import { anisoExitFlux, anisoLayerBlock, anisoRegionBlock, rotateZ } from './berreman.ts';
import { nCos, type Polarization } from './tmm.ts';

// An incident polarization: TE ('s'), TM ('p'), or the Jones state E = cos ψ p̂ + sin ψ e^{iδ} ŝ (ψ, δ in degrees; ψ = 0: TM,
// 90°: TE; ψ = 45°, δ = ±90°: circular), carrying unit power.
export type Jones = { psi: number; delta: number };
export type IncidentPol = Polarization | Jones;

export type ConicalResult = {
  orders: number[];
  R: Float64Array; // efficiency of each reflected order (both polarizations)
  T: Float64Array;
  RTE: Float64Array; // its TE part (E along s = ẑ × k̂t)
  RTM: Float64Array; // its TM part (H along s)
  TTE: Float64Array;
  TTM: Float64Array;
  // its circular parts: helicity +1 (σ+, E turning counterclockwise about k for e^{−iωt}) and −1 (σ−)
  RCP: Float64Array;
  RCM: Float64Array;
  TCP: Float64Array;
  TCM: Float64Array;
  Rtot: number;
  Ttot: number;
  // complex amplitudes of the zeroth orders, co- and cross-polarized: TE amplitude = E·s, TM amplitude = h·s (the
  // incident wave has unit amplitude in its own polarization)
  r0: { te: C; tm: C };
  t0: { te: C; tm: C };
};

// W, V: tangential E and h of each mode (columns); grating layers also keep [[ε]]⁻¹ and [[1/ε]]⁻¹ (the field maps)
export type Modes = { W: CMat; V: CMat; kz: C[]; eps?: C; Ei?: CMat; Ainv?: CMat };
type Vd = [Float64Array, Float64Array];

// A 2M × 2M matrix from four M × M blocks.
function blocks(a11: CMat, a12: CMat, a21: CMat, a22: CMat): CMat {
  const M = a11.n;
  const out = cmat(2 * M);
  const put = (b: CMat, r0: number, c0: number) => {
    for (let i = 0; i < M; i++)
      for (let j = 0; j < M; j++) {
        out.re[(r0 + i) * 2 * M + c0 + j] = b.re[i * M + j];
        out.im[(r0 + i) * 2 * M + c0 + j] = b.im[i * M + j];
      }
  };
  put(a11, 0, 0);
  put(a12, 0, M);
  put(a21, M, 0);
  put(a22, M, M);
  return out;
}
const dgm = (re: ArrayLike<number>, im?: ArrayLike<number>): CMat => {
  const n = re.length;
  const a = cmat(n);
  for (let i = 0; i < n; i++) {
    a.re[i * n + i] = re[i];
    if (im) a.im[i * n + i] = im[i];
  }
  return a;
};
const sqrtBranch = (v: C): C => nCos(X.sqrt(v), X.c(0)); // √v with Im ≥ 0 (Re > 0 when Im ≈ 0)
const safe = (q: C): C => (Math.hypot(q.re, q.im) < 1e-12 ? X.c(1e-12) : q); // kz = 0 exactly (grazing): 1/kz stays finite

// Modes of a uniform layer: W = I (the tangential E of each order), both polarizations with kz = √(ε − kt²).
function uniformModes(n: C, kx: Float64Array, ky: number): Modes {
  const M = kx.length;
  const eps = X.mul(n, n);
  const kz: C[] = [];
  for (let m = 0; m < M; m++) kz.push(nCos(n, X.c(Math.hypot(kx[m], ky))));
  // V = Q kz⁻¹, Q = [[−ky Kx, Kx² − ε], [ε − ky², ky Kx]] (diagonal blocks)
  const q = (f: (m: number) => C) => {
    const re = new Float64Array(M);
    const im = new Float64Array(M);
    for (let m = 0; m < M; m++) {
      const v = X.div(f(m), safe(kz[m]));
      re[m] = v.re;
      im[m] = v.im;
    }
    return dgm(re, im);
  };
  const V = blocks(
    q((m) => X.c(-ky * kx[m])),
    q((m) => X.sub(X.c(kx[m] * kx[m]), eps)),
    q(() => X.sub(eps, X.c(ky * ky))),
    q((m) => X.c(ky * kx[m])),
  );
  return { W: eye(2 * M), V, kz: [...kz, ...kz], eps };
}

const modeCache = new Map<string, Modes>();
const CACHE_MAX = 200;

// Modes of a grating layer (Li's factorization, or the Laurent rule for every product).
function gratingModes(L: RcwaLayer, kx: Float64Array, ky: number, fact: Factorization): Modes {
  const key = `${fact}|${ky.toPrecision(15)}|${Array.from(kx, (v) => v.toPrecision(15)).join(',')}|${L.segs!.map((s) => `${s.from},${s.to},${s.n.re},${s.n.im}`).join(';')}`;
  const hit = modeCache.get(key);
  if (hit) return hit;
  const M = kx.length;
  const I = eye(M);
  const zero = new Float64Array(M);
  const segsEps = L.segs!.map((s) => ({ from: s.from, to: s.to, v: X.mul(s.n, s.n) }));
  const E = toeplitz(fourier(segsEps, M - 1), M);
  const Ei = inv(E);
  const Ainv = fact === 'li' ? inv(toeplitz(fourier(segsEps.map((s) => ({ ...s, v: X.div(X.c(1), s.v) })), M - 1), M)) : E; // [[1/ε]]⁻¹
  const KxEi = diagMulLeft(kx, zero, Ei);
  const P = blocks(scale(KxEi, ky), add(I, diagMulRight(KxEi, kx, zero), -1), add(scale(Ei, ky * ky), I, -1), scale(diagMulRight(Ei, kx, zero), -ky));
  const Q = blocks(
    dgm(Array.from(kx, (v) => -ky * v)),
    add(dgm(Array.from(kx, (v) => v * v)), E, -1),
    add(Ainv, scale(I, ky * ky), -1),
    dgm(Array.from(kx, (v) => ky * v)),
  );
  const ev = eig(mul(P, Q));
  const kz: C[] = [];
  const ir = new Float64Array(2 * M);
  const ii = new Float64Array(2 * M);
  for (let j = 0; j < 2 * M; j++) {
    const q = sqrtBranch(X.c(ev.valRe[j], ev.valIm[j]));
    kz.push(q);
    const w = X.div(X.c(1), safe(q));
    ir[j] = w.re;
    ii[j] = w.im;
  }
  const modes: Modes = { W: ev.vec, V: diagMulRight(mul(Q, ev.vec), ir, ii), kz, Ei, Ainv };
  if (modeCache.size >= CACHE_MAX) modeCache.delete(modeCache.keys().next().value!);
  modeCache.set(key, modes);
  return modes;
}

// V₀⁻¹ of the gap medium (ε_g = 1 + kx² + ky² per order, kz = 1, W₀ = I): per order the 2×2 block
// (1/D)[[kx ky, 1 + ky²], [−(1 + kx²), −kx ky]], D = 1 + kx² + ky².
function gapVinv(kx: Float64Array, ky: number): CMat {
  const d = (f: (k: number) => number) => dgm(Array.from(kx, (k) => f(k) / (1 + k * k + ky * ky)));
  return blocks(
    d((k) => k * ky),
    d(() => 1 + ky * ky),
    d((k) => -(1 + k * k)),
    d((k) => -k * ky),
  );
}

// S-matrix of a layer of thickness k₀d between two gap media (the formulas of rcwa.ts, dense), with the pieces the
// field maps need to recover the mode amplitudes.
export type LayerPart = { S: SMat; Mm: CMat; Pinv: CMat; Dinv: CMat; Xr: Float64Array; Xi: Float64Array };
function layerS(md: Modes, k0d: number, V0i: CMat): LayerPart {
  const n = md.W.n;
  const Xr = new Float64Array(n);
  const Xi = new Float64Array(n);
  for (let m = 0; m < n; m++) {
    const e = X.exp(X.mul(X.c(0, 1), X.mul(md.kz[m], X.c(k0d))));
    Xr[m] = e.re;
    Xi[m] = e.im;
  }
  const V0iV = mul(V0i, md.V);
  const P = add(md.W, V0iV);
  const Mm = add(md.W, V0iV, -1);
  const Pinv = inv(P);
  const MXPi = mul(diagMulRight(Mm, Xr, Xi), Pinv);
  const Dinv = inv(add(P, diagMulRight(mul(MXPi, Mm), Xr, Xi), -1));
  const PX = diagMulRight(P, Xr, Xi);
  const S11 = add(mul(Mm, Dinv), mul(mul(PX, Dinv), MXPi), -1);
  const S12 = add(mul(PX, Dinv), mul(mul(Mm, Dinv), MXPi), -1);
  return { S: { S11, S12, S21: S12, S22: S11 }, Mm, Pinv, Dinv, Xr, Xi };
}

function regionS(md: Modes, V0i: CMat, side: 'ref' | 'trn'): SMat {
  const V0iV = mul(V0i, md.V);
  const P = add(md.W, V0iV);
  const Mm = add(md.W, V0iV, -1);
  const Pinv = inv(P);
  const half = scale(add(P, mul(mul(Mm, Pinv), Mm), -1), 0.5);
  if (side === 'ref') return { S11: scale(mul(Pinv, Mm), -1), S12: scale(Pinv, 2), S21: half, S22: mul(Mm, Pinv) };
  return { S11: mul(Mm, Pinv), S12: half, S21: scale(Pinv, 2), S22: scale(mul(Pinv, Mm), -1) };
}

// The internal state of a solve (for the field maps): wave vectors, modes and S-matrices of every layer, the incident
// field and the reflected / transmitted tangential fields of every order.
export type ConicalSolved = {
  kx: Float64Array;
  ky: number;
  phi: number; // rad
  k0: number;
  modes: Modes[];
  parts: LayerPart[];
  Sref: SMat;
  Strn: SMat;
  e0: [Float64Array, Float64Array];
  r: [Float64Array, Float64Array];
  t: [Float64Array, Float64Array];
  eps0: number;
  inc: { E2: number; H2: number };
  result: ConicalResult;
};

// The S-matrix of a stack for given in-plane wave vectors (kx of the orders, ky), and the modes / layer parts when the
// fields are wanted. The first medium is taken lossless (Re ñ).
type StackSolve = { S: SMat; apply: (x: Vd) => { r: Vd; t: Vd }; Sref: SMat; Strn: SMat; parts: LayerPart[]; modes: Modes[] };
function conicalStack(layers: RcwaLayer[], kx: Float64Array, ky: number, k0: number, fact: Factorization, withFields: boolean): StackSolve {
  const M = kx.length;
  const n0 = X.c(layers[0].n!.re);
  const V0i = gapVinv(kx, ky);
  const isGrating = (L: RcwaLayer, i: number) => !!L.segs && i > 0 && i < layers.length - 1;
  const fast = !withFields && RCWA_FAST.on;
  let Sref: SMat;
  let Strn: SMat;
  let parts: LayerPart[] = [];
  let modes: Modes[] = [];
  let apply: (x: Vd) => { r: Vd; t: Vd };
  let total: SMat;
  if (fast) {
    // per order: V of a uniform medium (Q kz⁻¹) and V₀⁻¹ of the gap, 2×2 blocks
    const V0b: B2[] = Array.from(kx, (k) => {
      const D = 1 + k * k + ky * ky;
      return [X.c((k * ky) / D), X.c((1 + ky * ky) / D), X.c(-(1 + k * k) / D), X.c((-k * ky) / D)];
    });
    const uniform = (n: C) => {
      const eps = X.mul(n, n);
      const kz = Array.from(kx, (k) => nCos(n, X.c(Math.hypot(k, ky))));
      const V: B2[] = Array.from(kx, (k, m) => {
        const w = X.div(X.c(1), safe(kz[m]));
        return [X.mul(X.c(-ky * k), w), X.mul(X.sub(X.c(k * k), eps), w), X.mul(X.sub(eps, X.c(ky * ky)), w), X.mul(X.c(ky * k), w)];
      });
      return { V, kz };
    };
    // the sequence: blocks (uniform) combined order by order, dense matrices for the gratings
    const seq: (BlockS | SMat)[] = [];
    const push = (x: BlockS | SMat) => {
      const last = seq[seq.length - 1];
      if (last && Array.isArray((last as BlockS).S11) && Array.isArray((x as BlockS).S11)) seq[seq.length - 1] = starBB(last as BlockS, x as BlockS);
      else seq.push(x);
    };
    const anisoMemo = new Map<string, BlockS>();
    push(blockRegionS(uniform(n0).V, V0b, 'ref'));
    layers.slice(1, -1).forEach((L, j) => {
      if (isGrating(L, j + 1)) push(layerS(gratingModes(L, kx, ky, fact), k0 * L.d, V0i).S);
      else if (L.eps) {
        // anisotropic: Berreman 4×4 per order; a repeated layer (a periodic stack) is solved once
        const layer = (eps: C[], d: number, twist = 0) => {
          const key = `${eps.map((v) => `${v.re},${v.im}`).join(';')}|${d}|${twist}`;
          let blk = anisoMemo.get(key);
          if (!blk) anisoMemo.set(key, (blk = anisoLayerBlock(eps, kx, ky, k0 * d, V0b, (twist * Math.PI) / 180)));
          push(blk);
        };
        const h = L.helix;
        // a helix: exact at normal incidence, sublayers (the tensor at the middle of each) otherwise
        if (!h) layer(L.eps, L.d);
        else if (ky === 0 && kx.every((k) => k === 0)) layer(L.eps, L.d, h.twist);
        else for (let j = 0; j < h.slices; j++) layer(rotateZ(L.eps, (h.twist * (j + 0.5)) / h.slices), L.d / h.slices);
      }
      else {
        const u = uniform(L.n!);
        push(blockLayerS(u.V, V0b, u.kz.map((q) => X.exp(X.mul(X.c(0, 1), X.mul(q, X.c(k0 * L.d)))))));
      }
    });
    // the exit medium: uniform, or anisotropic (a semi-infinite Berreman medium: its own outgoing / incoming modes)
    const exit = layers[layers.length - 1];
    push(exit.eps ? anisoRegionBlock(exit.eps, kx, ky, V0b) : blockRegionS(uniform(exit.n!).V, V0b, 'trn'));
    const asDense = (x: BlockS | SMat): SMat => (Array.isArray((x as BlockS).S11) ? toDense(x as BlockS) : (x as SMat));
    if (seq.length === 1) {
      const b = seq[0] as BlockS;
      apply = (x) => ({ r: blockApply(b.S11, x), t: blockApply(b.S21, x) });
      Sref = Strn = total = asDense(b);
    } else {
      let S = asDense(seq[0]);
      for (let i = 1; i < seq.length; i++) S = star(S, asDense(seq[i]));
      total = S;
      apply = (x) => ({ r: mulVec(S.S11, x[0], x[1]), t: mulVec(S.S21, x[0], x[1]) });
      Sref = asDense(seq[0]);
      Strn = asDense(seq[seq.length - 1]);
    }
  } else {
    if (layers.some((L) => L.eps)) throw new Error('field maps of anisotropic layers are not available yet');
    modes = layers.map((L, i) => (isGrating(L, i) ? gratingModes(L, kx, ky, fact) : uniformModes(i === 0 ? n0 : L.n!, kx, ky)));
    Sref = regionS(modes[0], V0i, 'ref');
    Strn = regionS(modes[modes.length - 1], V0i, 'trn');
    parts = layers.slice(1, -1).map((L, i) => layerS(modes[i + 1], k0 * L.d, V0i));
    let S = Sref;
    for (const pt of parts) S = star(S, pt.S);
    S = star(S, Strn);
    total = S;
    apply = (x) => ({ r: mulVec(S.S11, x[0], x[1]), t: mulVec(S.S21, x[0], x[1]) });
  }

  void M;
  return { S: total!, apply, Sref, Strn, parts, modes };
}

// The full S-matrix (every order and polarization in and out, basis: tangential E of each order, Ex block then Ey block)
// of a stack for the wave vectors kx, ky (normalized by k₀): the thick incoherent substrate combines two of them.
export const conicalSMatrix = (layers: RcwaLayer[], kx: Float64Array, ky: number, lam: number, fact: Factorization = 'li'): SMat =>
  conicalStack(layers, kx, ky, (2 * Math.PI) / lam, fact, false).S;

// layers: incident medium, layers, exit medium (both media uniform); φ in degrees from the grating vector (x).
// (the efficiencies only: uniform layers through the per-order fast path)
export const rcwaConical = (layers: RcwaLayer[], period: number, lam: number, thetaDeg: number, phiDeg: number, pol: IncidentPol, N: number, fact: Factorization = 'li'): ConicalResult =>
  conicalSolve(layers, period, lam, thetaDeg, phiDeg, pol, N, fact, false).result;

// withFields: the dense S-matrix of every layer is kept (the field maps); otherwise (RCWA_FAST on) the uniform layers
// and regions are 2×2 blocks per order, combined order by order, and only the grating layers use the dense algebra.
export function conicalSolve(layers: RcwaLayer[], period: number, lam: number, thetaDeg: number, phiDeg: number, pol: IncidentPol, N: number, fact: Factorization = 'li', withFields = true): ConicalSolved {
  if (layers[0].eps) throw new Error('the incident medium must be isotropic');
  const n0 = X.c(layers[0].n!.re);
  const eps0 = X.mul(n0, n0);
  const th = (thetaDeg * Math.PI) / 180;
  const ph = (phiDeg * Math.PI) / 180;
  const kt0 = n0.re * Math.sin(th);
  const kx = Float64Array.from(ordersOf(N), (m) => kt0 * Math.cos(ph) + (m * lam) / period);
  const ky = kt0 * Math.sin(ph);
  const M = kx.length;
  const k0 = (2 * Math.PI) / lam;
  const { apply, Sref, Strn, parts, modes } = conicalStack(layers, kx, ky, k0, fact, withFields);

  // s = ẑ × k̂t and k̂t of each order (the incident plane when kt = 0)
  const unit = (m: number): [number, number] => {
    const kt = Math.hypot(kx[m], ky);
    return kt > 1e-12 ? [kx[m] / kt, ky / kt] : [Math.cos(ph), Math.sin(ph)];
  };
  // the incident wave, order 0: TE E = s; TM h = s, its tangential E = (kz/ε) k̂t (h = s, E = −(k × h)/ε)
  const [ux, uy] = unit(N);
  const kz0 = nCos(n0, X.c(Math.abs(kt0))).re;
  const e0: Vd = [new Float64Array(2 * M), new Float64Array(2 * M)];
  // amplitudes a (TE: E·s) and c (TM: h·s) of the incident wave; TE / TM: unit amplitude, Jones: unit power
  const [a0, c0]: [C, C] =
    pol === 's'
      ? [X.c(1), X.c(0)]
      : pol === 'p'
        ? [X.c(0), X.c(1)]
        : [X.mul(X.exp(X.c(0, (pol.delta * Math.PI) / 180)), X.c(Math.sin((pol.psi * Math.PI) / 180) / Math.sqrt(kz0))), X.c(Math.cos((pol.psi * Math.PI) / 180) / Math.sqrt(kz0 / eps0.re))];
  // tangential E: TE a (−ûy, ûx), TM (kz/ε) c (ûx, ûy)
  const w = kz0 / eps0.re;
  e0[0][N] = -uy * a0.re + w * ux * c0.re;
  e0[1][N] = -uy * a0.im + w * ux * c0.im;
  e0[0][M + N] = ux * a0.re + w * uy * c0.re;
  e0[1][M + N] = ux * a0.im + w * uy * c0.im;
  const f0 = kz0 * X.abs2(a0) + (kz0 / eps0.re) * X.abs2(c0);
  const { r, t } = apply(e0);

  // per order: TE amplitude a = E·s, TM through E·k̂t = (kz/ε) h·s; fluxes TE Re(kz)|a|², TM Re(ε/kz)|E·k̂t|² (exact for a
  // lossy exit medium too: the cross terms of the Poynting vector vanish)
  const exitN = layers[layers.length - 1].n;
  // dir: −1 for the reflected waves (kz < 0: h·s = ε (E·k̂t) / (−kz))
  const split = (v: Vd, n: C, clamp: boolean, dir: number) => {
    const eps = X.mul(n, n);
    const TE = new Float64Array(M);
    const TM = new Float64Array(M);
    const CP = new Float64Array(M);
    const CM = new Float64Array(M);
    const amp: { te: C; tm: C }[] = [];
    for (let m = 0; m < M; m++) {
      const [ex, ey] = [X.c(v[0][m], v[1][m]), X.c(v[0][M + m], v[1][M + m])];
      const [cx, cy] = unit(m);
      const a = X.add(X.mul(X.c(-cy), ex), X.mul(X.c(cx), ey));
      const b = X.add(X.mul(X.c(cx), ex), X.mul(X.c(cy), ey));
      const kz = nCos(n, X.c(Math.hypot(kx[m], ky)));
      const fTE = (kz.re * (a.re ** 2 + a.im ** 2)) / f0;
      const fTM = (X.div(eps, safe(kz)).re * (b.re ** 2 + b.im ** 2)) / f0;
      TE[m] = clamp ? Math.max(0, fTE) : fTE;
      TM[m] = clamp ? Math.max(0, fTM) : fTM;
      // helicity: E = E_p p̂ + E_s ŝ with p̂ × ŝ = k̂ (E_s = a, E_p = ±(E·k̂t) n / kz, − for the reflected waves), e_± = (p̂ ± iŝ)/√2,
      // E_± = (E_p ∓ i E_s)/√2; the flux of the wave shared in the ratio |E_+|² : |E_−|² (exact without loss)
      const Ep = X.div(X.mul(X.mul(b, n), X.c(dir)), safe(kz));
      const iEs = X.mul(X.c(0, 1), a);
      const [p2, m2] = [X.abs2(X.sub(Ep, iEs)), X.abs2(X.add(Ep, iEs))];
      const share = p2 + m2 > 0 ? p2 / (p2 + m2) : 0.5;
      CP[m] = share * (TE[m] + TM[m]);
      CM[m] = (1 - share) * (TE[m] + TM[m]);
      amp.push({ te: a, tm: X.div(X.mul(b, eps), X.mul(X.c(dir), safe(kz))) });
    }
    return { TE, TM, CP, CM, amp };
  };
  // an anisotropic exit medium: the transmitted power of each order from the Poynting flux of its outgoing modes; its waves
  // are not TE / TM (the parts are NaN, as the transmitted amplitudes)
  const exitEps = layers[layers.length - 1].eps;
  const splitAniso = (v: Vd) => {
    const nan = new Float64Array(M).fill(NaN);
    const tot = Float64Array.from({ length: M }, (_, m) =>
      Math.max(0, anisoExitFlux(exitEps!, kx[m], ky, [X.c(v[0][m], v[1][m]), X.c(v[0][M + m], v[1][M + m])]) / f0),
    );
    return { TE: nan, TM: nan, CP: nan, CM: nan, tot, amp: Array.from({ length: M }, () => ({ te: X.c(NaN), tm: X.c(NaN) })) };
  };
  const R = split(r, n0, false, -1);
  const TA = exitEps ? splitAniso(t) : null;
  const T = TA ?? split(t, exitN!, true, 1);
  const sum = (a: Float64Array, b: Float64Array) => Float64Array.from(a, (v, i) => v + b[i]);
  const Rm = sum(R.TE, R.TM);
  const Tm = TA ? TA.tot : sum(T.TE, T.TM);
  const result: ConicalResult = {
    orders: ordersOf(N),
    R: Rm,
    T: Tm,
    RTE: R.TE,
    RTM: R.TM,
    TTE: T.TE,
    TTM: T.TM,
    RCP: R.CP,
    RCM: R.CM,
    TCP: T.CP,
    TCM: T.CM,
    Rtot: Rm.reduce((a, b) => a + b, 0),
    Ttot: Tm.reduce((a, b) => a + b, 0),
    r0: R.amp[N],
    t0: T.amp[N],
  };
  // |E|², |h|² of the incident wave (the reference of the field maps)
  const inc = { E2: X.abs2(a0) + X.abs2(c0) / eps0.re, H2: eps0.re * X.abs2(a0) + X.abs2(c0) };
  return { kx, ky, phi: ph, k0, modes, parts, Sref, Strn, e0, r, t, eps0: eps0.re, inc, result };
}
