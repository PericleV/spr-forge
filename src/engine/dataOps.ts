// Operations of the data nodes (pure): Extract data (some quantities, all curves or fixed steps), Merge data (several
// results side by side, each with its own points) and Custom data (formulas of the quantities, point by point).
import { strides } from './dataset.ts';
import { compileComplex } from './expr.ts';
import type { C } from '../physics/complex.ts';
import type { Axis, Dataset, FieldMeta } from './types.ts';

// ---- Extract data ----

// Fractional step of `v` along the axis values (ascending or descending), linear between neighbours; NaN outside.
export function fracStep(values: number[], v: number): number {
  for (let i = 0; i + 1 < values.length; i++) {
    const [a, b] = [values[i], values[i + 1]];
    if ((v >= a && v <= b) || (v <= a && v >= b)) return a === b ? i : i + (v - a) / (b - a);
  }
  return values.length === 1 && values[0] === v ? 0 : NaN;
}

// The chosen fields (empty = all) with the axes in `fixed` held at a step (the others kept whole).
// `mean`: axes averaged out (NaN skipped); every quantity then also gets its standard deviation over them (key `<key>:std`).
// `at`: axes held at a value, interpolated linearly between their two neighbouring steps (NaN outside the axis).
export function extract(ds: Dataset, fields: string[], fixed: Record<string, number>, mean: string[] = [], at: Record<string, number> = {}): Dataset {
  const frac = ds.axes.map((a) => (a.id in at && !(a.id in fixed) ? fracStep(a.values, at[a.id]) : undefined));
  const isAt = frac.map((f) => f !== undefined);
  const avg = ds.axes.map((a, i) => mean.includes(a.id) && !(a.id in fixed) && !isAt[i]);
  const keep = ds.axes.map((a, i) => !(a.id in fixed) && !avg[i] && !isAt[i]);
  const step = ds.axes.map((a) => Math.min(a.values.length - 1, Math.max(0, Math.round(fixed[a.id] ?? 0))));
  const metas = (fields.length ? fields.map((k) => ds.meta.find((m) => m.key === k)).filter((m): m is FieldMeta => !!m) : ds.meta).filter((m) => ds.fields[m.key]);
  const axes = ds.axes.filter((_, i) => keep[i]);
  const size = axes.reduce((p, a) => p * a.values.length, 1);
  const st = strides(ds.axes);
  const out: Record<string, Float64Array> = Object.fromEntries(metas.map((m) => [m.key, new Float64Array(size)]));
  const idx = ds.axes.map((_, i) => (keep[i] || avg[i] || isAt[i] ? 0 : step[i]));
  const kept = ds.axes.map((_, i) => i).filter((i) => keep[i]);
  // the offsets of the averaged points around each kept one
  const offs = ds.axes.reduce<number[]>((acc, a, i) => (avg[i] ? acc.flatMap((o) => a.values.map((_, j) => o + j * st[i])) : acc), [0]);
  // the interpolation corners (offset, weight) of the axes held at a value; a value outside its axis gives NaN
  const outside = frac.some((f) => f !== undefined && Number.isNaN(f));
  const corners = frac
    .reduce<{ o: number; w: number }[]>(
      (acc, f, i) => {
        if (f === undefined || Number.isNaN(f)) return acc;
        const i0 = Math.min(Math.floor(f), ds.axes[i].values.length - 1);
        const w = f - i0;
        return acc.flatMap((c) => [{ o: c.o + i0 * st[i], w: c.w * (1 - w) }, ...(w > 0 ? [{ o: c.o + (i0 + 1) * st[i], w: c.w * w }] : [])]);
      },
      [{ o: 0, w: 1 }],
    )
    .filter((c) => c.w > 0);
  const valueAt = (f: Float64Array, o: number) => (outside ? NaN : corners.reduce((s, c) => s + c.w * f[o + c.o], 0));
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
        out[m.key][k] = valueAt(f, src);
        continue;
      }
      // two passes: the mean, then the squared deviations (no cancellation)
      let [n, s1, s2] = [0, 0, 0];
      for (const o of offs) {
        const v = valueAt(f, src + o);
        if (Number.isNaN(v)) continue;
        n++;
        s1 += v;
      }
      const mu = n ? s1 / n : NaN;
      for (const o of offs) {
        const v = valueAt(f, src + o);
        if (!Number.isNaN(v)) s2 += (v - mu) ** 2;
      }
      out[m.key][k] = mu;
      std[m.key][k] = n > 1 ? Math.sqrt(s2 / (n - 1)) : NaN;
    }
  }
  const avgAxes = ds.axes.filter((_, i) => avg[i]);
  const over = avgAxes.map((a) => a.label).join(', ');
  const meta: FieldMeta[] = offs.length > 1 ? metas.flatMap((m) => [{ ...m, label: `${m.label} (mean over ${over})`, short: `⟨${m.short}⟩` }, { ...m, key: `${m.key}:std`, label: `${m.label} (std over ${over})`, short: `σ ${m.short}`, domain: undefined, cx: undefined }]) : metas;
  for (const m of metas) if (std[m.key]) out[`${m.key}:std`] = std[m.key];
  const atUsed = Object.entries(at).filter(([k]) => isAt[ds.axes.findIndex((a) => a.id === k)]);
  return { key: `${ds.key}|extract:${JSON.stringify([metas.map((m) => m.key), fixed, avgAxes.map((a) => a.id), atUsed])}`, axes, fields: out, meta, size };
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

// complex: a complex quantity (r, t, a complex formula), whose two parts are two fields of the input
export type CustomVar = { name: string; label: string; input: string; complex?: boolean };
export type CustomResult = { dataset?: Dataset; vars: CustomVar[]; errors: string[] };
// Variables that do not come from a dataset (a material's n, k, ε): built on the grid of the first input
export type CustomExtra = { alias: string; make: (base: Dataset) => { label: string; complex?: boolean; get: (k: number) => C }[] | string };

// The wavelength at every point of a dataset: its λ axis, else the single λ of its computation, else `fallback`.
export function lambdaAt(ds: Dataset, fallback?: number): ((k: number) => number) | string {
  const i = ds.axes.findIndex((a) => a.id === 'lambda');
  if (i >= 0) {
    const st = strides(ds.axes)[i];
    const v = ds.axes[i].values;
    return (k) => v[Math.floor(k / st) % v.length];
  }
  const one = ds.spec?.lambda.length === 1 ? ds.spec.lambda[0] : fallback;
  if (one !== undefined && Number.isFinite(one)) return () => one;
  return 'the data have no wavelength axis: connect a λ Parameter (one value) too';
}

// A result is complex when some point has an imaginary part above rounding.
const isComplex = (im: Float64Array, re: Float64Array) => im.some((y, k) => Number.isFinite(y) && Math.abs(y) > 1e-12 * Math.max(1, Math.abs(re[k])));

// inputs: letter → dataset. The grid is the first input's; another input has the same axes (point by point) or a single
// value (used everywhere). Variables: <letter>_<quantity> and <letter>_<axis>; the formulas are complex (r and t of a
// Compute node are complex variables, `i` the imaginary unit). A formula with a complex result gives a complex quantity:
// its real and imaginary parts, which another Custom data reads again as one complex variable.
export function customData(inputs: [string, Dataset][], rows: { name: string; expr: string }[], key: string, extras: CustomExtra[] = []): CustomResult {
  const errors: string[] = [];
  const vars: CustomVar[] = [];
  if (!inputs.length) return { vars, errors: ['Connect data to a (and b, c, d).'] };
  const [baseL, base] = inputs[0];
  const same = (a: Dataset) => a.axes.length === base.axes.length && a.axes.every((x, i) => x.id === base.axes[i].id && x.values.length === base.axes[i].values.length);
  const values = new Map<string, (k: number) => C>();
  for (const [L, ds] of inputs) {
    const scalar = ds.size === 1;
    if (L !== baseL && !scalar && !same(ds)) {
      errors.push(`Input ${L} has other points than ${baseL} (${ds.axes.map((a) => `${a.label} ${a.values.length}`).join(' × ')} vs ${base.axes.map((a) => `${a.label} ${a.values.length}`).join(' × ')}): use the same axes, or a single value.`);
      continue;
    }
    const add = (label: string, get: (k: number) => C, complex = false) => {
      let name = `${L}_${varName(label)}`;
      for (let j = 2; values.has(name); j++) name = `${L}_${varName(label)}_${j}`;
      values.set(name, get);
      vars.push({ name, label, input: L, ...(complex ? { complex } : {}) });
    };
    const at = (k: number) => (scalar ? 0 : k);
    for (const m of ds.meta) {
      const f = ds.fields[m.key];
      if (!f) continue;
      // the two parts of a complex quantity joined into one complex variable (named after it: a_r, a_t); a part alone
      // (e.g. only Re r extracted) stays a real variable
      const other = m.cx && ds.meta.find((o) => o.cx?.name === m.cx!.name && o.cx.part !== m.cx!.part && ds.fields[o.key]);
      if (!other) add(m.short || m.key, (k) => ({ re: f[at(k)], im: 0 }));
      else if (m.cx!.part === 're') {
        const g = ds.fields[other.key];
        add(m.cx!.name, (k) => ({ re: f[at(k)], im: g[at(k)] }), true);
      }
    }
    const st = strides(ds.axes);
    ds.axes.forEach((a, i) => {
      if (a.values.length < 2) return;
      add(a.label, (k) => ({ re: a.values[Math.floor(k / st[i]) % a.values.length], im: 0 }));
    });
  }
  for (const x of extras) {
    const got = x.make(base);
    if (typeof got === 'string') {
      errors.push(`${x.alias}: ${got}.`);
      continue;
    }
    for (const v of got) {
      let name = `${x.alias}_${varName(v.label)}`;
      for (let j = 2; values.has(name); j++) name = `${x.alias}_${varName(v.label)}_${j}`;
      values.set(name, v.get);
      vars.push({ name, label: v.label, input: x.alias, ...(v.complex ? { complex: true } : {}) });
    }
  }
  if (errors.length) return { vars, errors };
  const n = base.size;
  const fields: Record<string, Float64Array> = {};
  const meta: FieldMeta[] = [];
  rows.forEach((r, i) => {
    if (!r.expr.trim()) return;
    const c = compileComplex(r.expr);
    if (typeof c === 'string') return void errors.push(`${r.name || `Row ${i + 1}`}: ${c}`);
    const unknown = c.names.filter((x) => !values.has(x));
    if (unknown.length) return void errors.push(`${r.name || `Row ${i + 1}`}: unknown ${unknown.join(', ')} (the names are listed in the node).`);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const env: Record<string, C> = {};
    for (let k = 0; k < n; k++) {
      for (const x of c.names) env[x] = values.get(x)!(k);
      const z = c.fn(env);
      re[k] = z.re;
      im[k] = z.im;
    }
    const name = r.name || `f${i + 1}`;
    if (!isComplex(im, re)) {
      fields[`c${i}`] = re;
      meta.push({ key: `c${i}`, label: r.name || r.expr, short: name, unit: '' });
      return;
    }
    fields[`c${i}re`] = re;
    fields[`c${i}im`] = im;
    meta.push(
      { key: `c${i}re`, label: `Re ${r.name || `(${r.expr})`}`, short: `Re ${name}`, unit: '', cx: { name, part: 're' } },
      { key: `c${i}im`, label: `Im ${r.name || `(${r.expr})`}`, short: `Im ${name}`, unit: '', cx: { name, part: 'im' } },
    );
  });
  if (errors.length) return { vars, errors };
  if (!meta.length) return { vars, errors: ['Write a formula.'] };
  return { vars, errors, dataset: { key: `custom:${key}:${JSON.stringify(rows)}`, axes: base.axes, fields, meta, size: n } };
}
