// Adaptive spatial resolution (ASR) for the RCWA of 1D gratings: Granet, JOSA A 16, 2510 (1999); multilevel profiles
// with one common mapping through all the edges: Vallius & Honkanen, JOSA A 19, 1555 (2002).
//
// A coordinate change x = x(u) (x, u in units of the period) squeezes x near every edge of the profile, so the Fourier
// harmonics in u resolve the field jumps at the edges better (faster convergence, especially for metals in TM). On each
// interval [k_i, k_i+1] between consecutive edges (knots, width Δ):
//   x(u) = u − η Δ/(2π) sin(2π(u − k_i)/Δ),   f(u) = dx/du = 1 − η cos(2π(u − k_i)/Δ)
// so x(k_i) = k_i (the edges stay in place), f is continuous and periodic, mean 1, smallest (1 − η) at the edges.
// In u the layer equations keep their form with (normalized, Kx = diag(kx_m)):
//   TE: kz² = eig( [[f]]⁻¹ ( [[f ε]] − Kx [[1/f]] Kx ) )
//   TM: kz² = eig( [[1/ε]]⁻¹ [[f]]⁻¹ ( [[f]] − Kx [[f ε]]⁻¹ Kx ) )     (Li's rules: ε Ex and Ez as in x)
// and the v-fields (Hx, Ex) as without the mapping. Uniform layers and the outer media use the modes of the same
// truncated operator (consistent with the grating layers): TE kz² = ε − eig(B), B = [[f]]⁻¹ Kx [[1/f]] Kx; TM
// B = [[f]]⁻¹ Kx [[f]]⁻¹ Kx (ε-independent: every uniform medium has the same eigenvectors). The incident plane wave
// in u-harmonics is the column T_n0, T_nm = ∫₀¹ exp(i 2π(Λ/λ)(kx_m x(u) − kx_n u)) du, and the amplitude of order m of a
// field with u-harmonics y is the exact projection a_m = Σ_n P_mn y_n, P_mn = ∫₀¹ f exp(−i 2π(Λ/λ)(kx_m x(u) − kx_n u)) du
// (plane waves are orthogonal in x). With η = 0 everything reduces to the usual RCWA.
import type { C } from './complex.ts';
import { cmat, type CMat } from './cmat.ts';

export type AsrGeometry = {
  key: string;
  knots: number[];
  intervals: { a: number; b: number }[];
  // quadrature over [0, 1) aligned with the knots (Gauss–Legendre on sub-intervals)
  u: Float64Array;
  x: Float64Array;
  f: Float64Array;
  w: Float64Array;
  iv: Int32Array; // interval of each node
};

// 8-point Gauss–Legendre nodes / weights on [−1, 1]
const GX = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

// The knots: every edge of the grating slices where the material changes (positions in [0, 1), merged within 1e-9;
// a boundary between two segments of the same material, e.g. at x = 0 inside a groove, is not an edge).
type KnotSeg = { from: number; to: number; n?: C; m?: number };
export function asrKnots(segLists: KnotSeg[][]): number[] {
  const raw: number[] = [];
  const same = (a: KnotSeg, b: KnotSeg) => (a.n && b.n ? a.n.re === b.n.re && a.n.im === b.n.im : a.m !== undefined && a.m === b.m);
  for (const segs of segLists) {
    const s = [...segs].sort((a, b) => a.from - b.from);
    for (let i = 0; i < s.length; i++) {
      const next = s[(i + 1) % s.length];
      if (s.length > 1 && !same(s[i], next)) raw.push(((s[i].to % 1) + 1) % 1);
    }
  }
  raw.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of raw) if (!out.length || v - out[out.length - 1] > 1e-9) out.push(v);
  if (out.length > 1 && out[0] + 1 - out[out.length - 1] < 1e-9) out.pop();
  return out;
}

const cache = new Map<string, AsrGeometry>();

// The mapping and a quadrature fine enough for integrands oscillating up to `maxFreq` cycles per period of u.
export function asrGeometry(knots: number[], eta: number, maxFreq: number): AsrGeometry {
  const key = `${eta}|${Math.ceil(maxFreq)}|${knots.map((k) => k.toPrecision(12)).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ks = knots.length ? knots : [0];
  const intervals = ks.map((a, i) => ({ a, b: i + 1 < ks.length ? ks[i + 1] : ks[0] + 1 }));
  // 8-point Gauss on sub-intervals with ω·h ≤ 2.5 (error of e^{iωt} ~ (ωh/2)¹⁶/16! < 1e-11)
  const omega = 2 * Math.PI * (maxFreq + 1);
  const u: number[] = [];
  const x: number[] = [];
  const f: number[] = [];
  const w: number[] = [];
  const iv: number[] = [];
  intervals.forEach(({ a, b }, i) => {
    const D = b - a;
    const sub = Math.max(2, Math.ceil((omega * D) / 2.5));
    const h = D / sub;
    for (let s = 0; s < sub; s++)
      for (let g = 0; g < 8; g++) {
        const uu = a + h * (s + 0.5 + GX[g] / 2);
        const ph = (2 * Math.PI * (uu - a)) / D;
        u.push(uu);
        x.push(uu - ((eta * D) / (2 * Math.PI)) * Math.sin(ph));
        f.push(1 - eta * Math.cos(ph));
        w.push((h / 2) * GW[g]);
        iv.push(i);
      }
  });
  const geo: AsrGeometry = { key, knots: ks, intervals, u: Float64Array.from(u), x: Float64Array.from(x), f: Float64Array.from(f), w: Float64Array.from(w), iv: Int32Array.from(iv) };
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, geo);
  return geo;
}

// Fourier coefficients c_n (n = −K … K) in u of g(u) = weight(interval) · h(f): Σ nodes w g e^{−i2πnu}.
export function asrFourier(geo: AsrGeometry, K: number, h: (f: number) => number, perInterval: (i: number) => C = () => ({ re: 1, im: 0 })): [Float64Array, Float64Array] {
  const re = new Float64Array(2 * K + 1);
  const im = new Float64Array(2 * K + 1);
  const pi = geo.intervals.map((_, i) => perInterval(i));
  for (let j = 0; j < geo.u.length; j++) {
    const val = h(geo.f[j]) * geo.w[j];
    const p = pi[geo.iv[j]];
    const gr = val * p.re;
    const gi = val * p.im;
    // e^{−i2πnu} by recurrence from n = −K
    const th = -2 * Math.PI * geo.u[j];
    const sr = Math.cos(th);
    const si = Math.sin(th);
    let er = Math.cos(-K * th);
    let ei = Math.sin(-K * th);
    for (let n = 0; n <= 2 * K; n++) {
      re[n] += gr * er - gi * ei;
      im[n] += gr * ei + gi * er;
      const t = er * sr - ei * si;
      ei = er * si + ei * sr;
      er = t;
    }
  }
  return [re, im];
}

// Plane waves of the orders in the u-harmonics, T_nm = ∫ exp(i2π pl (kx_m x(u) − kx_n u)) du (pl = Λ/λ), and the same
// with the weight f, Tf, whose conjugate transpose is the projection P onto the orders. kx_m = kx₀ + m/pl, so the
// exponentials follow by recurrence over m and n (two sin / cos pairs per node).
export function asrT(geo: AsrGeometry, kx: Float64Array, pl: number): { T: CMat; Tf: CMat } {
  const M = kx.length;
  const J = geo.u.length;
  const T = cmat(M);
  const Tf = cmat(M);
  const exr = new Float64Array(M);
  const exi = new Float64Array(M);
  const eur = new Float64Array(M);
  const eui = new Float64Array(M);
  const a0 = pl * kx[0];
  for (let j = 0; j < J; j++) {
    const x = geo.x[j];
    const u = geo.u[j];
    // e^{i2π(a0 + m) x} and e^{−i2π(a0 + n) u}
    let [pr, pi] = [Math.cos(2 * Math.PI * a0 * x), Math.sin(2 * Math.PI * a0 * x)];
    const [sr, si] = [Math.cos(2 * Math.PI * x), Math.sin(2 * Math.PI * x)];
    let [qr, qi] = [Math.cos(-2 * Math.PI * a0 * u), Math.sin(-2 * Math.PI * a0 * u)];
    const [tr, ti] = [Math.cos(-2 * Math.PI * u), Math.sin(-2 * Math.PI * u)];
    for (let m = 0; m < M; m++) {
      exr[m] = pr;
      exi[m] = pi;
      eur[m] = qr;
      eui[m] = qi;
      [pr, pi] = [pr * sr - pi * si, pr * si + pi * sr];
      [qr, qi] = [qr * tr - qi * ti, qr * ti + qi * tr];
    }
    const w = geo.w[j];
    const wf = w * geo.f[j];
    for (let n = 0; n < M; n++) {
      const cr = eur[n];
      const ci = eui[n];
      const o = n * M;
      for (let m = 0; m < M; m++) {
        const vr = cr * exr[m] - ci * exi[m];
        const vi = cr * exi[m] + ci * exr[m];
        T.re[o + m] += w * vr;
        T.im[o + m] += w * vi;
        Tf.re[o + m] += wf * vr;
        Tf.im[o + m] += wf * vi;
      }
    }
  }
  return { T, Tf };
}
