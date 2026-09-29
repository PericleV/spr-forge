// Resonance metrics on a sampled curve y(x) with ascending x.

// Index window [i0, i1] covering the interval [lo, hi] (NaN = open end).
// x inside [lo, hi]; a non-finite bound (NaN, or null from an old project file) leaves that side open.
export const inWindow = (x: number, lo: number, hi: number) => (!Number.isFinite(lo) || x >= lo) && (!Number.isFinite(hi) || x <= hi);

export function windowOf(xs: ArrayLike<number>, lo: number, hi: number): [number, number] {
  let i0 = 0;
  let i1 = xs.length - 1;
  if (Number.isFinite(lo)) while (i0 < xs.length && xs[i0] < lo) i0++;
  if (Number.isFinite(hi)) while (i1 >= 0 && xs[i1] > hi) i1--;
  return [i0, i1];
}

export type Extremum = { x: number; y: number; i: number };

// Global minimum or maximum in the window, refined by a parabola through the three samples around it.
export function extremum(xs: ArrayLike<number>, ys: ArrayLike<number>, i0: number, i1: number, mode: 'min' | 'max'): Extremum {
  const sgn = mode === 'min' ? 1 : -1;
  let k = -1;
  for (let i = i0; i <= i1; i++) if (Number.isFinite(ys[i]) && (k < 0 || sgn * ys[i] < sgn * ys[k])) k = i;
  if (k < 0) return { x: NaN, y: NaN, i: -1 };
  if (k === i0 || k === i1) return { x: xs[k], y: ys[k], i: k };
  const [x0, x1, x2] = [xs[k - 1], xs[k], xs[k + 1]];
  const [y0, y1, y2] = [ys[k - 1], ys[k], ys[k + 1]];
  const den = (x0 - x1) * (x0 - x2) * (x1 - x2);
  const A = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / den;
  const B = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / den;
  const C = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / den;
  const xv = -B / (2 * A);
  if (!(sgn * A > 0) || !(xv >= x0 && xv <= x2)) return { x: x1, y: y1, i: k };
  return { x: xv, y: C - (B * B) / (4 * A), i: k };
}

export type LevelMethod = 'local' | 'edges' | 'absolute';

export type Width = { center: number; extreme: number; level: number; x1: number; x2: number; width: number };

const NO_WIDTH: Width = { center: NaN, extreme: NaN, level: NaN, x1: NaN, x2: NaN, width: NaN };

// Full width of a dip (or peak) at half depth. The reference is the opposite extreme of the window
// ('local'), the mean of the window edges ('edges') or a given absolute level.
export function halfWidth(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  i0: number,
  i1: number,
  kind: 'dip' | 'peak',
  method: LevelMethod,
  absolute = NaN,
): Width {
  if (i1 - i0 < 2) return NO_WIDTH;
  const e = extremum(xs, ys, i0, i1, kind === 'dip' ? 'min' : 'max');
  if (e.i < 0) return NO_WIDTH;
  let level: number;
  if (method === 'absolute') level = absolute;
  else {
    let base: number;
    if (method === 'edges') base = (ys[i0] + ys[i1]) / 2;
    else {
      base = ys[i0];
      for (let i = i0; i <= i1; i++) base = kind === 'dip' ? Math.max(base, ys[i]) : Math.min(base, ys[i]);
    }
    level = (base + e.y) / 2;
  }
  if (!Number.isFinite(level)) return { ...NO_WIDTH, center: e.x, extreme: e.y };
  const beyond = (y: number) => (kind === 'dip' ? y >= level : y <= level);
  const cross = (a: number, b: number) => xs[a] + ((level - ys[a]) / (ys[b] - ys[a])) * (xs[b] - xs[a]);
  let x1 = NaN;
  for (let j = e.i; j > i0; j--)
    if (beyond(ys[j - 1])) {
      x1 = cross(j - 1, j);
      break;
    }
  let x2 = NaN;
  for (let j = e.i; j < i1; j++)
    if (beyond(ys[j + 1])) {
      x2 = cross(j, j + 1);
      break;
    }
  return { center: e.x, extreme: e.y, level, x1, x2, width: x2 - x1 };
}
