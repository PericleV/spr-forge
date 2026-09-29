// Turns analysis annotations into drawable overlays for one plotted curve.
import { line, metaOf, otherIndex } from '../engine/dataset.ts';
import type { Annotation, Dataset } from '../engine/types.ts';

export type Overlay =
  | { kind: 'marker'; key: string; x: number; y: number; color: string; text?: string }
  | { kind: 'width'; key: string; x1: number; x2: number; y: number; color: string; text?: string }
  | { kind: 'curve'; key: string; x: ArrayLike<number>; y: ArrayLike<number>; color: string; solid?: boolean }
  | { kind: 'span'; key: string; lo: number; hi: number; color: string }
  | { kind: 'band'; key: string; lo: number; hi: number; color: string; label?: string } // e.g. a layer
  | { kind: 'vline'; key: string; x: number; color: string }
  | { kind: 'area'; key: string; x: ArrayLike<number>; lo: ArrayLike<number>; hi: ArrayLike<number>; color: string }; // e.g. a p5–p95 range

export type Trace = { key: string; x: number[]; y: number[]; color: string };

const num = (v: number, unit: string) => `${+v.toFixed(4)}${unit === '°' ? '°' : unit ? ` ${unit}` : ''}`;

// Identity of a mark in the legends (one entry per analysis and kind of mark).
export const markKey = (a: Annotation) => `${a.label}|${a.color}`;

// Marks shown on a plot: none when the plot's marks are off, and without the ones hidden in its legend.
export const visibleMarks = (anns: Annotation[], show: boolean | undefined, hidden: string[] | undefined) =>
  show === false ? [] : hidden?.length ? anns.filter((a) => !hidden.includes(markKey(a))) : anns;

// Overlays for the curve at per-axis indices `idx` of `ds`, drawn along axis `xDim` for `field`.
export function overlaysFor(anns: Annotation[], ds: Dataset, xDim: number, field: string, idx: number[], text: boolean): Overlay[] {
  const axis = ds.axes[xDim];
  const k = otherIndex(ds.axes, xDim, idx);
  const unit = metaOf(ds, field)?.unit ?? '';
  const out: Overlay[] = [];
  for (const a of anns) {
    if (a.datasetKey !== ds.key || a.along !== axis.id) continue;
    const key = `${a.id}#${k}`;
    if (a.kind === 'span') out.push({ kind: 'span', key: a.id, lo: a.lo, hi: a.hi, color: a.color });
    else if (a.kind === 'area') {
      if (a.field === field) out.push({ kind: 'area', key, x: axis.values, lo: line(a.dataset, a.lo, xDim, idx), hi: line(a.dataset, a.hi, xDim, idx), color: a.color });
    }
    else if (a.kind === 'curve') {
      if (a.dataset.fields[field]) out.push({ kind: 'curve', key, x: axis.values, y: line(a.dataset, field, xDim, idx), color: a.color });
    } else if (a.kind === 'xy') {
      if (a.field === field && a.k === k) out.push({ kind: 'curve', key, x: a.x, y: a.y, color: a.color, solid: !a.dash });
    } else if (a.field === field) {
      if (a.kind === 'points' && Number.isFinite(a.x[k]))
        out.push({
          kind: 'marker',
          key,
          x: a.x[k],
          y: a.y[k],
          color: a.color,
          text: text ? `${a.label}: ${num(a.x[k], axis.unit)}, ${num(a.y[k], unit)}${a.text?.[k] ? ` · ${a.text[k]}` : ''}` : undefined,
        });
      if (a.kind === 'width' && Number.isFinite(a.x1[k]) && Number.isFinite(a.x2[k]))
        out.push({
          kind: 'width',
          key,
          x1: a.x1[k],
          x2: a.x2[k],
          y: a.level[k],
          color: a.color,
          text: text ? `${a.label} = ${num(a.x2[k] - a.x1[k], axis.unit)}` : undefined,
        });
    }
  }
  return out;
}

// Positions of point annotations traced across a 2D map (x or y being the analysed axis).
export function tracesFor(anns: Annotation[], ds: Dataset, xDim: number, yDim: number, field: string, idx: number[]): Trace[] {
  const out: Trace[] = [];
  for (const a of anns) {
    if (a.datasetKey !== ds.key || a.kind !== 'points' || a.field !== field) continue;
    const alongX = a.along === ds.axes[xDim].id;
    if (!alongX && a.along !== ds.axes[yDim].id) continue;
    const along = alongX ? xDim : yDim;
    const other = alongX ? yDim : xDim;
    const t: Trace = { key: a.id, x: [], y: [], color: a.color };
    ds.axes[other].values.forEach((v, j) => {
      const at = [...idx];
      at[other] = j;
      const p = a.x[otherIndex(ds.axes, along, at)];
      if (!Number.isFinite(p)) return;
      t.x.push(alongX ? p : v);
      t.y.push(alongX ? v : p);
    });
    out.push(t);
  }
  return out;
}
