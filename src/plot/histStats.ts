// Summary statistics and bins of a set of values.
export type HistStats = { n: number; mean: number; median: number; std: number; min: number; max: number; p5: number; p95: number };

const q = (s: number[], f: number) => {
  const pos = (s.length - 1) * f;
  const i = Math.floor(pos);
  return i + 1 < s.length ? s[i] + (pos - i) * (s[i + 1] - s[i]) : s[i];
};

export function histStats(values: ArrayLike<number>): HistStats | null {
  const v = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const std = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
  return { n: v.length, mean, median: q(v, 0.5), std, min: v[0], max: v[v.length - 1], p5: q(v, 0.05), p95: q(v, 0.95) };
}

// Bins: the given count, or the Freedman–Diaconis rule (at least 5, at most 60).
export function binsOf(values: ArrayLike<number>, bins = 0): { edges: number[]; counts: number[] } {
  const v = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { edges: [], counts: [] };
  let [lo, hi] = [v[0], v[v.length - 1]];
  if (!(hi > lo)) [lo, hi] = [lo - 0.5 * (Math.abs(lo) || 1), hi + 0.5 * (Math.abs(hi) || 1)];
  let n = Math.round(bins);
  if (!(n >= 1)) {
    const iqr = q(v, 0.75) - q(v, 0.25);
    const w = iqr > 0 ? (2 * iqr) / Math.cbrt(v.length) : (hi - lo) / Math.sqrt(v.length);
    n = Math.min(60, Math.max(5, Math.ceil((hi - lo) / w)));
  }
  const edges = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const counts = new Array<number>(n).fill(0);
  for (const x of v) counts[Math.min(n - 1, Math.floor(((x - lo) / (hi - lo)) * n))]++;
  return { edges, counts };
}

