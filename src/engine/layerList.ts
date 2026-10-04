// Layer list of a structure (View Stack, View Grating): one row per real layer, from the incident medium to the exit —
// periodic blocks expanded, 2D materials with their monolayers, grating layers with their geometry and the slices that
// RCWA computes, a thick substrate with its back side. Material and thickness only: after a long optimization the
// structure can be read (and copied / exported) as a table.
import { matName } from './evaluate.ts';
import { gratingSlices, type GratingParams } from './grating.ts';
import type { MaterialValue, StackLayer, StackValue } from './types.ts';

export type LayerRow = {
  no: string; // 1, 2, … for the films; in / out / sub for the media; 3.1, 3.2 … for the slices of a grating
  layer: string;
  material: string;
  d: number | null; // nm (null: semi-infinite medium)
  details: string;
  sub?: boolean; // a slice of the grating above
};
export type LayerList = { rows: LayerRow[]; count: number; total: number };

const num = (x: number, digits = 3) => String(+x.toFixed(digits));

const PROFILES: Record<GratingParams<MaterialValue>['profile'], string> = {
  lamellar: 'lamellar (rectangular)',
  trapezoid: 'trapezoidal',
  sinus: 'sinusoidal',
  blazed: 'blazed (sawtooth)',
  pixel: 'pixel map',
};

function gratingDetails(g: GratingParams<MaterialValue>): string {
  const out = [PROFILES[g.profile], `period ${num(g.period)} nm`];
  if (g.profile === 'lamellar') out.push(`fill ${num(g.fill)} (ridge ${num(g.fill * g.period)} nm)`);
  if (g.profile === 'trapezoid') out.push(`fill ${num(g.fillTop)} at the top → ${num(g.fill)} at the bottom (ridge ${num(g.fillTop * g.period)} → ${num(g.fill * g.period)} nm)`);
  if (g.profile !== 'pixel' && Math.abs(g.shift - 0.5) > 1e-9) out.push(`ridge centre at ${num(g.shift)} of the period`);
  if (g.profile === 'pixel') {
    const nx = Math.max(1, Math.round(g.nx));
    out.push(`${nx} × ${Math.max(1, Math.round(g.pixels.length / nx))} cells`);
  } else if (g.profile !== 'lamellar') out.push(`${Math.max(1, Math.round(g.slices))} slices`);
  if (g.flip) out.push('upside down');
  return out.join(', ');
}

// Rows of one film (a grating layer adds one row per slice when it is not a single rectangle).
function filmRows(L: StackLayer, no: string, note: string, name?: string): LayerRow[] {
  const g = L.grating;
  if (!g) {
    const details = [L.layers2D ? `${L.layers2D} monolayer${L.layers2D === 1 ? '' : 's'}` : '', L.vary ? 'swept (nominal value)' : '', note].filter(Boolean).join('; ');
    return [{ no, layer: name || L.label || L.mat.name, material: L.mat.name, d: L.d, details }];
  }
  const names = g.mats.map((m) => m.name);
  const material = g.profile === 'pixel' ? names.join(' / ') : `ridge ${names[0]} / groove ${names[1]}`;
  const rows: LayerRow[] = [{ no, layer: name || L.label || 'grating', material, d: L.d, details: [gratingDetails(g), L.vary ? 'swept (nominal value)' : '', note].filter(Boolean).join('; ') }];
  const slices = gratingSlices(g);
  if (slices.length > 1)
    slices.forEach((s, k) =>
      rows.push({
        no: `${no}.${k + 1}`,
        layer: g.profile === 'pixel' ? `row ${k + 1}` : `slice ${k + 1}`,
        material: [...new Set(s.segs.map((x) => names[x.m] ?? '?'))].join(' / '),
        d: s.h * L.d,
        details: s.segs.map((x) => `${names[x.m] ?? '?'} ${num(x.from * g.period, 1)}–${num(x.to * g.period, 1)} nm`).join(', '),
        sub: true,
      }),
    );
  return rows;
}

// names: labels given on View Stack, by layer key and for the media 'incident' / 'exit' / 'out' (they replace the Layer
// node's label in the layer column)
export function layerList(stack: StackValue, names: Record<string, string> = {}): LayerList {
  const rows: LayerRow[] = [];
  let count = 0;
  let total = 0;
  const films = (layers: StackLayer[], note = '') => {
    const real = layers.filter((L) => !L.pad);
    real.forEach((L, i) => {
      // position in a periodic block: consecutive layers of the same group, `size` per period
      let extra = note;
      const grp = L.group;
      if (grp && grp.periods > 1) {
        let first = i;
        while (first > 0 && real[first - 1].group?.id === grp.id) first--;
        const period = Math.floor((i - first) / Math.max(1, grp.size)) + 1;
        extra = [`${grp.name || 'periodic block'}: period ${period} of ${grp.periods}`, note].filter(Boolean).join('; ');
      }
      count++;
      total += L.d;
      rows.push(...filmRows(L, String(count), extra, names[L.key]));
    });
  };
  if (stack.incident) rows.push({ no: 'in', layer: names.incident || 'incident medium', material: matName(stack.incident), d: null, details: 'semi-infinite' });
  films(stack.layers);
  const sub = stack.substrate;
  if (stack.exit) {
    if (sub) rows.push({ no: 'sub', layer: names.exit || 'substrate', material: matName(stack.exit), d: sub.d, details: `thick plate (incoherent), ${num(sub.d / 1e6)} mm` });
    else rows.push({ no: 'out', layer: names.exit || 'exit medium', material: matName(stack.exit), d: null, details: 'semi-infinite' });
  }
  if (sub) {
    films(sub.back, 'back side of the substrate');
    const o = sub.out ?? stack.incident;
    if (o) rows.push({ no: 'out', layer: names.out || 'back medium', material: matName(o), d: null, details: 'semi-infinite' });
  }
  return { rows, count, total };
}

const HEAD = ['#', 'layer', 'material', 'thickness [nm]', 'details'];
const cells = (r: LayerRow) => [r.no, r.layer, r.material, r.d === null ? '' : num(r.d), r.details];
const totalRow = (l: LayerList) => ['', 'total (films)', '', num(l.total), `${l.count} layer${l.count === 1 ? '' : 's'}`];

// CSV (spreadsheet file) and tab-separated text (the clipboard: pasted into a spreadsheet it fills the columns).
export function layerListCsv(l: LayerList): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [HEAD, ...l.rows.map(cells), totalRow(l)].map((r) => r.map(q).join(',')).join('\n') + '\n';
}
export function layerListTsv(l: LayerList): string {
  return [HEAD, ...l.rows.map(cells), totalRow(l)].map((r) => r.map((s) => s.replace(/[\t\n]/g, ' ')).join('\t')).join('\n') + '\n';
}
