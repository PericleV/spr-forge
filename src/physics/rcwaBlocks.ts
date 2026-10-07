// Scattering matrices that are block-diagonal over the diffraction orders: a uniform layer (or region) under conical
// incidence couples only the two polarizations of each order, so each of S11 … S22 is one 2×2 complex block per order
// (rows / columns m and M + m of the dense 2M × 2M matrix of rcwaConical.ts). Consecutive uniform layers are combined
// order by order before the dense algebra of the grating layers.
import * as X from './complex.ts';
import type { C } from './complex.ts';
import { cmat, type CMat } from './cmat.ts';
import type { SMat } from './rcwa.ts';

export type B2 = [C, C, C, C]; // [a11, a12, a21, a22]
export type BlockS = { S11: B2[]; S12: B2[]; S21: B2[]; S22: B2[] };

const I2: B2 = [X.c(1), X.c(0), X.c(0), X.c(1)];
// (real arithmetic inside: these run for every layer of every Berreman point; only the results are allocated)
// a·b + c·d
const mad = (a: C, b: C, c: C, d: C): C => X.c(a.re * b.re - a.im * b.im + c.re * d.re - c.im * d.im, a.re * b.im + a.im * b.re + c.re * d.im + c.im * d.re);
export const mul2 = (a: B2, b: B2): B2 => [mad(a[0], b[0], a[1], b[2]), mad(a[0], b[1], a[1], b[3]), mad(a[2], b[0], a[3], b[2]), mad(a[2], b[1], a[3], b[3])];
export const add2 = (a: B2, b: B2, s = 1): B2 => [
  X.c(a[0].re + s * b[0].re, a[0].im + s * b[0].im),
  X.c(a[1].re + s * b[1].re, a[1].im + s * b[1].im),
  X.c(a[2].re + s * b[2].re, a[2].im + s * b[2].im),
  X.c(a[3].re + s * b[3].re, a[3].im + s * b[3].im),
];
const scale2 = (a: B2, s: C): B2 => a.map((v) => X.mul(v, s)) as B2;
export function inv2(a: B2): B2 {
  // 1 / det
  const dr = a[0].re * a[3].re - a[0].im * a[3].im - (a[1].re * a[2].re - a[1].im * a[2].im);
  const di = a[0].re * a[3].im + a[0].im * a[3].re - (a[1].re * a[2].im + a[1].im * a[2].re);
  const q = dr * dr + di * di;
  const kr = dr / q;
  const ki = -di / q;
  const m = (v: C, s: number) => X.c(s * (v.re * kr - v.im * ki), s * (v.re * ki + v.im * kr));
  return [m(a[3], 1), m(a[1], -1), m(a[2], -1), m(a[0], 1)];
}
// I − a·b
const imm2 = (a: B2, b: B2): B2 => {
  const p = mul2(a, b);
  return [X.c(1 - p[0].re, -p[0].im), X.c(-p[1].re, -p[1].im), X.c(-p[2].re, -p[2].im), X.c(1 - p[3].re, -p[3].im)];
};
const mulV2 = (a: B2, x: [C, C]): [C, C] => [X.add(X.mul(a[0], x[0]), X.mul(a[1], x[1])), X.add(X.mul(a[2], x[0]), X.mul(a[3], x[1]))];

// S of a uniform layer between gap media: per order V (2×2), V₀⁻¹ (2×2) and the phase e^{i kz k₀d} (both polarizations).
export function blockLayerS(V: B2[], V0i: B2[], X0: C[]): BlockS {
  const S11: B2[] = [];
  const S12: B2[] = [];
  V.forEach((v, m) => {
    const q = mul2(V0i[m], v);
    const P = add2(I2, q);
    const Mm = add2(I2, q, -1);
    const Pinv = inv2(P);
    const MXPi = scale2(mul2(Mm, Pinv), X0[m]);
    const Dinv = inv2(add2(P, scale2(mul2(MXPi, Mm), X0[m]), -1));
    const PX = scale2(P, X0[m]);
    S11.push(add2(mul2(Mm, Dinv), mul2(mul2(PX, Dinv), MXPi), -1));
    S12.push(add2(mul2(PX, Dinv), mul2(mul2(Mm, Dinv), MXPi), -1));
  });
  return { S11, S12, S21: S12, S22: S11 };
}

// S of a uniform semi-infinite region against the gap.
export function blockRegionS(V: B2[], V0i: B2[], side: 'ref' | 'trn'): BlockS {
  const out: BlockS = { S11: [], S12: [], S21: [], S22: [] };
  V.forEach((v, m) => {
    const q = mul2(V0i[m], v);
    const P = add2(I2, q);
    const Mm = add2(I2, q, -1);
    const Pinv = inv2(P);
    const half = scale2(add2(P, mul2(mul2(Mm, Pinv), Mm), -1), X.c(0.5));
    const vals: B2[] =
      side === 'ref' ? [scale2(mul2(Pinv, Mm), X.c(-1)), scale2(Pinv, X.c(2)), half, mul2(Mm, Pinv)] : [mul2(Mm, Pinv), half, scale2(Pinv, X.c(2)), scale2(mul2(Pinv, Mm), X.c(-1))];
    out.S11.push(vals[0]);
    out.S12.push(vals[1]);
    out.S21.push(vals[2]);
    out.S22.push(vals[3]);
  });
  return out;
}

// Redheffer star product A ⋆ B, order by order.
export function starBB(A: BlockS, B: BlockS): BlockS {
  const out: BlockS = { S11: [], S12: [], S21: [], S22: [] };
  A.S11.forEach((_, m) => {
    const F = inv2(imm2(B.S11[m], A.S22[m]));
    const G = inv2(imm2(A.S22[m], B.S11[m]));
    const AF = mul2(A.S12[m], F);
    const BG = mul2(B.S21[m], G);
    out.S11.push(add2(A.S11[m], mul2(mul2(AF, B.S11[m]), A.S21[m])));
    out.S12.push(mul2(AF, B.S12[m]));
    out.S21.push(mul2(BG, A.S21[m]));
    out.S22.push(add2(B.S22[m], mul2(mul2(BG, A.S22[m]), B.S12[m])));
  });
  return out;
}

// ---- Isotropic runs, per polarization ----
// In the basis (k̂t, ŝ) of an order (k̂t along its in-plane wave vector, ŝ = ẑ × k̂t) an isotropic medium has
// V = [[0, −kz], [ε/kz, 0]] and the gap V₀⁻¹ = [[0, p], [r, 0]], so q = V₀⁻¹V = diag(p ε/kz, −r kz): TM (k̂t) and TE (ŝ)
// decouple. A run of isotropic layers (and the isotropic regions around it) is then two scalar S-matrix chains per order,
// turned back into the 2×2 blocks (basis x, y) once: B = R diag(TM, TE) Rᵀ, R = [k̂t ŝ].
export type S4 = [C, C, C, C]; // S11, S12, S21, S22 of one polarization
export const S4_ID: S4 = [X.c(0), X.c(1), X.c(1), X.c(0)];

// a uniform layer: q of the polarization, X = e^{i kz k₀d}
export function scalarLayerS(q: C, Xp: C): S4 {
  const one = X.c(1);
  const P = X.add(one, q);
  const Mm = X.sub(one, q);
  const MXPi = X.mul(X.div(Mm, P), Xp);
  const Dinv = X.div(one, X.sub(P, X.mul(X.mul(MXPi, Mm), Xp)));
  const PX = X.mul(P, Xp);
  const s11 = X.sub(X.mul(Mm, Dinv), X.mul(X.mul(PX, Dinv), MXPi));
  const s12 = X.sub(X.mul(PX, Dinv), X.mul(X.mul(Mm, Dinv), MXPi));
  return [s11, s12, s12, s11];
}

// a semi-infinite uniform region against the gap
export function scalarRegionS(q: C, side: 'ref' | 'trn'): S4 {
  const one = X.c(1);
  const P = X.add(one, q);
  const Mm = X.sub(one, q);
  const Pinv = X.div(one, P);
  const MP = X.mul(Mm, Pinv);
  const half = X.mul(X.sub(P, X.mul(MP, Mm)), X.c(0.5));
  const two = X.mul(Pinv, X.c(2));
  return side === 'ref' ? [X.mul(MP, X.c(-1)), two, half, MP] : [MP, half, two, X.mul(MP, X.c(-1))];
}

// Redheffer star product of two scalar S-matrices
export function starS(A: S4, B: S4): S4 {
  const F = X.div(X.c(1), X.sub(X.c(1), X.mul(B[0], A[3])));
  const AF = X.mul(A[1], F);
  const BF = X.mul(B[2], F);
  return [X.add(A[0], X.mul(X.mul(AF, B[0]), A[2])), X.mul(AF, B[1]), X.mul(BF, A[2]), X.add(B[3], X.mul(X.mul(BF, A[3]), B[1]))];
}

// the blocks of an order from its TM and TE chains (ux, uy: k̂t)
export function blocksOf(tm: S4, te: S4, ux: number, uy: number): BlockS {
  const xx = ux * ux;
  const yy = uy * uy;
  const xy = ux * uy;
  const b = (t: C, e: C): B2 => {
    const d = X.mul(X.sub(t, e), X.c(xy));
    return [X.add(X.mul(t, X.c(xx)), X.mul(e, X.c(yy))), d, d, X.add(X.mul(t, X.c(yy)), X.mul(e, X.c(xx)))];
  };
  return { S11: [b(tm[0], te[0])], S12: [b(tm[1], te[1])], S21: [b(tm[2], te[2])], S22: [b(tm[3], te[3])] };
}

// The dense 2M × 2M form (Ex block, then Ey block).
function dense(b: B2[]): CMat {
  const M = b.length;
  const a = cmat(2 * M);
  const put = (r: number, col: number, v: C) => {
    a.re[r * 2 * M + col] = v.re;
    a.im[r * 2 * M + col] = v.im;
  };
  b.forEach((v, m) => {
    put(m, m, v[0]);
    put(m, M + m, v[1]);
    put(M + m, m, v[2]);
    put(M + m, M + m, v[3]);
  });
  return a;
}
export const toDense = (S: BlockS): SMat => ({ S11: dense(S.S11), S12: dense(S.S12), S21: dense(S.S21), S22: dense(S.S22) });

// y = S x for a 2M vector (Ex block, Ey block).
export function blockApply(b: B2[], x: [Float64Array, Float64Array]): [Float64Array, Float64Array] {
  const M = b.length;
  const out: [Float64Array, Float64Array] = [new Float64Array(2 * M), new Float64Array(2 * M)];
  b.forEach((v, m) => {
    const [p, q] = mulV2(v, [X.c(x[0][m], x[1][m]), X.c(x[0][M + m], x[1][M + m])]);
    [out[0][m], out[1][m], out[0][M + m], out[1][M + m]] = [p.re, p.im, q.re, q.im];
  });
  return out;
}
