// Target specifications shared by the objective nodes (Target curve, Curve match, Zones, Objective, Custom objective)
// and the Filter designer: which quantity (R, T, A or the optical density OD = −log₁₀ T), for which polarization and
// angle, with equality or one-sided (≥ / ≤) targets, a tolerance per point, and the merit
//   MF = [Σ wᵢ |eᵢ / Δᵢ|^p / Σ wᵢ]^(1/p)      (p = 2: RMS; p = 1: mean |e|; p = ∞: max |e|)
// where eᵢ = value − target (0 when an inequality holds). Pure: also used by the design worker and the scripts.
import { line, otherIndex } from './dataset.ts';
import type { Dataset } from './types.ts';

export type SpecPol = 's' | 'p' | 'avg' | 'all'; // all = every curve of the data (each one separately)
export type SpecKind = 'eq' | 'ge' | 'le';
export type Slice = { pol: SpecPol; angle: number }; // angle NaN = every angle

// Optical density: OD = −log₁₀ T, T floored at 1e-12 (OD ≤ 12).
export const OD_FLOOR = 1e-12;
export const odOf = (T: number) => -Math.log10(Math.max(T, OD_FLOOR));
export const dOdOf = (T: number) => (T > OD_FLOOR ? -1 / (T * Math.LN10) : 0);

// A target term: at the points x (λ or θ) the quantity q, in the given slice, should be (=, ≥, ≤) v within tol.
// q = '' leaves the quantity to the node that uses the target (e.g. the field chosen in Curve match).
export type SpecTerm = { label: string; q: string; pol: SpecPol; angle: number; kind: SpecKind; x: number[]; v: number[]; tol: number[]; w: number[] };
export type TargetSpec = { axis: string; terms: SpecTerm[] };

export const KIND_TEXT: Record<SpecKind, string> = { eq: '=', ge: '≥', le: '≤' };
export const POL_TEXT: Record<SpecPol, string> = { all: 'each pol.', s: 's', p: 'p', avg: 'mean s, p' };

// Deviation of a value from a target point (0 when a one-sided target is met).
export function specError(kind: SpecKind | undefined, value: number, target: number): number {
  const e = value - target;
  if (kind === 'ge') return Math.min(0, e);
  if (kind === 'le') return Math.max(0, e);
  return e;
}

export type MeritPoint = { value: number; v: number; tol: number; w: number; kind?: SpecKind };
export type Merit = {
  mf: number; // the merit function value
  sum: number; // Σ r² = MF^p (finite p); MF for p = ∞
  residuals: number[]; // r_i = sign(e)·√(w_i/W)·|e_i/Δ_i|^(p/2): Σ r² = MF^p (least squares on MF^p)
  dres: number[]; // ∂r_i/∂value_i
  errors: number[]; // e_i / Δ_i
  used: number; // points with a finite value and weight > 0
};

// Residual of one point and its derivative with respect to the value: r = sign(e)·sw·|e/Δ|^(p/2), sw = √(w/W).
export function residualOf(kind: SpecKind | undefined, value: number, target: number, tol: number, sw: number, p: number): { r: number; g: number; e: number } {
  const t = tol > 0 ? tol : 1;
  const e = specError(kind, value, target) / t;
  const a = Math.abs(e);
  const r = p === 2 ? sw * e : Math.sign(e) * sw * a ** (p / 2);
  const active = e !== 0 || (kind ?? 'eq') === 'eq';
  const g = !active ? 0 : p === 2 ? sw / t : a > 0 ? (sw * (p / 2) * a ** (p / 2 - 1)) / t : 0;
  return { r, g, e };
}

// The merit of a set of points. Points with a non-finite value or target, or weight ≤ 0, are skipped (their residual
// is 0). p ≥ 1, Infinity allowed (then no residuals: minimax).
export function pMerit(points: MeritPoint[], p = 2): Merit {
  const n = points.length;
  const residuals = new Array<number>(n).fill(0);
  const dres = new Array<number>(n).fill(0);
  const errors = new Array<number>(n).fill(0);
  let W = 0;
  let used = 0;
  for (const q of points)
    if (q.w > 0 && Number.isFinite(q.value) && Number.isFinite(q.v)) {
      W += q.w;
      used++;
    }
  if (!used) return { mf: NaN, sum: NaN, residuals, dres, errors, used: 0 };
  const inf = !Number.isFinite(p);
  let acc = 0;
  points.forEach((q, i) => {
    if (!(q.w > 0 && Number.isFinite(q.value) && Number.isFinite(q.v))) return;
    const x = residualOf(q.kind, q.value, q.v, q.tol, Math.sqrt(q.w / W), inf ? 2 : p);
    errors[i] = x.e;
    if (inf) {
      acc = Math.max(acc, Math.abs(x.e));
      return;
    }
    residuals[i] = x.r;
    dres[i] = x.g; // zero where a one-sided target holds
    acc += x.r * x.r;
  });
  if (inf) return { mf: acc, sum: acc, residuals: new Array<number>(n).fill(0), dres, errors, used };
  return { mf: acc ** (1 / p), sum: acc, residuals, dres, errors, used };
}

// ---- Slices of a dataset: polarization and angle ----

// Axis index of the polarization sweep (steps p, s) of a TMM / RCWA result, or −1.
export function polAxisOf(ds: Dataset): number {
  const i = ds.spec?.polSweep;
  return i !== undefined && ds.axes[i]?.values.length === 2 ? i : -1;
}

export type SliceInfo = { polAxis: boolean; angles: number[] }; // what a node can offer in its slice controls
export function sliceInfo(ds: Dataset): SliceInfo {
  const th = ds.axes.find((a) => a.id === 'theta');
  return { polAxis: polAxisOf(ds) >= 0, angles: th ? th.values : [] };
}

// The curves along axis `along` of quantity q ('OD' is computed from T) restricted to a slice: pol 's' / 'p' keep one
// polarization, 'avg' averages s and p (before OD), 'all' keeps every curve; a finite angle keeps that θ. Returns an
// error message when the data cannot give the slice.
export function sliceLines(ds: Dataset, q: string, along: number, sl: Slice): Float64Array[] | string {
  const r = sliceCurves(ds, q, along, sl);
  return typeof r === 'string' ? r : r.lines;
}

// The same, with the indices of the plotted curves each line comes from (two for a mean of s and p).
export function sliceCurves(ds: Dataset, q: string, along: number, sl: Slice): { lines: Float64Array[]; ks: number[][] } | string {
  const key = q === 'OD' ? 'T' : q;
  if (!ds.fields[key]) return `The data has no ${q === 'OD' ? 'T (for OD)' : q}.`;
  const pa = polAxisOf(ds);
  const ta = ds.axes.findIndex((a) => a.id === 'theta');
  const fix = new Map<number, number[]>(); // axis → allowed indices
  let average = false;
  if (sl.pol !== 'all' && ds.spec) {
    if (pa >= 0 && pa !== along) {
      if (sl.pol === 'avg') average = true;
      else fix.set(pa, [sl.pol === 'p' ? 0 : 1]);
    } else if (pa < 0) {
      const thetas = ta >= 0 ? ds.axes[ta].values : [0];
      const normal = thetas.every((t) => t === 0) && !ds.spec.thetaOffset;
      if (sl.pol === 'avg' && !normal) return 'The mean of s and p needs both: connect a polarization sweep to the Compute node.';
      if ((sl.pol === 's' || sl.pol === 'p') && ds.spec.pol !== sl.pol && !normal)
        return `The data is ${ds.spec.pol}-polarized: connect a polarization sweep to the Compute node to use ${sl.pol}.`;
    }
  }
  if (Number.isFinite(sl.angle) && ta >= 0 && ta !== along) {
    const k = ds.axes[ta].values.findIndex((t) => Math.abs(t - sl.angle) < 1e-6);
    if (k < 0) return `θ = ${sl.angle}° is not in the data (${ds.axes[ta].values.slice(0, 6).join(', ')}${ds.axes[ta].values.length > 6 ? '…' : ''}°).`;
    fix.set(ta, [k]);
  }
  if (average) fix.set(pa, [0]);
  const ranges = ds.axes.map((a, i) => (i === along ? [0] : (fix.get(i) ?? a.values.map((_, j) => j))));
  const out: Float64Array[] = [];
  const ks: number[][] = [];
  const idx = ranges.map(() => 0);
  const rec = (i: number) => {
    if (i === ranges.length) {
      let ys = line(ds, key, along, idx);
      const k = [otherIndex(ds.axes, along, idx)];
      if (average) {
        const other = idx.slice();
        other[pa] = 1;
        const ys2 = line(ds, key, along, other);
        ys = ys.map((y, j) => (y + ys2[j]) / 2);
        k.push(otherIndex(ds.axes, along, other));
      }
      out.push(q === 'OD' ? ys.map(odOf) : ys);
      ks.push(k);
      return;
    }
    for (const j of ranges[i]) {
      idx[i] = j;
      rec(i + 1);
    }
  };
  rec(0);
  return { lines: out, ks };
}

// Same slice rules for a whole field (every value, any axis).
export function sliceValues(ds: Dataset, q: string, sl: Slice): number[] | string {
  const pa = polAxisOf(ds);
  let along = ds.axes.findIndex((a, i) => i !== pa && a.values.length > 1);
  if (along < 0) along = ds.axes.findIndex((_, i) => i !== pa);
  if (along < 0) along = 0;
  const lines = sliceLines(ds, q, along, sl);
  return typeof lines === 'string' ? lines : lines.flatMap((l) => Array.from(l));
}

// Effective slice of a term: its own polarization / angle, else the defaults of the node using it.
export const effectiveSlice = (term: { pol?: SpecPol; angle?: number }, def: Slice): Slice => ({
  pol: term.pol && term.pol !== 'all' ? term.pol : def.pol,
  angle: Number.isFinite(term.angle) ? term.angle! : def.angle,
});

// Band target points on a grid: each point belongs to the last band containing it (later bands win where bands
// overlap; a band of weight ≤ 0 masks the points).
export function bandTerms(
  xs: number[],
  bands: { lo: number; hi: number; value: number; weight: number; q?: string; pol?: SpecPol; angle?: number; kind?: SpecKind; tol?: number }[],
  def: { q: string; pol: SpecPol; angle: number; kind: SpecKind; tol: number },
): SpecTerm[] {
  const owner = xs.map((x) => bands.findLastIndex((b) => x >= b.lo && x <= b.hi));
  return bands.flatMap((b, i) => {
    const pts = b.weight > 0 ? xs.filter((_, k) => owner[k] === i) : [];
    if (!pts.length) return [];
    const tol = b.tol !== undefined && b.tol > 0 ? b.tol : def.tol;
    return [
      {
        label: `band ${i + 1}`,
        q: b.q ?? def.q,
        pol: b.pol ?? def.pol,
        angle: b.angle ?? def.angle,
        kind: b.kind ?? def.kind,
        x: pts,
        v: pts.map(() => b.value),
        tol: pts.map(() => tol),
        w: pts.map(() => b.weight),
      },
    ];
  });
}

export function termText(t: SpecTerm, fallbackQ = '') {
  const same = (a: number[]) => a.length > 0 && a.every((x) => x === a[0]);
  const value = same(t.v) ? `${+t.v[0].toPrecision(6)}` : 'the curve';
  const tol = same(t.tol) && t.tol[0] !== 1 ? ` ± ${+t.tol[0].toPrecision(4)}` : '';
  return `${t.q || fallbackQ}${t.pol !== 'all' ? ` (${POL_TEXT[t.pol]})` : ''}${Number.isFinite(t.angle) ? ` at ${t.angle}°` : ''} ${KIND_TEXT[t.kind]} ${value}${tol}`;
}
