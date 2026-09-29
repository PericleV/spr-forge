// Homogeneous anisotropic layers (Berreman 4×4, D. W. Berreman, JOSA 62, 502 (1972)): a dielectric tensor ε (3×3,
// complex, any orientation), μ = 1. With the tangential fields ψ = (Ex, Ey, hx, hy), h = η₀H, normalized z (k₀z) and
// the in-plane wave vector (kx, ky) of an order, Maxwell's equations give ψ′ = i Δ ψ:
//   Ez = −(kx hy − ky hx + εzx Ex + εzy Ey) / εzz,  hz = kx Ey − ky Ex
//   Ex′ = i (hy + kx Ez),  Ey′ = i (ky Ez − hx)
//   hx′ = i (kx hz − (εE)y),  hy′ = i (ky hz + (εE)x)
// — the equations of the conical RCWA (rcwaConical.ts) for an order, with a full tensor. The four eigenvectors of Δ are
// the modes (kz its eigenvalues): two go forward (Im kz > 0, or the Poynting flux Sz > 0 when kz is real), two back.
// The S-matrix of a layer between two gap media (the basis of rcwaConical.ts) comes from the continuity of ψ at both
// faces, with the backward modes referred to the bottom face — every exponential ≤ 1 (stable for thick or lossy layers).
import * as X from './complex.ts';
import type { C } from './complex.ts';
import { cmat, eig, solve, type CMat } from './cmat.ts';
import { add2, inv2, mul2, type B2, type BlockS } from './rcwaBlocks.ts';

export type Tensor = C[]; // 3×3, row-major: xx xy xz / yx yy yz / zx zy zz

// Uniaxial ε = ε_o I + (ε_e − ε_o) â âᵀ with the optic axis â at `tilt` from the layer plane (degrees; 90° = along z,
// the normal) and `azim` in the plane from x (degrees).
export function uniaxial(no: C, ne: C, tilt: number, azim: number): Tensor {
  const [t, a] = [(tilt * Math.PI) / 180, (azim * Math.PI) / 180];
  const ax = [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)];
  const eo = X.mul(no, no);
  const de = X.sub(X.mul(ne, ne), eo);
  const out: Tensor = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(X.add(i === j ? eo : X.c(0), X.mul(de, X.c(ax[i] * ax[j]))));
  return out;
}

// Biaxial ε = R diag(n₁², n₂², n₃²) Rᵀ, R = Rz(α) Rx(β) Rz(γ) (Euler z-x-z, degrees): the principal axes turned by α about z,
// tilted by β, turned by γ.
export function biaxial(n1: C, n2: C, n3: C, alpha: number, beta: number, gamma: number): Tensor {
  const r = Math.PI / 180;
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(alpha * r), Math.sin(alpha * r), Math.cos(beta * r), Math.sin(beta * r), Math.cos(gamma * r), Math.sin(gamma * r)];
  const R = [
    [ca * cg - sa * cb * sg, -ca * sg - sa * cb * cg, sa * sb],
    [sa * cg + ca * cb * sg, -sa * sg + ca * cb * cg, -ca * sb],
    [sb * sg, sb * cg, cb],
  ];
  const d = [X.mul(n1, n1), X.mul(n2, n2), X.mul(n3, n3)];
  const out: Tensor = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let v = X.c(0);
      for (let k = 0; k < 3; k++) v = X.add(v, X.mul(d[k], X.c(R[i][k] * R[j][k])));
      out.push(v);
    }
  return out;
}

export const isotropicTensor = (n: C): Tensor => {
  const e = X.mul(n, n);
  return [e, X.c(0), X.c(0), X.c(0), e, X.c(0), X.c(0), X.c(0), e];
};

// Δ of an order (row-major 4×4) for ψ = (Ex, Ey, hx, hy).
function delta(eps: Tensor, kx: number, ky: number): CMat {
  const [exx, exy, exz, eyx, eyy, eyz, ezx, ezy, ezz] = eps;
  const iz = X.div(X.c(1), ezz);
  // Ez = a·ψ with a = (−εzx/εzz, −εzy/εzz, ky/εzz, −kx/εzz)
  const a: C[] = [X.mul(X.mul(ezx, iz), X.c(-1)), X.mul(X.mul(ezy, iz), X.c(-1)), X.mul(iz, X.c(ky)), X.mul(iz, X.c(-kx))];
  const hz: C[] = [X.c(-ky), X.c(kx), X.c(0), X.c(0)];
  const E: C[][] = [
    [X.c(1), X.c(0), X.c(0), X.c(0)],
    [X.c(0), X.c(1), X.c(0), X.c(0)],
  ]; // Ex, Ey as rows over ψ
  const rowOf = (f: (k: number) => C) => [0, 1, 2, 3].map(f);
  // (εE)x = εxx Ex + εxy Ey + εxz Ez, (εE)y likewise
  const epsE = (c0: C, c1: C, c2: C) => rowOf((k) => X.add(X.add(X.mul(c0, E[0][k]), X.mul(c1, E[1][k])), X.mul(c2, a[k])));
  const eX = epsE(exx, exy, exz);
  const eY = epsE(eyx, eyy, eyz);
  const rows: C[][] = [
    rowOf((k) => X.add(k === 3 ? X.c(1) : X.c(0), X.mul(X.c(kx), a[k]))), // Ex′/i = hy + kx Ez
    rowOf((k) => X.sub(X.mul(X.c(ky), a[k]), k === 2 ? X.c(1) : X.c(0))), // Ey′/i = ky Ez − hx
    rowOf((k) => X.sub(X.mul(X.c(kx), hz[k]), eY[k])), // hx′/i = kx hz − (εE)y
    rowOf((k) => X.add(X.mul(X.c(ky), hz[k]), eX[k])), // hy′/i = ky hz + (εE)x
  ];
  const D = cmat(4);
  rows.forEach((r, i) =>
    r.forEach((v, j) => {
      D.re[i * 4 + j] = v.re;
      D.im[i * 4 + j] = v.im;
    }),
  );
  return D;
}

// The four modes of an order: forward (2) and backward (2), each a column ψ and its kz.
export type AnisoModes = { fwd: { psi: C[]; kz: C }[]; bwd: { psi: C[]; kz: C }[] };
export const anisoModes = (eps: Tensor, kx: number, ky: number): AnisoModes => modesOf(delta(eps, kx, ky));

// A cholesteric at normal incidence (kx = ky = 0): Δ commutes with rotations about z, so in the frame turning with the director,
// ψ = 𝓡(φ(z)) χ with 𝓡 = diag(R, R) acting on (Ex, Ey) and (hx, hy), χ′ = i Δ_R χ with the constant Δ_R = Δ₀ + i φ′ G,
// G = diag(J, J), J = [[0, −1], [1, 0]] (Rᵀ dR/dφ), φ′ = dφ / d(k₀z): the helix is solved exactly, without sublayers
// (Oseen, de Vries; the transfer matrix of D. W. Berreman, JOSA 62, 502 (1972) in the rotating basis).
export function helixDelta(eps: Tensor, rate: number): CMat {
  const D = delta(eps, 0, 0);
  for (const [i, j, g] of [
    [0, 1, -1],
    [1, 0, 1],
    [2, 3, -1],
    [3, 2, 1],
  ])
    D.im[i * 4 + j] += rate * g;
  return D;
}
// ψ turned by `turn` (radians) about z: (Ex, Ey) and (hx, hy) as vectors
export const rotatePsi = (psi: C[], turn: number): C[] => {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const rot = (x: C, y: C): [C, C] => [X.sub(X.mul(X.c(c), x), X.mul(X.c(s), y)), X.add(X.mul(X.c(s), x), X.mul(X.c(c), y))];
  return [...rot(psi[0], psi[1]), ...rot(psi[2], psi[3])];
};
// ε turned by π about y (x → −x, z → −z): the xy and yz components change sign
export const flipY = (eps: Tensor): Tensor => eps.map((v, k) => ([1, 3, 5, 7].includes(k) ? X.mul(v, X.c(-1)) : v));

// ε turned by `deg` about z: R ε Rᵀ
export function rotateZ(eps: Tensor, deg: number): Tensor {
  const t = (deg * Math.PI) / 180;
  const R = [
    [Math.cos(t), -Math.sin(t), 0],
    [Math.sin(t), Math.cos(t), 0],
    [0, 0, 1],
  ];
  const out: Tensor = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let v = X.c(0);
      for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) if (R[i][k] && R[j][l]) v = X.add(v, X.mul(eps[k * 3 + l], X.c(R[i][k] * R[j][l])));
      out.push(v);
    }
  return out;
}

export function modesOf(D: CMat): AnisoModes {
  const ev = eig(D);
  const modes = [0, 1, 2, 3].map((j) => {
    const psi = [0, 1, 2, 3].map((i) => X.c(ev.vec.re[i * 4 + j], ev.vec.im[i * 4 + j]));
    const kz = X.c(ev.valRe[j], ev.valIm[j]);
    // time-averaged Poynting flux along z: Re(Ex hy* − Ey hx*)
    const sz = X.sub(X.mul(psi[0], X.conj(psi[3])), X.mul(psi[1], X.conj(psi[2]))).re;
    return { psi, kz, sz };
  });
  const scale = Math.max(1, ...modes.map((m) => Math.hypot(m.kz.re, m.kz.im)));
  const forward = (m: (typeof modes)[number]) => (Math.abs(m.kz.im) > 1e-10 * scale ? m.kz.im > 0 : m.sz > 0);
  const fwd = modes.filter(forward);
  const bwd = modes.filter((m) => !forward(m));
  if (fwd.length !== 2 || bwd.length !== 2) throw new Error('anisotropic layer: the modes could not be split into two forward and two backward waves');
  // a degenerate pair (isotropic medium, a wave along the optic axis): every (Ex, Ey) belongs to the eigenspace, but the
  // eigenvectors of eig may come out nearly parallel (an ill-conditioned basis). Rebuild it from Ex, Ey = x̂, ŷ, with
 // (hx, hy) from the first two rows of (Δ − kz) ψ = 0: B h = (kz − Δ₀₀) E, B = Δ[0:2, 2:4]
  const d = (i: number, j: number) => X.c(D.re[i * 4 + j], D.im[i * 4 + j]);
  const fix = (pair: typeof fwd) => {
    if (Math.sqrt(X.abs2(X.sub(pair[0].kz, pair[1].kz))) > 1e-8 * scale) return pair;
    const kz = X.mul(X.add(pair[0].kz, pair[1].kz), X.c(0.5));
    const [b00, b01, b10, b11] = [d(0, 2), d(0, 3), d(1, 2), d(1, 3)];
    const det = X.sub(X.mul(b00, b11), X.mul(b01, b10));
    return [0, 1].map((m) => {
      const E = [X.c(m === 0 ? 1 : 0), X.c(m === 1 ? 1 : 0)];
      // r = (kz − Δ₀₀) E
      const r = [0, 1].map((i) => X.sub(X.mul(kz, E[i]), X.add(X.mul(d(i, 0), E[0]), X.mul(d(i, 1), E[1]))));
      const hx = X.div(X.sub(X.mul(b11, r[0]), X.mul(b01, r[1])), det);
      const hy = X.div(X.sub(X.mul(b00, r[1]), X.mul(b10, r[0])), det);
      const psi = [E[0], E[1], hx, hy];
      return { psi, kz, sz: X.sub(X.mul(psi[0], X.conj(psi[3])), X.mul(psi[1], X.conj(psi[2]))).re };
    });
  };
  return { fwd: fix(fwd), bwd: fix(bwd) };
}

// The tangential-E and tangential-h matrices (2×2: rows Ex, Ey / hx, hy; columns the two modes) of a pair of modes.
const pairWH = (p: { psi: C[] }[]): [B2, B2] => [
  [p[0].psi[0], p[1].psi[0], p[0].psi[1], p[1].psi[1]],
  [p[0].psi[2], p[1].psi[2], p[0].psi[3], p[1].psi[3]],
];
const I2: B2 = [X.c(1), X.c(0), X.c(0), X.c(1)];

// S of a semi-infinite anisotropic exit medium against the gap, per order (the 'trn' side, amplitudes = tangential E, as the
// uniform regions of rcwaBlocks.ts). Outgoing (forward) waves: h = V_f e, V_f = H_f W_f⁻¹; incoming (backward): h = V_b e —
// unlike an isotropic medium V_b ≠ −V_f. Continuity with the gap (e = a⁺ + a⁻, h = V₀(a⁺ − a⁻)) gives, with P = I + V₀⁻¹V_f and
// Q = I + V₀⁻¹V_b: S11 = 2P⁻¹ − I, S21 = 2P⁻¹, S12 = I − P⁻¹Q, S22 = −P⁻¹Q (V_b = −V_f: the isotropic formulas).
export function anisoRegionBlock(eps: Tensor, kx: Float64Array, ky: number, V0i: B2[]): BlockS {
  const out: BlockS = { S11: [], S12: [], S21: [], S22: [] };
  kx.forEach((k, m) => {
    const md = anisoModes(eps, k, ky);
    const [Wf, Hf] = pairWH(md.fwd);
    const [Wb, Hb] = pairWH(md.bwd);
    const P = add2(I2, mul2(V0i[m], mul2(Hf, inv2(Wf))));
    const Q = add2(I2, mul2(V0i[m], mul2(Hb, inv2(Wb))));
    const Pi = inv2(P);
    const PiQ = mul2(Pi, Q);
    const two = add2(Pi, Pi);
    out.S11.push(add2(two, I2, -1));
    out.S21.push(two);
    out.S12.push(add2(I2, PiQ, -1));
    out.S22.push(add2([X.c(0), X.c(0), X.c(0), X.c(0)], PiQ, -1));
  });
  return out;
}

// Power flux along z (Re(Ex hy* − Ey hx*), h = η₀H) of the outgoing wave with tangential E `e` in an anisotropic half-space.
export function anisoExitFlux(eps: Tensor, kx: number, ky: number, e: [C, C]): number {
  const [W, H] = pairWH(anisoModes(eps, kx, ky).fwd);
  const Wi = inv2(W);
  const cm = [X.add(X.mul(Wi[0], e[0]), X.mul(Wi[1], e[1])), X.add(X.mul(Wi[2], e[0]), X.mul(Wi[3], e[1]))];
  const hx = X.add(X.mul(H[0], cm[0]), X.mul(H[1], cm[1]));
  const hy = X.add(X.mul(H[2], cm[0]), X.mul(H[3], cm[1]));
  return X.sub(X.mul(e[0], X.conj(hy)), X.mul(e[1], X.conj(hx))).re;
}

// S of an anisotropic layer (thickness k₀d) between two gap media, for every order (kx_m, ky), in the 2×2 blocks of
// rcwaBlocks.ts. V0 of the gap per order is given by its inverse V0i (the gap: W₀ = I, forward h = V₀ e, backward −V₀ e).
// twist (radians, normal incidence only): a helix whose director turns by `twist` from the top face (where the tensor is
// `eps`) to the bottom — modes of Δ_R, the bottom-face vectors turned by `twist`.
export function anisoLayerBlock(eps: Tensor, kx: Float64Array, ky: number, k0d: number, V0i: B2[], twist = 0): BlockS {
  const out: BlockS = { S11: [], S12: [], S21: [], S22: [] };
  if (twist && (ky !== 0 || kx.some((k) => k !== 0))) throw new Error('the exact helix needs normal incidence (slice it otherwise)');
  kx.forEach((k, m) => {
    const md0 = twist ? modesOf(helixDelta(eps, twist / k0d)) : anisoModes(eps, k, ky);
    // mode vectors at the top face (psi) and at the bottom face (bot)
    const md = {
      fwd: md0.fwd.map((f) => ({ ...f, bot: twist ? rotatePsi(f.psi, twist) : f.psi })),
      bwd: md0.bwd.map((f) => ({ ...f, bot: twist ? rotatePsi(f.psi, twist) : f.psi })),
    };
    // V₀ = (V₀⁻¹)⁻¹ (2×2)
    const vi = V0i[m];
    const det = X.sub(X.mul(vi[0], vi[3]), X.mul(vi[1], vi[2]));
    const V0: B2 = [X.div(vi[3], det), X.div(X.mul(vi[1], X.c(-1)), det), X.div(X.mul(vi[2], X.c(-1)), det), X.div(vi[0], det)];
    // G0a = [I; V0] (forward gap wave), G0b = [I; −V0] (backward)
    const G0a = (i: number, j: number): C => (i < 2 ? X.c(i === j ? 1 : 0) : V0[(i - 2) * 2 + j]);
    const G0b = (i: number, j: number): C => (i < 2 ? X.c(i === j ? 1 : 0) : X.mul(V0[(i - 2) * 2 + j], X.c(-1)));
    const dP = md.fwd.map((f) => X.exp(X.mul(X.c(0, 1), X.mul(f.kz, X.c(k0d))))); // e^{i kz⁺ d}
    const dM = md.bwd.map((b) => X.exp(X.mul(X.c(0, -1), X.mul(b.kz, X.c(k0d))))); // e^{−i kz⁻ d}
    // unknowns [a1⁻ (2), a2⁺ (2), c⁺ (2), c⁻ (2)]; rows 0–3: top face, 4–7: bottom face
    const A = cmat(8);
    const put = (i: number, j: number, v: C) => {
      A.re[i * 8 + j] = v.re;
      A.im[i * 8 + j] = v.im;
    };
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        put(i, j, G0b(i, j)); // top: G0b a1⁻
        put(4 + i, 2 + j, G0a(i, j)); // bottom: G0a a2⁺
        put(i, 4 + j, X.mul(md.fwd[j].psi[i], X.c(-1))); // top: −Ψ⁺ c⁺
        put(i, 6 + j, X.mul(X.mul(md.bwd[j].psi[i], dM[j]), X.c(-1))); // top: −Ψ⁻ D⁻ c⁻
        put(4 + i, 4 + j, X.mul(X.mul(md.fwd[j].bot[i], dP[j]), X.c(-1))); // bottom: −Ψ⁺ D⁺ c⁺
        put(4 + i, 6 + j, X.mul(md.bwd[j].bot[i], X.c(-1))); // bottom: −Ψ⁻ c⁻
      }
    }
    // four right-hand sides: a1⁺ = e_j (top: −G0a e_j), a2⁻ = e_j (bottom: −G0b e_j)
    const col = (top: boolean, j: number) => {
      const br = new Float64Array(8);
      const bi = new Float64Array(8);
      for (let i = 0; i < 4; i++) {
        const v = top ? G0a(i, j) : G0b(i, j);
        br[(top ? 0 : 4) + i] = -v.re;
        bi[(top ? 0 : 4) + i] = -v.im;
      }
      const [xr, xi] = solve(A, br, bi);
      return [0, 1, 2, 3].map((k) => X.c(xr[k], xi[k])); // a1⁻ (0, 1), a2⁺ (2, 3)
    };
    const [t0, t1, b0, b1] = [col(true, 0), col(true, 1), col(false, 0), col(false, 1)];
    // S11: a1⁺ → a1⁻, S21: a1⁺ → a2⁺, S12: a2⁻ → a1⁻, S22: a2⁻ → a2⁺ (columns = the inputs)
    out.S11.push([t0[0], t1[0], t0[1], t1[1]]);
    out.S21.push([t0[2], t1[2], t0[3], t1[3]]);
    out.S12.push([b0[0], b1[0], b0[1], b1[1]]);
    out.S22.push([b0[2], b1[2], b0[3], b1[3]]);
  });
  return out;
}
