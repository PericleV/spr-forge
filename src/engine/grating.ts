// Geometry of a 1D grating layer: a profile and its parameters, turned into horizontal slices of piecewise-constant
// material (the staircase actually computed by the RCWA and drawn by View Grating). x in units of the period.
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
};

export type Slice = { h: number; segs: { from: number; to: number; m: number }[] }; // h: fraction of the thickness

const wrap = (x: number) => ((x % 1) + 1) % 1;

// Ridge interval [c − w/2, c + w/2] (wrapped into [0, 1)) in a groove background.
function ridgeRow(center: number, width: number, ridge = 0, groove = 1): Slice['segs'] {
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

// Slices from the top of the layer to its bottom.
export function gratingSlices<M>(g: GratingParams<M>): Slice[] {
  const s = slicesTopDown(g);
  return g.flip ? s.reverse() : s;
}

function slicesTopDown<M>(g: GratingParams<M>): Slice[] {
  const nz = Math.max(1, Math.round(g.slices));
  const c = g.shift;
  if (g.profile === 'lamellar') return [{ h: 1, segs: ridgeRow(c, g.fill) }];
  if (g.profile === 'pixel') {
    const nx = Math.max(1, Math.round(g.nx));
    const rows = Math.max(1, Math.round(g.pixels.length / nx) || nz);
    return Array.from({ length: rows }, (_, r) => {
      const segs: Slice['segs'] = [];
      for (let i = 0; i < nx; i++) {
        const v = g.pixels[r * nx + i];
        const m = Number.isInteger(v) && v >= 0 && v < g.mats.length ? v : 1;
        const last = segs[segs.length - 1];
        if (last && last.m === m) last.to = (i + 1) / nx;
        else segs.push({ from: i / nx, to: (i + 1) / nx, m });
      }
      return { h: 1 / rows, segs };
    });
  }
  return Array.from({ length: nz }, (_, k) => {
    const t = (k + 0.5) / nz; // depth of the slice centre from the top (0 … 1)
    let segs: Slice['segs'];
    if (g.profile === 'trapezoid') segs = ridgeRow(c, g.fillTop + (g.fill - g.fillTop) * t);
    else if (g.profile === 'sinus') {
      // surface h(x) = (1 + cos 2π(x − c)) / 2; the ridge is where h ≥ 1 − t
      segs = ridgeRow(c, Math.acos(Math.max(-1, Math.min(1, 1 - 2 * t))) / Math.PI);
    } else {
      // blazed (sawtooth): h rises linearly over one period, starting at c − ½
      const w = t;
      segs = ridgeRow(wrap(c + 0.5 - w / 2), w);
    }
    return { h: 1 / nz, segs };
  });
}

// Smallest feature (fraction of the period) of the staircase: the orders must resolve it.
export function smallestFeature(slices: Slice[]): number {
  let w = 1;
  for (const s of slices) for (const g of s.segs) if (g.to - g.from > 1e-12) w = Math.min(w, g.to - g.from);
  return w;
}

export const defaultPixels = (nx: number, rows: number, fill = 0.5): number[] =>
  Array.from({ length: rows * nx }, (_, k) => (Math.abs(((k % nx) + 0.5) / nx - 0.5) < fill / 2 ? 0 : 1));
