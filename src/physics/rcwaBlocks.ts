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
export const mul2 = (a: B2, b: B2): B2 => [
  X.add(X.mul(a[0], b[0]), X.mul(a[1], b[2])),
  X.add(X.mul(a[0], b[1]), X.mul(a[1], b[3])),
  X.add(X.mul(a[2], b[0]), X.mul(a[3], b[2])),
  X.add(X.mul(a[2], b[1]), X.mul(a[3], b[3])),
];
export const add2 = (a: B2, b: B2, s = 1): B2 => [0, 1, 2, 3].map((k) => X.add(a[k], X.mul(X.c(s), b[k]))) as B2;
const scale2 = (a: B2, s: C): B2 => a.map((v) => X.mul(v, s)) as B2;
export function inv2(a: B2): B2 {
  const det = X.sub(X.mul(a[0], a[3]), X.mul(a[1], a[2]));
  const k = X.div(X.c(1), det);
  return [X.mul(a[3], k), X.mul(X.mul(a[1], X.c(-1)), k), X.mul(X.mul(a[2], X.c(-1)), k), X.mul(a[0], k)];
}
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
    const F = inv2(add2(I2, mul2(B.S11[m], A.S22[m]), -1));
    const G = inv2(add2(I2, mul2(A.S22[m], B.S11[m]), -1));
    const AF = mul2(A.S12[m], F);
    const BG = mul2(B.S21[m], G);
    out.S11.push(add2(A.S11[m], mul2(mul2(AF, B.S11[m]), A.S21[m])));
    out.S12.push(mul2(AF, B.S12[m]));
    out.S21.push(mul2(BG, A.S21[m]));
    out.S22.push(add2(B.S22[m], mul2(mul2(BG, A.S22[m]), B.S12[m])));
  });
  return out;
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
