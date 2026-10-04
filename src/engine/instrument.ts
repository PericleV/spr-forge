// What a measuring instrument does to a computed curve (Tolerance analysis): the finite angular spread of the beam and
// the spectral width of the source blur it (convolutions along θ and λ), and the detector adds noise. The noise model
// follows Piliarik & Homola, Opt. Express 17, 16505 (2009): shot noise of the detected light, additive (thermal /
// read-out / dark) noise, fluctuations of the source intensity, averaging of K scans and the ADC quantization.
import { strides } from './dataset.ts';
import { rng } from './optimize.ts';
import type { Dataset } from './types.ts';
import type { InstrumentFields } from '../types.ts';

export type Instrument = {
  along: string; // the measured curve: a scan along this axis (one source fluctuation per scan)
  spread: number; // angular spread of the beam, ° (0 = none); its meaning set by `shape`
  shape: 'gauss' | 'uniform' | 'na'; // Gaussian σ; uniform ± half-angle; NA: uniform ± asin(NA)
  band: number; // spectral width of the source, nm FWHM (Gaussian; 0 = none)
  add: number; // additive noise σ (thermal / read-out / dark), in units of R (full scale = 1)
  shot: number; // detected photoelectrons at R = 1 per point and scan (0 = no shot noise)
  source: number; // relative σ of the source intensity per scan (0.001 = 0.1 %)
  avg: number; // scans averaged
  bits: number; // ADC resolution over the full scale R = 1 (0 = not quantized)
  seed: number;
};

// The half-angle (σ for a Gaussian) of the angular spread, in degrees.
export const spreadDeg = (i: Instrument) => (i.shape === 'na' ? (Math.asin(Math.min(1, Math.max(0, i.spread))) * 180) / Math.PI : i.spread);
export const blurs = (i: Instrument) => spreadDeg(i) > 0 || i.band > 0;
export const noisy = (i: Instrument) => i.add > 0 || i.shot > 0 || i.source > 0 || i.bits > 0;

// Kernel nodes (offset, weight) of the convolution along θ or λ.
function kernel(kind: 'gauss' | 'uniform', w: number): [number, number][] {
  const K = 41;
  if (kind === 'uniform') return Array.from({ length: K }, (_, k) => [w * (-1 + (2 * k + 1) / K), 1]);
  return Array.from({ length: K }, (_, k) => {
    const u = -4 + (8 * k) / (K - 1);
    return [u * w, Math.exp(-0.5 * u * u)];
  });
}

// Every curve along axis `a` convolved with the kernel: y linear between the samples, the part of the kernel outside the
// computed range left out (weights renormalized).
function convolve(ds: Dataset, f: Float64Array, a: number, ker: [number, number][]): Float64Array {
  const out = new Float64Array(f.length);
  const xs = ds.axes[a].values;
  const n = xs.length;
  const st = strides(ds.axes)[a];
  const asc = xs[n - 1] >= xs[0];
  const at = (base: number, x: number) => {
    // linear interpolation on the curve starting at `base`
    let lo = 0;
    let hi = n - 1;
    const v = (i: number) => (asc ? xs[i] : xs[n - 1 - i]);
    if (x < v(0) || x > v(n - 1)) return NaN;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (v(m) <= x) lo = m;
      else hi = m;
    }
    const [i0, i1] = asc ? [lo, hi] : [n - 1 - lo, n - 1 - hi];
    const t = xs[i1] === xs[i0] ? 0 : (x - xs[i0]) / (xs[i1] - xs[i0]);
    return f[base + i0 * st] * (1 - t) + f[base + i1 * st] * t;
  };
  const curves = f.length / n;
  for (let c = 0; c < curves; c++) {
    const base = Math.floor(c / st) * st * n + (c % st);
    for (let i = 0; i < n; i++) {
      let sw = 0;
      let sy = 0;
      for (const [u, w] of ker) {
        const y = at(base, xs[i] + u);
        if (Number.isFinite(y)) {
          sw += w;
          sy += w * y;
        }
      }
      out[base + i * st] = sw > 0 ? sy / sw : f[base + i * st];
    }
  }
  return out;
}

// The grid steps compared with the blur widths (a coarse grid makes the convolution inexact).
export function blurWarnings(ds: Dataset, i: Instrument): string[] {
  const w: string[] = [];
  const check = (id: string, width: number, what: string, unit: string) => {
    const ax = ds.axes.find((x) => x.id === id);
    if (!ax || ax.values.length < 2) {
      w.push(`${what} needs a range of ${id === 'theta' ? 'θ' : 'λ'} (the convolution runs along it): it is not applied.`);
      return;
    }
    const step = Math.abs(ax.values[ax.values.length - 1] - ax.values[0]) / (ax.values.length - 1);
    if (step > width) w.push(`${what} (${+width.toPrecision(3)} ${unit}) is finer than the grid step (${+step.toPrecision(3)} ${unit}): compute more points for an accurate convolution.`);
  };
  const s = spreadDeg(i);
  if (s > 0) check('theta', i.shape === 'gauss' ? s : s / 2, 'The angular spread', '°');
  if (i.band > 0) check('lambda', i.band / 2.3548, 'The source bandwidth', 'nm');
  return w;
}

// Dataset as measured: blurred, then (noise = true) with the detector noise of realization `stream`. R, T and A are
// blurred; R and T get the noise and A = 1 − R − T. Other fields are kept as they are.
export function degrade(ds: Dataset, inst: Instrument, stream: number, noise = true): Dataset {
  const fields: Record<string, Float64Array> = { ...ds.fields };
  const blurred = ['R', 'T', 'A'].filter((k) => fields[k]);
  const th = ds.axes.findIndex((a) => a.id === 'theta' && a.values.length > 1);
  const la = ds.axes.findIndex((a) => a.id === 'lambda' && a.values.length > 1);
  const s = spreadDeg(inst);
  for (const k of blurred) {
    let f = fields[k];
    if (s > 0 && th >= 0) f = convolve(ds, f, th, kernel(inst.shape === 'gauss' ? 'gauss' : 'uniform', s));
    if (inst.band > 0 && la >= 0) f = convolve(ds, f, la, kernel('gauss', inst.band / 2.3548));
    fields[k] = f;
  }
  if (noise && noisy(inst)) {
    const rand = rng((inst.seed * 7919 + stream * 104729 + 13) >>> 0);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const K = Math.max(1, Math.round(inst.avg));
    const a = Math.max(0, ds.axes.findIndex((x) => x.id === inst.along));
    const n = ds.axes[a].values.length;
    const st = strides(ds.axes)[a];
    const lsb = inst.bits > 0 ? 2 ** -Math.round(inst.bits) : 0;
    // one scan of a point: source fluctuation (the scan's ε), shot and additive noise, quantization
    const scan = (y: number, eps: number) => {
      const yl = y * (1 + eps);
      let v = yl + (inst.shot > 0 ? Math.sqrt(Math.max(0, yl) / inst.shot) * gauss() : 0) + inst.add * gauss();
      if (lsb) v = Math.round(v / lsb) * lsb;
      return v;
    };
    const keys = ['R', 'T'].filter((k) => fields[k]);
    for (const k of keys) fields[k] = Float64Array.from(fields[k]);
    const curves = ds.size / n;
    for (let c = 0; c < curves; c++) {
      const base = Math.floor(c / st) * st * n + (c % st);
      // the scans of this curve: their source factors (the same for R and T: one source)
      const eps = Array.from({ length: lsb ? K : 1 }, () => inst.source * gauss());
      for (const k of keys) {
        const f = fields[k];
        for (let i = 0; i < n; i++) {
          const p = base + i * st;
          const y = f[p];
          if (!Number.isFinite(y)) continue;
          if (lsb) {
            // quantized scans averaged one by one (the noise dithers the quantization)
            let sum = 0;
            for (let j = 0; j < K; j++) sum += scan(y, eps[j]);
            f[p] = sum / K;
          } else {
            // the average of K scans: every random part divided by √K
            const yl = y * (1 + eps[0] / Math.sqrt(K));
            f[p] = yl + ((inst.shot > 0 ? Math.sqrt(Math.max(0, yl) / inst.shot) : 0) * gauss() + inst.add * gauss()) / Math.sqrt(K);
          }
        }
      }
    }
    if (fields.A && fields.R && fields.T) fields.A = Float64Array.from(fields.R, (r, p) => 1 - r - fields.T[p]);
  }
  return { ...ds, key: `${ds.key}|inst:${JSON.stringify(inst)}:${noise ? stream : 'blur'}`, fields, instrument: { inst, stream } };
}

// Values of the instrument settings not yet set on a node.
export const INSTRUMENT_DEFAULTS = { spread: 0.05, band: 1, add: 0.001, shot: 1e5, source: 0.1, avg: 1, bits: 16 };

// The instrument of a node's settings (null when it does nothing): `along` = the measured curve's axis.
export function instrumentOf(d: InstrumentFields, along: string, seed: number): Instrument | null {
  const i: Instrument = {
    along,
    spread: d.spreadOn ? (d.spread ?? INSTRUMENT_DEFAULTS.spread) : 0,
    shape: d.spreadShape ?? 'gauss',
    band: d.bandOn ? (d.band ?? INSTRUMENT_DEFAULTS.band) : 0,
    add: d.noise ? (d.noiseAdd ?? INSTRUMENT_DEFAULTS.add) : 0,
    shot: d.noise ? (d.noiseShot ?? 0) : 0,
    source: d.noise ? (d.noiseSource ?? 0) / 100 : 0,
    avg: d.noise ? Math.max(1, Math.round(d.noiseAvg ?? 1)) : 1,
    bits: d.noise ? (d.noiseBits ?? 0) : 0,
    seed,
  };
  return blurs(i) || noisy(i) ? i : null;
}
