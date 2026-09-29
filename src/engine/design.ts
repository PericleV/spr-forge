// Thin-film filter design: merit of a layer sequence against target specifications, with analytic derivatives,
// refinement (Levenberg–Marquardt on the thicknesses), needle optimization and gradual evolution.
// Pure: runs in the design worker and in the check scripts.
import { c, type C } from '../physics/complex.ts';
import { attenuation, coherent, dPlate, plate, type Faces, type Film, type NeedleProbe } from '../physics/admittance.ts';
import type { Polarization } from '../physics/tmm.ts';
import { rng } from './optimize.ts';
import { dOdOf, odOf, residualOf, type SpecKind } from './spec.ts';

export type DesignLayer = { m: number; d: number }; // material index (into the problem's materials), thickness nm
export type Design = { front: DesignLayer[]; back: DesignLayer[] };
export type Side = 'front' | 'back';
export type Quantity = 'R' | 'T' | 'A' | 'OD'; // OD = −log₁₀ T
export type PolMode = 's' | 'p' | 'avg';

// A target sample: at wavelength li and angle ai, quantity q (for pol s, p or their mean) should be equal to (kind 'eq',
// default), ≥ or ≤ target, within tol (default 1); w = weight.
export type Sample = { li: number; ai: number; pol: PolMode; q: Quantity; target: number; w: number; kind?: SpecKind; tol?: number };

export type DesignProblem = {
  lambdas: number[]; // nm
  angles: number[]; // degrees, in the incident medium
  mats: C[][]; // [material][λ]: the coating materials
  names: string[];
  n0: C[]; // incident medium per λ (lossless: Re is used)
  nS: C[]; // substrate per λ
  nOut: C[]; // medium behind the back side (thick substrate only)
  thick: number | null; // substrate thickness in nm (incoherent), null = semi-infinite substrate
  sides: Side[]; // coatings being designed
  samples: Sample[];
  minD: number; // thinner layers are removed
  maxD: number; // upper bound of a layer thickness
  maxLayers: number; // per side
  maxTotal: number; // nm per side (soft penalty above)
  p?: number; // exponent of the merit function (default 2); the designer minimizes MF^p (+ the thickness penalty)
  nRef?: number[]; // Re n of each coating material at the reference wavelength (quarter waves)
};

export type Evaluation = {
  merit: number; // Σ r² = MF^p + the total-thickness penalty
  mf: number; // the merit function MF = [Σ w |e/Δ|^p / Σ w]^(1/p)
  residuals: number[];
  X: number[]; // value of each sample's quantity
  J?: number[][]; // ∂residual/∂d, variables = designed layers (front then back)
  needle?: { side: Side; layer: number; z: number; m: number; value: number }[]; // ∂merit/∂(inserted thickness)
};

const wsum = (p: DesignProblem) => p.samples.reduce((s, x) => s + x.w, 0) || 1;
// The designer needs a smooth merit: p in [2, 16].
export const meritExponent = (p: DesignProblem) => Math.min(16, Math.max(2, p.p ?? 2));
export const variablesOf = (p: DesignProblem, d: Design) => p.sides.flatMap((s) => d[s].map((_, j) => ({ side: s, j })));
const films = (p: DesignProblem, layers: DesignLayer[], li: number): Film[] => layers.map((L) => ({ n: p.mats[L.m][li], d: L.d }));

// Needle probes of a side: every `step` nm inside each layer, plus the end of the stack.
function probesOf(layers: DesignLayer[], step: number): NeedleProbe[] {
  const out: NeedleProbe[] = [];
  layers.forEach((L, j) => {
    const n = Math.max(1, Math.round(L.d / step));
    for (let k = 0; k < n; k++) out.push({ layer: j, z: (k * L.d) / n });
  });
  out.push({ layer: layers.length, z: 0 });
  return out;
}

type Point = { R: number; T: number; dR: number[]; dT: number[]; nR?: number[][]; nT?: number[][] };

export function evaluateDesign(p: DesignProblem, design: Design, opts: { grad?: boolean; needle?: { side: Side; step: number } } = {}): Evaluation {
  const vars = variablesOf(p, design);
  const nv = vars.length;
  const W = wsum(p);
  const P = meritExponent(p);
  const candidates = p.mats.map((_, m) => m);
  const probes = opts.needle ? probesOf(design[opts.needle.side], opts.needle.step) : [];
  // group the samples by (λ, angle) and polarizations needed
  const groups = new Map<string, { li: number; ai: number; pols: Set<Polarization>; idx: number[] }>();
  p.samples.forEach((s, k) => {
    const key = `${s.li}|${s.ai}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { li: s.li, ai: s.ai, pols: new Set(), idx: [] }));
    if (s.pol === 'avg') {
      g.pols.add('s');
      g.pols.add('p');
    } else g.pols.add(s.pol);
    g.idx.push(k);
  });

  const X = new Array<number>(p.samples.length).fill(0);
  const residuals = new Array<number>(p.samples.length).fill(0);
  const J = opts.grad ? p.samples.map(() => new Array<number>(nv).fill(0)) : undefined;
  const nd = probes.length * candidates.length;
  const needleSum = opts.needle ? new Array<number>(nd).fill(0) : undefined;

  for (const g of groups.values()) {
    const lam = p.lambdas[g.li];
    const k0 = (2 * Math.PI) / lam;
    const n0 = c(p.n0[g.li].re);
    const kx = n0.re * Math.sin((p.angles[g.ai] * Math.PI) / 180);
    const cand = candidates.map((m) => p.mats[m][g.li]);
    const pts = new Map<Polarization, Point>();
    // at normal incidence s and p are the same wave (up to ~k/n of an absorbing exit): computed once
    const normal = p.angles[g.ai] === 0 && g.pols.size === 2;
    for (const pol of normal ? (['s'] as Polarization[]) : g.pols) {
      const wantF = p.sides.includes('front');
      const wantB = p.sides.includes('back');
      const nd0 = opts.needle?.side;
      const frontOpts = { grad: !!opts.grad && wantF, ...(nd0 === 'front' ? { probes, candidates: cand } : {}) };
      if (p.thick === null) {
        const r = coherent(films(p, design.front, g.li), n0, p.nS[g.li], kx, k0, pol, frontOpts);
        pts.set(pol, {
          R: r.faces.R,
          T: r.faces.T,
          dR: r.grad?.map((x) => x.R) ?? [],
          dT: r.grad?.map((x) => x.T) ?? [],
          nR: r.needle?.map((row) => row.map((x) => x.R)),
          nT: r.needle?.map((row) => row.map((x) => x.T)),
        });
        continue;
      }
      // thick substrate: coherent front and back coatings, incoherent substrate
      const sub = c(p.nS[g.li].re);
      const f = coherent(films(p, design.front, g.li), n0, sub, kx, k0, pol, frontOpts);
      const back = kx < sub.re ? coherent(films(p, design.back, g.li), sub, p.nOut[g.li], kx, k0, pol, { grad: !!opts.grad && wantB, ...(nd0 === 'back' ? { probes, candidates: cand } : {}) }) : null;
      if (!back) {
        pts.set(pol, { R: f.faces.R, T: 0, dR: f.grad?.map((x) => x.R) ?? [], dT: f.grad?.map(() => 0) ?? [] });
        continue;
      }
      const parts = { f: f.faces, b: back.faces, a: attenuation(p.nS[g.li], kx, k0, p.thick) };
      const pl = plate(parts);
      const map = (front: boolean) => (x: Faces) => dPlate(parts, front ? x : null, front ? null : x);
      const fd = f.grad?.map(map(true)) ?? [];
      const bd = back.grad?.map(map(false)) ?? [];
      const nsrc = nd0 === 'front' ? f.needle : nd0 === 'back' ? back.needle : undefined;
      const nmap = nsrc?.map((row) => row.map(map(nd0 === 'front')));
      pts.set(pol, {
        R: pl.R,
        T: pl.T,
        dR: [...(wantF ? fd.map((x) => x.R) : []), ...(wantB ? bd.map((x) => x.R) : [])],
        dT: [...(wantF ? fd.map((x) => x.T) : []), ...(wantB ? bd.map((x) => x.T) : [])],
        nR: nmap?.map((row) => row.map((x) => x.R)),
        nT: nmap?.map((row) => row.map((x) => x.T)),
      });
    }
    if (normal) pts.set('p', pts.get('s')!);
    for (const k of g.idx) {
      const s = p.samples[k];
      const pols: Polarization[] = s.pol === 'avg' ? ['s', 'p'] : [s.pol];
      const wt = 1 / pols.length;
      const sw = Math.sqrt(s.w / W);
      const base = s.q === 'OD' ? 'T' : s.q; // OD is computed from T (after the polarization mean)
      let x = 0;
      for (const pol of pols) {
        const pt = pts.get(pol)!;
        x += wt * (base === 'R' ? pt.R : base === 'T' ? pt.T : 1 - pt.R - pt.T);
      }
      // chain rule: residual r(value(x)), value = x or OD(x)
      const chain = s.q === 'OD' ? dOdOf(x) : 1;
      if (s.q === 'OD') x = odOf(x);
      X[k] = x;
      const res = residualOf(s.kind, x, s.target, s.tol ?? 1, sw, P);
      residuals[k] = res.r;
      const factor = res.g * chain;
      // the Jacobian row (zero for a met one-sided target)
      if (J && factor !== 0) {
        const row = J[k];
        for (const pol of pols) {
          const pt = pts.get(pol)!;
          const f = factor * wt;
          const n = Math.min(nv, pt.dR.length);
          if (base === 'R') for (let v2 = 0; v2 < n; v2++) row[v2] += f * pt.dR[v2];
          else if (base === 'T') for (let v2 = 0; v2 < n; v2++) row[v2] += f * pt.dT[v2];
          else for (let v2 = 0; v2 < n; v2++) row[v2] -= f * (pt.dR[v2] + pt.dT[v2]);
        }
      }
      if (needleSum && factor !== 0) {
        for (const pol of pols) {
          const pt = pts.get(pol)!;
          if (!pt.nR) continue;
          let t = 0;
          for (let pi = 0; pi < probes.length; pi++)
            for (let m = 0; m < candidates.length; m++, t++) {
              const dv = base === 'R' ? pt.nR[pi][m] : base === 'T' ? pt.nT![pi][m] : -pt.nR[pi][m] - pt.nT![pi][m];
              needleSum[t] += 2 * res.r * factor * wt * dv;
            }
        }
      }
    }
  }
  // soft penalty on the total thickness of each designed side
  let penalty = 0;
  for (const side of p.sides) {
    const tot = design[side].reduce((s, L) => s + L.d, 0);
    if (tot > p.maxTotal) {
      const e = (tot - p.maxTotal) / p.maxTotal;
      penalty += e * e;
      if (J) {
        const row = new Array<number>(nv).fill(0);
        vars.forEach((v, i) => v.side === side && (row[i] = 1 / p.maxTotal));
        J.push(row);
      }
      residuals.push(e);
    } else if (J) {
      J.push(new Array<number>(nv).fill(0));
      residuals.push(0);
    }
  }
  const sum = residuals.slice(0, p.samples.length).reduce((s, r) => s + r * r, 0);
  const ev: Evaluation = { merit: sum + penalty, mf: sum ** (1 / P), residuals, X, J };
  if (needleSum && opts.needle) {
    const side = opts.needle.side;
    ev.needle = [];
    let t = 0;
    for (const pr of probes)
      for (const m of candidates) {
        ev.needle.push({ side, layer: pr.layer, z: pr.z, m, value: needleSum[t++] });
      }
  }
  return ev;
}

// ---- Design operations ----

const clone = (d: Design): Design => ({ front: d.front.map((L) => ({ ...L })), back: d.back.map((L) => ({ ...L })) });

// Removes layers thinner than minD and merges neighbours of the same material.
export function cleanup(p: DesignProblem, d: Design): Design {
  const out = clone(d);
  for (const side of ['front', 'back'] as Side[]) {
    let L = out[side].filter((x) => x.d >= p.minD);
    let merged = true;
    while (merged) {
      merged = false;
      const next: DesignLayer[] = [];
      for (const x of L) {
        const last = next.at(-1);
        if (last && last.m === x.m) {
          last.d += x.d;
          merged = true;
        } else next.push({ ...x });
      }
      L = next;
    }
    out[side] = L;
  }
  return out;
}

// pool: optional parallel refinement (deep search in sub-workers): `refine` refines one candidate design, ended early
// against the best trajectory `best` (see refineCandidate); `size` = the sub-workers available (0 once the pool failed).
// Without it, the candidates are refined one after another.
export type RefineResult = { design: Design; merit: number; stoppedEarly?: boolean; trajectory: number[] };
export type RefinePool = { readonly size: number; refine: (p: DesignProblem, d: Design, iterations: number, best: number[] | null) => Promise<RefineResult> };
export type Control = { stopped: () => boolean; tick: () => Promise<void>; pool?: RefinePool };
const NO_CONTROL: Control = { stopped: () => false, tick: async () => {} };

// Levenberg–Marquardt on the thicknesses of the designed layers (bounded to [0, maxD]). `watch(iteration, merit)` can
// end a refinement early (deep search: trajectories that have little chance to win); `stoppedEarly` is then set.
export async function refine(
  p: DesignProblem,
  d0: Design,
  iterations = 60,
  ctl: Control = NO_CONTROL,
  watch?: (it: number, merit: number) => boolean,
): Promise<RefineResult> {
  let d = clone(d0);
  const vars = variablesOf(p, d);
  let ev = evaluateDesign(p, d, { grad: vars.length > 0 });
  const trajectory = [ev.merit];
  if (!vars.length) return { design: d, merit: ev.merit, trajectory };
  let lambda = 1e-3;
  const nv = vars.length;
  const set = (base: Design, x: number[]) => {
    const n = clone(base);
    vars.forEach((v, i) => (n[v.side][v.j].d = Math.min(p.maxD, Math.max(0, x[i]))));
    return n;
  };
  for (let it = 0; it < iterations; it++) {
    if (ctl.stopped()) break;
    const J = ev.J!;
    const r = ev.residuals;
    // normal equations: JᵀJ (upper triangle, row-major) and Jᵀr; the rows of met one-sided targets are zero and skipped
    const JtJ = new Float64Array(nv * nv);
    const Jtr = new Float64Array(nv);
    for (let k = 0; k < J.length; k++) {
      const row = J[k];
      const rk = r[k];
      for (let a = 0; a < nv; a++) {
        const ra = row[a];
        if (ra === 0) continue;
        Jtr[a] += ra * rk;
        const o = a * nv;
        for (let b = a; b < nv; b++) JtJ[o + b] += ra * row[b];
      }
    }
    const x0 = vars.map((v) => d[v.side][v.j].d);
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const step = dampedStep(JtJ, Jtr, nv, lambda);
      if (step) {
        const cand = set(d, x0.map((x, i) => x + step[i]));
        const trialMerit = evaluateDesign(p, cand).merit; // the Jacobian only for accepted steps
        if (trialMerit < ev.merit) {
          const gain = (ev.merit - trialMerit) / (ev.merit || 1);
          [d, ev] = [cand, evaluateDesign(p, cand, { grad: true })];
          lambda = Math.max(lambda / 3, 1e-12);
          improved = true;
          if (gain < 1e-10) it = iterations;
          break;
        }
      }
      lambda *= 5;
    }
    if (!improved) break;
    trajectory.push(ev.merit);
    if (watch?.(trajectory.length - 1, ev.merit)) return { design: d, merit: ev.merit, stoppedEarly: true, trajectory };
    if (it % 5 === 0) await ctl.tick();
  }
  return { design: d, merit: ev.merit, trajectory };
}

// The Levenberg–Marquardt step: solves (JᵀJ + λ·diag JᵀJ) x = −Jᵀr by Cholesky (the damped normal matrix is symmetric
// positive definite; JtJ holds its upper triangle). null when a pivot is not positive: the caller then damps more.
function dampedStep(JtJ: Float64Array, Jtr: Float64Array, n: number, lambda: number): Float64Array | null {
  const L = new Float64Array(n * n); // lower factor, row-major: A = L Lᵀ
  for (let j = 0; j < n; j++) {
    const Lj = j * n;
    const ajj = JtJ[Lj + j];
    let s = ajj + lambda * (ajj || 1e-12) + 1e-18;
    for (let k = 0; k < j; k++) s -= L[Lj + k] * L[Lj + k];
    if (!(s > 0)) return null;
    const ljj = Math.sqrt(s);
    L[Lj + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      const Li = i * n;
      let t = JtJ[Lj + i]; // A[i][j] = A[j][i], upper triangle
      for (let k = 0; k < j; k++) t -= L[Li + k] * L[Lj + k];
      L[Li + j] = t / ljj;
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const Li = i * n;
    let t = -Jtr[i];
    for (let k = 0; k < i; k++) t -= L[Li + k] * x[k];
    x[i] = t / L[Li + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let t = x[i];
    for (let k = i + 1; k < n; k++) t -= L[k * n + i] * x[k];
    x[i] = t / L[i * n + i];
  }
  return x;
}

const layerCount = (d: Design, side: Side) => d[side].length;
const total = (d: Design, side: Side) => d[side].reduce((s, L) => s + L.d, 0);

// Inserts a thin layer of material m at depth z of layer j (splitting it), or at the end.
function insert(d: Design, side: Side, j: number, z: number, m: number, t: number): Design {
  const n = clone(d);
  const L = n[side];
  if (j >= L.length) L.push({ m, d: t });
  else if (z <= 1e-9) L.splice(j, 0, { m, d: t });
  else L.splice(j, 1, { m: L[j].m, d: z }, { m, d: t }, { m: L[j].m, d: L[j].d - z });
  return n;
}

export type Progress = { phase: string; iteration: number; merit: number; design: Design; history: number[]; historyD: number[] };
// needle: classical needle + gradual evolution; deep: deep search needle / gradual evolution (+ random kicks when stuck);
// gradual: gradual evolution (Tikhonravov); random: random perturbations + refinement; refine: thicknesses only;
// clean: design cleaner (deep) down to `cleanTo` layers per coating.
export type DesignSettings = {
  algorithm: 'needle' | 'deep' | 'gradual' | 'random' | 'refine' | 'clean';
  iterations: number;
  needleStep: number;
  lambdaRef: number;
  candidates?: number; // deep search: candidates refined per step (default 12)
  cleanTo?: number; // design cleaner: target number of layers per coating
  seed?: number; // random perturbations
};

// Refinement followed by thin-layer removal until the design is stable.
async function settle(p: DesignProblem, d: Design, ctl: Control, iterations = 80) {
  let r = await refine(p, d, iterations, ctl);
  for (let k = 0; k < 4; k++) {
    const c2 = cleanup(p, r.design);
    const changed = p.sides.some((s) => c2[s].length !== r.design[s].length);
    if (!changed) break;
    r = await refine(p, c2, iterations, ctl);
  }
  return { design: cleanup(p, r.design), merit: evaluateDesign(p, cleanup(p, r.design)).merit };
}

type Current = { design: Design; merit: number };
const GAIN = 1e-3; // smallest relative improvement worth a new layer

// Needle step: inserts a thin layer where the needle function is most negative, refines, keeps it if better.
async function needleStep(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, room: (side: Side) => boolean): Promise<Current | null> {
  const all: { side: Side; layer: number; z: number; m: number; value: number }[] = [];
  for (const side of p.sides) {
    if (!room(side)) continue;
    const ev = evaluateDesign(p, cur.design, { needle: { side, step: s.needleStep } });
    const L = cur.design[side];
    for (const n of ev.needle!) {
      const host = n.layer < L.length ? L[n.layer].m : -1;
      const prev = n.z <= 1e-9 && n.layer > 0 ? L[n.layer - 1].m : n.layer >= L.length && L.length ? L[L.length - 1].m : -1;
      if (n.m === host || n.m === prev) continue; // same material as a neighbour: only a thickness change
      all.push(n);
    }
  }
  // the most negative value of each (side, layer, material), then the sides taken in turn
  const best = new Map<string, (typeof all)[number]>();
  for (const n of all) {
    const k = `${n.side}|${n.layer}|${n.m}`;
    if (!best.has(k) || n.value < best.get(k)!.value) best.set(k, n);
  }
  const bySide = p.sides.map((side) => [...best.values()].filter((n) => n.side === side && n.value < -1e-9 * Math.max(cur.merit, 1e-12)).sort((a, b) => a.value - b.value));
  // the best of the first few candidates of each side (the first acceptable one is often a poor local choice)
  const order = bySide.flatMap((l) => l.slice(0, 3));
  let winner: Current | null = null;
  for (const n of order) {
    if (ctl.stopped()) break;
    const trial = await settle(p, insert(cur.design, n.side, n.layer, n.z, n.m, Math.max(1, p.minD)), ctl, 60);
    if (trial.merit < cur.merit * (1 - GAIN) && (!winner || trial.merit < winner.merit)) winner = trial;
  }
  if (winner) return winner;
  return null;
}

// Quarter-wave insertion step (used after the classical needle step): a quarter-wave layer (at the reference wavelength)
// tried at every interface; each try gets a short refinement, the three most promising a full one, and the best is kept.
async function quarterWaveStep(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, room: (side: Side) => boolean): Promise<Current | null> {
  const quick: { design: Design; merit: number }[] = [];
  for (const side of p.sides) {
    if (!room(side)) continue;
    const L = cur.design[side];
    for (let j = 0; j <= L.length; j++)
      for (let m = 0; m < p.mats.length; m++) {
        if (ctl.stopped()) return null;
        if ((j > 0 && L[j - 1].m === m) || (j < L.length && L[j].m === m)) continue;
        const qw = s.lambdaRef / 4 / nAtRef(p, m, s.lambdaRef);
        quick.push(await refine(p, insert(cur.design, side, j, 0, m, qw), 8, ctl));
      }
  }
  quick.sort((a, b) => a.merit - b.merit);
  let best: Current | null = null;
  for (const q of quick.slice(0, 3)) {
    if (ctl.stopped()) break;
    const trial = await settle(p, q.design, ctl, 60);
    if (trial.merit < cur.merit * (1 - GAIN) && (!best || trial.merit < best.merit)) best = trial;
  }
  return best;
}

const refIndex = (p: DesignProblem, lambdaRef: number) => p.lambdas.reduce((k, l, i) => (Math.abs(l - lambdaRef) < Math.abs(p.lambdas[k] - lambdaRef) ? i : k), 0);
// Re n of material m at the reference wavelength (else at the nearest wavelength of the problem).
export const nAtRef = (p: DesignProblem, m: number, lambdaRef: number) => p.nRef?.[m] ?? p.mats[m][refIndex(p, lambdaRef)].re;

// ---- Deep search (M. Trubetskov, Appl. Opt. 59, A75 (2020)) ----
// Every possible step is refined, the best refined design is taken. Refinements are ended early when their merit falls
// behind the best trajectory of the step (the "machine learning" element of the method).

type Trajectories = { best: number[] | null };
const watchOf = (tr: Trajectories) => (it: number, merit: number) => {
  const b = tr.best;
  if (!b || it < 4) return false;
  const ref = b[Math.min(it, b.length - 1)];
  return merit > 1.5 * ref + 1e-15;
};

// One candidate refined against the best trajectory so far (the task of a deep search sub-worker).
export const refineCandidate = (p: DesignProblem, d: Design, iterations: number, best: number[] | null) => refine(p, d, iterations, NO_CONTROL, watchOf({ best }));

// The best refined design among candidates, one after another (early termination against the best trajectory so far).
export async function bestRefined(p: DesignProblem, cands: Design[], iterations: number, ctl: Control): Promise<{ design: Design; merit: number } | null> {
  const tr: Trajectories = { best: null };
  let best: { design: Design; merit: number } | null = null;
  for (const c of cands) {
    if (ctl.stopped()) break;
    await ctl.tick();
    const r = await refine(p, c, iterations, ctl, watchOf(tr));
    if (r.stoppedEarly) continue;
    if (!tr.best || r.merit < tr.best[tr.best.length - 1]) tr.best = r.trajectory;
    if (!best || r.merit < best.merit) best = { design: r.design, merit: r.merit };
  }
  return best;
}

// The same with a pool: the candidates (in order of promise) handed out one at a time to the free sub-workers, each refined
// against the best trajectory known when it starts. If the pool fails (a sub-worker that cannot start or breaks), the
// step is done here, one candidate after another (and the pool is no longer used: its size is then 0).
async function bestRefinedAny(p: DesignProblem, cands: Design[], iterations: number, ctl: Control): Promise<{ design: Design; merit: number } | null> {
  const pool = ctl.pool;
  if (!pool || pool.size < 2 || cands.length < 2) return bestRefined(p, cands, iterations, ctl);
  const tr: Trajectories = { best: null };
  let best: { design: Design; merit: number } | null = null;
  let next = 0;
  let failed = false;
  const lane = async () => {
    while (next < cands.length && !failed && !ctl.stopped()) {
      const r = await pool.refine(p, cands[next++], iterations, tr.best);
      if (r.stoppedEarly) continue;
      if (!tr.best || r.merit < tr.best[tr.best.length - 1]) tr.best = r.trajectory;
      if (!best || r.merit < best.merit) best = { design: r.design, merit: r.merit };
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(pool.size, cands.length) }, lane));
    return best;
  } catch {
    failed = true;
    return ctl.stopped() ? null : bestRefined(p, cands, iterations, ctl);
  }
}

// Refines the candidates, then settles the best one; it is returned when it improves on `cur` (or anyway with allowWorse:
// gradual evolution keeps growing the design).
async function deepSelect(p: DesignProblem, cur: Current, cands: Design[], ctl: Control, iterations = 40, allowWorse = false): Promise<Current | null> {
  const best = await bestRefinedAny(p, cands, iterations, ctl);
  if (!best || ctl.stopped()) return null;
  const s = await settle(p, best.design, ctl, 80);
  return allowWorse || s.merit < cur.merit * (1 - GAIN) ? s : null;
}

// Deep needle step: needle insertions at every local minimum of the P function (all materials, all designed sides).
async function deepNeedleStep(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, room: (side: Side) => boolean): Promise<Current | null> {
  const minima: { side: Side; layer: number; z: number; m: number; value: number }[] = [];
  for (const side of p.sides) {
    if (!room(side)) continue;
    const ev = evaluateDesign(p, cur.design, { needle: { side, step: s.needleStep } });
    const L = cur.design[side];
    for (let m = 0; m < p.mats.length; m++) {
      const seq = ev.needle!.filter((n) => n.m === m);
      seq.forEach((n, i) => {
        const host = n.layer < L.length ? L[n.layer].m : -1;
        const prev = n.z <= 1e-9 && n.layer > 0 ? L[n.layer - 1].m : n.layer >= L.length && L.length ? L[L.length - 1].m : -1;
        if (n.m === host || n.m === prev || !(n.value < -1e-9 * Math.max(cur.merit, 1e-12))) return;
        const left = i > 0 ? seq[i - 1].value : Infinity;
        const right = i < seq.length - 1 ? seq[i + 1].value : Infinity;
        if (n.value <= left && n.value <= right) minima.push(n);
      });
    }
  }
  minima.sort((a, b) => a.value - b.value);
  const cands = minima.slice(0, s.candidates ?? 12).map((n) => insert(cur.design, n.side, n.layer, n.z, n.m, Math.max(1, p.minD)));
  return cands.length ? deepSelect(p, cur, cands, ctl) : null;
}

// Gradual evolution (Tikhonravov, Trubetskov, DeBell, Appl. Opt. 46, 704 (2007)): each layer thickened until the next
// local one-parameter minimum of the merit; a layer of every other material inserted at each boundary and thickened to
// its first local minimum. Classical: the smallest degradation is taken; deep: the best candidates are all refined.
function gradualCandidates(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, room: (side: Side) => boolean): { design: Design; merit: number }[] {
  const out: { design: Design; merit: number }[] = [];
  const steps = 24; // up to three quarters of a wave (optical) at λref in steps of λref/32: the next minimum is often at +λ/2
  // scans t = t0 + k·δ: the next local minimum after a maximum (parabolic refinement), or null
  const scan = (make: (t: number) => Design, t0: number, delta: number, f0: number) => {
    const f = [f0];
    let rising = false;
    for (let k = 1; k <= steps; k++) {
      f.push(evaluateDesign(p, make(t0 + k * delta)).merit);
      if (f[k] > f[k - 1]) {
        if (rising === false && k > 1 && f[k - 1] < f[k - 2]) {
          // f[k − 1] is a local minimum after a maximum
          const a = f[k - 2], b = f[k - 1], c = f[k];
          const den = a - 2 * b + c;
          const off = den > 0 ? (0.5 * (a - c)) / den : 0;
          const t = t0 + (k - 1 + Math.max(-0.5, Math.min(0.5, off))) * delta;
          const des = make(t);
          return { design: des, merit: evaluateDesign(p, des).merit };
        }
        rising = true;
      } else if (rising) rising = false;
    }
    return null;
  };
  for (const side of p.sides) {
    const L = cur.design[side];
    // thickness increases of every layer
    for (let j = 0; j < L.length; j++) {
      if (ctl.stopped()) return out;
      const n = nAtRef(p, L[j].m, s.lambdaRef);
      const r = scan(
        (t) => {
          const d = clone(cur.design);
          d[side][j].d = Math.min(p.maxD, t);
          return d;
        },
        L[j].d,
        s.lambdaRef / 32 / n,
        cur.merit,
      );
      if (r) out.push(r);
    }
    // insertions of other materials at every boundary (room permitting)
    if (!room(side)) continue;
    for (let j = 0; j <= L.length; j++)
      for (let m = 0; m < p.mats.length; m++) {
        if (ctl.stopped()) return out;
        if ((j > 0 && L[j - 1].m === m) || (j < L.length && L[j].m === m)) continue;
        const n = nAtRef(p, m, s.lambdaRef);
        const r = scan((t) => insert(cur.design, side, j, 0, m, t), 0, s.lambdaRef / 32 / n, cur.merit);
        if (r) out.push(r);
      }
  }
  return out.sort((a, b) => a.merit - b.merit);
}

// With allowWorse the best refined candidate is returned even when it does not improve (the evolution goes on to
// thicker designs; the caller keeps the best design met and stops after a few steps without improvement).
async function gradualStep(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, room: (side: Side) => boolean, deep: boolean, allowWorse = false): Promise<Current | null> {
  const cands = gradualCandidates(p, cur, s, ctl, room);
  if (!cands.length) return null;
  if (deep) return deepSelect(p, cur, cands.slice(0, s.candidates ?? 12).map((c) => c.design), ctl, 40, allowWorse);
  // classical: the smallest degradations refined (the first that improves, else the best of the first three)
  let best: Current | null = null;
  for (const [i, c] of cands.slice(0, 8).entries()) {
    if (ctl.stopped()) break;
    const t = await settle(p, c.design, ctl, 80);
    if (t.merit < cur.merit * (1 - GAIN)) return t;
    if (i < 3 && (!best || t.merit < best.merit)) best = t;
  }
  return allowWorse ? best : null;
}

// Random perturbations of every thickness (uniform, ± `amp` of the layer, at least ± λref/40 optical), refined.
async function randomStep(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, rand: () => number, tries = 4, amp = 0.15): Promise<Current | null> {
  let best: Current | null = null;
  for (let k = 0; k < tries; k++) {
    if (ctl.stopped()) break;
    const d = clone(cur.design);
    for (const side of p.sides)
      for (const L of d[side]) {
        const span = Math.max(amp * L.d, s.lambdaRef / 40 / nAtRef(p, L.m, s.lambdaRef));
        L.d = Math.min(p.maxD, Math.max(0, L.d + (2 * rand() - 1) * span));
      }
    const t = await settle(p, d, ctl, 80);
    if (t.merit < (best?.merit ?? cur.merit * (1 - GAIN))) best = t;
  }
  return best;
}

// Design cleaner: removes one layer at a time (its optical thickness shared by its neighbours, so the total optical
// thickness is kept) until every coating has at most `target` layers. Deep: every removal is refined and the best one
// taken; classical: the removal with the smallest immediate merit increase.
async function cleanStep(p: DesignProblem, cur: Current, s: DesignSettings, ctl: Control, target: number, deep: boolean): Promise<Current | null> {
  const cands: Design[] = [];
  for (const side of p.sides) {
    const L = cur.design[side];
    if (L.length <= target) continue;
    for (let j = 0; j < L.length; j++) {
      const d = clone(cur.design);
      const Ls = d[side];
      const opt = Ls[j].d * nAtRef(p, Ls[j].m, s.lambdaRef);
      const nb = [j - 1, j + 1].filter((k) => k >= 0 && k < Ls.length);
      for (const k of nb) Ls[k].d += opt / nb.length / nAtRef(p, Ls[k].m, s.lambdaRef);
      Ls.splice(j, 1);
      cands.push(cleanup({ ...p, minD: 0 }, d));
    }
  }
  if (!cands.length) return null;
  if (deep) {
    const best = await bestRefinedAny(p, cands, 30, ctl);
    return best && !ctl.stopped() ? settle(p, best.design, ctl, 80) : null;
  }
  const scored = cands.map((d) => ({ d, m: evaluateDesign(p, d).merit })).sort((a, b) => a.m - b.m);
  return settle(p, scored[0].d, ctl, 80);
}

// Main design loop. `report` is called after every step.
export async function runDesign(p: DesignProblem, start: Design, s: DesignSettings, report: (x: Progress) => void, ctl: Control = NO_CONTROL): Promise<Progress> {
  const history: number[] = [];
  const historyD: number[] = [];
  let cur: Current = await settle(p, start, ctl);
  const thickness = () => p.sides.reduce((a, side) => a + total(cur.design, side), 0);
  history.push(cur.merit);
  historyD.push(thickness());
  let it = 0;
  const emit = (phase: string) => {
    const x: Progress = { phase, iteration: it, merit: cur.merit, design: cur.design, history: history.slice(), historyD: historyD.slice() };
    report(x);
    return x;
  };
  let last = emit('refined start');
  const push = (phase: string) => {
    it++;
    history.push(cur.merit);
    historyD.push(thickness());
    last = emit(phase);
  };
  if (s.algorithm === 'refine' || (cur.merit <= 1e-15 && s.algorithm !== 'clean')) return { ...last, phase: 'done' };
  const rand = rng(s.seed ?? 1);

  if (s.algorithm === 'clean') {
    const target = Math.max(1, s.cleanTo ?? p.maxLayers);
    while (p.sides.some((side) => cur.design[side].length > target) && !ctl.stopped()) {
      const r = await cleanStep(p, cur, s, ctl, target, true);
      if (!r) break;
      cur = r;
      push('design cleaner');
    }
    return { ...last, phase: ctl.stopped() ? 'stopped' : 'done' };
  }
  if (s.algorithm === 'random') {
    for (let k = 0; k < s.iterations && !ctl.stopped(); k++) {
      await ctl.tick();
      const r = await randomStep(p, cur, s, ctl, rand, 1);
      if (r) {
        cur = r;
        push('random perturbation');
      } else it++;
    }
    return { ...last, phase: ctl.stopped() ? 'stopped' : 'done' };
  }

  // the best design met (gradual evolution may pass through worse designs on its way to thicker ones)
  let bestAll: Current = cur;
  // Insertion steps on the given sides until no step helps (or the budget of steps is used).
  const evolve = async (sides: Side[], budget: number, label: string) => {
    const q = { ...p, sides };
    let kicks = 0;
    let stall = 0;
    for (let k = 0; k < budget && it < s.iterations; k++) {
      if (ctl.stopped() || cur.merit <= 1e-15) return; // stopped, or every target met (one-sided targets)
      await ctl.tick();
      const room = (side: Side) => layerCount(cur.design, side) + 2 <= p.maxLayers && total(cur.design, side) < p.maxTotal;
      let best: Current | null = null;
      let phase = '';
      if (s.algorithm === 'needle') {
        best = await needleStep(q, cur, s, ctl, room);
        phase = 'needle insertion';
        // quarter-wave insertions when the needles are exhausted (a local minimum for insertions)
        if (!best && !ctl.stopped()) {
          best = await quarterWaveStep(q, cur, s, ctl, room);
          phase = 'quarter-wave insertion';
        }
      } else if (s.algorithm === 'deep') {
        best = await deepNeedleStep(q, cur, s, ctl, room);
        phase = 'deep needle';
        if (!best && !ctl.stopped()) {
          best = await gradualStep(q, cur, s, ctl, room, true, stall < 5);
          phase = 'deep gradual evolution';
        }
        // stuck: random perturbations (a few), then the search goes on from there
        if (!best && !ctl.stopped() && kicks < 3) {
          best = await randomStep(q, cur, s, ctl, rand, 3);
          phase = 'random perturbation';
          kicks++;
        }
      } else {
        best = await gradualStep(q, cur, s, ctl, room, false, stall < 5);
        phase = 'gradual evolution';
      }
      if (!best) return;
      // back on all the designed sides: joint refinement
      cur = sides.length < p.sides.length ? await settle(p, best.design, ctl) : best;
      if (cur.merit < bestAll.merit * (1 - GAIN)) {
        bestAll = cur;
        stall = 0;
      } else stall++;
      push(`${phase}${label}`);
      if (stall >= 6) return;
    }
  };
  // Two coated faces: each face alone first (their reflections add up nearly independently), then together.
  if (p.sides.length > 1)
    for (const side of p.sides) {
      await evolve([side], Math.ceil(s.iterations / (p.sides.length + 1)), ` (${side})`);
      cur = bestAll;
    }
  await evolve(p.sides, s.iterations, '');
  // the result: the best design met
  if (bestAll !== cur) {
    cur = bestAll;
    last = emit('best design');
  }
  return { ...last, phase: ctl.stopped() ? 'stopped' : 'done' };
}

// Spectrum of a design over the problem's wavelengths at one angle (R, T for s, p or their mean).
export function spectrum(p: DesignProblem, d: Design, ai: number, pol: PolMode): { R: number[]; T: number[] } {
  const samples: Sample[] = p.lambdas.flatMap((_, li) => [
    { li, ai, pol, q: 'R' as const, target: 0, w: 1 },
    { li, ai, pol, q: 'T' as const, target: 0, w: 1 },
  ]);
  const ev = evaluateDesign({ ...p, samples, maxTotal: Infinity }, d);
  return { R: p.lambdas.map((_, i) => ev.X[2 * i]), T: p.lambdas.map((_, i) => ev.X[2 * i + 1]) };
}

// ---- Start designs from a formula ----

// Letters of the coating materials, in the order of the Filter designer's material ports.
export const MATERIAL_LETTERS = ['H', 'L', 'M', 'A', 'B', 'C', 'D', 'E'];

// Parses a design formula in quarter waves at the reference wavelength, e.g. "(1.92H 2.08L)^100", "(0.5H L 0.5H)^8",
// "H 2L H": a coefficient (default 1 = a quarter wave) before a material letter, groups in parentheses repeated with
// ^N (nested groups allowed). Returns the layers (material index, number of quarter waves) or an error message.
export function parseFormula(text: string, letters: string[]): { m: number; q: number }[] | string {
  const src = text.replace(/\s+/g, ' ').trim();
  let i = 0;
  const peek = () => src[i];
  const skip = () => {
    while (src[i] === ' ') i++;
  };
  const group = (depth: number): { m: number; q: number }[] | string => {
    const out: { m: number; q: number }[] = [];
    for (;;) {
      skip();
      if (i >= src.length) return depth ? 'a “(” is not closed.' : out;
      if (peek() === ')') {
        if (!depth) return `unexpected “)” at ${i + 1}.`;
        return out;
      }
      if (peek() === '(') {
        i++;
        const inner = group(depth + 1);
        if (typeof inner === 'string') return inner;
        i++; // ')'
        skip();
        let rep = 1;
        if (peek() === '^') {
          i++;
          skip();
          const m = /^\d+/.exec(src.slice(i));
          if (!m) return `a whole number is expected after “^” at ${i + 1}.`;
          rep = Number(m[0]);
          i += m[0].length;
        }
        if (rep > 2000) return 'too many repetitions.';
        for (let k = 0; k < rep; k++) out.push(...inner);
        if (out.length > 5000) return 'too many layers (> 5000).';
        continue;
      }
      const m = /^(\d+(?:\.\d*)?|\.\d+)?([A-Za-z])/.exec(src.slice(i));
      if (!m) return `cannot read “${src.slice(i, i + 8)}” (use e.g. 2H 0.5L (HL)^5).`;
      const idx = letters.indexOf(m[2].toUpperCase());
      if (idx < 0) return `material “${m[2]}” is not connected (letters: ${letters.join(', ')}).`;
      const q = m[1] === undefined ? 1 : Number(m[1]);
      if (!(q > 0)) return `the thickness of “${m[0]}” must be > 0.`;
      out.push({ m: idx, q });
      i += m[0].length;
    }
  };
  const r = group(0);
  if (typeof r === 'string') return `Formula: ${r}`;
  if (!r.length) return 'Formula: no layers.';
  return r;
}
