// Geometry of a 1D grating layer: a profile and its parameters, turned into horizontal slices of piecewise-constant
// material (the staircase computed by the RCWA and drawn by View Grating), or — smooth profiles (FFF) — the materials at
// any depth and the normal of the profile (physics/rcwaFff.ts). x in units of the period.
import type { C } from '../physics/complex.ts';
import type { Segment } from '../physics/rcwa.ts';
import type { FffProfile, NormalSeg } from '../physics/rcwaFff.ts';

export type GratingProfile = 'lamellar' | 'trapezoid' | 'sinus' | 'blazed' | 'pixel';

export type GratingParams<M> = {
  profile: GratingProfile;
  period: number; // nm
  fill: number; // ridge fraction (trapezoid: at the bottom)
  fillTop: number; // trapezoid: ridge fraction at the top
  shift: number; // position of the ridge centre (fraction of the period)
  slices: number; // Nz: staircase slices (trapezoid, sinus, blazed) / pixel rows
  nx: number; // Nx: pixel columns (pixel map) and drawing grid
  pixels: number[]; // pixel map, row-major from the top: material index per cell
  mats: M[]; // 0 = ridge, 1 = groove, 2 = third material (pixel map)
  flip?: boolean; // upside down (Reverse stack)
  // pixel map (for the smooth profiles to come; no node sets it yet): what the drawing stands for — the pixels, or a
  // smooth contour through them (the 0.5 level of the bilinear interpolation of each material between the pixel centres:
  // diagonal steps become slopes, corners round off by a quarter of a pixel, straight walls stay)
  outline?: 'pixels' | 'smooth';
};

export type SliceSeg = { from: number; to: number; m: number };
export type Slice = { h: number; segs: SliceSeg[] }; // h: fraction of the thickness
type Row = SliceSeg[];

const wrap = (x: number) => ((x % 1) + 1) % 1;

// Ridge interval [c − w/2, c + w/2] (wrapped into [0, 1)) in a groove background.
function ridgeRow(center: number, width: number, ridge = 0, groove = 1): Row {
  const w = Math.min(1, Math.max(0, width));
  if (w <= 1e-12) return [{ from: 0, to: 1, m: groove }];
  if (w >= 1 - 1e-12) return [{ from: 0, to: 1, m: ridge }];
  const a = wrap(center - w / 2);
  const b = a + w;
  if (b <= 1)
    return [
      ...(a > 0 ? [{ from: 0, to: a, m: groove }] : []),
      { from: a, to: b, m: ridge },
      ...(b < 1 ? [{ from: b, to: 1, m: groove }] : []),
    ];
  return [
    { from: 0, to: b - 1, m: ridge },
    { from: b - 1, to: a, m: groove },
    { from: a, to: 1, m: ridge },
  ];
}

const pixelRows = (g: GratingParams<unknown>) => {
  const nx = Math.max(1, Math.round(g.nx));
  return { nx, rows: Math.max(1, Math.round(g.pixels.length / nx) || Math.max(1, Math.round(g.slices))) };
};
const pixelAt = (g: GratingParams<unknown>, nx: number, r: number, i: number) => {
  const v = g.pixels[r * nx + i];
  return Number.isInteger(v) && v >= 0 && v < g.mats.length ? v : 1;
};

// One row of the pixel map.
function pixelRow(g: GratingParams<unknown>, r: number): Row {
  const { nx } = pixelRows(g);
  const segs: Row = [];
  for (let i = 0; i < nx; i++) {
    const m = pixelAt(g, nx, r, i);
    const last = segs[segs.length - 1];
    if (last && last.m === m) last.to = (i + 1) / nx;
    else segs.push({ from: i / nx, to: (i + 1) / nx, m });
  }
  return segs;
}

// The smooth contour of the pixel map at depth t: each material's indicator interpolated bilinearly between the pixel
// centres (periodic in x, the edge rows held above the first and below the last centre); the material is the largest.
// Along x the interpolants are linear between two centres: the changes of material are found exactly.
function smoothPixelRow(g: GratingParams<unknown>, t: number): Row {
  const { nx, rows } = pixelRows(g);
  const nm = g.mats.length;
  const u = t * rows - 0.5;
  let r0 = Math.floor(u);
  let a = u - r0;
  if (r0 < 0) [r0, a] = [0, 0];
  if (r0 >= rows - 1) [r0, a] = [rows - 1, 0];
  const r1 = Math.min(rows - 1, r0 + 1);
  // φ[m][i]: the indicator of material m at the centre of column i, at this depth
  const phi = Array.from({ length: nm }, (_, m) => Float64Array.from({ length: nx }, (_, i) => (1 - a) * +(pixelAt(g, nx, r0, i) === m) + a * +(pixelAt(g, nx, r1, i) === m)));
  const best = (i0: number, i1: number, s: number) => {
    let mb = 0;
    let vb = -Infinity;
    for (let m = 0; m < nm; m++) {
      const v = phi[m][i0] + s * (phi[m][i1] - phi[m][i0]);
      if (v > vb + 1e-12) [mb, vb] = [m, v];
    }
    return mb;
  };
  const out: Row = [];
  const push = (from: number, to: number, m: number) => {
    if (!(to > from + 1e-12)) return;
    const last = out[out.length - 1];
    if (last && last.m === m && Math.abs(last.to - from) < 1e-12) last.to = to;
    else out.push({ from, to, m });
  };
  // the stretch between the centres of columns i and i + 1 (the last one wraps to the first column of the next period)
  for (let i = -1; i < nx; i++) {
    const [i0, i1] = [(i + nx) % nx, (i + 1) % nx];
    const [x0, x1] = [(i + 0.5) / nx, (i + 1.5) / nx];
    const cuts = [0, 1];
    for (let m = 0; m < nm; m++)
      for (let q = m + 1; q < nm; q++) {
        const d0 = phi[m][i0] - phi[q][i0];
        const d1 = phi[m][i1] - phi[q][i1];
        if (d0 !== d1) {
          const s = d0 / (d0 - d1);
          if (s > 0 && s < 1) cuts.push(s);
        }
      }
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const m = best(i0, i1, (cuts[k] + cuts[k + 1]) / 2);
      // clipped to the period [0, 1)
      const [xa, xb] = [x0 + cuts[k] * (x1 - x0), x0 + cuts[k + 1] * (x1 - x0)];
      push(Math.max(0, xa), Math.min(1, xb), m);
    }
  }
  return out;
}

// The materials across the period at depth t (0 = top, 1 = bottom of the layer, before a flip).
export function gratingRowAt<M>(g: GratingParams<M>, t: number): Row {
  const c = g.shift;
  switch (g.profile) {
    case 'lamellar':
      return ridgeRow(c, g.fill);
    case 'trapezoid':
      return ridgeRow(c, g.fillTop + (g.fill - g.fillTop) * t);
    case 'sinus':
      // surface h(x) = (1 + cos 2π(x − c)) / 2; the ridge is where h ≥ 1 − t
      return ridgeRow(c, Math.acos(Math.max(-1, Math.min(1, 1 - 2 * t))) / Math.PI);
    case 'blazed':
      // blazed (sawtooth): h rises linearly over one period, starting at c − ½
      return ridgeRow(wrap(c + 0.5 - t / 2), t);
    case 'pixel': {
      if (g.outline === 'smooth') return smoothPixelRow(g, t);
      const { rows } = pixelRows(g);
      return pixelRow(g, Math.min(rows - 1, Math.max(0, Math.floor(t * rows))));
    }
  }
}

// Slices from the top of the layer to its bottom.
export function gratingSlices<M>(g: GratingParams<M>): Slice[] {
  const s = slicesTopDown(g);
  return g.flip ? s.reverse() : s;
}

function slicesTopDown<M>(g: GratingParams<M>): Slice[] {
  if (g.profile === 'lamellar') return [{ h: 1, segs: gratingRowAt(g, 0.5) }];
  if (g.profile === 'pixel' && g.outline !== 'smooth') {
    const { rows } = pixelRows(g);
    return Array.from({ length: rows }, (_, r) => ({ h: 1 / rows, segs: pixelRow(g, r) }));
  }
  const nz = g.profile === 'pixel' ? pixelRows(g).rows : Math.max(1, Math.round(g.slices));
  return Array.from({ length: nz }, (_, k) => ({ h: 1 / nz, segs: gratingRowAt(g, (k + 0.5) / nz) }));
}

// Smooth profiles (trapezoid, sinus, blazed) for the differential method: the materials at depth t (refractive
// indices ns of the materials) and the normal of the profile, z-independent (Popov, Gratings, ch. 7: N = (−g′, 1)/√(1 + g′²)
// for a surface z = g(x), extended through the whole layer; trapezoid: the walls' normals over their columns, x̂ elsewhere,
// Fig. 7.4). d: thickness (nm).
export const FFF_PROFILES: GratingProfile[] = ['trapezoid', 'sinus', 'blazed'];
const BLAZE_TURN = 0.1; // periods
export function gratingFff<M>(g: GratingParams<M>, d: number, ns: (m: number) => C): FffProfile {
  const flipT = (t: number) => (g.flip ? 1 - t : t);
  const sz = g.flip ? -1 : 1; // upside down: z mirrored, the xz products change sign
  const P = g.period;
  let normals: NormalSeg[];
  if (g.profile === 'trapezoid') {
    // the walls: x = c ∓ w(t)/2, w from fillTop (t = 0) to fill (t = 1); slope dx/dz = ∓(fill − fillTop) Λ / (2d)
    const s = ((g.fill - g.fillTop) * P) / (2 * d);
    const [lo, hi] = [Math.min(g.fill, g.fillTop) / 2, Math.max(g.fill, g.fillTop) / 2];
    const bands: { a: number; b: number; nx: number; nz: number }[] = [
      { a: g.shift - hi, b: g.shift - lo, nx: 1, nz: sz * s },
      { a: g.shift + lo, b: g.shift + hi, nx: 1, nz: -sz * s },
    ];
    normals = piecewise(bands, { nx: 1, nz: 0 });
  } else if (g.profile === 'sinus') {
    // surface depth z(x) = d (1 − h(x)), h = (1 + cos 2π(x − c))/2: dz/dx = d π sin 2π(x − c) / Λ
    const K = 2048;
    normals = Array.from({ length: K }, (_, k) => ({ from: k / K, to: (k + 1) / K, nx: -((d * Math.PI * Math.sin(2 * Math.PI * ((k + 0.5) / K - g.shift))) / P), nz: sz }));
  } else {
    // blazed: the facet x = c + ½ − t (dz/dx = −d/Λ) over the period, turning continuously (cos²) to x̂ at the vertical wall
    // x = c + ½ within a tenth of the period on each side — the facet's normal right at the wall gives erratic TM results
    // (gold, Λ 600, 60 nm: R₀ 0.741 / 0.584 / 0.682 at N = 15 / 30 / 45; with the turn 0.758 / 0.767 / 0.766)
    const K = 2048;
    const [fx, fz] = [d / P / Math.hypot(d / P, 1), 1 / Math.hypot(d / P, 1)];
    const xw = wrap(g.shift + 0.5);
    normals = Array.from({ length: K }, (_, k) => {
      let dw = Math.abs((k + 0.5) / K - xw);
      dw = Math.min(dw, 1 - dw);
      const w = dw < BLAZE_TURN ? Math.cos((Math.PI / 2) * (dw / BLAZE_TURN)) ** 2 : 0;
      return { from: k / K, to: (k + 1) / K, nx: (1 - w) * fx + w, nz: sz * (1 - w) * fz };
    });
  }
  const segsAt = (t: number): Segment[] => gratingRowAt(g, flipT(Math.min(1, Math.max(0, t)))).map((q) => ({ from: q.from, to: q.to, n: ns(q.m) }));
  return { segsAt, normals, key: JSON.stringify([g.profile, P, g.fill, g.fillTop, g.shift, d, !!g.flip, g.mats.length, Array.from({ length: g.mats.length }, (_, m) => ns(m))]) };
}

// Constant normals on bands [a, b] (periods, wrapped into [0, 1)) and a background value elsewhere.
function piecewise(bands: { a: number; b: number; nx: number; nz: number }[], bg: { nx: number; nz: number }): NormalSeg[] {
  const cuts: { from: number; to: number; nx: number; nz: number }[] = [];
  for (const q of bands) {
    if (!(q.b > q.a + 1e-12)) continue;
    const a = wrap(q.a);
    const b = a + (q.b - q.a);
    if (b <= 1) cuts.push({ from: a, to: b, nx: q.nx, nz: q.nz });
    else cuts.push({ from: a, to: 1, nx: q.nx, nz: q.nz }, { from: 0, to: b - 1, nx: q.nx, nz: q.nz });
  }
  cuts.sort((p, q) => p.from - q.from);
  const out: NormalSeg[] = [];
  let x = 0;
  for (const q of cuts) {
    if (q.from > x + 1e-12) out.push({ from: x, to: q.from, ...bg });
    out.push(q);
    x = Math.max(x, q.to);
  }
  if (x < 1 - 1e-12) out.push({ from: x, to: 1, ...bg });
  return out;
}

// The outline of the profile for the field maps: polylines [x0, t0, x1, t1, …] (x in periods, t: depth in the layer,
// 0 = top), the true walls rather than the staircase. Pixels as drawn: their edges; otherwise the contour between the
// materials sampled on a fine grid (marching squares).
export function gratingOutline<M>(g: GratingParams<M>): number[][] {
  const lines = g.profile === 'pixel' && g.outline !== 'smooth' ? pixelEdges(g) : contourOf((t) => gratingRowAt(g, t), g.profile === 'pixel' ? Math.max(512, 8 * Math.round(g.nx)) : 512, 129);
  return g.flip ? lines.map((p) => p.map((v, i) => (i % 2 ? 1 - v : v))) : lines;
}

function pixelEdges(g: GratingParams<unknown>): number[][] {
  const { nx, rows } = pixelRows(g);
  const lines: number[][] = [];
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < nx; i++) {
      const m = pixelAt(g, nx, r, i);
      if (pixelAt(g, nx, r, (i + 1) % nx) !== m) lines.push([(i + 1) / nx, r / rows, (i + 1) / nx, (r + 1) / rows]);
      if (r + 1 < rows && pixelAt(g, nx, r + 1, i) !== m) lines.push([i / nx, (r + 1) / rows, (i + 1) / nx, (r + 1) / rows]);
    }
  return lines;
}

// Marching squares over the materials of rowAt(t), nx samples across the period (periodic) and nt depths from the top
// face to the bottom one: a segment through the midpoints of the two sides of a cell where the material changes, or
// from each such midpoint to the centre (three or four: a junction of materials or a saddle).
export function contourOf(rowAt: (t: number) => Row, nx: number, nt: number): number[][] {
  const ts = Array.from({ length: nt }, (_, j) => Math.min(1 - 1e-9, Math.max(1e-9, j / (nt - 1))));
  const lab = ts.map((t) => {
    const row = rowAt(t);
    const out = new Int32Array(nx);
    let p = 0;
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) / nx;
      while (p < row.length - 1 && row[p].to <= x) p++;
      out[i] = row[p].m;
    }
    return out;
  });
  const lines: number[][] = [];
  for (let j = 0; j + 1 < nt; j++)
    for (let i = 0; i < nx; i++) {
      const i1 = (i + 1) % nx;
      const [a, b, c, d] = [lab[j][i], lab[j][i1], lab[j + 1][i1], lab[j + 1][i]];
      if (a === b && b === c && c === d) continue;
      const [xl, xr, xm] = [(i + 0.5) / nx, (i + 1.5) / nx, (i + 1) / nx];
      const [tt, tb, tm] = [ts[j], ts[j + 1], (ts[j] + ts[j + 1]) / 2];
      const pts: [number, number][] = [];
      if (a !== b) pts.push([xm, tt]);
      if (b !== c) pts.push([xr, tm]);
      if (c !== d) pts.push([xm, tb]);
      if (d !== a) pts.push([xl, tm]);
      if (pts.length === 2) lines.push([...pts[0], ...pts[1]]);
      else for (const p of pts) lines.push([...p, xm, tm]);
    }
  return lines;
}

// Smallest feature (fraction of the period) of the staircase: the orders must resolve it.
export function smallestFeature(slices: Slice[]): number {
  let w = 1;
  for (const s of slices) for (const g of s.segs) if (g.to - g.from > 1e-12) w = Math.min(w, g.to - g.from);
  return w;
}

export const defaultPixels = (nx: number, rows: number, fill = 0.5): number[] =>
  Array.from({ length: rows * nx }, (_, k) => (Math.abs(((k % nx) + 0.5) / nx - 0.5) < fill / 2 ? 0 : 1));
