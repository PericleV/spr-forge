// Measured spectra: CSV parsing and interpolation (the misfit against targets is in spec.ts).
import { HC_EV_NM } from '../physics/materials.ts';
import type { ImportData } from '../types.ts';
import type { FieldMeta } from './types.ts';

export type ImportedTable = { xs: number[]; columns: { meta: FieldMeta; values: Float64Array }[] };

const KNOWN: Record<string, FieldMeta> = {
  r: { key: 'R', label: 'R — reflectance', short: 'R', unit: '', domain: [0, 1] },
  t: { key: 'T', label: 'T — transmittance', short: 'T', unit: '', domain: [0, 1] },
  a: { key: 'A', label: 'A — absorptance', short: 'A', unit: '', domain: [0, 1] },
};

// Converts x to the unit of the axis: wavelengths in nm, angles in degrees.
export function toAxisUnit(x: number, unit: ImportData['unit']): number {
  if (unit === 'um') return x * 1000;
  if (unit === 'eV') return HC_EV_NM / x;
  return x;
}

// Numeric table: first column x, the others values. The last non-numeric line before the data names the columns.
export function parseSpectrum(text: string, unit: ImportData['unit'], names: string, scale: number): ImportedTable | string {
  const lines = text.split(/\r?\n/);
  let header: string[] = [];
  const rows: number[][] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('#') || l.startsWith('%')) continue;
    const cells = l.split(/[\t,;]+|\s+/).filter(Boolean);
    const nums = cells.map(Number);
    if (cells.length >= 2 && nums.every(Number.isFinite)) rows.push(nums);
    else if (!rows.length)
      header = l
        .split(/[\t,;]/.test(l) ? /[\t,;]+/ : /\s+/)
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
  }
  if (rows.length < 2) return 'No rows with two or more numeric columns found.';
  const cols = Math.min(...rows.map((r) => r.length)) - 1;
  const given = names
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pts = rows.map((r) => ({ x: toAxisUnit(r[0], unit), v: r.slice(1, cols + 1).map((y) => y * (Number.isFinite(scale) ? scale : 1)) }));
  if (pts.some((p) => !Number.isFinite(p.x))) return 'Invalid x values (energies must be > 0).';
  pts.sort((a, b) => a.x - b.x);
  const uniq = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x);
  const used = new Set<string>();
  const columns = Array.from({ length: cols }, (_, j) => {
    const name = given[j] ?? header[j + 1] ?? (cols === 1 ? 'y' : `y${j + 1}`);
    const known = KNOWN[name.toLowerCase()];
    let key = known?.key ?? (name.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || `y${j + 1}`);
    while (used.has(key)) key += '_';
    used.add(key);
    const meta: FieldMeta = known ? { ...known, label: `${known.label} (measured)` } : { key, label: name, short: name, unit: '' };
    return { meta, values: Float64Array.from(uniq, (p) => p.v[j]) };
  });
  return { xs: uniq.map((p) => p.x), columns };
}

// Linear interpolation of (xs, ys) at x; NaN outside the range. xs ascending.
export function interp(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (!n || x < xs[0] || x > xs[n - 1]) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  if (hi === lo) return ys[lo];
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}
