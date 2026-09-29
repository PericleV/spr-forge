// Characteristic-matrix (admittance) form of the TMM with analytic derivatives, for thin-film design.
//   M_j = [[cos δ, −i sin δ / η], [−i η sin δ, cos δ]] (ñ = n + ik),  δ = k₀ q d,  q = ñ cos θ = √(ñ² − kx²)
//   η = q (s) or ñ²/q (p): tilted admittances, so that H_t = η E_t in every medium.
//   [B, C] = M₁…M_N · [1, η_s];  r = (η₀B − C)/(η₀B + C);  T = 4 η₀ Re(η_s) / |η₀B + C|²  (η₀ real).
// Derivatives: ∂M/∂d_j = P_{j−1} ∂M_j S_{j+1} (prefix / suffix products). A thin layer of material m inserted at a
// point (the “needle”) changes M by P · M_j(z) · G_m · M_j(d − z) · S at first order, G_m = k₀ q [[0, −i/η], [−iη, 0]].
// Every matrix has equal diagonal elements, so the stack seen from the other side is [[m₂₂, m₁₂], [m₂₁, m₁₁]]
// (the same holds for the derivatives): one pass gives both directions.
import * as X from './complex.ts';
import type { C } from './complex.ts';
import { nCos, type Polarization } from './tmm.ts';

export const admittance = (n: C, q: C, pol: Polarization): C => (pol === 's' ? q : X.div(X.mul(n, n), q));

// Response of a stack between two media, both directions: R, T from medium 0; Rr, Tr from medium s.
export type Faces = { R: number; T: number; Rr: number; Tr: number };

export type Film = { n: C; d: number };
export type NeedleProbe = { layer: number; z: number }; // position: layer index (0 … N−1) and depth from its top; layer N = the end

export type CoherentResult = {
  faces: Faces;
  grad?: Faces[]; // ∂/∂d_j
  needle?: Faces[][]; // [probe][candidate material]: ∂/∂(thickness of an inserted layer)
};

// 2×2 complex matrices are stored as 8 reals [m11 re, im, m12 re, im, m21 re, im, m22 re, im] in Float64Arrays
// (no allocation per product: this is the inner loop of the thin-film design).

// out[o..] = A[a..] · B[b..] (out may not alias A or B)
function mul(A: Float64Array, a: number, B: Float64Array, b: number, out: Float64Array, o: number) {
  const a0 = A[a], a1 = A[a + 1], a2 = A[a + 2], a3 = A[a + 3], a4 = A[a + 4], a5 = A[a + 5], a6 = A[a + 6], a7 = A[a + 7];
  const b0 = B[b], b1 = B[b + 1], b2 = B[b + 2], b3 = B[b + 3], b4 = B[b + 4], b5 = B[b + 5], b6 = B[b + 6], b7 = B[b + 7];
  out[o] = a0 * b0 - a1 * b1 + a2 * b4 - a3 * b5;
  out[o + 1] = a0 * b1 + a1 * b0 + a2 * b5 + a3 * b4;
  out[o + 2] = a0 * b2 - a1 * b3 + a2 * b6 - a3 * b7;
  out[o + 3] = a0 * b3 + a1 * b2 + a2 * b7 + a3 * b6;
  out[o + 4] = a4 * b0 - a5 * b1 + a6 * b4 - a7 * b5;
  out[o + 5] = a4 * b1 + a5 * b0 + a6 * b5 + a7 * b4;
  out[o + 6] = a4 * b2 - a5 * b3 + a6 * b6 - a7 * b7;
  out[o + 7] = a4 * b3 + a5 * b2 + a6 * b7 + a7 * b6;
}

const setI = (M: Float64Array, o: number) => {
  M.fill(0, o, o + 8);
  M[o] = 1;
  M[o + 6] = 1;
};

// Characteristic matrix of a layer (q, η complex; thickness d) into M[o..]; with dM, also ∂M/∂d into dM[o..].
//   M = [[cos δ, −i sin δ / η], [−i η sin δ, cos δ]], δ = k₀ q d;  ∂M/∂d = k₀ q [[−sin δ, −i cos δ / η], [−i η cos δ, −sin δ]]
function layerInto(qr: number, qi: number, er: number, ei: number, k0: number, d: number, M: Float64Array, o: number, dM?: Float64Array | null) {
  const xr = k0 * d * qr;
  const xi = k0 * d * qi;
  const ch = xi === 0 ? 1 : Math.cosh(xi); // lossless layers: real phase
  const sh = xi === 0 ? 0 : Math.sinh(xi);
  const cx = Math.cos(xr);
  const sx = Math.sin(xr);
  const cr = cx * ch; // cos δ
  const ci = -sx * sh;
  const sr = sx * ch; // sin δ
  const si = cx * sh;
  const e2 = er * er + ei * ei;
  // s / η and η s; −i (x + iy) = y − i x
  const sdr = (sr * er + si * ei) / e2;
  const sdi = (si * er - sr * ei) / e2;
  const esr = er * sr - ei * si;
  const esi = er * si + ei * sr;
  M[o] = cr;
  M[o + 1] = ci;
  M[o + 2] = sdi;
  M[o + 3] = -sdr;
  M[o + 4] = esi;
  M[o + 5] = -esr;
  M[o + 6] = cr;
  M[o + 7] = ci;
  if (!dM) return;
  const kr = k0 * qr;
  const ki = k0 * qi;
  const cdr = (cr * er + ci * ei) / e2; // cos δ / η
  const cdi = (ci * er - cr * ei) / e2;
  const ecr = er * cr - ei * ci; // η cos δ
  const eci = er * ci + ei * cr;
  // k q · (−sin δ)
  dM[o] = -(kr * sr - ki * si);
  dM[o + 1] = -(kr * si + ki * sr);
  // k q · (−i cos δ / η) = k q · (cdi − i cdr)
  dM[o + 2] = kr * cdi + ki * cdr;
  dM[o + 3] = ki * cdi - kr * cdr;
  // k q · (−i η cos δ) = k q · (eci − i ecr)
  dM[o + 4] = kr * eci + ki * ecr;
  dM[o + 5] = ki * eci - kr * ecr;
  dM[o + 6] = dM[o];
  dM[o + 7] = dM[o + 1];
}

// Face context: B, C, D = η₀B + C, N = η₀B − C, r = N/D and the same for the reversed stack.
type FaceCtx = {
  e0r: number; e0i: number; esr: number; esi: number;
  Dr: number; Di: number; Nr: number; Ni: number; rr: number; ri: number;
  RDr: number; RDi: number; RNr: number; RNi: number; rrr: number; rri: number; K: number;
};

function facesOf(M: Float64Array, o: number, e0r: number, e0i: number, esr: number, esi: number): { f: Faces; ctx: FaceCtx } {
  const m0 = M[o], m1 = M[o + 1], m2 = M[o + 2], m3 = M[o + 3], m4 = M[o + 4], m5 = M[o + 5], m6 = M[o + 6], m7 = M[o + 7];
  // B = m11 + m12 ηs, C = m21 + m22 ηs
  const Br = m0 + m2 * esr - m3 * esi, Bi = m1 + m2 * esi + m3 * esr;
  const Cr = m4 + m6 * esr - m7 * esi, Ci = m5 + m6 * esi + m7 * esr;
  const eBr = e0r * Br - e0i * Bi, eBi = e0r * Bi + e0i * Br;
  const Dr = eBr + Cr, Di = eBi + Ci, Nr = eBr - Cr, Ni = eBi - Ci;
  const dd = Dr * Dr + Di * Di;
  const rr = (Nr * Dr + Ni * Di) / dd, ri = (Ni * Dr - Nr * Di) / dd;
  // reversed: [[m22, m12], [m21, m11]] from the s side: B' = m22 + m12 η₀, C' = m21 + m11 η₀
  const bBr = m6 + m2 * e0r - m3 * e0i, bBi = m7 + m2 * e0i + m3 * e0r;
  const bCr = m4 + m0 * e0r - m1 * e0i, bCi = m5 + m0 * e0i + m1 * e0r;
  const sBr = esr * bBr - esi * bBi, sBi = esr * bBi + esi * bBr;
  const RDr = sBr + bCr, RDi = sBi + bCi, RNr = sBr - bCr, RNi = sBi - bCi;
  const rd = RDr * RDr + RDi * RDi;
  const rrr = (RNr * RDr + RNi * RDi) / rd, rri = (RNi * RDr - RNr * RDi) / rd;
  const K = 4 * e0r * esr;
  return {
    f: { R: rr * rr + ri * ri, T: K / dd, Rr: rrr * rrr + rri * rri, Tr: K / rd },
    ctx: { e0r, e0i, esr, esi, Dr, Di, Nr, Ni, rr, ri, RDr, RDi, RNr, RNi, rrr, rri, K },
  };
}

// First-order change of the faces for a change dM of the stack matrix.
function dFaces(M: Float64Array, o: number, k: FaceCtx): Faces {
  const m0 = M[o], m1 = M[o + 1], m2 = M[o + 2], m3 = M[o + 3], m4 = M[o + 4], m5 = M[o + 5], m6 = M[o + 6], m7 = M[o + 7];
  const { e0r, e0i, esr, esi } = k;
  const dBr = m0 + m2 * esr - m3 * esi, dBi = m1 + m2 * esi + m3 * esr;
  const dCr = m4 + m6 * esr - m7 * esi, dCi = m5 + m6 * esi + m7 * esr;
  const eBr = e0r * dBr - e0i * dBi, eBi = e0r * dBi + e0i * dBr;
  const dDr = eBr + dCr, dDi = eBi + dCi, dNr = eBr - dCr, dNi = eBi - dCi;
  // dr = (dN D − N dD) / D²
  const nr = dNr * k.Dr - dNi * k.Di - (k.Nr * dDr - k.Ni * dDi);
  const ni = dNr * k.Di + dNi * k.Dr - (k.Nr * dDi + k.Ni * dDr);
  const D2r = k.Dr * k.Dr - k.Di * k.Di, D2i = 2 * k.Dr * k.Di, D2 = D2r * D2r + D2i * D2i;
  const drr = (nr * D2r + ni * D2i) / D2, dri = (ni * D2r - nr * D2i) / D2;
  const bBr = m6 + m2 * e0r - m3 * e0i, bBi = m7 + m2 * e0i + m3 * e0r;
  const bCr = m4 + m0 * e0r - m1 * e0i, bCi = m5 + m0 * e0i + m1 * e0r;
  const sBr = esr * bBr - esi * bBi, sBi = esr * bBi + esi * bBr;
  const RdDr = sBr + bCr, RdDi = sBi + bCi, RdNr = sBr - bCr, RdNi = sBi - bCi;
  const Rnr = RdNr * k.RDr - RdNi * k.RDi - (k.RNr * RdDr - k.RNi * RdDi);
  const Rni = RdNr * k.RDi + RdNi * k.RDr - (k.RNr * RdDi + k.RNi * RdDr);
  const R2r = k.RDr * k.RDr - k.RDi * k.RDi, R2i = 2 * k.RDr * k.RDi, R2 = R2r * R2r + R2i * R2i;
  const Rdrr = (Rnr * R2r + Rni * R2i) / R2, Rdri = (Rni * R2r - Rnr * R2i) / R2;
  const aD = k.Dr * k.Dr + k.Di * k.Di;
  const aDr = k.RDr * k.RDr + k.RDi * k.RDi;
  return {
    R: 2 * (k.rr * drr + k.ri * dri),
    T: (-k.K * 2 * (k.Dr * dDr + k.Di * dDi)) / (aD * aD),
    Rr: 2 * (k.rrr * Rdrr + k.rri * Rdri),
    Tr: (-k.K * 2 * (k.RDr * RdDr + k.RDi * RdDi)) / (aDr * aDr),
  };
}

// Work arrays reused from call to call (coherent is synchronous and not re-entrant; nothing returned points into them):
// the design loop calls it for every wavelength of every evaluation.
const work = { Q: new Float64Array(0), E: new Float64Array(0), Ms: new Float64Array(0), dMs: new Float64Array(0), P: new Float64Array(0), S: new Float64Array(0) };
const grown = (a: Float64Array<ArrayBuffer>, n: number) => (a.length >= n ? a : new Float64Array(Math.max(n, 2 * a.length)));

// Coherent stack between a lossless medium n0 and a medium nS, wave vector kx.
export function coherent(
  films: Film[],
  n0: C,
  nS: C,
  kx: number,
  k0: number,
  pol: Polarization,
  opts: { grad?: boolean; probes?: NeedleProbe[]; candidates?: C[] } = {},
): CoherentResult {
  const kxc = X.c(kx);
  const q0 = nCos(X.c(n0.re), kxc);
  const qS = nCos(nS, kxc);
  const eta0 = admittance(X.c(n0.re), q0, pol);
  const etaS = admittance(nS, qS, pol);
  const N = films.length;
  const Q = (work.Q = grown(work.Q, 2 * N)); // q = ñ cos θ
  const E = (work.E = grown(work.E, 2 * N)); // tilted admittance η
  // q and η once per distinct index (the layers of a design share a few materials)
  const seen: C[] = [];
  const seenAt: number[] = [];
  for (let j = 0; j < N; j++) {
    const n = films[j].n;
    let k = seen.indexOf(n);
    if (k < 0) {
      k = seen.push(n) - 1;
      seenAt.push(j);
      const q = nCos(n, kxc);
      const e = admittance(n, q, pol);
      Q[2 * j] = q.re;
      Q[2 * j + 1] = q.im;
      E[2 * j] = e.re;
      E[2 * j + 1] = e.im;
    } else {
      const i = seenAt[k];
      Q[2 * j] = Q[2 * i];
      Q[2 * j + 1] = Q[2 * i + 1];
      E[2 * j] = E[2 * i];
      E[2 * j + 1] = E[2 * i + 1];
    }
  }
  const Ms = (work.Ms = grown(work.Ms, 8 * N));
  const dMs = opts.grad ? (work.dMs = grown(work.dMs, 8 * N)) : null;
  for (let j = 0; j < N; j++) layerInto(Q[2 * j], Q[2 * j + 1], E[2 * j], E[2 * j + 1], k0, films[j].d, Ms, 8 * j, dMs);
  const needGrad = !!opts.grad || !!opts.probes?.length;
  // prefix P[j] = M_1…M_j (P[0] = I), suffix S[j] = M_{j+1}…M_N (S[N] = I), 0-based layer j ↔ M_{j+1}
  const P = (work.P = grown(work.P, 8 * (N + 1)));
  setI(P, 0);
  for (let j = 0; j < N; j++) mul(P, 8 * j, Ms, 8 * j, P, 8 * (j + 1));
  let S: Float64Array | null = null;
  if (needGrad) {
    S = work.S = grown(work.S, 8 * (N + 1));
    setI(S, 8 * N);
    for (let j = N - 1; j >= 0; j--) mul(Ms, 8 * j, S, 8 * (j + 1), S, 8 * j);
  }
  const { f, ctx } = facesOf(P, 8 * N, eta0.re, eta0.im, etaS.re, etaS.im);
  const out: CoherentResult = { faces: f };
  const t1 = new Float64Array(8);
  const t2 = new Float64Array(8);
  if (dMs && S) {
    out.grad = new Array<Faces>(N);
    for (let j = 0; j < N; j++) {
      mul(P, 8 * j, dMs, 8 * j, t1, 0);
      mul(t1, 0, S, 8 * (j + 1), t2, 0);
      out.grad[j] = dFaces(t2, 0, ctx);
    }
  }
  if (opts.probes?.length && opts.candidates?.length && S) {
    // needle matrices G = k₀ q [[0, −i/η], [−i η, 0]]
    const G = opts.candidates.map((n) => {
      const q = nCos(n, kxc);
      const e = admittance(n, q, pol);
      const e2 = e.re * e.re + e.im * e.im;
      const ir = e.re / e2, ii = -e.im / e2; // 1/η
      const kr = k0 * q.re, ki = k0 * q.im;
      const g = new Float64Array(8);
      // k q · (−i/η) = k q · (ii − i ir)
      g[2] = kr * ii + ki * ir;
      g[3] = ki * ii - kr * ir;
      // k q · (−i η) = k q · (e.im − i e.re)
      g[4] = kr * e.im + ki * e.re;
      g[5] = ki * e.im - kr * e.re;
      return g;
    });
    const L = new Float64Array(8);
    const Rm = new Float64Array(8);
    const part = new Float64Array(8);
    out.needle = opts.probes.map(({ layer, z }) => {
      if (layer >= N) {
        L.set(P.subarray(8 * N, 8 * N + 8));
        setI(Rm, 0);
      } else {
        layerInto(Q[2 * layer], Q[2 * layer + 1], E[2 * layer], E[2 * layer + 1], k0, z, part, 0);
        mul(P, 8 * layer, part, 0, L, 0);
        layerInto(Q[2 * layer], Q[2 * layer + 1], E[2 * layer], E[2 * layer + 1], k0, films[layer].d - z, part, 0);
        mul(part, 0, S!, 8 * (layer + 1), Rm, 0);
      }
      return G.map((g) => {
        mul(L, 0, g, 0, t1, 0);
        mul(t1, 0, Rm, 0, t2, 0);
        return dFaces(t2, 0, ctx);
      });
    });
  }
  return out;
}

// ---- Thick incoherent substrate: combination of the front and back coatings ----

export type PlateParts = { f: Faces; b: Faces; a: number }; // front coating, back coating (from the substrate), attenuation
export type PlateResult = { R: number; T: number };

export function plate({ f, b, a }: PlateParts): PlateResult {
  const a2 = a * a;
  const den = 1 - f.Rr * b.R * a2;
  return { R: f.R + (f.T * f.Tr * b.R * a2) / den, T: (f.T * b.T * a) / den };
}

// Derivatives of the plate R, T from derivatives of the front (df) and back (db) faces.
export function dPlate({ f, b, a }: PlateParts, df: Faces | null, db: Faces | null): PlateResult {
  const a2 = a * a;
  const den = 1 - f.Rr * b.R * a2;
  const den2 = den * den;
  let dR = 0;
  let dT = 0;
  if (df) {
    dR += df.R + ((df.T * f.Tr + f.T * df.Tr) * b.R * a2) / den + (f.T * f.Tr * b.R * a2 * b.R * a2 * df.Rr) / den2;
    dT += (df.T * b.T * a) / den + (f.T * b.T * a * b.R * a2 * df.Rr) / den2;
  }
  if (db) {
    dR += (f.T * f.Tr * a2 * db.R) / den2;
    dT += (f.T * db.T * a) / den + (f.T * b.T * a * f.Rr * a2 * db.R) / den2;
  }
  return { R: dR, T: dT };
}

// Single-pass intensity attenuation in the substrate.
export const attenuation = (nS: C, kx: number, k0: number, d: number) => Math.exp(-2 * k0 * nCos(nS, X.c(kx)).im * d);
