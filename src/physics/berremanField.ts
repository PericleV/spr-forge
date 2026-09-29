// Fields inside a stack with anisotropic layers (Berreman 4×4, zeroth order): the same Profile as field.ts. The reflected
// and transmitted waves come from the S-matrix solve (rcwaConical.ts); the tangential field ψ = (Ex, Ey, hx, hy) is then
// carried from the exit medium back up through every layer with its modes, ψ(z) = Σ_m Ψ_m c_m e^{i kz_m k₀ (z − z_b)} (a
// helix at normal incidence: in the frame turning with the director, exactly), and Ez, hz follow from Maxwell's equations.
// z = 0 at the first interface, fields relative to the incident wave (|E₀| = 1, h = η₀H so that |h| = n|E|).
import * as X from './complex.ts';
import type { C } from './complex.ts';
import { cmat, solve } from './cmat.ts';
import { anisoModes, helixDelta, isotropicTensor, modesOf, rotatePsi, rotateZ, type AnisoModes, type Tensor } from './berreman.ts';
import { conicalSolve, type IncidentPol } from './rcwaConical.ts';
import type { RcwaLayer } from './rcwa.ts';
import { COMPONENTS, type Complexes, type Component, type Profile } from './field.ts';

type Mode = { psi: C[]; kz: C };
const all = (m: AnisoModes): Mode[] => [...m.fwd, ...m.bwd];

// c = Ψ⁻¹ ψ (the four modes as columns)
function coeffs(modes: Mode[], psi: C[]): C[] {
  const A = cmat(4);
  modes.forEach((m, j) =>
    m.psi.forEach((v, i) => {
      A.re[i * 4 + j] = v.re;
      A.im[i * 4 + j] = v.im;
    }),
  );
  const [xr, xi] = solve(
    A,
    Float64Array.from(psi, (v) => v.re),
    Float64Array.from(psi, (v) => v.im),
  );
  return [0, 1, 2, 3].map((k) => X.c(xr[k], xi[k]));
}
// Σ_m Ψ_m c_m e^{i kz_m s}
const combine = (modes: Mode[], c: C[], s: number): C[] =>
  [0, 1, 2, 3].map((i) => modes.reduce((acc, m, j) => X.add(acc, X.mul(X.mul(m.psi[i], c[j]), X.exp(X.mul(X.c(0, 1), X.mul(m.kz, X.c(s)))))), X.c(0)));

// A layer as the solver sees it: a tensor, its modes and (a helix) the twist; `tensorAt(s)`: ε at depth s (nm) in it.
type Part = { d: number; eps: Tensor; modes: Mode[]; twist: number; tensorAt: (s: number) => Tensor };

export function berremanProfile(
  layers: RcwaLayer[],
  lambda: number,
  thetaDeg: number,
  phiDeg: number,
  pol: IncidentPol,
  z: ArrayLike<number>,
  layerOf: ArrayLike<number>,
): Profile {
  const k0 = (2 * Math.PI) / lambda;
  const n0 = layers[0].n!.re;
  const sol = conicalSolve(layers, 1000, lambda, thetaDeg, phiDeg, pol, 0, 'li', false);
  const kt = n0 * Math.sin((thetaDeg * Math.PI) / 180);
  const ph = (phiDeg * Math.PI) / 180;
  const [kx, ky] = [kt * Math.cos(ph), kt * Math.sin(ph)];
  const normal = kt === 0;
  const tensorOf = (L: RcwaLayer): Tensor => L.eps ?? isotropicTensor(L.n!);
  const N = layers.length;
  // every layer (and the media) as parts; a helix off normal incidence as its sublayers (as the solver slices it)
  const parts: Part[][] = layers.map((L, j) => {
    const eps = j === 0 ? isotropicTensor(X.c(n0)) : tensorOf(L);
    const h = j > 0 && j < N - 1 ? L.helix : undefined;
    if (h && normal) {
      const tw = (h.twist * Math.PI) / 180;
      return [{ d: L.d, eps, twist: tw, modes: all(modesOf(helixDelta(eps, tw / (k0 * L.d)))), tensorAt: (s: number) => rotateZ(eps, (h.twist * s) / L.d) }];
    }
    if (h)
      return Array.from({ length: h.slices }, (_, q) => {
        const e = rotateZ(eps, (h.twist * (q + 0.5)) / h.slices);
        return { d: L.d / h.slices, eps: e, twist: 0, modes: all(anisoModes(e, kx, ky)), tensorAt: () => e };
      });
    return [{ d: j === 0 || j === N - 1 ? 0 : L.d, eps, twist: 0, modes: all(anisoModes(eps, kx, ky)), tensorAt: () => eps }];
  });
  // the incident field: tangential E (e0) and reflected (r) from the solve; the media split into their forward / backward modes
  const vec = (v: [Float64Array, Float64Array]): [C, C] => [X.c(v[0][0], v[1][0]), X.c(v[0][1], v[1][1])];
  const [e0, r, t] = [vec(sol.e0), vec(sol.r), vec(sol.t)];
  const top = parts[0][0].modes;
  const ex = parts[N - 1][0].modes;
  const pairCoeffs = (pair: Mode[], e: [C, C]): C[] => {
    // amplitudes of a pair of modes with this tangential E (2×2)
    const [a, b, c, d] = [pair[0].psi[0], pair[1].psi[0], pair[0].psi[1], pair[1].psi[1]];
    const det = X.sub(X.mul(a, d), X.mul(b, c));
    return [X.div(X.sub(X.mul(d, e[0]), X.mul(b, e[1])), det), X.div(X.sub(X.mul(a, e[1]), X.mul(c, e[0])), det)];
  };
  const cInc = pairCoeffs(top.slice(0, 2), e0);
  const cRef = pairCoeffs(top.slice(2, 4), r);
  const cT = pairCoeffs(ex.slice(0, 2), t);
  // ψ at the bottom face of every part, carried upwards from the exit medium; `c` = its mode amplitudes at that face
  const start: number[] = new Array(N).fill(0);
  let acc = 0;
  for (let j = 1; j < N - 1; j++) {
    start[j] = acc;
    acc += layers[j].d;
  }
  start[N - 1] = acc;
  let psi = combine(ex.slice(0, 2), cT, 0); // at the last interface
  const partState: { z0: number; part: Part; c: C[] }[][] = layers.map(() => []);
  for (let j = N - 2; j >= 1; j--) {
    let zb = start[j] + layers[j].d;
    for (let q = parts[j].length - 1; q >= 0; q--) {
      const P = parts[j][q];
      // a helix: its modes are in the frame turned by the twist at the bottom face
      const chi = P.twist ? rotatePsi(psi, -P.twist) : psi;
      const c = coeffs(P.modes, chi);
      partState[j].unshift({ z0: zb, part: P, c });
      const chiTop = combine(P.modes, c, -k0 * P.d);
      psi = chiTop; // at the top face the helix frame coincides with the lab frame
      zb -= P.d;
    }
  }
  // the field at z (in layer j): ψ, then Ez and hz from the local tensor
  const fieldAt = (j: number, zz: number) => {
    let psiZ: C[];
    let eps: Tensor;
    if (j === 0) {
      const [a, b] = [combine(top.slice(0, 2), cInc, k0 * zz), combine(top.slice(2, 4), cRef, k0 * zz)];
      psiZ = a.map((v, i) => X.add(v, b[i]));
      eps = parts[0][0].eps;
    } else if (j === N - 1) {
      psiZ = combine(ex.slice(0, 2), cT, k0 * (zz - start[N - 1]));
      eps = parts[N - 1][0].eps;
    } else {
      const st = partState[j].find((s) => zz >= s.z0 - s.part.d - 1e-9 && zz <= s.z0 + 1e-9) ?? partState[j][partState[j].length - 1];
      const P = st.part;
      const s = zz - (st.z0 - P.d); // depth in the part
      const chi = combine(P.modes, st.c, k0 * (zz - st.z0));
      psiZ = P.twist ? rotatePsi(chi, (P.twist * s) / P.d) : chi;
      eps = P.tensorAt(s);
    }
    const [Ex, Ey, hx, hy] = psiZ;
    const [, , , , , , ezx, ezy, ezz] = eps;
    // Ez = −(kx hy − ky hx + εzx Ex + εzy Ey) / εzz, hz = kx Ey − ky Ex
    const Ez = X.div(X.mul(X.add(X.sub(X.mul(X.c(kx), hy), X.mul(X.c(ky), hx)), X.add(X.mul(ezx, Ex), X.mul(ezy, Ey))), X.c(-1)), ezz);
    const hz = X.sub(X.mul(X.c(kx), Ey), X.mul(X.c(ky), Ex));
    return { f: { Ex, Ey, Ez, Hx: hx, Hy: hy, Hz: hz } as Record<Component, C>, eps };
  };
  // the incident wave alone: |E₀|² (TE: 1; TM: 1/n₀²; Jones: its own), for the normalization
  const inc0 = combine(top.slice(0, 2), cInc, 0);
  const Ez0 = X.div(X.mul(X.sub(X.mul(X.c(kx), inc0[3]), X.mul(X.c(ky), inc0[2])), X.c(-1)), X.c(n0 * n0));
  const E0sq = X.abs2(inc0[0]) + X.abs2(inc0[1]) + X.abs2(Ez0);
  const cos0 = Math.sqrt(Math.max(0, 1 - (kt / n0) ** 2));
  const m = z.length;
  const mk = () => ({ re: new Float64Array(m), im: new Float64Array(m) });
  const fields = { Ex: mk(), Ey: mk(), Ez: mk(), Hx: mk(), Hy: mk(), Hz: mk() } as Record<Component, Complexes>;
  const E2 = new Float64Array(m);
  const H2 = new Float64Array(m);
  const absorption = new Float64Array(m);
  const norm = 1 / Math.sqrt(E0sq);
  for (let i = 0; i < m; i++) {
    const { f, eps } = fieldAt(layerOf[i], z[i]);
    for (const k of COMPONENTS) {
      fields[k].re[i] = f[k].re * norm;
      fields[k].im[i] = f[k].im * norm;
    }
    const E = [f.Ex, f.Ey, f.Ez];
    E2[i] = (X.abs2(f.Ex) + X.abs2(f.Ey) + X.abs2(f.Ez)) / E0sq;
    H2[i] = (X.abs2(f.Hx) + X.abs2(f.Hy) + X.abs2(f.Hz)) / (E0sq * n0 * n0);
    // absorbed power density: k₀ E†·Im ε·E (ε symmetric), per incident flux n₀ cos θ₀ |E₀|²
    let w = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) w += X.mul(X.conj(E[a]), X.mul(X.c(eps[a * 3 + b].im), E[b])).re;
    absorption[i] = (k0 * w) / (n0 * cos0 * E0sq);
  }
  // flux along z, relative to the incident flux
  const flux = (j: number, zz: number) => {
    const { f } = fieldAt(j, zz);
    return X.sub(X.mul(f.Ex, X.conj(f.Hy)), X.mul(f.Ey, X.conj(f.Hx))).re / (n0 * cos0 * E0sq);
  };
  const layerAbs = layers.map((L, j) => (j === 0 ? 0 : j === N - 1 ? flux(j, start[N - 1]) : flux(j, start[j] + 1e-9) - flux(j, start[j] + L.d - 1e-9)));
  const kzIm = Math.min(...ex.slice(0, 2).map((q) => q.kz.im)) * k0;
  return {
    z: Float64Array.from(z),
    layer: Int32Array.from(layerOf),
    fields,
    E2,
    H2,
    absorption,
    boundaries: start.slice(1),
    layerAbs,
    R: sol.result.Rtot,
    T: sol.result.Ttot,
    decay: kzIm > 1e-12 ? 1 / (2 * kzIm) : Infinity,
  };
}
