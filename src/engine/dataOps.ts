// Operations of the data nodes (pure): Extract data (some quantities, all curves or fixed steps), Merge data (several
// results side by side, each with its own points) and Custom data (formulas of the quantities, point by point).
import { strides } from './dataset.ts';
import { compile } from './expr.ts';
import type { Axis, Dataset, FieldMeta } from './types.ts';

// ---- Extract data ----

// The chosen fields (empty = all) with the axes in `fixed` held at a step (the others kept whole).
// `mean`: axes averaged out (NaN skipped); every quantity then also gets its standard deviation over them (key `<key>:std`).
export function extract(ds: Dataset, fields: string[], fixed: Record<string, number>, mean: string[] = []): Dataset {
  const avg = ds.axes.map((a) => mean.includes(a.id) && !(a.id in fixed));
  const keep = ds.axes.map((a, i) => !(a.id in fixed) && !avg[i]);
  const at = ds.axes.map((a) => Math.min(a.values.length - 1, Math.max(0, Math.round(fixed[a.id] ?? 0))));
  const metas = (fields.length ? fields.map((k) => ds.meta.find((m) => m.key === k)).filter((m): m is FieldMeta => !!m) : ds.meta).filter((m) => ds.fields[m.key]);
  const axes = ds.axes.filter((_, i) => keep[i]);
  const size = axes.reduce((p, a) => p * a.values.length, 1);
  const st = strides(ds.axes);
  const out: Record<string, Float64Array> = Object.fromEntries(metas.map((m) => [m.key, new Float64Array(size)]));
  const idx = ds.axes.map((_, i) => (keep[i] || avg[i] ? 0 : at[i]));
  const kept = ds.axes.map((_, i) => i).filter((i) => keep[i]);
  // the offsets of the averaged points around each kept one
  const offs = ds.axes.reduce<number[]>((acc, a, i) => (avg[i] ? acc.flatMap((o) => a.values.map((_, j) => o + j * st[i])) : acc), [0]);
  const std: Record<string, Float64Array> = offs.length > 1 ? Object.fromEntries(metas.map((m) => [m.key, new Float64Array(size)])) : {};
  for (let k = 0; k < size; k++) {
    // row-major over the kept axes
    for (let j = kept.length - 1, rem = k; j >= 0; j--) {
      const n = ds.axes[kept[j]].values.length;
      idx[kept[j]] = rem % n;
      rem = Math.floor(rem / n);
    }
    const src = idx.reduce((s, v, i) => s + v * st[i], 0);
    for (const m of metas) {
      const f = ds.fields[m.key];
      if (offs.length === 1) {
        out[m.key][k] = f[src];
        continue;
      }
      // two passes: the mean, then the squared deviations (no cancellation)
      let [n, s1, s2] = [0, 0, 0];
      for (const o of offs) {
        const v = f[src + o];
        if (Number.isNaN(v)) continue;
        n++;
        s1 += v;
      }
      const mu = n ? s1 / n : NaN;
      for (const o of offs) {
        const v = f[src + o];
        if (!Number.isNaN(v)) s2 += (v - mu) ** 2;
      }
      out[m.key][k] = mu;
      std[m.key][k] = n > 1 ? Math.sqrt(s2 / (n - 1)) : NaN;
    }
  }
  const avgAxes = ds.axes.filter((_, i) => avg[i]);
  const over = avgAxes.map((a) => a.label).join(', ');
  const meta = offs.length > 1 ? metas.flatMap((m) => [{ ...m, label: `${m.label} (mean over ${over})`, short: `⟨${m.short}⟩` }, { ...m, key: `${m.key}:std`, label: `${m.label} (std over ${over})`, short: `σ ${m.short}`, domain: undefined }]) : metas;
  for (const m of metas) if (std[m.key]) out[`${m.key}:std`] = std[m.key];
  return { key: `${ds.key}|extract:${JSON.stringify([metas.map((m) => m.key), fixed, avgAxes.map((a) => a.id)])}`, axes, fields: out, meta, size };
}

// ---- Flat table: every point of a dataset as a row, the swept axes as columns next to the quantities ----

export type Column = { key: string; meta: FieldMeta; values: Float64Array };
export const axisKey = (a: Axis) => `ax:${a.id}`;
export function flatten(ds: Dataset): { n: number; columns: Column[] } {
  const n = ds.size;
  const st = strides(ds.axes);
  const columns: Column[] = [];
  ds.axes.forEach((a, i) => {
    if (a.values.length < 2) return;
    const v = new Float64Array(n);
    for (let k = 0; k < n; k++) v[k] = a.values[Math.floor(k / st[i]) % a.values.length];
    columns.push({ key: axisKey(a), meta: { key: axisKey(a), label: a.label, short: a.label, unit: a.unit }, values: v });
  });
  for (const m of ds.meta) if (ds.fields[m.key]) columns.push({ key: m.key, meta: m, values: Float64Array.from(ds.fields[m.key]) });
  return { n, columns };
}

// ---- Merge data ----

// Several datasets side by side: axis 'source' (one per input) × axis 'point' (the rows of each, NaN after its last);
// the quantities of all of them (the first one's description of a key), plus their swept axes as quantities.
export function merge(sources: { label: string; ds: Dataset }[]): Dataset {
  const flat = sources.map((s) => flatten(s.ds));
  const nMax = Math.max(1, ...flat.map((f) => f.n));
  const metas: FieldMeta[] = [];
  for (const f of flat) for (const c of f.columns) if (!metas.some((m) => m.key === c.key)) metas.push(c.meta);
  const S = sources.length;
  const fields: Record<string, Float64Array> = Object.fromEntries(metas.map((m) => [m.key, new Float64Array(S * nMax).fill(NaN)]));
  flat.forEach((f, s) => {
    for (const c of f.columns) fields[c.key].set(c.values, s * nMax);
  });
  return {
    key: `merge:${sources.map((s) => `${s.label}@${s.ds.key}`).join('|')}`,
    axes: [
      { id: 'source', label: 'source', unit: '', values: sources.map((_, i) => i), labels: sources.map((s) => s.label) },
      { id: 'point', label: 'point', unit: '', values: Array.from({ length: nMax }, (_, i) => i) },
    ],
    fields,
    meta: metas,
    size: S * nMax,
  };
}

// ---- Custom data ----

// A name usable in a formula: letters, digits and _ (Greek letters spelled out).
const GREEK: Record<string, string> = { λ: 'lambda', θ: 'theta', φ: 'phi', δ: 'delta', Δ: 'Delta', ε: 'eps', σ: 'sigma', ψ: 'psi', ω: 'omega', Ω: 'Omega', Γ: 'Gamma', η: 'eta', μ: 'mu', ν: 'nu', ρ: 'rho', τ: 'tau' };
export const varName = (s: string) =>
  [...s]
    .map((c) => GREEK[c] ?? c)
    .join('')
    .normalize('NFKD')
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'v';

export type CustomVar = { name: string; label: string; input: string };
export type CustomResult = { dataset?: Dataset; vars: CustomVar[]; errors: string[] };

// inputs: letter → dataset. The grid is the first input's; another input has the same axes (point by point) or a single
// value (used everywhere). Variables: <letter>_<quantity> and <letter>_<axis>.
export function customData(inputs: [string, Dataset][], rows: { name: string; expr: string }[], key: string): CustomResult {
  const errors: string[] = [];
  const vars: CustomVar[] = [];
  if (!inputs.length) return { vars, errors: ['Connect data to a (and b, c, d).'] };
  const [baseL, base] = inputs[0];
  const same = (a: Dataset) => a.axes.length === base.axes.length && a.axes.every((x, i) => x.id === base.axes[i].id && x.values.length === base.axes[i].values.length);
  const values = new Map<string, (k: number) => number>();
  for (const [L, ds] of inputs) {
    const scalar = ds.size === 1;
    if (L !== baseL && !scalar && !same(ds)) {
      errors.push(`Input ${L} has other points than ${baseL} (${ds.axes.map((a) => `${a.label} ${a.values.length}`).join(' × ')} vs ${base.axes.map((a) => `${a.label} ${a.values.length}`).join(' × ')}): use the same axes, or a single value.`);
      continue;
    }
    const add = (label: string, get: (k: number) => number) => {
      let name = `${L}_${varName(label)}`;
      for (let j = 2; values.has(name); j++) name = `${L}_${varName(label)}_${j}`;
      values.set(name, get);
      vars.push({ name, label, input: L });
    };
    for (const m of ds.meta) {
      const f = ds.fields[m.key];
      if (f) add(m.short || m.key, scalar ? () => f[0] : (k) => f[k]);
    }
    const st = strides(ds.axes);
    ds.axes.forEach((a, i) => {
      if (a.values.length < 2) return;
      add(a.label, (k) => a.values[Math.floor(k / st[i]) % a.values.length]);
    });
  }
  if (errors.length) return { vars, errors };
  const n = base.size;
  const fields: Record<string, Float64Array> = {};
  const meta: FieldMeta[] = [];
  rows.forEach((r, i) => {
    if (!r.expr.trim()) return;
    const c = compile(r.expr);
    if (typeof c === 'string') return void errors.push(`${r.name || `Row ${i + 1}`}: ${c}`);
    const unknown = c.names.filter((x) => !values.has(x));
    if (unknown.length) return void errors.push(`${r.name || `Row ${i + 1}`}: unknown ${unknown.join(', ')} (the names are listed in the node).`);
    const out = new Float64Array(n);
    const env: Record<string, number> = {};
    for (let k = 0; k < n; k++) {
      for (const x of c.names) env[x] = values.get(x)!(k);
      out[k] = c.fn(env);
    }
    const fkey = `c${i}`;
    fields[fkey] = out;
    meta.push({ key: fkey, label: r.name || r.expr, short: r.name || `f${i + 1}`, unit: '' });
  });
  if (errors.length) return { vars, errors };
  if (!meta.length) return { vars, errors: ['Write a formula.'] };
  return { vars, errors, dataset: { key: `custom:${key}:${JSON.stringify(rows)}`, axes: base.axes, fields, meta, size: n } };
}
