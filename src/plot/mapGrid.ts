// Colour-map helpers: fractional positions, bilinear values, Gaussian blur, log colour-bar ticks.
import { niceTicks } from './scale.ts';

// Position of p between the samples v (monotonic) as a fractional index, clamped to the ends.
export function fracIndex(v: number[], p: number): number {
  const n = v.length;
  if (n < 2) return 0;
  const up = v[n - 1] > v[0];
  if (up ? p <= v[0] : p >= v[0]) return 0;
  if (up ? p >= v[n - 1] : p <= v[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (up ? v[m] <= p : v[m] >= p) lo = m;
    else hi = m;
  }
  return lo + (p - v[lo]) / (v[hi] - v[lo]);
}

// Bilinear value of g (row-major, nx columns) at fractional (row, col); missing neighbours fall back to the nearest.
export function bilinear(g: ArrayLike<number>, nx: number, ny: number, fr: number, fc: number): number {
  const r0 = Math.min(ny - 1, Math.floor(fr));
  const c0 = Math.min(nx - 1, Math.floor(fc));
  const r1 = Math.min(ny - 1, r0 + 1);
  const c1 = Math.min(nx - 1, c0 + 1);
  const tr = fr - r0;
  const tc = fc - c0;
  const a = g[r0 * nx + c0];
  const b = g[r0 * nx + c1];
  const c = g[r1 * nx + c0];
  const d = g[r1 * nx + c1];
  if (![a, b, c, d].every(Number.isFinite)) return g[Math.round(fr) * nx + Math.round(fc)];
  return (a * (1 - tc) + b * tc) * (1 - tr) + (c * (1 - tc) + d * tc) * tr;
}

// Separable Gaussian blur of a grid (σ in cells); missing values are skipped (weights renormalised).
export function gaussianBlur(g: ArrayLike<number>, nx: number, ny: number, sigma: number): Float64Array {
  const R = Math.max(1, Math.ceil(3 * sigma));
  const w = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-((k - R) ** 2) / (2 * sigma * sigma)));
  const pass = (src: ArrayLike<number>, horizontal: boolean) => {
    const out = new Float64Array(nx * ny);
    for (let r = 0; r < ny; r++)
      for (let c = 0; c < nx; c++) {
        let s = 0;
        let ws = 0;
        for (let k = -R; k <= R; k++) {
          const rr = horizontal ? r : r + k;
          const cc = horizontal ? c + k : c;
          if (rr < 0 || rr >= ny || cc < 0 || cc >= nx) continue;
          const v = src[rr * nx + cc];
          if (!Number.isFinite(v)) continue;
          s += w[k + R] * v;
          ws += w[k + R];
        }
        out[r * nx + c] = Number.isFinite(src[r * nx + c]) && ws > 0 ? s / ws : NaN;
      }
    return out;
  };
  return pass(pass(g, true), false);
}

// Colour-bar ticks of a log10 range: whole decades (1e-3, 0.01, 0.1, 1, 10 …), else nice steps within one decade.
export function logTicks(z0: number, z1: number): { v: number; text: string }[] {
  const fmt = (e: number) => {
    const v = 10 ** e;
    return Math.abs(e) >= 4 ? `1e${Math.round(e)}` : `${+v.toPrecision(2)}`;
  };
  if (z1 - z0 >= 1) {
    const out: { v: number; text: string }[] = [];
    const step = Math.max(1, Math.ceil((z1 - z0) / 6));
    for (let e = Math.ceil(z0); e <= Math.floor(z1); e += step) out.push({ v: e, text: fmt(e) });
    return out;
  }
  return niceTicks(z0, z1, 4).map((t) => ({ v: t.v, text: `${+(10 ** t.v).toPrecision(2)}` }));
}

// Values above the cap: set to the cap (saturated) or removed (NaN, not drawn); no cap = unchanged.
export function capValues(values: Float64Array, cap: number | undefined, hide: boolean): Float64Array {
  if (cap === undefined || !Number.isFinite(cap)) return values;
  return values.map((v) => (v > cap ? (hide ? NaN : cap) : v));
}
