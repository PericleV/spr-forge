// Sanity checks for the TMM solver, material models and the sweep grid. Run: npm run check:tmm
import { makeLibrary } from '../src/physics/library.ts';
import { carrierDrude, emaEps, refractiveIndex, type Models } from '../src/physics/materials.ts';
import { c, type C } from '../src/physics/complex.ts';
import { interfaceCoeffs as interfaceCoeffsTmm, nCos as nCosTmm, tmmPoint, type Layer } from '../src/physics/tmm.ts';
import * as CX from '../src/physics/complex.ts';
import { fieldProfile, layerOfZ, profileGrid } from '../src/physics/field.ts';
import { incoherentPoint, layersAt, metaOfSpec, runSpec, runTmm } from '../src/engine/run.ts';
import { joinParts, partsFor, splitRange } from '../src/engine/computePool.ts';
import { evaluateGraph, rangeValues, type FitInfo, type JobState, type FormulaInfo, type MatchInfo, type OptimizerInfo, type TargetInfo } from '../src/engine/evaluate.ts';
import { line, strides, TMM_META } from '../src/engine/dataset.ts';
import { extremum, halfWidth, locate, zoneAt } from '../src/engine/metrics.ts';
import { degrade } from '../src/engine/instrument.ts';
import { branches, COMPONENTS, crossingOf, guessDispersion, guessSpectrum, mode2At, modelAt, type ComponentType, type FitComponent, type ModelCtx } from '../src/engine/fitmodels.ts';
import { fitDispersion, fitSpectrum } from '../src/engine/fitrun.ts';
import { rng as rngOpt, adam, DEFAULT_PARAMS, differentialEvolution, fromScalar, genetic, levenbergMarquardtBatch, mergeParams, nelderMead, nsga2, particleSwarm, simulatedAnnealing, Tracker, type Box, type Control, type Crossover, type Evaluate } from '../src/engine/optimize.ts';
import { evaluateHeadless, meritOf } from '../src/engine/headless.ts';
import { OIC_A_MF, OIC_B_MF } from '../src/data/oic2025.ts';
import { myoglobinRsaExample, sensorgramAntibodyExample, sensorgramSmallMoleculeExample, sensorgramSwellingExample, startHereExample } from '../src/examples.ts';
import { huGratingExample, HU2011, HU_N, roughSprExample, teneMalariaExample, TENE2025, oicCastleExample, oicNotchExample, CONV_N, rcwaConvergenceExample, absorberExample, anisoBicExample, lcCavityExample, liuBicExample, LIU2023, PANKIN2022, conicalSprExample, toleranceExample, ANALYSIS_DEFAULTS, dbrExample, filterExample, materialData, TOLERANCE_DEFAULTS, FIELD_DEFAULTS, gratingSprExample, gmrExample, metrologyExample, sprExample, METROLOGY_TRUTH, sprDesignExample, strongCouplingExample, strongCouplingAngleExample, tammExample, TAMM_LU2019, rabiJenaExample, RABI_JENA, TARGET_DEFAULTS, notchExample, NOTCH_SPEC, bandpassExample, arBothSidesExample, thermalEmitterSaExample, PAN2024, heTammExample, he2021TargetCsv, pelesExample, SEBEK2023, sprGaExample, sprDualModeExample } from '../src/examples.ts';
import { countsBreak, crossover, evaluateSensor, geneD, mergedGenes, mutate, randomStructure, runSprGa, sprClassOf, sprScan, withMaterial, type SprGene, type SprMaterial, type SprOk, type SprProblem, type SprStructure } from '../src/engine/sprDesign.ts';
import { compile, compileComplex } from '../src/engine/expr.ts';
import { customData } from '../src/engine/dataOps.ts';
import { interp, parseSpectrum } from '../src/engine/match.ts';
import { pMerit, sliceLines, type MeritPoint } from '../src/engine/spec.ts';
import { formulaStat } from '../src/engine/objectives.ts';
import type { AppNode, FilterData, FitData, FwhmData, KineticsData, SensorgramData, ToleranceData } from '../src/types.ts';
import { binsOf, histStats } from '../src/plot/histStats.ts';
import { bilinear, capValues, fracIndex, gaussianBlur, gridFromPoints, logTicks } from '../src/plot/mapGrid.ts';
import { attenuation, coherent, plate, type Film } from '../src/physics/admittance.ts';
import { evaluateDesign, layerSensitivity, parseFormula, refineCandidate, runDesign, spectrum, type Design, type DesignProblem, type DesignSettings, type RefinePool, type Sample } from '../src/engine/design.ts';
import { bandWeights, photopicWeight, PHOTOPIC_TABLES } from '../src/engine/photopic.ts';
import { coneRays } from '../src/engine/cone.ts';
import { ANALYTES, blocking, surfaceOf, simulate, THETA_JAM, type KineticParams } from '../src/engine/kinetics.ts';
import { PRESETS, startDesign } from '../src/engine/filters.ts';
import type { ComputeInfo, FilterInfo, LayerGaInfo, SensorgramInfo, ToleranceInfo } from '../src/engine/evaluate.ts';
import { decodeProject, encodeProject, parseProject, stringifyProject, type Project } from '../src/project.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { RETICOLO_CASES, RETICOLO_FIELD_CASES } from './reticolo-cases.ts';
import { layerList, layerListCsv, layerListTsv } from '../src/engine/layerList.ts';
import type { Dataset, StackValue } from '../src/engine/types.ts';
import type { InstanceSpec, LayerSpec, TmmSpec } from '../src/engine/types.ts';
import { cmat, eig, mul as cmul } from '../src/physics/cmat.ts';
import { RCWA_FAST, rcwaPoint, rcwaSolve, type RcwaLayer } from '../src/physics/rcwa.ts';
import { conicalSMatrix, conicalSolve, rcwaConical } from '../src/physics/rcwaConical.ts';
import { isotropicTensor, uniaxial } from '../src/physics/berreman.ts';
import { conicalFieldMap, conicalFieldsAt, conicalRegions } from '../src/physics/rcwaFieldConical.ts';
import { fieldMapOfJob } from '../src/engine/rcwaFieldCompute.ts';
import { fieldMap, sigmaFactors, type FieldQuantity } from '../src/physics/rcwaField.ts';
import { add as cadd, sub as csub, mul as cmulC, div as cdiv, abs2 as cabs2, sqrt as csqrt } from '../src/physics/complex.ts';
import { defaultPixels, gratingFff, gratingSlices, type GratingParams } from '../src/engine/grating.ts';
import { convergenceOrders, convergencePoints, rcwaConvergence, rcwaLayersAt, runRcwa } from '../src/engine/runRcwa.ts';
import { convDeviation } from '../src/engine/rcwaConvRun.ts';
import { rcwaThickConical, rcwaThickPoint } from '../src/physics/rcwaThick.ts';
import { KINETICS_DEFAULTS, RCWA_DEFAULTS, ROUGH_DEFAULTS, SENSORGRAM_DEFAULTS } from '../src/defaults.ts';
import { brugL, corrLength, emaMix, normInv, roughPlan, roughShape, scaledProfile, shapeFactors, statsOf, type Plan, type RoughSpec } from '../src/engine/rough.ts';
import { fieldResults } from '../src/engine/rcwaFieldRun.ts';
import type { CustomInfo, DrawGratingInfo, FieldInfo, RcwaFieldInfo } from '../src/engine/evaluate.ts';


// npm run check:tmm -- --quick: skips the slow blocks (10 s or more each: RCWA conical / fields, literature examples,
// global optimizers; ~1 min instead of ~12). The full run before every commit and whenever asked.
const QUICK = process.argv.includes('--quick');
const skipped: string[] = [];
const PUBLISHED_HEAVY: string[] = []; // project files of the published version with RCWA / Berreman jobs (robustness block)
const full = (what: string) => (QUICK ? (skipped.push(what), false) : true);

const lib = makeLibrary([]);
const models: Models = Object.fromEntries([...lib].map(([id, d]) => [id, d.model]));
const L = 633;
const n = (id: string, l = L) => refractiveIndex(id, models, l);
const layer = (mat: string, d = 0, bind: LayerSpec['bind'] = {}): LayerSpec => ({ mat, d, dn: 0, bind });
// One material instance per library material, keyed by its id.
const inst = (extra: Record<string, InstanceSpec> = {}) => ({ ...Object.fromEntries([...lib.keys()].map((id) => [id, { lib: id }])), ...extra });
const argmin = (a: ArrayLike<number>) => {
  let k = 0;
  for (let i = 1; i < a.length; i++) if (a[i] < a[k]) k = i;
  return k;
};
const fmt = (z: { re: number; im: number }) => `${z.re.toFixed(4)}+${z.im.toFixed(4)}i`;

console.log('n @633:', ['BK7', 'SiO2', 'Water', 'Ag', 'Au', 'TiO2'].map((m) => `${m} ${fmt(n(m))}`).join(', '));

const theta = rangeValues(30, 85, 0.01) as number[];
for (const out of ['Air', 'Water']) {
  const f = runTmm({ models, instances: inst(), layers: [layer('BK7'), layer('Ag', 50), layer(out)], lambda: [L], theta, pol: 'p', sweeps: [] });
  const bad = f.R.findIndex((r, k) => r > 1 + 1e-9 || f.T[k] < -1e-9);
  if (bad >= 0) throw new Error(`R > 1 or T < 0 at ${theta[bad]}°: R=${f.R[bad]}, T=${f.T[bad]}`);
  const i = argmin(f.R);
  console.log(`Ag/${out}: SPR dip at ${theta[i].toFixed(2)}°, Rmin ${f.R[i].toFixed(4)}`);
}

// Fresnel and energy conservation.
const g = [{ n: c(1), d: 0 }, { n: n('BK7'), d: 0 }];
console.log('R normal air/BK7', tmmPoint(g, L, 0, 'p').R.toFixed(5), 'expected', (((1 - n('BK7').re) / (1 + n('BK7').re)) ** 2).toFixed(5));
console.log('R_p at Brewster', tmmPoint(g, L, (Math.atan(n('BK7').re) * 180) / Math.PI, 'p').R.toExponential(2));
const d = [{ n: n('BK7'), d: 0 }, { n: c(n('SiO2').re), d: 200 }, { n: n('Water'), d: 0 }];
console.log('lossless A', tmmPoint(d, L, 20, 'p').A.toExponential(2));

// Quarter-wave Bragg mirror: R at λ0 matches the analytic value.
const l0 = 650;
const [nH, nL, nS] = [n('TiO2', l0).re, n('SiO2', l0).re, n('BK7', l0).re];
const N = 6;
const mirror: LayerSpec[] = [layer('Air')];
for (let i = 0; i < N; i++) mirror.push(layer('TiO2', l0 / 4 / nH), layer('SiO2', l0 / 4 / nL));
mirror.push(layer('BK7'));
const noLoss: Models = { ...models, TiO2: { type: 'constant', n: nH, k: 0 }, SiO2: { type: 'constant', n: nL, k: 0 } };
const Rq = runTmm({ models: noLoss, instances: inst(), layers: mirror, lambda: [l0], theta: [0], pol: 's', sweeps: [] }).R[0];
const Y = (nH / nL) ** (2 * N) * nS; // each quarter-wave layer maps Y → n²/Y
console.log(`QW mirror R(λ0): TMM ${Rq.toFixed(6)}, analytic ${(((1 - Y) / (1 + Y)) ** 2).toFixed(6)}`);

// Effective medium: all three rules agree at p = 0 and p = 1 and lie in between.
const e1 = c(1);
const e2 = c(11.9, 0.1);
for (const m of ['bruggeman', 'maxwell-garnett', 'looyenga'] as const)
  console.log(`EMA ${m}: p=0 ${fmt(emaEps(m, e1, e2, 0))}, p=0.5 ${fmt(emaEps(m, e1, e2, 0.5))}, p=1 ${fmt(emaEps(m, e1, e2, 1))}`);

// Sweeps: grid [d(Ag), pol, Δn, material, λ, θ] must match point-by-point evaluation.
const spec: TmmSpec = {
  models,
  instances: inst({ w: { lib: 'Water', dn: { s: [2], v: [0, 0.01] } }, a: { lib: 'Air', dn: { s: [2], v: [0, 0.01] } } }),
  layers: [layer('BK7'), layer('Ag', 0, { d: { s: [0], v: [40, 50] } }), layer('w', 0, { mat: { s: [3], v: ['w', 'a'] } })],
  lambda: [600, 633, 700],
  theta: [30, 45, 67.7],
  pol: 'p',
  polSweep: 1,
  sweeps: [2, 2, 2, 2],
};
const f = runTmm(spec);
let maxErr = 0;
let k = 0;
for (const dAg of [40, 50])
  for (const pol of ['p', 's'] as const)
    for (const dn of [0, 0.01])
      for (const out of ['Water', 'Air'])
        for (const lam of spec.lambda)
          for (const th of spec.theta) {
            const w = n(out, lam);
            const ref = tmmPoint([{ n: n('BK7', lam), d: 0 }, { n: n('Ag', lam), d: dAg }, { n: c(w.re + dn, w.im), d: 0 }], lam, th, pol);
            maxErr = Math.max(maxErr, Math.abs(ref.R - f.R[k++]));
          }
console.log('sweep grid vs pointwise, max |ΔR|', maxErr.toExponential(2), 'points', k);

// DBR builder: a sweep of the number of periods and of the cavity position gives the same spectra as
// separately built structures (slots missing in a variant have zero thickness).
{
  const mat = (id: string, materialId: string) => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialId, color: '', indexMode: 'absolute', porosity: NaN } });
  const E = (source: string, target: string, targetHandle: string) => ({ id: `${source}-${target}-${targetHandle}`, source, sourceHandle: 'out', target, targetHandle });
  const dbr = (periods: number, after: number) => ({ id: 'dbr', type: 'dbr', position: { x: 0, y: 0 }, data: { name: '', period: [{ mode: 'qw', d: 0, label: '', layers2D: 1 }, { mode: 'qw', d: 0, label: '', layers2D: 1 }], periods, closing: false, mirrorAfterCavity: true, lambda0: 650, cavities: [{ after, mode: 'half', d: 0, m: 2, layers2D: 1 }] } });
  const base = (dbrNode: object, extraNodes: object[] = [], extraEdges: object[] = []) => ({
    nodes: [mat('air', 'Air'), mat('h', 'TiO2'), mat('l', 'SiO2'), mat('s', 'BK7'), dbrNode,
      { id: 'wl', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'lambda', mode: 'range', value: 0, min: 500, max: 800, step: 10 } },
      { id: 'th', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'theta', mode: 'constant', value: 0, min: 0, max: 0, step: 1 } },
      { id: 'c', type: 'compute', position: { x: 0, y: 0 }, data: { name: '', polarization: 'p' } }, ...extraNodes],
    edges: [E('air', 'dbr', 'incident'), E('h', 'dbr', 'p0'), E('l', 'dbr', 'p1'), E('l', 'dbr', 'c0'), E('s', 'dbr', 'exit'),
      E('dbr', 'c', 'stack'), E('wl', 'c', 'lambda'), E('th', 'c', 'theta'), ...extraEdges],
  });
  const run = (g: { nodes: object[]; edges: object[] }) => {
    const ev = evaluateGraph(g.nodes as never, g.edges as never, { cache: new Map(), lastDone: new Map(), failed: new Map() }, lib);
    const errs = [...ev.results.values()].flatMap((r) => r.errors);
    if (errs.length) throw new Error(errs.join('; '));
    return runTmm(ev.jobs[0].spec).R;
  };
  const sweep = (id: string, list: string) => ({ id, type: 'sweep', position: { x: 0, y: 0 }, data: { name: '', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list } });
  const swept = run(base(dbr(8, 3), [sweep('N', '4 8'), sweep('P', '1 3')], [E('N', 'dbr', 'periods'), E('P', 'dbr', 'pos0')]));
  const nL = 31;
  let err = 0;
  [[4, 1], [4, 3], [8, 1], [8, 3]].forEach(([N, P], k) => {
    const ref = run(base(dbr(N, P)));
    for (let i = 0; i < nL; i++) err = Math.max(err, Math.abs(ref[i] - swept[k * nL + i]));
  });
  console.log('DBR periods × cavity-position sweep vs separate structures, max |ΔR|', err.toExponential(2));
}

// Metrics on a synthetic Lorentzian dip: known centre and full width at half depth.
{
  const x0 = 50.123;
  const w = 2.5;
  const xs = Array.from({ length: 2001 }, (_, i) => i * 0.05);
  const ys = xs.map((x) => 1 - 0.9 / (1 + ((x - x0) / (w / 2)) ** 2));
  const e = extremum(xs, ys, 0, xs.length - 1, 'min');
  const h = halfWidth(xs, ys, 0, xs.length - 1, 'dip', 'absolute', 1 - 0.45);
  console.log(`Lorentzian: centre ${e.x.toFixed(5)} (exact ${x0}), FWHM ${h.width.toFixed(5)} (exact ${w})`);
}

// Sensitivity through the node graph (engine jobs run inline) vs the analytic surface-plasmon condition
// n_p sinθ = Re √(εm εd / (εm + εd)).
{
  const N = (id: string, type: string, data: object) => ({ id, type, position: { x: 0, y: 0 }, data });
  const E = (source: string, target: string, targetHandle: string, sourceHandle = 'out') => ({ id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle });
  const M = (id: string, m: string) => N(id, 'material', { materialId: m, color: '', indexMode: 'absolute', porosity: NaN });
  const nodes = [
    M('bk7', 'BK7'), M('ag', 'Ag'), M('w', 'Water'),
    N('L', 'layer', { label: '', thickness: 50, layers2D: 1 }),
    N('st', 'combine', { name: '', count: 1 }),
    N('wl', 'param', { quantity: 'lambda', mode: 'constant', value: 633, min: 0, max: 0, step: 1 }),
    N('th', 'param', { quantity: 'theta', mode: 'range', value: 0, min: 60, max: 80, step: 0.01 }),
    N('c', 'compute', { name: '', polarization: 'p' }),
    N('s', 'sensitivity', { target: 'mat:w', dn: 0.001, kind: 'dip', field: 'R', along: '', lo: NaN, hi: NaN, color: '' }),
  ];
  const edges = [E('ag', 'L', 'mat'), E('bk7', 'st', 'incident'), E('L', 'st', 'item-0'), E('w', 'st', 'exit'), E('st', 'c', 'stack'), E('wl', 'c', 'lambda'), E('th', 'c', 'theta'), E('c', 's', 'in')];
  const state = { cache: new Map(), lastDone: new Map(), failed: new Map() };
  for (let pass = 0; pass < 3; pass++) {
    const ev = evaluateGraph(nodes as never, edges as never, state, lib);
    for (const job of ev.jobs) {
      const fields = runTmm(job.spec);
      state.cache.set(job.key, { key: job.key, spec: job.spec, axes: job.axes, fields, meta: TMM_META, size: fields.R.length });
      state.lastDone.set(job.requester, job.key);
    }
    if (!ev.jobs.length) {
      const r = ev.results.get('s')!;
      if (r.errors.length) throw new Error(r.errors.join('; '));
      console.log('Sensitivity node:', (r.info as { rows: string[] }).rows.join(' | '));
      const S = (r.outs.metrics as { dataset: { fields: Record<string, Float64Array> } }).dataset.fields.S[0];
      const np = n('BK7').re;
      const em = { re: n('Ag').re ** 2 - n('Ag').im ** 2, im: 2 * n('Ag').re * n('Ag').im };
      const theta = (nd: number) => {
        const ed = nd * nd;
        const num = { re: em.re * ed, im: em.im * ed };
        const den = { re: em.re + ed, im: em.im };
        const q = den.re ** 2 + den.im ** 2;
        const z = { re: (num.re * den.re + num.im * den.im) / q, im: (num.im * den.re - num.re * den.im) / q };
        const kre = Math.sqrt((Math.hypot(z.re, z.im) + z.re) / 2);
        return (Math.asin(kre / np) * 180) / Math.PI;
      };
      const nd = n('Water').re;
      console.log(`  analytic (semi-infinite metal) dθ/dn ≈ ${((theta(nd + 1e-4) - theta(nd - 1e-4)) / 2e-4).toFixed(1)} °/RIU; TMM S = ${S.toFixed(1)} °/RIU`);
      break;
    }
  }
}

// ---- Compute TMM: the real-arithmetic transfer matrices = the previous complex-object implementation ----
{
  // the previous implementation (complex objects), kept here as the reference
  const cx = CX;
  const nCosT = nCosTmm;
  const interfaceCoeffsT = interfaceCoeffsTmm;
  type M2 = [ReturnType<typeof c>, ReturnType<typeof c>, ReturnType<typeof c>, ReturnType<typeof c>];
function tmmPointRef(input: Layer[], lambdaNm: number, thetaDeg: number, pol: Polarization) {
  const layers = [{ ...input[0], n: cx.c(input[0].n.re) }, ...input.slice(1)];
  const N = layers.length;
  const n0 = layers[0].n;
  const kx = cx.mul(n0, cx.c(Math.sin((thetaDeg * Math.PI) / 180)));
  const q = layers.map((L) => nCosT(L.n, kx));
  const k0 = (2 * Math.PI) / lambdaNm;

  const scaled = (r: C, t: C): M2 => {
    const it = cx.div(cx.c(1), t);
    return [it, cx.mul(r, it), cx.mul(r, it), it];
  };

  let { r, t } = interfaceCoeffsT(pol, layers[0].n, layers[1].n, q[0], q[1]);
  let M = scaled(r, t);
  for (let j = 1; j < N - 1; j++) {
    const delta = cx.mul(q[j], cx.c(k0 * layers[j].d));
    const ed = cx.exp(cx.mul(cx.c(0, -1), delta));
    const eu = cx.exp(cx.mul(cx.c(0, 1), delta));
    ({ r, t } = interfaceCoeffsT(pol, layers[j].n, layers[j + 1].n, q[j], q[j + 1]));
    const P: M2 = [ed, cx.c(0), cx.c(0), eu];
    M = cx.matmul(M, cx.matmul(P, scaled(r, t)));
  }

  const rr = cx.div(M[2], M[0]);
  const tt = cx.div(cx.c(1), M[0]);
  const nf = layers[N - 1].n;
  const qf = q[N - 1];
  const q0 = q[0];

  let T: number;
  if (pol === 's') {
    T = (cx.abs2(tt) * qf.re) / q0.re;
  } else {
    // Re(n conj(cosθ)) with cosθ = q/n
    const num = cx.mul(nf, cx.conj(cx.div(qf, nf))).re;
    const den = cx.mul(n0, cx.conj(cx.div(q0, n0))).re;
    T = (cx.abs2(tt) * num) / den;
  }
  const R = cx.abs2(rr);
  return { R, T, A: 1 - R - T, phir: cx.arg(rr), phit: cx.arg(tt) };
}
  const rnd = rngOpt(42);
  let dR = 0;
  let dPh = 0;
  let cases = 0;
  for (let k = 0; k < 400; k++) {
    const nLay = 1 + Math.floor(rnd() * 12);
    const n0 = 1 + rnd() * 0.8;
    const layers: Layer[] = [{ n: c(n0), d: 0 }];
    for (let j = 0; j < nLay; j++) {
      const metal = rnd() < 0.2;
      layers.push({ n: metal ? c(0.05 + rnd() * 0.5, 2 + rnd() * 5) : c(1.3 + rnd() * 1.4, rnd() < 0.3 ? rnd() * 0.05 : 0), d: metal ? 5 + rnd() * 60 : 10 + rnd() * 900 });
    }
    layers.push({ n: rnd() < 0.2 ? c(0.2, 3.5) : c(1 + rnd() * 1.2, rnd() < 0.2 ? 0.01 : 0), d: 0 });
    const lam = 350 + rnd() * 1200;
    const th = rnd() * 85;
    for (const pol of ['s', 'p'] as const) {
      const a2 = tmmPoint(layers, lam, th, pol);
      const b2 = tmmPointRef(layers, lam, th, pol);
      dR = Math.max(dR, Math.abs(a2.R - b2.R), Math.abs(a2.T - b2.T));
      if (b2.R > 1e-8) dPh = Math.max(dPh, Math.abs(Math.atan2(Math.sin(a2.phir - b2.phir), Math.cos(a2.phir - b2.phir))));
      if (b2.T > 1e-8) dPh = Math.max(dPh, Math.abs(Math.atan2(Math.sin(a2.phit - b2.phit), Math.cos(a2.phit - b2.phit))));
      cases++;
    }
  }
  const tS = performance.now();
  const big: Layer[] = [{ n: c(1), d: 0 }, ...Array.from({ length: 60 }, (_, j) => ({ n: c(j % 2 ? 1.46 : 2.3), d: 80 })), { n: c(1.52), d: 0 }];
  for (let k = 0; k < 20000; k++) tmmPoint(big, 400 + (k % 400), 0, 's');
  const tFast = performance.now() - tS;
  const tS2 = performance.now();
  for (let k = 0; k < 20000; k++) tmmPointRef(big, 400 + (k % 400), 0, 's');
  const tRef = performance.now() - tS2;
  console.log(`Compute TMM (real arithmetic) = previous implementation on ${cases} random stacks (metals, TIR, thick layers): |ΔR|, |ΔT| ≤ ${dR.toExponential(1)}, phases ≤ ${dPh.toExponential(1)} rad; ${(tRef / tFast).toFixed(1)}× faster (60 layers)`);
  if (dR > 1e-12 || dPh > 1e-9) throw new Error(`fast TMM vs reference: ${dR}, ${dPh}`);
}

// ---- Fits of synthetic data with known parameters ----
{
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const comp = (id: string, type: ComponentType, v: Record<string, number> = {}): FitComponent => ({
  id,
  type,
  params: Object.fromEntries(COMPONENTS[type].params.map((d) => [d.key, { value: v[d.key] ?? (d.kind === 'width' ? 1 : 0), fixed: false }])),
});
const show = (c: FitComponent[], sig: Record<string, number>) =>
  c.map((k) => `${k.type}(${Object.entries(k.params).map(([n, p]) => `${n}=${p.value.toFixed(4)}±${(sig[`${k.id}.${n}`] ?? NaN).toExponential(1)}`).join(', ')})`).join(' + ');

// 1) Lorentzian dip on a sloped baseline, with noise
{
  const truth = [comp('b', 'baseline', { c: 0.9, s: 0.002 }), comp('l', 'lorentz', { A: -0.8, x0: 67.7, w: 1.1 })];
  const ctx = { energy: false, xref: 65 };
  const xs = Array.from({ length: 401 }, (_, i) => 60 + i * 0.025);
  const ys = xs.map((x) => modelAt(truth, x, ctx) + 0.002 * rnd());
  const start = guessSpectrum([comp('b', 'baseline'), comp('l', 'lorentz')], xs, ys);
  const r = fitSpectrum(start, xs, ys, ctx);
  console.log('Lorentz+baseline  R²', r.stats.r2.toFixed(6), '\n ', show(r.comps, r.stats.sigma));
}
// 1b) Gaussian peak on a baseline, with noise: the parameters come back
{
  const truth = [comp('b', 'baseline', { c: 0.1 }), comp('g', 'gauss', { A: 0.7, x0: 532.4, w: 8.3 })];
  const ctx = { energy: false, xref: 530 };
  const xs = Array.from({ length: 301 }, (_, i) => 515 + i * 0.1);
  const ys = xs.map((x) => modelAt(truth, x, ctx) + 0.002 * rnd());
  const r = fitSpectrum(guessSpectrum([comp('b', 'baseline'), comp('g', 'gauss')], xs, ys), xs, ys, ctx);
  const g = r.comps[1].params;
  console.log('Gauss+baseline    R²', r.stats.r2.toFixed(6), '\n ', show(r.comps, r.stats.sigma));
  if (!(Math.abs(g.A.value - 0.7) < 0.005 && Math.abs(g.x0.value - 532.4) < 0.02 && Math.abs(g.w.value - 8.3) < 0.05)) throw new Error('Gaussian fit');
}
// 2) Fano
{
  const truth = [comp('b', 'baseline', { c: 1 }), comp('f', 'fano', { A: 0.6, x0: 650, w: 12, q: 1.5 })];
  const ctx = { energy: false, xref: 650 };
  const xs = Array.from({ length: 301 }, (_, i) => 600 + i / 3);
  const ys = xs.map((x) => modelAt(truth, x, ctx) + 0.001 * rnd());
  const start = guessSpectrum([comp('b', 'baseline'), comp('f', 'fano')], xs, ys);
  const r = fitSpectrum(start, xs, ys, ctx);
  console.log('Fano  R²', r.stats.r2.toFixed(6), '\n ', show(r.comps, r.stats.sigma));
}
// 3) Coupled oscillators on a wavelength axis (energy conversion), anticrossed dip
{
  const truth = [comp('b', 'baseline', { c: 0.95 }), comp('c', 'coupled', { A: -0.9, x1: 640, w1: 20, x2: 655, w2: 8, W: 40, r: 0 })];
  const ctx = { energy: true, xref: 650 };
  const xs = Array.from({ length: 401 }, (_, i) => 550 + i * 0.5);
  const ys = xs.map((x) => modelAt(truth, x, ctx) + 0.002 * rnd());
  const start = guessSpectrum([comp('b', 'baseline'), comp('c', 'coupled')], xs, ys);
  const r = fitSpectrum(start, xs, ys, ctx);
  console.log('Coupled (spectral) R²', r.stats.r2.toFixed(6), 'iterations', r.stats.iterations, '\n ', show(r.comps, r.stats.sigma));
}
// 4) Dispersion: two branches vs cavity thickness
{
  const truth = { x1: 650, a: 650, b: 1.2, W: 25 };
  const ctx = { energy: true, xref: 200 };
  const xs = Array.from({ length: 21 }, (_, i) => 180 + i * 2);
  const br = xs.map((x) => branches(x, truth, ctx));
  const short = br.map((b) => b[0] + 0.1 * rnd());
  const long = br.map((b) => b[1] + 0.1 * rnd());
  const g = guessDispersion(xs, short, long, ctx.xref);
  const params = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { value: v, fixed: false }]));
  const r = fitDispersion(params, { xs, short, long }, ctx);
  console.log('Dispersion guess', Object.entries(g).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
  console.log('Dispersion fit  R²', r.stats.r2.toFixed(6), Object.entries(r.params).map(([k, p]) => `${k}=${p.value.toFixed(3)}±${r.stats.sigma[k]?.toFixed(3)}`).join(' '), '(truth x1=650 a=650 b=1.2 Ω=25)');
}

}

// ---- Strong coupling example end to end: TMM → FWHM (two branches) → dispersion fit ----
{
const p = strongCouplingExample();
const scLib = makeLibrary(p.materials);
const scState = { cache: new Map(), lastDone: new Map(), failed: new Map() };
let ev = evaluateGraph(p.nodes, p.edges, scState, scLib);
for (let pass = 0; pass < 3 && ev.jobs.length; pass++) {
  for (const job of ev.jobs) {
    const fields = runTmm(job.spec);
    scState.cache.set(job.key, { key: job.key, spec: job.spec, axes: job.axes, fields, meta: TMM_META, size: fields.R.length });
    scState.lastDone.set(job.requester, job.key);
  }
  ev = evaluateGraph(p.nodes, p.edges, scState, scLib);
}
for (const [id, r] of ev.results) if (r.errors.length || r.warnings.length) console.log(id, r.errors, r.warnings);
console.log('fwhm rows', (ev.results.get('fwhm')!.info as { rows: string[] }).rows);
const info = ev.results.get('fit')!.info as FitInfo;
const xs = info.xs.slice(info.i0, info.i1 + 1);
console.log('branches', xs.length, 'short', info.short!.map((v) => v.toFixed(1)).join(' '));
console.log('long ', info.long!.map((v) => v.toFixed(1)).join(' '));
const guess = guessDispersion(xs, info.short!, info.long!, info.xref);
const params = Object.fromEntries(Object.entries(guess).map(([k, v]) => [k, { value: v, fixed: false }]));
const r = fitDispersion(params, { xs, short: info.short!, long: info.long! }, { energy: info.energy, xref: info.xref });
console.log('fit R²', r.stats.r2.toFixed(5), Object.entries(r.params).map(([k, q]) => `${k}=${q.value.toFixed(2)}±${r.stats.sigma[k]?.toFixed(2)}`).join(' '));

}

// ---- Dispersion vs angle: E_c(θ) = E₀/√(1 − sin²θ/n_eff²) ----
{
  for (const energy of [true, false]) {
    const truth = energy ? { x1: 652.5, a: 690, n: 1.7, W: 40 } : { x1: 1.9, a: 1.8, n: 1.7, W: 0.1 };
    const ctx: ModelCtx = { energy, xref: 25, mode2: 'angle' };
    const xs = Array.from({ length: 51 }, (_, i) => i);
    const br = xs.map((x) => branches(x, truth, ctx));
    const short = br.map((b) => b[0]);
    const long = br.map((b) => b[1]);
    // uncoupled mode 2 follows the formula; zero detuning where it meets mode 1
    const xc = crossingOf(truth, ctx);
    const m2 = mode2At(xc, truth, ctx);
    if (Math.abs(m2 - truth.x1) > 1e-9 * truth.x1) throw new Error('angle model: crossing');
    const g = guessDispersion(xs, short, long, 25, ctx);
    const r = fitDispersion(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { value: v, fixed: false }])), { xs, short, long }, ctx);
    const worst = Math.max(...Object.entries(truth).map(([k, v]) => Math.abs(r.params[k].value - v) / Math.abs(v)));
    if (!(worst < 1e-6)) throw new Error(`angle dispersion fit (${energy ? 'nm' : 'energy'}): relative error ${worst}`);
    console.log(`dispersion vs angle (${energy ? 'branches in nm' : 'energy-like units'}): parameters recovered (${worst.toExponential(1)}), zero detuning at ${xc.toFixed(2)}°`);
  }
  const p = strongCouplingAngleExample();
  const ev = evaluateHeadless(p.nodes, p.edges, makeLibrary(p.materials));
  const info = ev.results.get('fit')!.info as FitInfo;
  const xs = info.xs.slice(info.i0, info.i1 + 1);
  const ctx: ModelCtx = { energy: info.energy, xref: info.xref, mode2: 'angle' };
  const g = guessDispersion(xs, info.short!, info.long!, info.xref, ctx);
  const r = fitDispersion(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { value: v, fixed: false }])), { xs, short: info.short!, long: info.long! }, ctx);
  const v = Object.fromEntries(Object.entries(r.params).map(([k, q]) => [k, q.value]));
  if (!(r.stats.r2 > 0.999) || Math.abs(v.x1 - 652.5) > 3 || !(v.n > 1.3 && v.n < 2.2)) throw new Error(`polaritons vs angle: ${JSON.stringify(v)} R² ${r.stats.r2}`);
  console.log(`polaritons vs angle (TMM → FWHM → Fit): R² ${r.stats.r2.toFixed(5)}, exciton ${v.x1.toFixed(1)} nm (652.5), cavity λ₀ ${v.a.toFixed(1)} nm, n_eff ${v.n.toFixed(3)}, Ω ${v.W.toFixed(1)} nm, zero detuning at ${crossingOf(v, ctx).toFixed(1)}°`);

  // zones that follow θ: the FWHM of interval 2 (a zone) is on the local minimum of R nearest the branch at every
  // angle, not on the stop-band edge (R ≈ 0 near 720–750 nm from 30° on) that a fixed 652.5–720 nm window catches
  const tds = (ev.results.get('tmm')!.outs.out as { dataset: Dataset }).dataset;
  const fm = (ev.results.get('fwhm')!.outs.metrics as { dataset: Dataset }).dataset;
  const [li, ti] = ['lambda', 'theta'].map((a) => tds.axes.findIndex((x) => x.id === a));
  const lamS = tds.axes[li].values;
  let worstZ = 0;
  tds.axes[ti].values.forEach((th, j) => {
    const idx = tds.axes.map(() => 0);
    idx[ti] = j;
    const Rj = line(tds, 'R', li, idx);
    const [zl, zh] = zoneAt([{ y: 0, lo: 652.5, hi: 705 }, { y: 40, lo: 645, hi: 690 }], th);
    let best = -1;
    for (let i = 1; i < Rj.length - 1; i++) if (lamS[i] > zl && lamS[i] < zh && Rj[i] < Rj[i - 1] && Rj[i] <= Rj[i + 1] && (best < 0 || Rj[i] < Rj[best])) best = i;
    worstZ = Math.max(worstZ, Math.abs(fm.fields.c1[j] - lamS[best]));
  });
  const fixedEv = evaluateHeadless(p.nodes.map((nn) => (nn.id === 'fwhm' ? ({ ...nn, data: { ...nn.data, intervals: [(nn.data as FwhmData).intervals[0], { lo: 652.5, hi: 720 }] } } as AppNode) : nn)), p.edges, makeLibrary(p.materials));
  const fixedC = (fixedEv.results.get('fwhm')!.outs.metrics as { dataset: Dataset }).dataset.fields.c1;
  console.log(`FWHM zone following θ: dip 2 within ${worstZ.toFixed(2)} nm of the local minimum at all ${tds.axes[ti].values.length} angles (${Math.min(...fm.fields.c1).toFixed(1)}–${Math.max(...fm.fields.c1).toFixed(1)} nm); a fixed window reaches ${Math.max(...fixedC).toFixed(1)} nm`);
  if (!(worstZ < 0.5 && Math.max(...fm.fields.c1) < 685 && Math.max(...fixedC) > 715)) throw new Error(`FWHM zone: ${worstZ}`);
  // zone interpolation: straight between points, constant beyond, any order; a zone on an axis the data lacks = error
  const zz = [{ y: 10, lo: 0, hi: 10 }, { y: 0, lo: 5, hi: 6 }];
  if (zoneAt(zz, 5).join() !== '2.5,8' || zoneAt(zz, -3).join() !== '5,6' || zoneAt(zz, 99).join() !== '0,10') throw new Error('zoneAt');
  const bad = evaluateHeadless(p.nodes.map((nn) => (nn.id === 'fwhm' ? ({ ...nn, data: { ...nn.data, intervals: [{ lo: 600, hi: 700, path: { at: 'sweep:none', pts: zz } }] } } as AppNode) : nn)), p.edges, makeLibrary(p.materials));
  if (!bad.results.get('fwhm')!.errors.some((e) => e.includes('follows an axis'))) throw new Error('zone on a missing axis');
}

// ---- Coupled oscillators on a λ axis: nm parameters equal what is measured on the curves ----
{// How well do the nm parameters of the coupled-oscillator models match what is measured on the curves?

const uctx = { energy: true, xref: 650 };
const uxs = Array.from({ length: 40001 }, (_, i) => 500 + i * 0.005);
const cf = COMPONENTS.coupled.f;

// 1) Uncoupled mode (Ω = 0): FWHM in λ should equal Γ₁ (nm).
for (const w1 of [5, 20, 60]) {
  const ys = uxs.map((x) => cf(x, { A: 1, x1: 650, w1, x2: 900, w2: 10, W: 0, r: 0 }, uctx));
  const h = halfWidth(uxs, ys, 0, uxs.length - 1, 'peak', 'absolute', 0.5);
  console.log(`Γ₁ = ${w1} nm → measured FWHM ${h.width.toFixed(3)} nm, peak at ${h.center.toFixed(3)} nm`);
}
// 2) Dispersion at zero detuning: branch separation should equal Ω (nm).
for (const W of [10, 46.4, 120]) {
  const p = { x1: 650, a: 650, b: 1, W };
  const [s, l] = branches(650, p, uctx);
  let gap = Infinity;
  for (let x = 550; x <= 750; x += 0.01) {
    const [a, b] = branches(x, p, uctx);
    gap = Math.min(gap, b - a);
  }
  console.log(`Ω = ${W} nm → separation at zero detuning ${(l - s).toFixed(3)} nm, minimum separation ${gap.toFixed(3)} nm`);
}

}

// ---- Field profile: continuity at interfaces, R/T as TMM, energy balance, absorption density ----
{
const nf = (id: string, l: number) => refractiveIndex(id, models, l);
const cases: [string, Layer[], number, number][] = [
  ['SPR BK7/Ag50/Water 633 p @67.7°', [{ n: nf('BK7', 633), d: 0 }, { n: nf('Ag', 633), d: 50 }, { n: nf('Water', 633), d: 0 }], 633, 67.73],
  ['SPR 633 s @67.7°', [{ n: nf('BK7', 633), d: 0 }, { n: nf('Ag', 633), d: 50 }, { n: nf('Water', 633), d: 0 }], 633, 67.73],
  ['Au/Cr/TiO2 stack 550 p @30°', [{ n: nf('BK7', 550), d: 0 }, { n: nf('Cr', 550), d: 3 }, { n: nf('Au', 550), d: 40 }, { n: nf('TiO2', 550), d: 80 }, { n: nf('Air', 550), d: 0 }], 550, 30],
];
for (const [name, layers, lam, th] of cases) {
  const pol = name.includes(' s ') ? 's' : 'p';
  const g = profileGrid(layers.map((L) => L.d), 300, 400, 4000);
  const p = fieldProfile(layers, lam, th, pol, g.z, g.layer);
  const ref = tmmPoint(layers, lam, th, pol);
  // continuity of tangential E and H at each interface (samples on both sides share the same z)
  let jumpE = 0;
  let jumpH = 0;
  const [tE, tH] = pol === 's' ? (['Ey', 'Hx'] as const) : (['Ex', 'Hy'] as const);
  for (let i = 1; i < p.z.length; i++)
    if (p.z[i] === p.z[i - 1] && p.layer[i] !== p.layer[i - 1]) {
      jumpE = Math.max(jumpE, Math.hypot(p.fields[tE].re[i] - p.fields[tE].re[i - 1], p.fields[tE].im[i] - p.fields[tE].im[i - 1]));
      jumpH = Math.max(jumpH, Math.hypot(p.fields[tH].re[i] - p.fields[tH].re[i - 1], p.fields[tH].im[i] - p.fields[tH].im[i - 1]));
    }
  // ∫ absorption density over each finite layer (trapezoid) vs flux difference
  const integ = layers.map(() => 0);
  for (let i = 1; i < p.z.length; i++) if (p.layer[i] === p.layer[i - 1]) integ[p.layer[i]] += ((p.absorption[i] + p.absorption[i - 1]) / 2) * (p.z[i] - p.z[i - 1]);
  const sumA = p.layerAbs.slice(1, -1).reduce((a, b) => a + b, 0);
  const iMax = p.E2.reduce((k, v, i) => (v > p.E2[k] ? i : k), 0);
  console.log(name);
  console.log(`  R ${p.R.toFixed(6)} (tmm ${ref.R.toFixed(6)})  T ${p.T.toExponential(3)} (tmm ${ref.T.toExponential(3)})  R+T+ΣA = ${(p.R + p.T + sumA).toFixed(9)}`);
  console.log(`  tangential jumps: E ${jumpE.toExponential(1)}, H ${jumpH.toExponential(1)}`);
  console.log(`  layer absorption (flux) ${p.layerAbs.slice(1, -1).map((v) => v.toFixed(5)).join(' ')} | ∫density ${integ.slice(1, -1).map((v) => v.toFixed(5)).join(' ')}`);
  console.log(`  max |E|² ${p.E2[iMax].toFixed(2)} at z = ${p.z[iMax].toFixed(1)} nm; decay length in exit ${p.decay.toFixed(1)} nm`);
}
const L = [{ n: nf('BK7', 633), d: 0 }, { n: nf('Ag', 633), d: 50 }, { n: nf('Water', 633), d: 0 }];
const zs = Float64Array.from({ length: 11 }, (_, i) => -100 + i * 20);
console.log('layerOfZ', Array.from(layerOfZ(L.map((x) => x.d), zs)).join(' '));

}

// ---- Optimizers on benchmark functions ----
{
const octl: Control = { stopped: () => false, waitIfPaused: async () => {}, report: () => {} };
const orun = async (name: string, f: (x: number[]) => number, box: Box, x0: number[], algo: (t: Tracker) => Promise<void>) => {
  const t = new Tracker(fromScalar(f), box);
  const t0 = performance.now();
  await algo(t);
  console.log(`${name}: best ${t.best.toExponential(3)} at [${t.bestX.map((v) => v.toFixed(4)).join(', ')}] after ${t.evaluations} evals (${(performance.now() - t0).toFixed(0)} ms)`);
};

const rosen = (x: number[]) => x.slice(0, -1).reduce((s, v, i) => s + 100 * (x[i + 1] - v * v) ** 2 + (1 - v) ** 2, 0);
const rastrigin = (x: number[]) => 10 * x.length + x.reduce((s, v) => s + v * v - 10 * Math.cos(2 * Math.PI * v), 0);
const quad = (x: number[]) => x.reduce((s, v, i) => s + (v - (i + 1)) ** 2, 0);
const obox = (d: number, lo: number, hi: number, integer = false): Box => ({ lo: Array(d).fill(lo), hi: Array(d).fill(hi), integer: Array(d).fill(integer) });

await orun('Adam quadratic (5D)', quad, obox(5, -10, 10), [0, 0, 0, 0, 0], (t) => adam(t, obox(5, -10, 10), [0, 0, 0, 0, 0], { iterations: 400, lr: 0.05, starts: 1, seed: 1 }, octl));
await orun('Adam Rosenbrock (2D)', rosen, obox(2, -2, 2), [-1.2, 1], (t) => adam(t, obox(2, -2, 2), [-1.2, 1], { iterations: 2000, lr: 0.05, starts: 4, seed: 1 }, octl));
await orun('NM Rosenbrock (2D)', rosen, obox(2, -2, 2), [-1.2, 1], (t) => nelderMead(t, obox(2, -2, 2), [-1.2, 1], { iterations: 1000, step: 0.1 }, octl));
await orun('DE Rastrigin (4D)', rastrigin, obox(4, -5.12, 5.12), [3, 3, 3, 3], (t) => differentialEvolution(t, obox(4, -5.12, 5.12), [3, 3, 3, 3], { iterations: 300, population: 40, seed: 7 }, octl));
await orun('DE integer (3D, round)', (x) => quad(x), obox(3, -10, 10, true), [0, 0, 0], (t) => differentialEvolution(t, obox(3, -10, 10, true), [0, 0, 0], { iterations: 100, population: 20, seed: 3 }, octl));
// stop after 5 iterations
let n = 0;
const tt = new Tracker(fromScalar(rosen), obox(2, -2, 2));
await differentialEvolution(tt, obox(2, -2, 2), [0, 0], { iterations: 1000, population: 20, seed: 1 }, { stopped: () => n >= 5, waitIfPaused: async () => {}, report: () => n++ });
console.log('stop after 5 generations:', tt.history.length, 'reports,', tt.evaluations, 'evals');

}

// ---- Dual-band absorber: the graph merit improves under Adam (short run) ----
{
  const p = absorberExample();
  const alib = makeLibrary(p.materials);
  const oi = evaluateHeadless(p.nodes, p.edges, alib).results.get('opt')!.info as OptimizerInfo;
  const vars = oi.variables;
  const box: Box = { lo: vars.map((v) => v.min), hi: vars.map((v) => v.max), integer: vars.map((v) => v.integer) };
  const f = (x: number[]) => meritOf(p.nodes, p.edges, alib, vars, ['zones'], x).merit;
  const x0 = vars.map((v) => v.value);
  const t = new Tracker(fromScalar(f), box);
  await adam(t, box, x0, { iterations: 25, lr: 0.08, starts: 1, seed: 1 }, { stopped: () => false, waitIfPaused: async () => {}, report: () => {} });
  console.log(`absorber merit ${f(x0).toFixed(4)} → ${t.best.toFixed(4)} after ${t.evaluations} evaluations (Adam, 25 iterations)`);
}

// ---- GA, PSO, NSGA-II and batch Levenberg-Marquardt ----
{
  const ctl: Control = { stopped: () => false, waitIfPaused: async () => {}, report: () => {} };
  const box = (d: number, lo: number, hi: number): Box => ({ lo: Array(d).fill(lo), hi: Array(d).fill(hi), integer: Array(d).fill(false) });
  const rastrigin = (x: number[]) => 10 * x.length + x.reduce((s, v) => s + v * v - 10 * Math.cos(2 * Math.PI * v), 0);
  for (const [name, algo] of [
    ['GA', genetic],
    ['PSO', particleSwarm],
  ] as const) {
    const b = box(4, -5.12, 5.12);
    const t = new Tracker(fromScalar(rastrigin), b);
    await algo(t, b, [3, 3, 3, 3], { iterations: 300, population: 40, seed: 5 }, ctl);
    console.log(`${name} Rastrigin 4D: best ${t.best.toExponential(3)} at [${t.bestX.map((v) => v.toFixed(3)).join(', ')}], ${t.evaluations} evals`);
    if (t.best > 3) throw new Error(`${name} did not approach the Rastrigin minimum`);
  }

  // ZDT1 with 10 variables: the front must follow f2 = 1 − √f1 over the whole f1 range.
  const d = 10;
  const zdt1: Evaluate = async (xs) => {
    const parts = xs.map((x) => {
      const g = 1 + (9 * x.slice(1).reduce((s, v) => s + v, 0)) / (d - 1);
      return [x[0], g * (1 - Math.sqrt(x[0] / g))];
    });
    return { merits: parts.map((q) => q[0] + q[1]), parts };
  };
  const t = new Tracker(zdt1, box(d, 0, 1));
  const front = await nsga2(t, box(d, 0, 1), Array(d).fill(0.5), { iterations: 250, population: 60, seed: 3 }, ctl);
  const err = Math.max(...front.map((q) => Math.abs(q.f[1] - (1 - Math.sqrt(q.f[0])))));
  const spread = [Math.min(...front.map((q) => q.f[0])), Math.max(...front.map((q) => q.f[0]))];
  console.log(`NSGA-II ZDT1: ${front.length} front points, max |f2 − (1 − √f1)| = ${err.toExponential(2)}, f1 spans ${spread.map((v) => v.toFixed(3)).join('–')}`);
  if (err > 0.1 || spread[1] - spread[0] < 0.9) throw new Error('NSGA-II front is off');

  // LM: y = a·exp(−b·x) + c through residuals
  const xsData = Array.from({ length: 30 }, (_, i) => i * 0.2);
  const truth = [2, 1.3, 0.5];
  const model = (q: number[], x: number) => q[0] * Math.exp(-q[1] * x) + q[2];
  const lmEval: Evaluate = async (xs) => {
    const residuals = xs.map((q) => xsData.map((x) => model(q, x) - model(truth, x)));
    const merits = residuals.map((r) => r.reduce((s, v) => s + v * v, 0));
    return { merits, parts: merits.map((m) => [m]), residuals };
  };
  const tl = new Tracker(lmEval, box(3, 0, 5));
  await levenbergMarquardtBatch(tl, box(3, 0, 5), [1, 0.5, 0], { iterations: 100 }, ctl);
  console.log(`LM exponential: best ${tl.best.toExponential(2)} at [${tl.bestX.map((v) => v.toFixed(5)).join(', ')}] (truth 2, 1.3, 0.5), ${tl.evaluations} evals`);
  if (tl.best > 1e-12) throw new Error('LM did not converge');
}

// ---- Simulated annealing: test functions and the thermal-emitter benchmark (Pan et al., Opt. Express 32, 47154 (2024)) ----
if (full('simulated annealing, Pan 2024 (47 s)')) {
  const sctl = { stopped: () => false, waitIfPaused: async () => {}, report: () => {} };
  const sbox = (d: number, lo: number, hi: number): Box => ({ lo: Array(d).fill(lo), hi: Array(d).fill(hi), integer: Array(d).fill(false) });
  const rastr = (x: number[]) => 10 * x.length + x.reduce((s, v) => s + v * v - 10 * Math.cos(2 * Math.PI * v), 0);
  const quad5 = (x: number[]) => x.reduce((s, v, i) => s + (v - i) ** 2, 0);
  const tq = new Tracker(fromScalar(quad5), sbox(5, -10, 10));
  await simulatedAnnealing(tq, sbox(5, -10, 10), [5, 5, 5, 5, 5], { iterations: 4000, seed: 3, chains: 4, perTemp: 50, cooling: 0.9, step: 0.1 }, sctl);
  const tr = new Tracker(fromScalar(rastr), sbox(2, -5.12, 5.12));
  await simulatedAnnealing(tr, sbox(2, -5.12, 5.12), [3.5, -3.5], { iterations: 3000, seed: 5, chains: 4, perTemp: 50, cooling: 0.92, step: 0.15 }, sctl);
  // a worse move is accepted with probability exp(−Δ/T): at a very high temperature almost every move is taken
  let hot = 0;
  const th = new Tracker(fromScalar(quad5), sbox(5, -10, 10));
  await simulatedAnnealing(th, sbox(5, -10, 10), [0, 1, 2, 3, 4], { iterations: 50, seed: 1, chains: 1, t0: 1e9, perTemp: 1000, step: 0.2 }, { ...sctl, report: (p) => (hot = Number(/accepted (\d+) %/.exec(p.phase)?.[1] ?? 0)) });
  let cold = 0;
  const tc = new Tracker(fromScalar(quad5), sbox(5, -10, 10));
  await simulatedAnnealing(tc, sbox(5, -10, 10), [0, 1, 2, 3, 4], { iterations: 50, seed: 1, chains: 1, t0: 1e-12, perTemp: 1000, step: 0.2 }, { ...sctl, report: (p) => (cold = Number(/accepted (\d+) %/.exec(p.phase)?.[1] ?? 0)) });
  console.log(`simulated annealing: quadratic 5D ${tq.best.toExponential(1)}, Rastrigin 2D ${tr.best.toExponential(1)} (global minimum 0, next local minima ≥ 1); acceptance at T₀ = 10⁹ ${hot} %, at the minimum with T₀ → 0 ${cold} %`);
  if (!(tq.best < 0.05 && tr.best < 0.9 && hot > 90 && cold === 0)) throw new Error('simulated annealing on the test functions');

  // Thermal emitter: the published optimum through the graph, then SA (+ Nelder-Mead polish) from the example's start
  const ep = thermalEmitterSaExample();
  const elib = makeLibrary(ep.materials);
  const withVals = (vals: number[]) => ep.nodes.map((nn) => (nn.type === 'variable' ? ({ ...nn, data: { ...nn.data, value: vals[Number(nn.id.slice(1)) - 1] } } as AppNode) : nn));
  const metricsAt = (vals: number[]) => {
    const r = evaluateHeadless(withVals(vals), ep.edges, elib).results.get('obj')!;
    return { ...(r.info as FormulaInfo).values, F: (r.info as FormulaInfo).value };
  };
  const pub = metricsAt(PAN2024.thicknesses);
  if (!(Math.abs(pub.H - PAN2024.peakA) < 0.01 && Math.abs(pub.lp / 1000 - PAN2024.peakUm) / PAN2024.peakUm < 0.006 && Math.abs(pub.Q - PAN2024.Q) / PAN2024.Q < 0.05))
    throw new Error(`Pan 2024 optimum through the graph: A ${pub.H}, λ ${pub.lp}, Q ${pub.Q}`);
  const eoi = evaluateHeadless(ep.nodes, ep.edges, elib).results.get('opt')!.info as OptimizerInfo;
  const evars = eoi.variables;
  const ebox: Box = { lo: evars.map((v) => v.min), hi: evars.map((v) => v.max), integer: evars.map((v) => v.integer) };
  const ef = (x: number[]) => meritOf(ep.nodes, ep.edges, elib, evars, ['obj'], x).merit;
  const ex0 = evars.map((v) => v.value);
  const st = metricsAt(ex0);
  const t0 = performance.now();
  const et = new Tracker(fromScalar(ef), ebox);
  await simulatedAnnealing(et, ebox, ex0, { iterations: 800, seed: 1, chains: 4, perTemp: 20, cooling: 0.9, step: 0.1 }, sctl);
  const afterSa = et.best;
  const saEvals = et.evaluations;
  await nelderMead(et, ebox, et.bestX, { iterations: 150, step: 0.02 }, sctl, 'polish');
  const fin = metricsAt(et.bestX);
  console.log(
    `thermal emitter (Pan et al. 2024): published optimum → A ${pub.H.toFixed(4)} at ${(pub.lp / 1000).toFixed(3)} µm, Q ${pub.Q.toFixed(0)} (paper 0.8261, 5.34 µm, 175), F ${pub.F.toFixed(3)}; ` +
      `SA from ${ex0.join(' / ')} nm (F ${st.F.toFixed(3)}, peak ${(st.lp / 1000).toFixed(3)} µm): F ${afterSa.toFixed(3)} after ${saEvals} evaluations, + Nelder-Mead ${fin.F.toFixed(3)} → ` +
      `[${et.bestX.map((v) => v.toFixed(1)).join(', ')}] nm, A ${fin.H.toFixed(3)} at ${(fin.lp / 1000).toFixed(4)} µm, Q ${fin.Q.toFixed(0)} (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
  );
  if (!(afterSa < st.F && fin.F < pub.F && Math.abs(fin.lp - 5340) < 3 && fin.H > 0.8 && fin.Q > 150)) throw new Error('simulated annealing on the thermal emitter');
}

// ---- Gradient inverse design after M. He et al., Nat. Mater. 20, 1663 (2021): CdO carrier model, Adam stages / decay, loss ----
if (full('He 2021 inverse design (21 s)')) {
  // (1) doped-semiconductor Drude model = the CdO function of the reference code (which uses 3.14 for π: ~0.1 % in ωp²)
  const hp = heTammExample();
  const hlib = makeLibrary(hp.materials);
  const hm = Object.fromEntries([...hlib].map(([id, dd]) => [id, dd.model]));
  const cdo = hm['user-cdo-nolen'] as Parameters<typeof carrierDrude>[0];
  const codeDrude = (carrier: number, wavelength: number) => {
    const k = 1e7 / wavelength, w = 2.998e10 * k, q = 1.60217662e-19, m = 9.10938e-31, eps0 = 8.854e-12;
    const n1 = carrier * 1e20;
    const mEff = 0.1 * (1 + 2 * 1.47 * (0.19732697 ** 2 / (0.1 * 510998.5)) * (3 * 3.14 * carrier * 1e8) ** (2 / 3)) ** 0.5;
    const wp = (1000 / (2 * 3.14)) * ((n1 * q ** 2) / (mEff * m * eps0)) ** 0.5;
    const g = (10000 / (2 * 3.14)) * (q / (200 * mEff * m));
    return c(5.1 - wp ** 2 / (w ** 2 + g ** 2), (g * wp ** 2) / (w * (w ** 2 + g ** 2)));
  };
  let dCdo = 0;
  for (const N of [0.4, 1, 2.2, 4]) for (const lam of [2900, 3500, 4237, 5000, 6600]) {
    const e = carrierDrude(cdo, N, 1239.84193 / lam);
    const r = codeDrude(N, lam);
    // relative to the free-carrier term ε − ε∞ (near ε ≈ 0 a relative error on ε itself is meaningless)
    dCdo = Math.max(dCdo, Math.hypot(e.re - r.re, e.im - r.im) / Math.hypot(r.re - 5.1, r.im));
  }
  if (dCdo > 3e-3) throw new Error(`CdO model vs the reference code: ${dCdo}`);
  // the carrier density from a Design variable reaches the TMM: graph R = direct TMM with ε(N)
  const Nset = 1.3;
  const hn = hp.nodes.map((nn) => (nn.id === 'vN' ? ({ ...nn, data: { ...nn.data, value: Nset } } as AppNode) : nn.type === 'param' && nn.id === 'wl' ? ({ ...nn, data: { ...nn.data, mode: 'constant', value: 4237 } } as AppNode) : nn));
  const hout = evaluateHeadless(hn, hp.edges, hlib).results.get('tmm')!.outs.out;
  const Rg = hout?.type === 'data' ? hout.dataset!.fields.R[0] : NaN;
  const nOf = (id: string, N?: number) => refractiveIndex(id, hm, 4237, N);
  const stackH: Layer[] = [{ n: c(1), d: 0 }, ...['Ge', 'SiO', 'Ge', 'SiO', 'Ge', 'SiO', 'Ge', 'SiO', 'Ge'].map((mm) => ({ n: nOf(mm === 'Ge' ? 'user-ge-4' : 'user-sio-225'), d: 450 })), { n: nOf('user-cdo-nolen', Nset), d: 450 }, { n: nOf('user-sio-225'), d: 0 }];
  const Rd = tmmPoint(stackH, 4237, 0, 's').R;
  if (!(Math.abs(Rg - Rd) < 1e-12)) throw new Error(`carrier density through the graph: ${Rg} vs ${Rd}`);

  // (2) loss MSE + λ·max e² (Curve match) = manual
  const hev = evaluateHeadless(hp.nodes, hp.edges, hlib);
  const mAll = hev.results.get('mAll')!.info as MatchInfo;
  const errs2 = mAll.terms[0].sim.map((s2, i) => (s2 - mAll.terms[0].target[i]) ** 2).filter(Number.isFinite);
  const lossMan = errs2.reduce((a, b) => a + b, 0) / errs2.length + 0.01 * Math.max(...errs2);
  if (Math.abs(mAll.rmse - lossMan) > 1e-12 * lossMan) throw new Error(`MSE + 0.01·max e²: ${mAll.rmse} vs ${lossMan}`);
  // the Target node (baseline − Lorentzian − Gaussian on the cm⁻¹ grid) = the target of the reference code; the Curve match
  // “only where the target is < 0.95” uses exactly its resonance points
  {
    const ti = hev.results.get('target')!.info as TargetInfo;
    const rows = he2021TargetCsv(true).trim().split('\n').slice(1).map((r) => r.split(',').map(Number));
    if (ti.xs.length !== rows.length) throw new Error(`He 2021 target: ${ti.xs.length} points vs ${rows.length}`);
    let dx = 0;
    let dy = 0;
    rows.forEach(([x, y], i) => {
      dx = Math.max(dx, Math.abs(ti.xs[i] - x));
      dy = Math.max(dy, Math.abs(ti.target[i] - y));
    });
    const mRes = hev.results.get('mRes')!.info as MatchInfo;
    const resX = rows.filter((r) => r[2] === 1).map((r) => r[0]);
    const usedX = mRes.terms[0].xs.filter((_, i) => Number.isFinite(mRes.terms[0].sim[i]));
    const sameSet = usedX.length === resX.length && usedX.every((x, i) => Math.abs(x - resX[i]) < 1e-5);
    if (!(dx < 1e-5 && dy < 1e-8 && sameSet && mAll.used === rows.length)) throw new Error(`He 2021 target vs the code: Δλ ${dx}, Δy ${dy}, resonance points ${usedX.length} vs ${resX.length}, all ${mAll.used}`);
  }
  // a Gaussian component: FWHM Γ (value 1/2 at x₀ ± Γ/2)
  const gz = modelAt([{ id: 'g', type: 'gauss', params: { A: { value: 2, fixed: false }, x0: { value: 500, fixed: false }, w: { value: 30, fixed: false } } }], 515, { energy: false, xref: 0 });
  if (Math.abs(gz - 1) > 1e-14) throw new Error(`Gaussian half width: ${gz}`);

  // (3) Adam: two stages on selected objectives, staircase learning-rate decay
  const box2: Box = { lo: [0, 0], hi: [1, 1], integer: [false, false] };
  const two: Evaluate = async (xs) => {
    const parts = xs.map((x) => [(x[0] - 0.3) ** 2, (x[1] - 0.7) ** 2]);
    return { merits: parts.map((q) => q[0] + q[1]), parts };
  };
  let lastPhase = '';
  const actl = { stopped: () => false, waitIfPaused: async () => {}, report: (q: { phase: string }) => (lastPhase = q.phase) };
  const ta = new Tracker(two, box2);
  await adam(ta, box2, [0.9, 0.1], { iterations: 300, lr: 0.05, starts: 1, seed: 1, stall: 0, stage1: { iterations: 300, lr: 0.05, mask: [true, false] } }, actl);
  const afterStage1 = ta.bestX.slice();
  const tb = new Tracker(two, box2);
  await adam(tb, box2, [0.9, 0.1], { iterations: 700, lr: 0.05, starts: 1, seed: 1, stall: 0, decay: 0.5, decaySteps: 100, stage1: { iterations: 300, lr: 0.05, mask: [true, false] }, stage2Mask: [false, true] }, actl);
  const lrEnd = Number(/lr ([\d.e-]+)/.exec(lastPhase)?.[1]);
  // (the best point may be a finite-difference probe: x₁ within 1e-4; the phase shows lr with 2 digits)
  if (!(Math.abs(afterStage1[0] - 0.3) < 0.01 && Math.abs(afterStage1[1] - 0.1) < 1e-4 && Math.abs(tb.bestX[0] - 0.3) < 0.01 && Math.abs(tb.bestX[1] - 0.7) < 0.01 && Math.abs(lrEnd - 0.05 * 0.5 ** 3) < 1e-4))
    throw new Error(`Adam stages / decay: stage 1 ${afterStage1}, both ${tb.bestX}, lr ${lrEnd}`);

  // (4) the example: the schedule of the reference code (shortened) forms both dips
  const fast = hp.nodes.map((nn) => (nn.id === 'wl' ? ({ ...nn, data: { ...nn.data, step: 4 } } as AppNode) : nn));
  const hoi = evaluateHeadless(fast, hp.edges, hlib).results.get('opt')!.info as OptimizerInfo;
  const hvars = hoi.variables;
  const hbox: Box = { lo: hvars.map((v) => v.min), hi: hvars.map((v) => v.max), integer: hvars.map((v) => v.integer) };
  const hids = hoi.objectives.map((o) => o.id);
  const heval: Evaluate = async (xs) => {
    const r = xs.map((x) => meritOf(fast, hp.edges, hlib, hvars, hids, x));
    return { merits: r.map((q) => q.merit), parts: r.map((q) => q.parts) };
  };
  const hx0 = hvars.map((v) => v.value);
  const start = (await heval([hx0])).merits[0];
  const t0 = performance.now();
  const th = new Tracker(heval, hbox);
  const hmask = (ids: string[]) => hids.map((id) => ids.includes(id));
  await adam(th, hbox, hx0, { iterations: 90, lr: 0.05, starts: 1, seed: 1, decay: 0.7, decaySteps: 14, stall: 0, stage1: { iterations: 30, lr: 0.01, mask: hmask(['mRes']) }, stage2Mask: hmask(['mAll']) }, { stopped: () => false, waitIfPaused: async () => {}, report: () => {} });
  const hvals = Object.fromEntries(hvars.map((v, i) => [v.id, th.bestX[i]]));
  const hfin = evaluateHeadless(fast.map((nn) => (nn.type === 'variable' ? ({ ...nn, data: { ...nn.data, value: hvals[nn.id] } } as AppNode) : nn)), hp.edges, hlib).results.get('mAll')!.info as MatchInfo;
  const Rat = (l: number) => {
    const t2 = hfin.terms[0];
    return t2.sim[t2.xs.reduce((k, x, i) => (Math.abs(x - l) < Math.abs(t2.xs[k] - l) ? i : k), 0)];
  };
  console.log(
    `He et al. 2021: CdO carrier model = reference code (${dCdo.toExponential(1)}; 3.14 for π there), N from a Design variable through the graph = direct TMM (${Math.abs(Rg - Rd).toExponential(1)}); loss MSE + 0.01·max e² = manual; ` +
      `Adam stage 1 moves only its objective (x₁ unchanged), stage 2 the other, lr 0.05 → ${lrEnd} (×0.5 / 100 steps); example (shortened schedule, 30 + 60 steps): merit ${start.toExponential(2)} → ${th.best.toExponential(2)}, R at 4237 / 3500 nm ${Rat(4237.3).toFixed(3)} / ${Rat(3500).toFixed(3)}, at 5000 nm ${Rat(5000).toFixed(3)}, N = ${th.bestX[hvars.findIndex((v) => v.id === 'vN')].toFixed(2)} (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
  );
  if (!(th.best < 0.3 * start && Rat(4237.3) < 0.4 && Rat(3500) < 0.4 && Rat(5000) > 0.9)) throw new Error('He et al. example: the dips were not formed');
}

// ---- Measured data, targets, curve matching: thicknesses recovered from a synthetic measurement ----
{
  const tp = parseSpectrum('# comment\nE (eV); R (%); T\n2.0; 50; 0.4\n1.5; 40; 0.5\n', 'eV', '', 0.01);
  if (typeof tp === 'string' || Math.abs(tp.xs[0] - 1239.84193 / 2) > 1e-9 || tp.columns[0].meta.key !== 'R' || tp.columns[0].values[0] !== 0.5)
    throw new Error('CSV spectrum parser');

  const p = metrologyExample();
  const mlib = makeLibrary(p.materials);
  const ev = evaluateHeadless(p.nodes, p.edges, mlib);
  for (const id of ['meas', 'match', 'opt']) if (ev.results.get(id)!.errors.length) throw new Error(`${id}: ${ev.results.get(id)!.errors.join('; ')}`);
  const vars = (ev.results.get('opt')!.info as OptimizerInfo).variables;
  const box: Box = { lo: vars.map((v) => v.min), hi: vars.map((v) => v.max), integer: vars.map((v) => v.integer) };
  const x0 = vars.map((v) => v.value);
  const m0 = meritOf(p.nodes, p.edges, mlib, vars, ['match'], x0);
  const sr = m0.residuals.reduce((s, r) => s + r * r, 0);
  if (Math.abs(sr - m0.merit) > 1e-12 * Math.max(1, m0.merit)) throw new Error('Curve match residuals do not sum to the cost');
  const evaluate: Evaluate = async (xs, residuals) => {
    const r = xs.map((x) => meritOf(p.nodes, p.edges, mlib, vars, ['match'], x));
    return { merits: r.map((q) => q.merit), parts: r.map((q) => q.parts), residuals: residuals ? r.map((q) => q.residuals) : undefined };
  };
  const tl = new Tracker(evaluate, box);
  await levenbergMarquardtBatch(tl, box, x0, { iterations: 60 }, { stopped: () => false, waitIfPaused: async () => {}, report: () => {} });
  console.log(
    `metrology fit (LM): d = [${tl.bestX.map((v) => v.toFixed(2)).join(', ')}] nm (truth ${METROLOGY_TRUTH.tio2}, ${METROLOGY_TRUTH.sio2}), rms ${Math.sqrt(tl.best).toFixed(4)}, ${tl.evaluations} evals`,
  );
  if (Math.abs(tl.bestX[0] - METROLOGY_TRUTH.tio2) > 0.5 || Math.abs(tl.bestX[1] - METROLOGY_TRUTH.sio2) > 0.5) throw new Error('metrology fit did not recover the thicknesses');

  // Band target on the same simulation: only the band points are matched.
  const nodes: AppNode[] = [
    ...p.nodes,
    { id: 'tg', type: 'target', position: { x: 0, y: 0 }, data: { ...TARGET_DEFAULTS, bands: [{ lo: 500, hi: 600, value: 0, weight: 1 }] } },
    { id: 'm2', type: 'match', position: { x: 0, y: 0 }, data: { name: '', field: 'R', metric: 'rms', weight: 1, lo: NaN, hi: NaN } },
  ];
  const edges = [
    ...p.edges,
    { id: 'a', source: 'tmm', target: 'm2', targetHandle: 'in', sourceHandle: 'out' },
    { id: 'b', source: 'tg', target: 'm2', targetHandle: 'target', sourceHandle: 'out' },
  ];
  const ev2 = evaluateHeadless(nodes, edges, mlib);
  const ti = ev2.results.get('tg')!.info as TargetInfo;
  const mi = ev2.results.get('m2')!.info as MatchInfo;
  console.log(`band target: ${ti.weight.filter((w) => w > 0).length} of ${ti.xs.length} points weighted; R → 0 in 500–600 nm: rms ${mi.rmse.toFixed(4)} over ${mi.used} points`);
  if (mi.used !== 51) throw new Error('band target point count');

  // Target outputs for plots: Curve match draws its target on the simulation; Zones a step target (absorber example)
  const mr = ev2.results.get('m2')!;
  const mk = mr.outs.marked;
  const mt = mr.outs.target;
  const xyM = mk?.type === 'data' ? mk.annotations.find((a) => a.kind === 'xy' && a.id === 'm2:target') : undefined;
  if (mk?.type !== 'data' || mt?.type !== 'data' || !xyM || xyM.kind !== 'xy' || mk.dataset !== (ev2.results.get('tmm')!.outs.out as { dataset: unknown }).dataset)
    throw new Error('Curve match target outputs');
  const ap = absorberExample();
  const ar = evaluateHeadless(ap.nodes, ap.edges, makeLibrary(ap.materials)).results.get('zones')!;
  const zm = ar.outs.marked;
  const zt = ar.outs.target;
  if (zm?.type !== 'data' || zt?.type !== 'data' || !zt.dataset) throw new Error(`Zones target outputs: ${ar.errors}`);
  const spans = zm.annotations.filter((a) => a.kind === 'span').length;
  const tx = zt.dataset.axes[0].values;
  const tA = zt.dataset.fields.A;
  const lvl = (x: number) => tA[tx.findIndex((v) => Math.abs(v - x) < 1e-9)];
  // zones 480–530 and 680–730 maximize A (→ 1), outside minimized (→ 0)
  if (spans !== 2 || lvl(500) !== 1 || lvl(700) !== 1 || lvl(600) !== 0) throw new Error(`Zones step target: spans ${spans}, A(500) ${lvl(500)}, A(600) ${lvl(600)}`);
  // a zone without a quantity: an error, and nothing drawn for it
  const noField = ap.nodes.map((n) => (n.type === 'zones' ? ({ ...n, data: { ...n.data, zones: [...n.data.zones, { lo: 600, hi: 620, field: '', goal: 'max', target: 1, weight: 1 }] } } as AppNode) : n));
  const nr = evaluateHeadless(noField, ap.edges, makeLibrary(ap.materials)).results.get('zones')!;
  if (!nr.errors.some((e) => e.includes('choose the quantity'))) throw new Error('zone without a quantity');
  console.log(`target outputs: Curve match draws its target (${xyM.x.length} points) on the simulation; Zones step target A = 1 in the bands, 0 outside, ${spans} zone bands`);
}

// ---- Colour maps (display only): blur, smoothing, log colour-bar ticks ----
{
  const nx = 7;
  const ny = 5;
  const flat = new Float64Array(nx * ny).fill(2.5);
  const eFlat = Math.max(...gaussianBlur(flat, nx, ny, 1.5).map((v) => Math.abs(v - 2.5)));
  const lin = Float64Array.from({ length: nx * ny }, (_, k) => 3 * (k % nx) + 2 * Math.floor(k / nx));
  const eLin = Math.abs(bilinear(lin, nx, ny, 1.25, 3.5) - (3 * 3.5 + 2 * 1.25));
  const holes = flat.slice();
  holes[8] = NaN;
  const bh = gaussianBlur(holes, nx, ny, 1);
  const fi = fracIndex([10, 20, 40], 30);
  const dec = logTicks(-3, 1).map((t) => t.text).join(' ');
  if (eFlat > 1e-12 || eLin > 1e-12 || !Number.isNaN(bh[8]) || Math.abs(bh[9] - 2.5) > 1e-12 || Math.abs(fi - 1.5) > 1e-12 || dec !== '0.001 0.01 0.1 1 10')
    throw new Error(`colour-map helpers: ${eFlat} ${eLin} ${bh[8]} ${bh[9]} ${fi} ${dec}`);
  const cv = Float64Array.of(1, 5, 50, NaN, 20);
  const sat = Array.from(capValues(cv, 20, false));
  const hid = Array.from(capValues(cv, 20, true));
  if (sat.join() !== '1,5,20,NaN,20' || hid.join() !== '1,5,NaN,NaN,20' || capValues(cv, undefined, false) !== cv) throw new Error(`cap: ${sat} / ${hid}`);
  console.log(`colour maps: blur keeps a uniform field (${eFlat.toExponential(1)}) and skips holes; bilinear exact on a plane; log ticks ${dec}; cap: saturate 50 → 20, hide 50 → not drawn`);
}

// ---- Project files keep NaN / Infinity (open interval bounds) ----
{
  const p = { app: 'spr-flow', version: 3, nodes: [{ id: 'a', type: 'objective', position: { x: 0, y: 0 }, data: { lo: NaN, hi: -Infinity, stats: null, list: [NaN, 1] } }], edges: [], materials: [] } as unknown as Project;
  const back = parseProject(stringifyProject(p));
  const d = typeof back === 'string' ? null : (back.nodes[0].data as unknown as { lo: number; hi: number; stats: null; list: number[] });
  if (!d || !Number.isNaN(d.lo) || d.hi !== -Infinity || d.stats !== null || !Number.isNaN(d.list[0]) || d.list[1] !== 1) throw new Error('NaN round trip in project files');
  console.log('project NaN / Infinity round trip ok');

  // a damaged file: repaired where possible (a missing position), else the part left out, never a crash of the app
  const dmg = {
    app: 'spr-flow',
    version: 3,
    nodes: [
      { id: 'a', type: 'param', data: {} }, // no position → (0, 0)
      { id: 'b', type: 'nosuchnode', position: { x: 1, y: 2 }, data: {} }, // unknown type → left out
      { id: 'c', type: 'plot', position: { x: 'x', y: 2 }, data: {}, parentId: 'missing' }, // bad position, unknown frame
      { type: 'plot', position: { x: 0, y: 0 }, data: {} }, // no id
      { id: 'd', type: 'plot', position: { x: 5, y: 6 } }, // no data
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'c' },
      { id: 'e2', source: 'a', target: 'b' }, // to a node left out
      { id: 'e3', source: 'a' }, // no target
    ],
    materials: 'x',
  };
  const rp = parseProject(JSON.stringify(dmg));
  if (typeof rp === 'string') throw new Error(`damaged project: ${rp}`);
  const byId = new Map(rp.nodes.map((nn) => [nn.id, nn]));
  const okRepair = rp.nodes.length === 2 && byId.get('a')!.position.x === 0 && byId.get('c')!.position.x === 0 && byId.get('c')!.position.y === 0 && !('parentId' in byId.get('c')!) && rp.edges.length === 1 && rp.edges[0].id === 'e1' && Array.isArray(rp.materials) && rp.materials.length === 0;
  if (!okRepair) throw new Error(`damaged project repair: ${JSON.stringify(rp)}`);
  // share links: deflate + base64url round trip of an example; damaged links give a message
  const ex = notchExample();
  const code = await encodeProject(ex);
  const dec = await decodeProject(code);
  if (typeof dec === 'string' || stringifyProject(dec) !== stringifyProject(parseProject(stringifyProject(ex)) as Project)) throw new Error('share link round trip');
  const bad = [await decodeProject('garbage!!'), await decodeProject(code.slice(0, -30)), await decodeProject('')];
  if (!bad.every((b) => typeof b === 'string')) throw new Error('damaged share links');
  console.log(`damaged project repaired (5 nodes → 2, 3 connections → 1); share link of the notch example: ${code.length} characters for ${stringifyProject(ex).length} of JSON, round trip exact; damaged links rejected with a message`);
}

// ---- Custom objective (expression) and the optimizer outputs ----
{
  for (const [e, v] of [
    ['0.5*a + 0.25*b/5 - 0.25*c/100', 1.14],
    ['-a^2 + max(a, b, c) * sqrt(4)', 4],
    ['(a+b)*(c-a) / abs(-2)', 5],
  ] as const) {
    const c = compile(e);
    if (typeof c === 'string' || Math.abs(c.fn({ a: 2, b: 3, c: 4 }) - v) > 1e-12) throw new Error(`expression ${e}`);
  }
  if (typeof compile('a +') !== 'string' || typeof compile('foo(a)') !== 'string') throw new Error('expression errors not reported');

  const p = sprDesignExample();
  const slib = makeLibrary(p.materials);
  const ev = evaluateHeadless(p.nodes, p.edges, slib);
  const fi = ev.results.get('obj')!.info as FormulaInfo;
  if (ev.results.get('obj')!.errors.length || !Number.isFinite(fi.value)) throw new Error('custom objective');
  const vars = (ev.results.get('opt')!.info as OptimizerInfo).variables;
  const box: Box = { lo: vars.map((v) => v.min), hi: vars.map((v) => v.max), integer: vars.map((v) => v.integer) };
  const f = (x: number[]) => meritOf(p.nodes, p.edges, slib, vars, ['obj'], x).merit;
  const t = new Tracker(fromScalar(f), box);
  await nelderMead(t, box, vars.map((v) => v.value), { iterations: 40, step: 0.1 }, { stopped: () => false, waitIfPaused: async () => {}, report: () => {} });
  console.log(`SPR design (custom objective): d Ag 35 → ${t.bestX[0].toFixed(2)} nm, merit ${fi.cost.toFixed(4)} → ${t.best.toFixed(4)} (a = R dip, b = FWHM, c = S: ${Object.values(fi.values).map((v) => v.toFixed(3)).join(', ')} at start)`);

  // A stored run: the outputs give the optimized simulation (plain data, usable by analysis nodes) and stack;
  // a Pareto point can be chosen instead of the best merit.
  const run = {
    id: 'r1', algorithm: 'nm' as const, started: 0, seconds: 1, evaluations: t.evaluations, merit: t.best,
    values: { vd: t.bestX[0] }, start: { vd: 35 }, names: { vd: 'd Ag' }, history: [], stopped: false,
    front: [{ x: [45], f: [0, 0] }],
  };
  const withRun = (extra: object) => p.nodes.map((n) => (n.type === 'optimizer' ? ({ ...n, data: { ...n.data, runs: [run], ...extra } } as AppNode) : n));
  const o = evaluateHeadless(withRun({}), p.edges, slib).results.get('opt')!;
  const out = o.outs.out;
  const ds = out?.type === 'data' ? out.dataset : null;
  if (!ds || ds.axes.some((a) => a.id === 'design') || !ds.spec) throw new Error('optimizer data output');
  const r1 = Math.min(...ds.fields.R);
  const st = o.outs.stack;
  if (st?.type !== 'stack' || Math.abs(st.stack.layers[0].d - t.bestX[0]) > 1e-9 || o.outs.start) throw new Error('optimizer stack output');
  // analysis nodes work on the output
  const nodes2: AppNode[] = [...withRun({}), { id: 'fw2', type: 'fwhm', position: { x: 0, y: 0 }, data: ANALYSIS_DEFAULTS.fwhm }];
  const edges2 = [...p.edges, { id: 'z', source: 'opt', sourceHandle: 'out', target: 'fw2', targetHandle: 'in' }];
  const fw = evaluateHeadless(nodes2, edges2, slib).results.get('fw2')!;
  const fwm = fw.outs.metrics;
  if (fw.errors.length || fwm?.type !== 'data' || !fwm.dataset) throw new Error(`FWHM on the optimizer output: ${fw.errors.join('; ')}`);
  const pt = evaluateHeadless(withRun({ outputPoint: 0 }), p.edges, slib).results.get('opt')!.outs.stack;
  if (pt?.type !== 'stack' || pt.stack.layers[0].d !== 45) throw new Error('optimizer output of a Pareto point');
  console.log(`optimizer outputs: R_min ${r1.toFixed(4)} at d = ${st.stack.layers[0].d.toFixed(2)} nm; FWHM of the output = ${fwm.dataset.fields.w0[0].toFixed(3)}°; Pareto point → d = 45 nm`);

  // Regression: a stale perturbed result with the same size but other axes (a second variable added) must not crash.
  const state: JobState = { cache: new Map(), lastDone: new Map(), failed: new Map() };
  evaluateHeadless(p.nodes, p.edges, slib, state);
  const nodes3: AppNode[] = [...p.nodes, { id: 'vn', type: 'variable', position: { x: 0, y: 0 }, data: { name: 'n water', value: 1.34, min: 1.33, max: 1.35, integer: false } }];
  const edges3 = [...p.edges, { id: 'y', source: 'vn', sourceHandle: 'out', target: 'water', targetHandle: 'n' }];
  // the main TMM job finishes first; the perturbed one is still pending (its old result has the old axes)
  for (const job of evaluateGraph(nodes3, edges3, state, slib).jobs.filter((j) => j.requester === 'tmm')) {
    const fields = runTmm(job.spec);
    state.cache.set(job.key, { key: job.key, spec: job.spec, axes: job.axes, fields, meta: TMM_META, size: fields.R.length });
    state.lastDone.set(job.requester, job.key);
  }
  const ev3 = evaluateGraph(nodes3, edges3, state, slib);
  const bad = [...ev3.results].filter(([, r]) => r.errors.some((e) => e.startsWith('Internal error')));
  if (bad.length) throw new Error(`internal errors: ${bad.map(([id, r]) => `${id}: ${r.errors}`).join('; ')}`);
  console.log('second design variable while results are pending: no internal errors');
}

// ---- Algorithm settings: DE strategies, GA / NSGA-II operators, PSO ring topology ----
{
  const ctl: Control = { stopped: () => false, waitIfPaused: async () => {}, report: () => {} };
  const bx = (d: number, lo: number, hi: number): Box => ({ lo: Array(d).fill(lo), hi: Array(d).fill(hi), integer: Array(d).fill(false) });
  const rastrigin = (x: number[]) => 10 * x.length + x.reduce((s, v) => s + v * v - 10 * Math.cos(2 * Math.PI * v), 0);
  const P = DEFAULT_PARAMS;
  const rows: string[] = [];
  for (const strategy of ['rand/1/bin', 'best/1/bin', 'current-to-best/1/bin', 'rand/2/bin', 'rand/1/exp'] as const) {
    const t = new Tracker(fromScalar(rastrigin), bx(4, -5.12, 5.12));
    await differentialEvolution(t, bx(4, -5.12, 5.12), [3, 3, 3, 3], { iterations: 300, population: 40, seed: 7, ...P.de, strategy }, ctl);
    rows.push(`DE ${strategy} ${t.best.toExponential(1)}`);
    if (t.best > 3) throw new Error(`DE ${strategy}`);
  }
  for (const [c, m] of [
    ['blx', 'gaussian'],
    ['uniform', 'uniform'],
    ['arithmetic', 'polynomial'],
  ] as const) {
    const t = new Tracker(fromScalar(rastrigin), bx(4, -5.12, 5.12));
    await genetic(t, bx(4, -5.12, 5.12), [3, 3, 3, 3], { iterations: 300, population: 40, seed: 5, ...P.ga, crossover: { ...P.ga.crossover, type: c }, mutation: { ...P.ga.mutation, type: m } }, ctl);
    rows.push(`GA ${c}+${m} ${t.best.toExponential(1)}`);
    if (!(t.best < 10)) throw new Error(`GA ${c}+${m}`);
  }
  const tp = new Tracker(fromScalar(rastrigin), bx(4, -5.12, 5.12));
  await particleSwarm(tp, bx(4, -5.12, 5.12), [3, 3, 3, 3], { iterations: 300, population: 40, seed: 5, ...P.pso, topology: 'ring', w: 0.9, wEnd: 0.4 }, ctl);
  rows.push(`PSO ring, w 0.9→0.4 ${tp.best.toExponential(1)}`);
  const d = 10;
  const zdt1: Evaluate = async (xs) => {
    const parts = xs.map((x) => {
      const g = 1 + (9 * x.slice(1).reduce((s, v) => s + v, 0)) / (d - 1);
      return [x[0], g * (1 - Math.sqrt(x[0] / g))];
    });
    return { merits: parts.map((q) => q[0] + q[1]), parts };
  };
  const tn = new Tracker(zdt1, bx(d, 0, 1));
  const front = await nsga2(tn, bx(d, 0, 1), Array(d).fill(0.5), { iterations: 250, population: 60, seed: 3, crossover: { ...P.nsga2.crossover, type: 'blx' }, mutation: { ...P.nsga2.mutation, type: 'gaussian', sigma: 0.05 } }, ctl);
  const err = Math.max(...front.map((q) => Math.abs(q.f[1] - (1 - Math.sqrt(q.f[0])))));
  rows.push(`NSGA-II BLX+Gaussian ZDT1 front error ${err.toExponential(1)}`);
  if (err > 0.3) throw new Error('NSGA-II with BLX / Gaussian');
  const merged = mergeParams({ ga: { crossover: { type: 'blx' } as Crossover } });
  if (merged.ga.crossover.eta !== 15 || merged.ga.crossover.type !== 'blx' || merged.de.CR !== 0.9) throw new Error('mergeParams');
  console.log(rows.join(' · '));
}

// ---- Reverse stack, and the Field profile placed at the resonance by default ----
{
  // Reverse + swapped media = light from the other side: T is reciprocal (same T), layer order reversed.
  const p = absorberExample();
  const rlib = makeLibrary(p.materials);
  const nodes: AppNode[] = [
    ...p.nodes.filter((n) => n.id !== 'opt' && n.id !== 'zones'),
    { id: 'rev', type: 'reverse', position: { x: 0, y: 0 }, data: { name: '', swapMedia: true } },
    { id: 'tmm2', type: 'compute', position: { x: 0, y: 0 }, data: { name: 'reversed', polarization: 'p' } },
  ];
  const edges = [
    ...p.edges.filter((e) => e.target !== 'opt' && e.target !== 'zones'),
    { id: 'r1', source: 'stack', sourceHandle: 'out', target: 'rev', targetHandle: 'in' },
    { id: 'r2', source: 'rev', sourceHandle: 'out', target: 'tmm2', targetHandle: 'stack' },
    { id: 'r3', source: 'wl', sourceHandle: 'out', target: 'tmm2', targetHandle: 'lambda' },
    { id: 'r4', source: 'th', sourceHandle: 'out', target: 'tmm2', targetHandle: 'theta' },
  ];
  const ev = evaluateHeadless(nodes, edges, rlib);
  const a = ev.results.get('stack')!.outs.out;
  const b = ev.results.get('rev')!.outs.out;
  if (a?.type !== 'stack' || b?.type !== 'stack') throw new Error('reverse stack output');
  const la = a.stack.layers.map((L) => L.key);
  const lb = b.stack.layers.map((L) => L.key);
  if (lb.join() !== [...la].reverse().join() || b.stack.incident !== a.stack.exit) throw new Error('reverse stack order / media');
  const t1 = ev.results.get('tmm')!.outs.out;
  const t2 = ev.results.get('tmm2')!.outs.out;
  const T1 = t1?.type === 'data' ? t1.dataset!.fields.T : null;
  const T2 = t2?.type === 'data' ? t2.dataset!.fields.T : null;
  const R1 = t1?.type === 'data' ? t1.dataset!.fields.R : null;
  const R2 = t2?.type === 'data' ? t2.dataset!.fields.R : null;
  if (!T1 || !T2 || !R1 || !R2) throw new Error('reverse: no TMM results');
  const dT = Math.max(...Array.from(T1, (v, i) => Math.abs(v - T2[i])));
  const dR = Math.max(...Array.from(R1, (v, i) => Math.abs(v - R2[i])));
  // tolerance: BK7 has a tiny k that is dropped only when it is the incident medium
  if (dT > 1e-9) throw new Error(`reverse: T not reciprocal (${dT})`);
  console.log(`reverse stack: order reversed, media swapped; |ΔT| = ${dT.toExponential(1)} (reciprocity), max |ΔR| = ${dR.toFixed(3)} (absorbing: R differs by side)`);

  // Field profile without a chosen angle: at the SPR dip.
  const s = sprExample();
  const sev = evaluateHeadless(s.nodes, s.edges, makeLibrary(s.materials));
  const fi = sev.results.get('field')!.info as { theta: { value: number; auto: boolean } };
  const out = sev.results.get('tmm')!.outs.out;
  const ds = out?.type === 'data' ? out.dataset! : null;
  const th = ds!.axes[ds!.axes.length - 1].values;
  const iMin = Array.from(ds!.fields.R).reduce((k, v, i, R) => (v < R[k] ? i : k), 0);
  if (!fi.theta.auto || fi.theta.value !== th[iMin]) throw new Error('field profile default point is not the R dip');
  console.log(`field profile default: θ = ${fi.theta.value}° = R minimum`);
}

// ---- DBR builder: thickness sweep of a period layer in nm = separate structures ----
{
  const p = dbrExample();
  const dlib = makeLibrary(p.materials);
  const base = p.nodes.map((n) =>
    n.type === 'dbr' ? ({ ...n, data: { ...n.data, cavities: [], period: [{ ...n.data.period[0], mode: 'nm', d: 60 }, { ...n.data.period[1], mode: 'nm', d: 100 }] } } as AppNode) : n,
  );
  const edges = p.edges.filter((e) => !(e.target === 'dbr' && (e.targetHandle === 'c0' || e.targetHandle === 'cavd')));
  const values = [50, 60, 70];
  const swept: AppNode[] = [...base, { id: 'sw', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'dA', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: values.join(', ') } }];
  const ev = evaluateHeadless(swept, [...edges, { id: 's', source: 'sw', sourceHandle: 'out', target: 'dbr', targetHandle: 'd0' }], dlib);
  const out = ev.results.get('tmm0')!.outs.out;
  if (ev.results.get('dbr')!.errors.length || out?.type !== 'data' || !out.dataset) throw new Error(`DBR d sweep: ${ev.results.get('dbr')!.errors}`);
  const ds = out.dataset;
  const ax = ds.axes.findIndex((a) => a.id === 'sweep:sw');
  const per = ds.size / values.length;
  let diff = 0;
  values.forEach((v, k) => {
    const single = base.map((n) => (n.type === 'dbr' ? ({ ...n, data: { ...n.data, period: [{ ...n.data.period[0], d: v }, n.data.period[1]] } } as AppNode) : n));
    const o = evaluateHeadless(single, edges, dlib).results.get('tmm0')!.outs.out;
    const R = o?.type === 'data' ? o.dataset!.fields.R : new Float64Array();
    for (let i = 0; i < per; i++) diff = Math.max(diff, Math.abs(ds.fields.R[k * per + i] - R[i]));
  });
  if (ax !== 0 || diff > 1e-12) throw new Error(`DBR thickness sweep differs from separate structures (${diff})`);
  // a λ₀/4 layer ignores the sweep (warning)
  const qw = base.map((n) => (n.type === 'dbr' ? ({ ...n, data: { ...n.data, period: [{ ...n.data.period[0], mode: 'qw' }, n.data.period[1]] } } as AppNode) : n));
  const w = evaluateHeadless([...qw, swept.at(-1)!], [...edges, { id: 's', source: 'sw', sourceHandle: 'out', target: 'dbr', targetHandle: 'd0' }], dlib).results.get('dbr')!;
  if (!w.warnings.some((x) => x.includes('ignored'))) throw new Error('DBR: λ₀/4 layer with a thickness sweep should warn');
  console.log(`DBR thickness sweep of layer A (${values.join('/')} nm) vs separate structures: max ΔR = ${diff.toExponential(1)}`);
}

// ---- Stage 4: analytic gradients, thick incoherent substrate, filter design ----
{
  // (1) characteristic-matrix TMM = Byrnes TMM; analytic ∂/∂d and needle derivatives = finite differences
  const nH = c(2.35, 0.001), nL = c(1.46), n0 = c(1), nS = c(1.52, 0.0005);
  const films: Film[] = [{ n: nH, d: 57 }, { n: nL, d: 91 }, { n: nH, d: 120 }, { n: c(0.13, 3.9), d: 12 }, { n: nL, d: 33 }];
  let eF = 0, eG = 0, eN = 0;
  for (const pol of ['s', 'p'] as const)
    for (const th of [0, 35, 62]) {
      const lam = 612, k0 = (2 * Math.PI) / lam, kx = Math.sin((th * Math.PI) / 180);
      const r = coherent(films, n0, nS, kx, k0, pol, { grad: true, probes: [{ layer: 1, z: 40 }], candidates: [nH] });
      const tm = (fs: Film[]) => tmmPoint([{ n: n0, d: 0 }, ...fs, { n: nS, d: 0 }], lam, th, pol);
      const ref = tm(films);
      const rev = tmmPoint([{ n: c(nS.re), d: 0 }, ...[...films].reverse(), { n: n0, d: 0 }], lam, (Math.asin(kx / nS.re) * 180) / Math.PI, pol);
      const r2 = coherent(films, n0, c(nS.re), kx, k0, pol);
      eF = Math.max(eF, Math.abs(r.faces.R - ref.R), Math.abs(r.faces.T - ref.T), Math.abs(r2.faces.Rr - rev.R), Math.abs(r2.faces.Tr - rev.T));
      films.forEach((_, j) => {
        const h = 1e-5;
        const a = tm(films.map((f, k) => (k === j ? { ...f, d: f.d + h } : f)));
        const b = tm(films.map((f, k) => (k === j ? { ...f, d: f.d - h } : f)));
        eG = Math.max(eG, Math.abs((a.R - b.R) / (2 * h) - r.grad![j].R), Math.abs((a.T - b.T) / (2 * h) - r.grad![j].T));
      });
      const eps = 1e-5;
      const ins = tm([films[0], { n: nL, d: 40 }, { n: nH, d: eps }, { n: nL, d: 51 }, ...films.slice(2)]);
      eN = Math.max(eN, Math.abs((ins.R - ref.R) / eps - r.needle![0][0].R));
    }
  if (eF > 1e-12 || eG > 1e-8 || eN > 1e-5) throw new Error(`admittance TMM: faces ${eF}, gradient ${eG}, needle ${eN}`);
  console.log(`admittance TMM vs Byrnes: ${eF.toExponential(1)}; analytic ∂/∂d vs FD ${eG.toExponential(1)}; needle vs FD ${eN.toExponential(1)} (s, p; 0/35/62°; absorbing layers)`);

  // (2) thick substrate: plate formula = run.ts, and = the coherent result averaged over one fringe of the substrate thickness
  const back: Film[] = [{ n: nL, d: 100 }];
  const lam = 550, th = 20, k0 = (2 * Math.PI) / lam, kx = Math.sin((th * Math.PI) / 180);
  const f0 = coherent(films.filter((f) => f.n.im < 1), n0, c(nS.re), kx, k0, 's').faces;
  const b0 = coherent(back, c(nS.re), n0, kx, k0, 's').faces;
  const pl = plate({ f: f0, b: b0, a: 1 });
  const cosS = Math.sqrt(1 - (kx / nS.re) ** 2);
  const period = lam / (2 * nS.re * cosS);
  let Ravg = 0, Tavg = 0;
  const M = 2000;
  for (let i = 0; i < M; i++) {
    const p = tmmPoint([{ n: n0, d: 0 }, ...films.filter((f) => f.n.im < 1), { n: c(nS.re), d: 10000 + (i / M) * period }, ...back, { n: n0, d: 0 }], lam, th, 's');
    Ravg += p.R / M;
    Tavg += p.T / M;
  }
  const ip = incoherentPoint([{ n: n0, d: 0 }, ...films, { n: nS, d: 0 }], [{ n: nS, d: 0 }, ...back, { n: n0, d: 0 }], 1e6, lam, th, 'p');
  const fa = coherent(films, n0, c(nS.re), kx, k0, 'p').faces;
  const ba = coherent(back, c(nS.re), n0, kx, k0, 'p').faces;
  const pa = plate({ f: fa, b: ba, a: attenuation(nS, kx, k0, 1e6) });
  if (Math.abs(pl.R - Ravg) > 1e-6 || Math.abs(pl.T - Tavg) > 1e-6) throw new Error(`plate vs averaged coherent: ${pl.R - Ravg}, ${pl.T - Tavg}`);
  if (Math.abs(pa.R - ip.R) > 1e-14 || Math.abs(pa.T - ip.T) > 1e-14) throw new Error('plate (design) vs incoherentPoint (run.ts)');
  console.log(`thick substrate: incoherent formula vs coherent average over a fringe |ΔR| = ${Math.abs(pl.R - Ravg).toExponential(1)}, |ΔT| = ${Math.abs(pl.T - Tavg).toExponential(1)}; absorbing plate (1 mm, k = 5e-4): R ${ip.R.toFixed(4)}, T ${ip.T.toFixed(4)}`);

  // (3) Combine with a thick substrate through the graph = incoherentPoint
  const glib = makeLibrary([]);
  const gnodes: AppNode[] = [
    { id: 'air', type: 'material', position: { x: 0, y: 0 }, data: materialData('Air') },
    { id: 'tio2', type: 'material', position: { x: 0, y: 0 }, data: materialData('TiO2') },
    { id: 'sio2', type: 'material', position: { x: 0, y: 0 }, data: materialData('SiO2') },
    { id: 'bk7', type: 'material', position: { x: 0, y: 0 }, data: materialData('BK7') },
    { id: 'lh', type: 'layer', position: { x: 0, y: 0 }, data: { label: '', thickness: 60, layers2D: 1 } },
    { id: 'll', type: 'layer', position: { x: 0, y: 0 }, data: { label: '', thickness: 95, layers2D: 1 } },
    { id: 'lb', type: 'layer', position: { x: 0, y: 0 }, data: { label: '', thickness: 94, layers2D: 1 } },
    { id: 'st', type: 'combine', position: { x: 0, y: 0 }, data: { name: '', count: 2, thick: true, dSub: 1 } },
    { id: 'wl', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'lambda', mode: 'range', value: 550, min: 450, max: 650, step: 50 } },
    { id: 'th', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'theta', mode: 'constant', value: 25, min: 0, max: 80, step: 1 } },
    { id: 'tm', type: 'compute', position: { x: 0, y: 0 }, data: { name: '', polarization: 'p' } },
  ];
  const E = (s: string, t: string, h: string) => ({ id: `${s}-${t}-${h}`, source: s, sourceHandle: 'out', target: t, targetHandle: h });
  const gedges = [E('tio2', 'lh', 'mat'), E('sio2', 'll', 'mat'), E('sio2', 'lb', 'mat'), E('air', 'st', 'incident'), E('lh', 'st', 'item-0'), E('ll', 'st', 'item-1'), E('bk7', 'st', 'exit'), E('lb', 'st', 'back'), E('st', 'tm', 'stack'), E('wl', 'tm', 'lambda'), E('th', 'tm', 'theta')];
  const gev = evaluateHeadless(gnodes, gedges, glib);
  const gout = gev.results.get('tm')!.outs.out;
  if (gev.results.get('st')!.errors.length || gout?.type !== 'data' || !gout.dataset) throw new Error(`thick Combine: ${gev.results.get('st')!.errors}`);
  const gm = Object.fromEntries([...glib].map(([id, dd]) => [id, dd.model]));
  let gerr = 0;
  [450, 500, 550, 600, 650].forEach((l, i) => {
    const nn = (id: string) => refractiveIndex(id, gm, l);
    const ref = incoherentPoint([{ n: nn('Air'), d: 0 }, { n: nn('TiO2'), d: 60 }, { n: nn('SiO2'), d: 95 }, { n: nn('BK7'), d: 0 }], [{ n: nn('BK7'), d: 0 }, { n: nn('SiO2'), d: 94 }, { n: nn('Air'), d: 0 }], 1e6, l, 25, 'p');
    gerr = Math.max(gerr, Math.abs(gout.dataset!.fields.R[i] - ref.R), Math.abs(gout.dataset!.fields.T[i] - ref.T));
  });
  if (gerr > 1e-14) throw new Error(`thick Combine vs incoherentPoint: ${gerr}`);
  console.log(`Combine + thick substrate + back coating through Compute TMM = incoherent formula (${gerr.toExponential(1)})`);

  // (4) filter designs through the Filter designer node's problem
  const withFilter = (patch: Partial<FilterData>) => {
    const p = filterExample();
    return { ...p, nodes: p.nodes.map((n) => (n.type === 'filter' ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n)) };
  };
  const problemOf = (proj: Project) => {
    const r = evaluateHeadless(proj.nodes, proj.edges, makeLibrary(proj.materials)).results.get('filter')!;
    if (r.errors.length) throw new Error(`filter node: ${r.errors}`);
    return (r.info as FilterInfo).problem!;
  };
  const design = async (patch: Partial<FilterData>) => {
    const proj = withFilter(patch);
    const fd = proj.nodes.find((n) => n.type === 'filter')!.data as FilterData;
    const prob = problemOf(proj);
    const t0 = performance.now();
    const r = await runDesign(prob, startDesign(fd, prob), { algorithm: fd.algorithm, iterations: fd.iterations, needleStep: fd.needleStep, lambdaRef: fd.lambdaRef }, () => {});
    return { proj, prob, r, ms: performance.now() - t0 };
  };
  const band = (prob: DesignProblem, r: { design: Design }, pred: (s: Sample) => boolean) => {
    const ev = evaluateDesign(prob, r.design);
    return ev.X.filter((_, k) => pred(prob.samples[k]));
  };
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const rows: string[] = [];

  // AR on BK7
  const ar = await design({ preset: 'ar', bands: PRESETS.ar.bands, lmin: 400, lmax: 750, lambdaRef: 550, ...PRESETS.ar.start, iterations: 12 });
  const arR = mean(band(ar.prob, ar.r, () => true));
  const bare = mean(evaluateDesign(ar.prob, { front: [], back: [] }).X);
  rows.push(`AR: R ${(100 * bare).toFixed(2)} % → ${(100 * arR).toFixed(3)} % (${ar.r.design.front.length} layers, ${ar.ms.toFixed(0)} ms)`);
  if (!(arR < 0.003)) throw new Error(`AR design: mean R ${arR}`);

  // Long-pass edge
  const lp = await design({ iterations: 15 });
  const stop = band(lp.prob, lp.r, (s) => s.target === 0);
  const pass = band(lp.prob, lp.r, (s) => s.target === 1);
  rows.push(`long-pass: T stop ≤ ${Math.max(...stop).toFixed(3)} (mean ${mean(stop).toFixed(4)}), T pass ≥ ${Math.min(...pass).toFixed(3)} (mean ${mean(pass).toFixed(3)}), ${lp.r.design.front.length} layers, ${lp.r.design.front.reduce((s, L) => s + L.d, 0).toFixed(0)} nm (${lp.ms.toFixed(0)} ms)`);
  if (!(mean(stop) < 0.02 && Math.max(...stop) < 0.1 && mean(pass) > 0.97)) throw new Error('long-pass design did not meet the specification');

  // The designed stack through the graph (Filter → Compute TMM) = the designer's own spectrum
  const proj2 = { ...lp.proj, nodes: lp.proj.nodes.map((n) => (n.type === 'filter' ? ({ ...n, data: { ...n.data, design: lp.r.design } } as AppNode) : n)) };
  const ev2 = evaluateHeadless(proj2.nodes, proj2.edges, makeLibrary(proj2.materials));
  const t2 = ev2.results.get('tmm')!.outs.out;
  const fi = ev2.results.get('filter')!.info as FilterInfo;
  const lam2 = t2?.type === 'data' ? t2.dataset!.axes.find((a) => a.id === 'lambda')!.values : [];
  // same polarization as the Compute node (s): with a slightly absorbing substrate s and p differ by ~1e-9 even at 0°
  const sT = spectrum(fi.problem!, lp.r.design, 0, 's').T;
  let dmax = 0;
  fi.lambdas.forEach((l, i) => {
    const k = lam2.indexOf(l);
    if (k >= 0 && t2?.type === 'data') dmax = Math.max(dmax, Math.abs(t2.dataset!.fields.T[k] - sT[i]));
  });
  if (dmax > 1e-12) throw new Error(`Filter stack through Compute TMM differs from the designer (${dmax})`);
  rows.push(`designed stack via Compute TMM = designer spectrum (${dmax.toExponential(1)})`);

  // Thick plate, both faces AR
  const pb = await design({ preset: 'ar', bands: PRESETS.ar.bands, lmin: 420, lmax: 720, step: 10, lambdaRef: 550, ...PRESETS.ar.start, thick: true, sides: 'both', iterations: 16 });
  const pbR = mean(band(pb.prob, pb.r, () => true));
  const pbBare = mean(evaluateDesign(pb.prob, { front: [], back: [] }).X);
  rows.push(`BK7 plate, AR on both faces: R ${(100 * pbBare).toFixed(2)} % → ${(100 * pbR).toFixed(3)} % (${pb.r.design.front.length} + ${pb.r.design.back.length} layers, ${pb.ms.toFixed(0)} ms)`);
  if (!(pbR < 0.005)) throw new Error(`plate AR: mean R ${pbR}`);

  // Angle and polarization averaging: AR for 0° and 45°, unpolarized
  const aa = await design({ preset: 'ar', bands: PRESETS.ar.bands, lmin: 420, lmax: 720, step: 10, lambdaRef: 550, ...PRESETS.ar.start, angles: '0, 45', pol: 'unpolarized', iterations: 12 });
  const a0 = mean(band(aa.prob, aa.r, (s) => s.ai === 0));
  const a45 = mean(band(aa.prob, aa.r, (s) => s.ai === 1));
  rows.push(`AR for 0° and 45° (unpolarized): R ${(100 * a0).toFixed(3)} % / ${(100 * a45).toFixed(3)} %`);
  if (!(a0 < 0.006 && a45 < 0.012)) throw new Error('angle-averaged AR design');
  console.log(rows.join('\n'));
}

// ---- Target specifications: merit (p-norm, tolerances, ≥ / ≤), slices (s, p, mean, angle), OD, through the nodes ----
{
  const rows: string[] = [];
  // (1) the merit function
  const pts: MeritPoint[] = [
    { value: 0.9, v: 1, tol: 1, w: 1 },
    { value: 0.2, v: 0, tol: 1, w: 1 },
    { value: 0.5, v: 0.4, tol: 1, w: 2, kind: 'ge' }, // met: no error
    { value: 0.3, v: 0.4, tol: 1, w: 2, kind: 'ge' }, // −0.1
    { value: 0.6, v: 0.5, tol: 1, w: 1, kind: 'le' }, // +0.1
  ];
  const errs = [-0.1, 0.2, 0, -0.1, 0.1];
  const ws = [1, 1, 2, 2, 1];
  const W = 7;
  const rms = Math.sqrt(errs.reduce((s, e, i) => s + ws[i] * e * e, 0) / W);
  const m2 = pMerit(pts, 2);
  const m1 = pMerit(pts, 1);
  const mInf = pMerit(pts, Infinity);
  const mTol = pMerit(pts.map((q) => ({ ...q, tol: 0.01 })), 2);
  if (Math.abs(m2.mf - rms) > 1e-15) throw new Error(`pMerit p = 2: ${m2.mf} vs ${rms}`);
  if (Math.abs(m1.mf - errs.reduce((s, e, i) => s + ws[i] * Math.abs(e), 0) / W) > 1e-15) throw new Error('pMerit p = 1');
  if (Math.abs(mInf.mf - 0.2) > 1e-15) throw new Error('pMerit p = ∞');
  if (Math.abs(mTol.mf - 100 * rms) > 1e-12) throw new Error('pMerit tolerance 0.01 → 100·RMS');
  let resErr = 0;
  for (const p of [2, 3, 4, 8]) {
    const m = pMerit(pts, p);
    resErr = Math.max(resErr, Math.abs(m.residuals.reduce((s, r) => s + r * r, 0) - m.mf ** p));
    // ∂r/∂value by finite differences (the met ≥ point has a zero derivative)
    pts.forEach((q, i) => {
      const h = 1e-7;
      const up = pMerit(pts.map((x, j) => (j === i ? { ...x, value: x.value + h } : x)), p).residuals[i];
      const dn = pMerit(pts.map((x, j) => (j === i ? { ...x, value: x.value - h } : x)), p).residuals[i];
      resErr = Math.max(resErr, Math.abs((up - dn) / (2 * h) - m.dres[i]) / Math.max(1, Math.abs(m.dres[i])));
    });
  }
  if (resErr > 1e-6) throw new Error(`pMerit residuals / derivatives: ${resErr}`);
  rows.push(`merit: p = 2 = weighted RMS, tolerance 0.01 = 100·RMS, p = 1 / ∞ = mean / max |e|, ≥ / ≤ met = 0; Σr² = MF^p and ∂r/∂value vs FD (p = 2, 3, 4, 8): ${resErr.toExponential(1)}`);

  // (2) slices of a Compute result with a polarization sweep and three angles
  const slib = makeLibrary([]);
  const sm = Object.fromEntries([...slib].map(([id, dd]) => [id, dd.model]));
  const E = (s: string, t: string, h: string, sh = 'out') => ({ id: `${s}-${sh}-${t}-${h}`, source: s, sourceHandle: sh, target: t, targetHandle: h });
  const base: AppNode[] = [
    { id: 'air', type: 'material', position: { x: 0, y: 0 }, data: materialData('Air') },
    { id: 'tio2', type: 'material', position: { x: 0, y: 0 }, data: materialData('TiO2') },
    { id: 'sio2', type: 'material', position: { x: 0, y: 0 }, data: materialData('SiO2') },
    { id: 'bk7', type: 'material', position: { x: 0, y: 0 }, data: materialData('BK7') },
    { id: 'lh', type: 'layer', position: { x: 0, y: 0 }, data: { label: '', thickness: 60, layers2D: 1 } },
    { id: 'll', type: 'layer', position: { x: 0, y: 0 }, data: { label: '', thickness: 95, layers2D: 1 } },
    { id: 'st', type: 'combine', position: { x: 0, y: 0 }, data: { name: '', count: 2 } },
    { id: 'wl', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'lambda', mode: 'range', value: 550, min: 450, max: 650, step: 10 } },
    { id: 'th', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'theta', mode: 'range', value: 0, min: 0, max: 50, step: 25 } },
    { id: 'ps', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'pol', kind: 'polarization', mode: 'list', min: 0, max: 0, step: 1, list: '' } },
    { id: 'tm', type: 'compute', position: { x: 0, y: 0 }, data: { name: '', polarization: 'p' } },
    { id: 'tmS', type: 'compute', position: { x: 0, y: 0 }, data: { name: '', polarization: 's' } },
    { id: 'tmP', type: 'compute', position: { x: 0, y: 0 }, data: { name: '', polarization: 'p' } },
  ];
  const baseEdges = [
    E('tio2', 'lh', 'mat'),
    E('sio2', 'll', 'mat'),
    E('air', 'st', 'incident'),
    E('lh', 'st', 'item-0'),
    E('ll', 'st', 'item-1'),
    E('bk7', 'st', 'exit'),
    ...['tm', 'tmS', 'tmP'].flatMap((c) => [E('st', c, 'stack'), E('wl', c, 'lambda'), E('th', c, 'theta')]),
    E('ps', 'tm', 'pol'),
  ];
  const sev = evaluateHeadless(base, baseEdges, slib);
  const dsOf = (id: string) => {
    const o = sev.results.get(id)!.outs.out;
    if (o?.type !== 'data' || !o.dataset) throw new Error(`slice test: no data from ${id} (${sev.results.get(id)!.errors})`);
    return o.dataset;
  };
  const dAll = dsOf('tm');
  const dS = dsOf('tmS');
  const dP = dsOf('tmP');
  const lam = dAll.axes.find((a) => a.id === 'lambda')!;
  const li = dAll.axes.indexOf(lam);
  const liS = dS.axes.findIndex((a) => a.id === 'lambda');
  const get = (r: Float64Array[] | string) => {
    if (typeof r === 'string') throw new Error(r);
    return r;
  };
  let dSl = 0;
  const sS = get(sliceLines(dAll, 'R', li, { pol: 's', angle: NaN }));
  const sP = get(sliceLines(dAll, 'R', li, { pol: 'p', angle: 25 }));
  const sA = get(sliceLines(dAll, 'T', li, { pol: 'avg', angle: 50 }));
  const sOD = get(sliceLines(dAll, 'OD', li, { pol: 's', angle: 50 }));
  const refS = get(sliceLines(dS, 'R', liS, { pol: 'all', angle: NaN }));
  if (sS.length !== 3 || sP.length !== 1 || sA.length !== 1 || refS.length !== 3) throw new Error('slice line counts');
  sS.forEach((l, k) => l.forEach((v, i) => (dSl = Math.max(dSl, Math.abs(v - refS[k][i])))));
  const pRef = get(sliceLines(dP, 'R', liS, { pol: 'all', angle: 25 }))[0];
  sP[0].forEach((v, i) => (dSl = Math.max(dSl, Math.abs(v - pRef[i]))));
  const tS50 = get(sliceLines(dS, 'T', liS, { pol: 'all', angle: 50 }))[0];
  const tP50 = get(sliceLines(dP, 'T', liS, { pol: 'all', angle: 50 }))[0];
  sA[0].forEach((v, i) => (dSl = Math.max(dSl, Math.abs(v - (tS50[i] + tP50[i]) / 2))));
  sOD[0].forEach((v, i) => (dSl = Math.max(dSl, Math.abs(v + Math.log10(tS50[i])))));
  if (dSl > 1e-15) throw new Error(`slices vs separate computes: ${dSl}`);
  const wrong = sliceLines(dP, 'R', liS, { pol: 's', angle: 25 });
  const noAngle = sliceLines(dAll, 'R', li, { pol: 's', angle: 30 });
  if (typeof wrong !== 'string' || typeof noAngle !== 'string') throw new Error('slice errors (s from p data, missing angle)');
  rows.push(`slices of a Compute with a polarization sweep and θ = 0/25/50° = separate s / p computes (s, p at 25°, mean at 50°, OD = −log₁₀ T): ${dSl.toExponential(1)}; s from p-only data and a missing angle are errors`);

  // (3) Target curve (R ≤ 0.05 for s at 25°, OD ≥ 1.2 for the mean at 50°, tolerance) → Curve match = manual merit
  const tgt: AppNode = {
    id: 'tg',
    type: 'target',
    position: { x: 0, y: 0 },
    data: {
      ...TARGET_DEFAULTS,
      min: 450,
      max: 650,
      step: 5,
      quantity: 'R',
      tol: 0.01,
      bands: [
        { lo: 480, hi: 560, value: 0.05, weight: 1, pol: 's', angle: 25, kind: 'le' },
        { lo: 600, hi: 650, value: 1.2, weight: 2, q: 'OD', pol: 'avg', angle: 50, kind: 'ge', tol: 0.1 },
      ],
    },
  };
  const match: AppNode = { id: 'mt', type: 'match', position: { x: 0, y: 0 }, data: { name: '', field: 'T', metric: 'rms', weight: 1, lo: NaN, hi: NaN } };
  const mNodes = [...base, tgt, match];
  const mEdges = [...baseEdges, E('tm', 'mt', 'in'), E('tg', 'mt', 'target')];
  const mev = evaluateHeadless(mNodes, mEdges, slib);
  const mr = mev.results.get('mt')!;
  if (mr.errors.length) throw new Error(`Curve match with a spec target: ${mr.errors}`);
  const mi = mr.info as MatchInfo;
  // manual: band 1 on the s curve at 25°, band 2 on the mean T at 50° (OD); simulation interpolated at 5 nm points
  const R25s = get(sliceLines(dS, 'R', liS, { pol: 'all', angle: 25 }))[0];
  const lx = lam.values;
  const odAvg50 = sA[0].map((t) => -Math.log10(t)); // the simulated OD, interpolated as a curve
  const manual: { e: number; w: number }[] = [];
  for (let x = 450; x <= 650 + 1e-9; x += 5) {
    const xr = +x.toFixed(6);
    if (xr >= 480 && xr <= 560) manual.push({ e: Math.max(0, interp(lx, R25s, xr) - 0.05) / 0.01, w: 1 });
    else if (xr >= 600 && xr <= 650) manual.push({ e: Math.min(0, interp(lx, odAvg50, xr) - 1.2) / 0.1, w: 2 });
  }
  const mfMan = Math.sqrt(manual.reduce((s, q) => s + q.w * q.e * q.e, 0) / manual.reduce((s, q) => s + q.w, 0));
  const mo = mr.outs.out;
  const res = mo?.type === 'objective' ? (mo.objective.residuals ?? []) : [];
  const sumR = res.reduce((s, r) => s + r * r, 0);
  if (Math.abs(mi.rmse - mfMan) > 1e-12 * Math.max(1, mfMan)) throw new Error(`spec Curve match: ${mi.rmse} vs manual ${mfMan}`);
  if (Math.abs(sumR - mi.cost) > 1e-12 * Math.max(1, mi.cost)) throw new Error('spec Curve match residuals');
  rows.push(`Target curve (R ≤ 0.05 s at 25°, OD ≥ 1.2 mean s,p at 50°, tolerances 0.01 / 0.1) → Curve match: MF ${mi.rmse.toFixed(4)} = manual ${mfMan.toFixed(4)} (${mi.terms.length} terms), Σr² = cost`);

  // (4) Zones with a slice = Zones on the separate computation
  const zone = (id: string, pol: 's' | 'all', angle: number): AppNode => ({
    id,
    type: 'zones',
    position: { x: 0, y: 0 },
    data: { name: '', along: 'lambda', reduce: 'mean', outside: 'ignore', outsideField: '', outsideWeight: 1, weight: 1, tau: 0.02, zones: [{ lo: 500, hi: 600, field: 'R', goal: 'le', target: 0.02, weight: 1, pol, angle }] },
  });
  const zev = evaluateHeadless([...base, zone('z1', 's', 25), zone('z2', 'all', 25)], [...baseEdges, E('tm', 'z1', 'in'), E('tmS', 'z2', 'in')], slib);
  const z1 = zev.results.get('z1')!;
  const z2 = zev.results.get('z2')!;
  if (z1.errors.length || z2.errors.length) throw new Error(`zones with slices: ${z1.errors} ${z2.errors}`);
  const zc = (r: typeof z1) => (r.outs.out?.type === 'objective' ? r.outs.out.objective.cost : NaN);
  if (Math.abs(zc(z1) - zc(z2)) > 1e-15 || !(zc(z1) > 0)) throw new Error(`zones slice: ${zc(z1)} vs ${zc(z2)}`);
  rows.push(`Zones: R ≤ 0.02 on the s curve at 25° (sliced) = on the s-only computation (cost ${zc(z1).toExponential(3)})`);

  // (5) Custom objective terms: values at a point (Ts / Tp at 550 nm, 50°) and the fraction of points with R ≥ level
  const R50s = get(sliceLines(dS, 'R', liS, { pol: 'all', angle: 50 }))[0];
  const level = +((Math.min(...R50s) + Math.max(...R50s)) / 2).toFixed(4);
  const fnode: AppNode = {
    id: 'fx',
    type: 'formula',
    position: { x: 0, y: 0 },
    data: {
      name: '',
      goal: 'min',
      weight: 1,
      expr: 'a/b + c',
      terms: [
        { name: 'a', source: 'tm:out', field: 'T', stat: 'at', along: 'lambda', lo: 555, pol: 's', angle: 50 },
        { name: 'b', source: 'tm:out', field: 'T', stat: 'at', along: 'lambda', lo: 555, pol: 'p', angle: 50 },
        { name: 'c', source: 'tm:out', field: 'R', stat: 'fge', along: 'lambda', lo: 450, hi: 650, pol: 's', angle: 50, level },
      ],
    },
  };
  const fev = evaluateHeadless([...base, fnode], [...baseEdges, E('tm', 'fx', 'in')], slib);
  const fr = fev.results.get('fx')!;
  if (fr.errors.length) throw new Error(`formula terms: ${fr.errors}`);
  const fv = (fr.info as FormulaInfo).values;
  const aMan = interp(lx, tS50, 555);
  const bMan = interp(lx, tP50, 555);
  const cMan = Array.from(R50s).filter((v) => v >= level).length / R50s.length;
  if (Math.abs(fv.a - aMan) > 1e-15 || Math.abs(fv.b - bMan) > 1e-15 || Math.abs(fv.c - cMan) > 1e-15) throw new Error(`formula at / fraction: ${JSON.stringify(fv)} vs ${aMan}, ${bMan}, ${cMan}`);
  const soft = formulaStat([0.05, 0.1, 0.15], 'fge', 0.1, 1e-4);
  if (Math.abs(soft - 0.5) > 1e-6) throw new Error(`smooth fraction: ${soft}`);
  rows.push(`Custom objective: Ts / Tp at 555 nm (50°) = ${(fv.a / fv.b).toFixed(5)}, fraction of R_s ≥ ${level} = ${fv.c.toFixed(4)} (= manual); smooth fraction (logistic) → exact`);

  // (6) Filter designer merit: Jacobian and needle function vs finite differences with OD, ≥ / ≤, tolerances, p = 4
  const lams = [480, 560, 640];
  const nx = (id: string) => lams.map((l) => refractiveIndex(id, sm, l));
  const prob: DesignProblem = {
    lambdas: lams,
    angles: [0, 40],
    mats: [nx('TiO2'), nx('SiO2')],
    names: ['H', 'L'],
    n0: nx('Air'),
    nS: nx('BK7'),
    nOut: nx('Air'),
    thick: null,
    sides: ['front'],
    p: 4,
    samples: [
      { li: 0, ai: 1, pol: 's', q: 'OD', target: 2, w: 1, kind: 'ge', tol: 0.5 },
      { li: 1, ai: 0, pol: 'avg', q: 'R', target: 0.05, w: 2, kind: 'le', tol: 0.02 },
      { li: 2, ai: 1, pol: 'p', q: 'T', target: 0.99, w: 1, tol: 0.05 },
      { li: 2, ai: 0, pol: 'avg', q: 'A', target: 0, w: 1 },
      { li: 0, ai: 0, pol: 'avg', q: 'OD', target: 0.3, w: 1, tol: 0.1 },
    ],
    minD: 0,
    maxD: 1000,
    maxLayers: 50,
    maxTotal: 1e6,
  };
  const des: Design = { front: [{ m: 0, d: 80 }, { m: 1, d: 120 }, { m: 0, d: 60 }, { m: 1, d: 90 }], back: [] };
  const ev0 = evaluateDesign(prob, des, { grad: true });
  let jErr = 0;
  des.front.forEach((_, j) => {
    const h = 1e-5;
    const at = (dd: number) => evaluateDesign(prob, { ...des, front: des.front.map((L2, k) => (k === j ? { ...L2, d: L2.d + dd } : L2)) }).residuals;
    const up = at(h);
    const dn = at(-h);
    prob.samples.forEach((_, k) => (jErr = Math.max(jErr, Math.abs((up[k] - dn[k]) / (2 * h) - ev0.J![k][j]) / Math.max(1e-3, Math.abs(ev0.J![k][j])))));
  });
  // needle: ∂merit/∂(thickness of a thin inserted layer) at a probe
  const evN = evaluateDesign(prob, des, { needle: { side: 'front', step: 20 } });
  let nErr = 0;
  for (const nd of evN.needle!.filter((_, i) => i % 3 === 0)) {
    const L0 = des.front;
    const ins = (t: number): Design => {
      const f = L0.map((x) => ({ ...x }));
      if (nd.layer >= f.length) f.push({ m: nd.m, d: t });
      else if (nd.z <= 1e-9) f.splice(nd.layer, 0, { m: nd.m, d: t });
      else f.splice(nd.layer, 1, { m: f[nd.layer].m, d: nd.z }, { m: nd.m, d: t }, { m: f[nd.layer].m, d: f[nd.layer].d - nd.z });
      return { front: f, back: [] };
    };
    const h = 1e-4;
    const fd = (evaluateDesign(prob, ins(h)).merit - evaluateDesign(prob, ins(0)).merit) / h;
    nErr = Math.max(nErr, Math.abs(fd - nd.value) / Math.max(1e-2, Math.abs(nd.value)));
  }
  if (Math.abs(ev0.mf ** 4 - ev0.merit) > 1e-12 * ev0.merit) throw new Error('designer merit = MF^p');
  if (jErr > 1e-5 || nErr > 2e-3) throw new Error(`designer Jacobian / needle with OD, ≥ / ≤, p = 4: ${jErr}, ${nErr}`);
  rows.push(`designer merit with OD, ≥ / ≤, tolerances, mean s,p, p = 4: MF^p = merit, Jacobian vs FD ${jErr.toExponential(1)}, needle vs FD ${nErr.toExponential(1)}`);

  // (7) Target curves → Filter designer: quantity, polarization, angle, kind and tolerance reach the problem; a mirror
  // designed for R ≥ 99.5 % (s, 45°) meets it
  const fp = filterExample();
  const mirrorTarget: AppNode = {
    id: 'mtg',
    type: 'target',
    position: { x: 0, y: 0 },
    data: { ...TARGET_DEFAULTS, min: 520, max: 600, step: 4, quantity: 'R', pol: 's', angle: 45, kind: 'ge', tol: 0.01, bands: [{ lo: 520, hi: 600, value: 0.995, weight: 1 }] },
  };
  const fNodes = fp.nodes.map((nn) => (nn.type === 'filter' ? ({ ...nn, data: { ...nn.data, start: 'qw', startPeriods: 6, lambdaRef: 640, algorithm: 'needle', iterations: 8, lmin: 400, lmax: 800 } } as AppNode) : nn));
  const fEdges = [...fp.edges, E('mtg', 'filter', 'target')];
  const fr2 = evaluateHeadless([...fNodes, mirrorTarget], fEdges, makeLibrary(fp.materials)).results.get('filter')!;
  if (fr2.errors.length) throw new Error(`filter with a spec target: ${fr2.errors}`);
  const fprob = (fr2.info as FilterInfo).problem!;
  const s0 = fprob.samples[0];
  if (!(fprob.angles.includes(45) && s0.pol === 's' && s0.q === 'R' && s0.kind === 'ge' && s0.tol === 0.01 && fprob.angles[s0.ai] === 45 && fprob.samples.length === 21)) throw new Error(`spec → designer samples: ${JSON.stringify(s0)}, angles ${fprob.angles}`);
  const fd = fNodes.find((nn) => nn.type === 'filter')!.data as FilterData;
  const t0 = performance.now();
  const mir = await runDesign(fprob, startDesign(fd, fprob), { algorithm: 'needle', iterations: 8, needleStep: fd.needleStep, lambdaRef: 640 }, () => {});
  const Rband = evaluateDesign(fprob, mir.design).X;
  const minR = Math.min(...Rband);
  if (!(minR > 0.994)) throw new Error(`mirror R ≥ 0.995 (s, 45°): min R ${minR}`);
  rows.push(`Target curve → Filter designer (R ≥ 0.995, s, 45°, tolerance 0.01): angle 45° added, ${fprob.samples.length} samples; designed mirror min R = ${minR.toFixed(5)} (${mir.design.front.length} layers, ${(performance.now() - t0).toFixed(0)} ms)`);
  console.log(rows.join('\n'));
}

// ---- Filter design algorithms (N materials, formula starts, deep search, gradual evolution, cleaner) and benchmarks ----
if (full('filter design algorithms (26 s)')) {
  const log = (x: string) => console.log(x);
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  // (1) formula starts
  const f1 = parseFormula('(1.92H 2.08L)^3', ['H', 'L']);
  const f2 = parseFormula('((HL)^2 0.5M)^2 A', ['H', 'L', 'M', 'A']);
  const bad = [parseFormula('H 2X', ['H', 'L']), parseFormula('(HL', ['H', 'L']), parseFormula('(HL)^', ['H', 'L']), parseFormula('', ['H', 'L'])];
  if (typeof f1 === 'string' || f1.length !== 6 || f1[0].q !== 1.92 || f1[1].m !== 1 || f1[1].q !== 2.08) throw new Error(`formula 1: ${JSON.stringify(f1)}`);
  if (typeof f2 === 'string' || f2.length !== 11 || f2[4].m !== 2 || f2[4].q !== 0.5 || f2[10].m !== 3) throw new Error(`formula 2: ${JSON.stringify(f2)}`);
  if (!bad.every((b) => typeof b === 'string')) throw new Error('formula errors not reported');
  log('formula starts: (1.92H 2.08L)^3 → 6 layers, nested groups, unknown letters / unclosed groups / empty = errors');

  // (2) five coating materials (one of them a metal), thick substrate, both faces: Jacobian and needle vs FD
  const glib = makeLibrary([]);
  const gm = Object.fromEntries([...glib].map(([id, dd]) => [id, dd.model]));
  const lams = [450, 560, 680];
  const nx = (id: string) => lams.map((l) => refractiveIndex(id, gm, l));
  const five: DesignProblem = {
    lambdas: lams,
    angles: [0, 30],
    mats: [nx('TiO2'), nx('SiO2'), nx('Al2O3'), lams.map(() => c(1.38)), nx('Ag')],
    names: ['H', 'L', 'M', 'A', 'B'],
    n0: nx('Air'),
    nS: nx('BK7'),
    nOut: nx('Air'),
    thick: 1e6,
    sides: ['front', 'back'],
    samples: [
      { li: 0, ai: 0, pol: 'avg', q: 'R', target: 0.1, w: 1 },
      { li: 1, ai: 1, pol: 's', q: 'T', target: 0.5, w: 2, tol: 0.1 },
      { li: 2, ai: 1, pol: 'p', q: 'OD', target: 1, w: 1, kind: 'ge', tol: 0.2 },
      { li: 1, ai: 0, pol: 'avg', q: 'A', target: 0, w: 1 },
    ],
    minD: 0,
    maxD: 1000,
    maxLayers: 50,
    maxTotal: 1e6,
    p: 3,
  };
  const d5: Design = { front: [{ m: 0, d: 60 }, { m: 4, d: 12 }, { m: 2, d: 80 }, { m: 3, d: 95 }], back: [{ m: 1, d: 70 }, { m: 0, d: 40 }] };
  const e5 = evaluateDesign(five, d5, { grad: true });
  const vars5 = [...d5.front.map((_, j) => ['front', j] as const), ...d5.back.map((_, j) => ['back', j] as const)];
  let j5 = 0;
  vars5.forEach(([side, j], v) => {
    const h = 1e-5;
    const at = (dd: number) => evaluateDesign(five, { ...d5, [side]: d5[side].map((L2, k) => (k === j ? { ...L2, d: L2.d + dd } : L2)) }).residuals;
    const up = at(h);
    const dn = at(-h);
    five.samples.forEach((_, k) => (j5 = Math.max(j5, Math.abs((up[k] - dn[k]) / (2 * h) - e5.J![k][v]) / Math.max(1e-3, Math.abs(e5.J![k][v])))));
  });
  let n5 = 0;
  for (const side of ['front', 'back'] as const) {
    const evN = evaluateDesign(five, d5, { needle: { side, step: 15 } });
    for (const nd of evN.needle!.filter((_, i) => i % 4 === 1)) {
      const ins = (t: number): Design => {
        const f = d5[side].map((x) => ({ ...x }));
        if (nd.layer >= f.length) f.push({ m: nd.m, d: t });
        else if (nd.z <= 1e-9) f.splice(nd.layer, 0, { m: nd.m, d: t });
        else f.splice(nd.layer, 1, { m: f[nd.layer].m, d: nd.z }, { m: nd.m, d: t }, { m: f[nd.layer].m, d: f[nd.layer].d - nd.z });
        return { ...d5, [side]: f };
      };
      const h = 1e-5;
      const fd = (evaluateDesign(five, ins(h)).merit - evaluateDesign(five, ins(0)).merit) / h;
      n5 = Math.max(n5, Math.abs(fd - nd.value) / Math.max(1e-2, Math.abs(nd.value)));
    }
  }
  if (j5 > 1e-5 || n5 > 1e-3) throw new Error(`five materials (with Ag), both faces: Jacobian ${j5}, needle ${n5}`);
  log(`five coating materials (incl. Ag), thick plate with both faces, p = 3: Jacobian vs FD ${j5.toExponential(1)}, needle (every material) vs FD ${n5.toExponential(1)}`);

  // helpers: the problem of an example's Filter designer, a run with a time limit
  const probOf = (proj: Project) => {
    const r = evaluateHeadless(proj.nodes, proj.edges, makeLibrary(proj.materials)).results.get('filter')!;
    if (r.errors.length) throw new Error(`filter example: ${r.errors}`);
    return { prob: (r.info as FilterInfo).problem!, fd: proj.nodes.find((nn) => nn.type === 'filter')!.data as FilterData, warnings: r.warnings };
  };
  const limit = (s: number) => {
    const t0 = performance.now();
    return { stopped: () => performance.now() - t0 > s * 1000, tick: async () => {} };
  };
  const designWith = async (prob: DesignProblem, fd: FilterData, over: Partial<DesignSettings>, seconds: number) => {
    const t0 = performance.now();
    const r = await runDesign(prob, startDesign(fd, prob), { algorithm: fd.algorithm, iterations: fd.iterations, needleStep: fd.needleStep, lambdaRef: fd.lambdaRef, candidates: fd.candidates, cleanTo: fd.cleanTo, ...over }, () => {}, limit(seconds));
    return { ...r, s: (performance.now() - t0) / 1000 };
  };

  // (3) narrow notch: the analytic start (second order, mismatch 4 %) and the deep search to the specification
  const np = probOf(notchExample());
  const Tn = (d: Design) => spectrum(np.prob, d, 0, 's').T;
  const lamN = np.prob.lambdas;
  const notchStats = (T: number[]) => {
    const inR = (a: number, b: number) => lamN.flatMap((l, i) => (l >= a && l <= b ? [T[i]] : []));
    const odMin = Math.min(...inR(NOTCH_SPEC.odBand[0], NOTCH_SPEC.odBand[1]).map((t) => -Math.log10(Math.max(t, 1e-12))));
    const passMin = Math.min(...NOTCH_SPEC.passBands.flatMap(([a, b]) => inR(a, b)));
    const k = T.indexOf(Math.min(...inR(520, 545)));
    // T = 50 % crossings, linear interpolation (a point at the limit within 1e-6 counts as reached: the optimizer puts
    // one-sided targets exactly on their bound)
    let x1 = NaN;
    let x2 = NaN;
    const at50 = (t: number) => t >= 0.5 - 1e-6;
    for (let i = k; i > 0; i--) if (at50(T[i - 1])) { x1 = lamN[i - 1] + (Math.max(0, T[i - 1] - 0.5) / Math.max(1e-12, T[i - 1] - T[i])) * (lamN[i] - lamN[i - 1]); break; }
    for (let i = k; i < T.length - 1; i++) if (at50(T[i + 1])) { x2 = lamN[i] + (Math.min(1, (0.5 - T[i]) / Math.max(1e-12, T[i + 1] - T[i]))) * (lamN[i + 1] - lamN[i]); break; }
    return { odMin, passMin, width: x2 - x1, center: (x1 + x2) / 2 };
  };
  const nStart: Design = { front: np.fd.design.front, back: [] };
  const s0 = notchStats(Tn(nStart));
  const nH = refractiveIndex('TiO2', gm, 532).re;
  const nL = refractiveIndex('SiO2', gm, 532).re;
  const est = (4 / Math.PI) * ((nH - nL) / (nH + nL)) * (Math.abs(Math.sin(2 * Math.PI * ((1.92 * 1) / 4))) / 2) * 532;
  if (!(Math.abs(s0.center - 532) < 1.5 && s0.width / est > 0.7 && s0.width / est < 1.4)) throw new Error(`notch start: centre ${s0.center}, width ${s0.width} vs estimate ${est}`);
  const nr = await designWith(np.prob, np.fd, { algorithm: 'deep' }, 240);
  const sN = notchStats(Tn(nr.design));
  const mfN = evaluateDesign(np.prob, nr.design).mf;
  log(
    `notch (Zhang 2013 start (1.92H 2.08L)^100): start centre ${s0.center.toFixed(2)} nm, width ${s0.width.toFixed(2)} nm (weak-coupling estimate ${est.toFixed(2)}), OD ${s0.odMin.toFixed(2)}, pass T min ${s0.passMin.toFixed(3)} → deep search: MF ${mfN.toFixed(4)}, width ${sN.width.toFixed(2)} nm at ${sN.center.toFixed(2)} nm, OD min ${sN.odMin.toFixed(2)}, pass T min ${sN.passMin.toFixed(3)}, ${nr.design.front.length} layers, ${(nr.design.front.reduce((a, L) => a + L.d, 0) / 1000).toFixed(1)} µm (${nr.s.toFixed(0)} s)`,
  );
  if (!(sN.odMin >= NOTCH_SPEC.od - 0.02 && sN.width <= NOTCH_SPEC.maxWidth + 0.05 && sN.passMin >= NOTCH_SPEC.pass - 0.003)) throw new Error('notch: the deep search did not meet the specification');

  // (4) narrow band-pass (three cavities): centred, flat top, blocking
  const bp = probOf(bandpassExample());
  const br = await designWith(bp.prob, bp.fd, { algorithm: 'deep' }, 200);
  const Tb = spectrum(bp.prob, br.design, 0, 's').T;
  const lb = bp.prob.lambdas;
  const topMin = Math.min(...lb.flatMap((l, i) => (l >= 531.5 && l <= 532.5 ? [Tb[i]] : [])));
  const odB = Math.min(...lb.flatMap((l, i) => ((l >= 500 && l <= 528) || (l >= 536 && l <= 565) ? [-Math.log10(Math.max(Tb[i], 1e-12))] : [])));
  const kb = Tb.indexOf(Math.max(...Tb));
  const half = Tb[kb] / 2;
  const lo = lb[Tb.findIndex((t, i) => i < kb && Tb[i + 1] >= half && t < half) + 1];
  const hi = lb[Tb.findIndex((t, i) => i > kb && t < half)];
  const mfB = evaluateDesign(bp.prob, br.design).mf;
  log(`band-pass (3 cavities): MF ${mfB.toFixed(4)}, top T min ${topMin.toFixed(3)} on 531.5–532.5 nm, FWHM ≈ ${(hi - lo).toFixed(2)} nm, OD min ${odB.toFixed(2)} outside ±4 nm, ${br.design.front.length} layers (${br.s.toFixed(0)} s)`);
  if (!(topMin >= 0.897 && odB >= 2.98)) throw new Error('band-pass: the specification is not met');

  // (5) AR on both faces of a plate: four materials vs two, same deep search budget
  const ap = probOf(arBothSidesExample());
  const ar4 = await designWith(ap.prob, ap.fd, { algorithm: 'deep' }, 90);
  const two: DesignProblem = { ...ap.prob, mats: [ap.prob.mats[0], ap.prob.mats[2]], names: ['TiO2', 'SiO2'], nRef: ap.prob.nRef && [ap.prob.nRef[0], ap.prob.nRef[2]] };
  const ar2 = await designWith(two, { ...ap.fd, startMat: 1, materials: 2 }, { algorithm: 'deep' }, 90);
  const Rmean = (prob: DesignProblem, d: Design) => mean(evaluateDesign({ ...prob, samples: prob.samples.map((x) => ({ ...x, kind: 'eq' as const, target: 0, tol: 1 })) }, d).X);
  const r4 = Rmean(ap.prob, ar4.design);
  const r2 = Rmean(two, ar2.design);
  const used = new Set([...ar4.design.front, ...ar4.design.back].map((L) => ap.prob.names[L.m]));
  log(
    `AR on both faces of 1 mm BK7 (bare 8.1 %): four materials R mean ${(100 * r4).toFixed(3)} % (${ar4.design.front.length} + ${ar4.design.back.length} layers; uses ${[...used].join(', ')}) vs TiO₂ / SiO₂ ${(100 * r2).toFixed(3)} % (${ar2.design.front.length} + ${ar2.design.back.length})`,
  );
  if (!(r4 < 0.004 && r4 < r2)) throw new Error(`AR both faces: four materials ${r4} vs two ${r2}`);

  // (6) classical gradual evolution from nothing; the design cleaner on the four-material plate AR
  const ar1 = probOf(filterExample()).prob; // long-pass example → replace targets with an AR band on one face
  const arP: DesignProblem = { ...ar1, samples: ar1.samples.filter((x) => ar1.lambdas[x.li] >= 450 && ar1.lambdas[x.li] <= 700).map((x) => ({ ...x, q: 'R' as const, target: 0, kind: 'eq' as const, tol: 1 })) };
  const ge = await runDesign(arP, { front: [], back: [] }, { algorithm: 'gradual', iterations: 20, needleStep: 5, lambdaRef: 550 }, () => {}, limit(90));
  const geR = mean(evaluateDesign(arP, ge.design).X);
  const n4 = Math.max(ar4.design.front.length, ar4.design.back.length);
  const cl = await runDesign(ap.prob, ar4.design, { algorithm: 'clean', iterations: 0, needleStep: 5, lambdaRef: 550, cleanTo: n4 - 2 }, () => {}, limit(90));
  const clR = Rmean(ap.prob, cl.design);
  log(`gradual evolution (Tikhonravov) from no layers, AR 450–700 nm: R ${(100 * geR).toFixed(3)} %, ${ge.design.front.length} layers; design cleaner on the plate AR: ${ar4.design.front.length} + ${ar4.design.back.length} → ${cl.design.front.length} + ${cl.design.back.length} layers, R ${(100 * r4).toFixed(3)} → ${(100 * clR).toFixed(3)} %`);
  if (!(geR < 0.008 && Math.max(cl.design.front.length, cl.design.back.length) <= n4 - 2 && clR < 3 * r4 + 0.0005)) throw new Error('gradual evolution / cleaner');

  // (7) deep search with a pool of parallel refiners (the app: sub-workers). Here an in-process pool with random delays:
  // the candidates are handed out to the free lanes, several in flight; a pool that fails at once gives exactly the
  // sequential result (the step is redone here and the pool is dropped).
  const deepS: DesignSettings = { algorithm: 'deep', iterations: 5, needleStep: 5, lambdaRef: 550 };
  const seq = await runDesign(arP, { front: [], back: [] }, deepS, () => {}, limit(60));
  const prng = rngOpt(7);
  let inFlight = 0;
  let maxInFlight = 0;
  let tasks = 0;
  const lanes: RefinePool = {
    size: 4,
    refine: async (prob, d, iterations, best) => {
      tasks++;
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, 3 * prng()));
      try {
        return await refineCandidate(prob, d, iterations, best);
      } finally {
        inFlight--;
      }
    },
  };
  const par = await runDesign(arP, { front: [], back: [] }, deepS, () => {}, { ...limit(60), pool: lanes });
  let broken = false;
  const failing: RefinePool = {
    get size() {
      return broken ? 0 : 4;
    },
    refine: async () => {
      broken = true;
      throw new Error('sub-worker failed');
    },
  };
  const fb = await runDesign(arP, { front: [], back: [] }, deepS, () => {}, { ...limit(60), pool: failing });
  const mfSeq = evaluateDesign(arP, seq.design).mf;
  const mfPar = evaluateDesign(arP, par.design).mf;
  const mfFb = evaluateDesign(arP, fb.design).mf;
  log(`deep search with parallel refiners (in-process pool, 4 lanes): ${tasks} candidates, up to ${maxInFlight} in flight, MF ${mfPar.toFixed(4)} (sequential ${mfSeq.toFixed(4)}); a failing pool → sequential result (MF ${mfFb.toFixed(4)}, ${fb.design.front.length} layers)`);
  if (!(maxInFlight >= 2 && tasks >= 4 && mfPar < 1.3 * mfSeq + 1e-4)) throw new Error('deep search: the parallel pool');
  if (!(mfFb === mfSeq && fb.design.front.length === seq.design.front.length && fb.iteration === seq.iteration)) throw new Error('deep search: a failing pool does not fall back to the sequential search');
}

// ---- Castle filter (Peleș contour, in the spirit of OIC 2025 Problem A) and the optimizer waiting for Compute RCWA ----
if (full('castle filter (20 s)')) {
  const pp = pelesExample();
  const plib = makeLibrary(pp.materials);
  const pev = evaluateHeadless(pp.nodes, pp.edges, plib);
  const pfi = pev.results.get('filter')!.info as FilterInfo;
  const pprob = pfi.problem!;
  if (!(pprob.samples.length === 151 && pprob.samples.every((x) => x.q === 'T' && x.tol === 0.01) && Math.abs(pfi.mf - 53.0) < 0.1)) throw new Error(`Peleș target: ${pprob.samples.length} samples, MF ${pfi.mf}`);
  const pfd = pp.nodes.find((nn) => nn.type === 'filter')!.data as FilterData;
  const pt0 = performance.now();
  const pr = await runDesign(pprob, startDesign(pfd, pprob), { algorithm: 'deep', iterations: 400, needleStep: 10, lambdaRef: 700, candidates: 8 }, () => {}, { stopped: () => performance.now() - pt0 > 20000, tick: async () => {} });
  const pn2 = pp.nodes.map((nn) => (nn.type === 'filter' ? ({ ...nn, data: { ...nn.data, design: pr.design } } as AppNode) : nn));
  const pev2 = evaluateHeadless(pn2, pp.edges, plib);
  const pmf = (pev2.results.get('filter')!.info as FilterInfo).mf;
  const cmf = (pev2.results.get('check')!.info as MatchInfo).rmse;
  // the optimizer waiting for Compute RCWA (the app: Run not pressed) can start: placeholders, a warning, no error
  const gm = gmrExample();
  const garm: JobState = { cache: new Map(), lastDone: new Map(), failed: new Map(), armed: new Map() };
  const gopt = evaluateGraph(gm.nodes, gm.edges, garm, makeLibrary(gm.materials)).results.get('opt')!;
  const goi = gopt.info as OptimizerInfo;
  console.log(
    `castle filter (Peleș contour, H 2.25 / M 1.38): 151 target points, bare MF ${pfi.mf.toFixed(1)} % → deep search 20 s: MF ${pmf.toFixed(2)} % (${pr.design.front.length} layers), independent TMM (Compute + Curve match) ${cmf.toFixed(4)} = designer ${pmf.toFixed(4)}; ` +
      `optimizer before Compute RCWA's Run: ${goi.objectives.length} objective(s) (placeholder), errors ${gopt.errors.length}, warning “${gopt.warnings[0]?.slice(0, 40)}…”`,
  );
  if (!(pmf < 10 && Math.abs(pmf - cmf) < 1e-9 && goi.objectives.length === 1 && !gopt.errors.length && gopt.warnings.length)) throw new Error('castle filter / optimizer waiting for Run');
}

// ---- SPR sensors by a genetic algorithm (M. Sebek et al., ACS Omega 8, 20792 (2023)): evaluation, operators, benchmarks ----
if (full('Sebek 2023 genetic algorithm (17 s)')) {
  const log = (x: string) => console.log(x);
  const glib = makeLibrary([]);
  const gm = Object.fromEntries([...glib].map(([id, dd]) => [id, dd.model]));
  const at = (id: string, l: number) => refractiveIndex(id, gm, l);
  // candidates with their role (the class suggested by the index) and the article's thickness limits
  const matsOf = (ids: string[], l: number): SprMaterial[] =>
    ids.map((id) => {
      const n = at(id, l);
      const mono = glib.get(id)!.monolayer;
      const cls = sprClassOf(n, mono);
      return { key: `${cls}:${id}`, id, name: id, n, cls, monolayer: mono, lo: cls === 'twoD' ? 1 : 5, hi: cls === 'twoD' ? 50 : 100 };
    });
  const COUNTS: SprProblem['counts'] = { plasmonic: [1, 3], dielectric: [0, 3], twoD: [0, 4], metal: [0, 1] };
  const problemOf = (l: number, prisms: string[], mats: SprMaterial[], over: Partial<SprProblem> = {}): SprProblem => ({
    lambda: l, ns: SEBEK2023.ns, dn: SEBEK2023.dn, prisms: prisms.map((id) => ({ key: id, id, name: id, n: at(id, l).re })), mats, counts: COUNTS, holdCounts: false,
    maxLayers: 12, thetaMin: 40, thetaMax: 89.9, step: 0.1, objective: 'S', maxTheta: 90, single: { on: false, minDepth: 0.4, maxAsym: 1.25, smooth: true }, trace: false, ...over,
  });
  const ids = ['Ag', 'Au', 'Al', 'Cr', 'SiO2', 'TiO2', 'GeO2', 'MgF2', 'Graphene', 'hBN', 'MoS2', 'WS2'];
  const m633 = matsOf(ids, 633);
  const k = (id: string) => ids.indexOf(id);
  const p633 = problemOf(633, ['CaF2'], m633, { single: { on: true, minDepth: 0.4, maxAsym: 1.25, smooth: true }, trace: true });
  const pub633: SprStructure = { p: 0, genes: [{ m: k('hBN'), t: 17 }, { m: k('Al'), t: 12 }, { m: k('Ag'), t: 28 }, { m: k('hBN'), t: 17 }] };

  // (1) classes at 633 nm; the angular TMM of the algorithm = the design TMM (admittance form), TM beyond total internal
  // reflection, with metals and 2D layers
  const cls = m633.map((m) => m.cls).join(',');
  if (cls !== 'plasmonic,plasmonic,plasmonic,metal,dielectric,dielectric,dielectric,dielectric,twoD,twoD,twoD,twoD') throw new Error(`layer GA classes: ${cls}`);
  const nP = p633.prisms[0].n;
  const films: Film[] = pub633.genes.map((g) => ({ n: m633[g.m].n, d: geneD(p633, g) }));
  let dAdm = 0;
  for (let th = 60; th < 89.95; th += 0.37) {
    const kx = nP * Math.sin((th * Math.PI) / 180);
    const ra = coherent(films, c(nP), c(SEBEK2023.ns), kx, (2 * Math.PI) / 633, 'p').faces.R;
    const rb = tmmPoint([{ n: c(nP), d: 0 }, ...films, { n: c(SEBEK2023.ns), d: 0 }], 633, th, 'p').R;
    dAdm = Math.max(dAdm, Math.abs(ra - rb));
  }
  // (2) the refined dip = a fine scan (0.0005°) refined by a parabola
  const ev633 = evaluateSensor(p633, pub633);
  if (!ev633.ok) throw new Error(`published 633 nm sensor: ${ev633.why}`);
  const stack633 = [{ n: c(nP), d: 0 }, ...films, { n: c(SEBEK2023.ns), d: 0 }];
  const fx: number[] = [];
  const fy: number[] = [];
  for (let th = ev633.a.theta - 0.3; th <= ev633.a.theta + 0.3; th += 0.0005) {
    fx.push(th);
    fy.push(tmmPoint(stack633, 633, th, 'p').R);
  }
  const fine = extremum(fx, fy, 0, fx.length - 1, 'min');
  const dTheta = Math.abs(fine.x - ev633.a.theta);
  log(`layer GA: classes at 633 nm (Ag, Au, Al plasmonic; Cr other metal; oxides dielectric; graphene, hBN, MoS₂, WS₂ 2D); angular TMM = design TMM (TM, beyond TIR, metals, 2D) ${dAdm.toExponential(1)}; refined dip = fine scan ${dTheta.toExponential(1)}°`);
  if (!(dAdm < 1e-12 && dTheta < 2e-4)) throw new Error('layer GA: TMM / dip refinement');

  // (3) the published sensors with the library data (the article's optical constants, its Table S1, are not available)
  const S633 = ev633.S;
  const pDual = problemOf(633, ['K-FIR97UV'], m633);
  const dualS: SprStructure = { p: 0, genes: [{ m: k('WS2'), t: 3 }, { m: k('GeO2'), t: 282 }, { m: k('Ag'), t: 47 }] };
  const evDual = evaluateSensor(pDual, dualS);
  if (!evDual.ok) throw new Error(`published dual-mode sensor: ${evDual.why}`);
  const dual = evDual as SprOk;
  const dsc = sprScan(pDual, dualS, SEBEK2023.ns);
  let nDips = 0;
  for (let i = 1; i < dsc.R.length - 1; i++) if (dsc.R[i] < dsc.R[i - 1] && dsc.R[i] <= dsc.R[i + 1] && dsc.thetas[i] > 75) nDips++;
  // 785 nm: MoS₂ as drawn in their Fig. 5D (n ≈ 3.5, lossless); the text's 7 hBN layers against the figure's 13
  const m785: SprMaterial[] = [...matsOf(['Ag', 'hBN'], 785), { key: 'twoD:mos2fig', id: 'mos2fig', name: 'MoS₂ (Fig. 5D)', n: c(3.5), cls: 'twoD', monolayer: 0.65, lo: 1, hi: 50 }];
  const p785 = problemOf(785, ['FSL3'], m785);
  const s785 = (top: number) => evaluateSensor(p785, { p: 0, genes: [{ m: 1, t: 15 }, { m: 2, t: 14 }, { m: 1, t: 14 }, { m: 0, t: 47 }, { m: 1, t: top }, { m: 2, t: 9 }, { m: 1, t: top }] });
  const e13 = s785(13);
  const e7 = s785(7);
  if (!e13.ok || !e7.ok) throw new Error('published 785 nm sensor');
  log(
    `Sebek 2023, published sensors with the library data: 633 nm (CaF₂ | 17 L hBN | 12 nm Al | 28 nm Ag | 17 L hBN) S = ${S633.toFixed(1)} deg/RIU, ${ev633.a.theta.toFixed(2)}° → ${ev633.b.theta.toFixed(2)}° (article ${SEBEK2023.s633.S}, ${SEBEK2023.s633.theta.join('° → ')}°); ` +
      `dual mode (K-FIR97UV | 3 L WS₂ | 282 nm GeO₂ | 47 nm Ag) ${nDips} dips, the deeper jumps ${dual.a.theta.toFixed(2)}° → ${dual.b.theta.toFixed(2)}° (Δθ ${(dual.b.theta - dual.a.theta).toFixed(2)}°), S = ${dual.S.toFixed(0)} (article ${SEBEK2023.dual.S}, ${SEBEK2023.dual.dTheta}°); ` +
      `785 nm with MoS₂ as in their Fig. 5D: S = ${e13.S.toFixed(0)} with 13 top hBN layers (figure; article ${SEBEK2023.s785.S}), ${e7.S.toFixed(0)} with 7 (text)`,
  );
  if (!(S633 > 380 && S633 < 620 && Math.abs(ev633.a.theta - SEBEK2023.s633.theta[0]) < 1.5)) throw new Error('Sebek 633 nm sensor');
  if (!(Math.abs(dual.S / SEBEK2023.dual.S - 1) < 0.1 && Math.abs(dual.b.theta - dual.a.theta - SEBEK2023.dual.dTheta) < 0.7 && nDips === 2)) throw new Error('Sebek dual-mode sensor');
  if (!(Math.abs(e13.S / SEBEK2023.s785.S - 1) < 0.25 && e7.S < 0.5 * e13.S)) throw new Error('Sebek 785 nm sensor');

  // (4) operators: bounds and steps kept, deletion keeps the minimum numbers of layers, the crossover point joins a head
  // of one parent to a tail of the other (with its prism), 2D ↔ nm thicknesses carried over; several prisms: the prism
  // mutation, children keep a valid prism; the role limits
  const rand = rngOpt(3);
  const p3 = { ...p633, prisms: ['CaF2', 'K-FIR97UV', 'FSL3'].map((id) => ({ key: id, id, name: id, n: at(id, 633).re })) };
  const randomS = (): SprStructure => {
    const n = 1 + Math.floor(rand() * 6);
    const genes = Array.from({ length: n }, () => {
      const m = Math.floor(rand() * m633.length);
      return { m, t: m633[m].lo + Math.floor(rand() * (m633[m].hi - m633[m].lo + 1)) };
    });
    genes.push({ m: k('Ag'), t: 40 });
    return { p: Math.floor(rand() * 3), genes };
  };
  const inBounds = (s: SprStructure) => s.p >= 0 && s.p < 3 && s.genes.every((g) => Number.isInteger(g.t) && g.t >= m633[g.m].lo && g.t <= m633[g.m].hi);
  const key = (s: SprStructure) => `${s.p}|${s.genes.map((g) => `${g.m}:${g.t}`).join(',')}`;
  const opsSeen = new Set<string>();
  let joinsOk = true;
  let prismOk = true;
  for (let i = 0; i < 3000; i++) {
    const A = randomS();
    const B = randomS();
    const mu = mutate(p3, A, rand);
    opsSeen.add(mu.op);
    if (!inBounds(mu.s) || (mu.op === 'delete' && countsBreak(p3, mu.s.genes, false)) || mu.s.genes.length > p3.maxLayers) throw new Error(`mutation ${mu.op}: ${key(A)} → ${key(mu.s)}`);
    if (mu.op === 'prism' && (mu.s.p === A.p || key({ ...mu.s, p: 0 }) !== key({ ...A, p: 0 }))) prismOk = false;
    const cx = crossover(p3, A, B, rand);
    opsSeen.add(cx.op);
    if (!inBounds(cx.s)) throw new Error(`crossover ${cx.op}`);
    if (cx.op === 'crossover point') {
      const kc = key(cx.s);
      let found = false;
      for (let a = 0; a <= A.genes.length && !found; a++)
        for (let b = 0; b <= B.genes.length && !found; b++) found = kc === key({ p: A.p, genes: [...A.genes.slice(0, a), ...B.genes.slice(b)] }) || kc === key({ p: B.p, genes: [...B.genes.slice(0, b), ...A.genes.slice(a)] });
      joinsOk &&= found;
    }
  }
  // thicknesses carried over: 10 nm → hBN (0.333 nm / layer) = 30 layers, 17 L hBN (5.66 nm) → 6 nm, 17 L hBN → WS₂ = 17 L
  const conv = [withMaterial(p633, { m: k('SiO2'), t: 10 }, k('hBN')).t, withMaterial(p633, { m: k('hBN'), t: 17 }, k('SiO2')).t, withMaterial(p633, { m: k('hBN'), t: 17 }, k('WS2')).t];
  // role limits: the random structures respect them; the check of the counts
  const r0 = rngOpt(9);
  let firstOk = true;
  for (let i = 0; i < 500; i++) firstOk &&= !countsBreak(p633, randomStructure(p633, r0).genes, true);
  const tooMany: SprGene[] = [{ m: k('Ag'), t: 30 }, { m: k('Cr'), t: 5 }, { m: k('Cr'), t: 5 }];
  const countMsgs = [countsBreak(p633, [{ m: k('SiO2'), t: 30 }], false), countsBreak(p633, tooMany, false), countsBreak(p633, tooMany, true)];
  log(`layer GA operators (3000 applications, 3 prisms): ${[...opsSeen].join(', ')}; crossover point = head + tail with its prism: ${joinsOk}; thicknesses carried over ${conv.join(' / ')}; first population within the role limits: ${firstOk}; counts: “${countMsgs[0]}”, ${countMsgs[1]}, “${countMsgs[2]}”`);
  if (!(opsSeen.size === 8 && joinsOk && prismOk && conv.join() === '30,6,17' && firstOk && countMsgs[0] && !countMsgs[1] && countMsgs[2])) throw new Error('layer GA operators');

  // (5) the algorithm: single-mode at 633 nm (seed 1, 30 generations) reaches at least the published structure with the
  // same data; the best never gets worse (elites); the same seed gives the same result; without the single-mode
  // conditions and with the K-FIR97UV prism it finds a mode jump (the first of seeds 2 … 7); with three prisms it settles on one
  const settings = { population: 50, generations: 30, elite: 0.1, mutation: 0.33, seed: 1 };
  const quiet = { stopped: () => false, tick: async () => {} };
  const tGa = performance.now();
  const ga = await runSprGa(p633, settings, () => {}, quiet);
  const tGaS = (performance.now() - tGa) / 1000;
  const best = ga.best!;
  const again = evaluateSensor(p633, best.s);
  const monotone = ga.history.every((v, i) => i === 0 || v >= ga.history[i - 1] - 1e-9);
  const small = { ...settings, population: 12, generations: 6, seed: 5 };
  const r1 = await runSprGa(p633, small, () => {}, quiet);
  const r2 = await runSprGa(p633, small, () => {}, quiet);
  // a stochastic search: the first of seeds 2 … 7 that jumps (the path depends on the last digits of the evaluations)
  const jumped = (r: Awaited<ReturnType<typeof runSprGa>>) => r.best!.ev.S > 1000 && r.best!.ev.b.theta - r.best!.ev.a.theta > 5;
  let freeSeed = 2;
  let gaFree = await runSprGa(pDual, { ...settings, generations: 60, seed: freeSeed }, () => {}, quiet);
  while (!jumped(gaFree) && freeSeed < 7) gaFree = await runSprGa(pDual, { ...settings, generations: 60, seed: ++freeSeed }, () => {}, quiet);
  const bf = gaFree.best!;
  const ga3 = await runSprGa({ ...p3, single: { on: false, minDepth: 0.4, maxAsym: 1.25, smooth: true }, trace: false }, { ...settings, generations: 20, seed: 4 }, () => {}, quiet);
  const txt = (s: SprStructure, p: SprProblem) => `${p.prisms[s.p].name} | ${mergedGenes(s.genes).map((g) => `${p.mats[g.m].name} ${g.t}${p.mats[g.m].cls === 'twoD' ? ' L' : ' nm'}`).join(' | ')}`;
  log(
    `Sebek GA, single mode at 633 nm (12 candidates, seed 1): best S ${best.ev.S.toFixed(1)} deg/RIU after ${ga.generation} generations (published structure ${S633.toFixed(1)} with the same data), ${txt(best.s, p633)}, R min ${best.ev.a.R.toFixed(3)}, ` +
      `${ga.evaluations} structures evaluated (${ga.tried} random for the first population), ${tGaS.toFixed(1)} s; without the single-mode conditions (K-FIR97UV, seed ${freeSeed}): S ${bf.ev.S.toFixed(0)} (Δθ ${(bf.ev.b.theta - bf.ev.a.theta).toFixed(2)}°), ${txt(bf.s, pDual)}; ` +
      `three prisms (CaF₂ 1.433, K-FIR97UV 1.425, FSL3 1.463; seed 4): S ${ga3.best!.ev.S.toFixed(0)} on ${p3.prisms[ga3.best!.s.p].name}`,
  );
  if (!(best.ev.S >= S633 - 1e-6 && again.ok && Math.abs((again as SprOk).S - best.ev.S) < 1e-9 && monotone)) throw new Error('Sebek GA: single mode');
  if (!(key(r1.best!.s) === key(r2.best!.s) && r1.evaluations === r2.evaluations)) throw new Error('Sebek GA: the same seed must give the same run');
  if (!jumped(gaFree)) throw new Error('Sebek GA: no mode jump without conditions (seeds 2 … 7)');
  if (!(ga3.best!.ev.S > S633)) throw new Error('Sebek GA: three prisms');

  // (6) the example through the graph: the Optimization Engine's structure = Compute TMM + Sensitivity (a finer grid, a
  // parabola); the dual-mode example
  const run = (proj: Project) => {
    const r = evaluateHeadless(proj.nodes, proj.edges, makeLibrary(proj.materials)).results;
    const bad = [...r.entries()].filter(([, v]) => v.errors.length);
    if (bad.length) throw new Error(`${bad.map(([id, v]) => `${id}: ${v.errors}`)}`);
    const mt = r.get('sens')!.outs.metrics;
    return { S: mt?.type === 'data' ? mt.dataset.fields.S[0] : NaN, info: r.get('opt')?.info as LayerGaInfo | undefined, outs: r.get('opt')?.outs };
  };
  const exGa = run(sprGaExample());
  const exDual = run(sprDualModeExample());
  const exEval = exGa.info?.eval;
  const out = exGa.outs?.out;
  const outOk = out?.type === 'data' && out.dataset?.axes.length === 2 && out.dataset.fields.R.length === 2 * (exGa.info?.thetas.length ?? 0);
  log(`Sebek examples through the graph: Optimization Engine (layer sequences) S ${exEval?.ok ? exEval.S.toFixed(3) : '—'} = Compute TMM + Sensitivity ${exGa.S.toFixed(3)} deg/RIU, data output R(n_s, θ) ${outOk}; dual mode ${exDual.S.toFixed(1)} deg/RIU`);
  if (!(exEval?.ok && Math.abs(exEval.S - exGa.S) < 0.05 && outOk && Math.abs(exDual.S - dual.S) < 1)) throw new Error('Sebek examples');
}

// ---- Stage 5: tolerance analysis (Monte Carlo) ----
{
  const tlib = makeLibrary([]);
  const tm = Object.fromEntries([...tlib].map(([id, dd]) => [id, dd.model]));
  const thick = [110.3, 32.8, 18.9, 94.2]; // SiO2 / TiO2 / SiO2 / TiO2 … from air: an AR-like stack
  const matsOf = ['SiO2', 'TiO2', 'SiO2', 'TiO2'];
  const E = (s: string, t: string, h: string, sh = 'out') => ({ id: `${s}-${sh}-${t}-${h}`, source: s, sourceHandle: sh, target: t, targetHandle: h });
  const graph = (tol: Partial<ToleranceData>): { nodes: AppNode[]; edges: ReturnType<typeof E>[] } => ({
    nodes: [
      { id: 'air', type: 'material', position: { x: 0, y: 0 }, data: materialData('Air') },
      { id: 'SiO2', type: 'material', position: { x: 0, y: 0 }, data: materialData('SiO2') },
      { id: 'TiO2', type: 'material', position: { x: 0, y: 0 }, data: materialData('TiO2') },
      { id: 'bk7', type: 'material', position: { x: 0, y: 0 }, data: materialData('BK7') },
      ...thick.map((d, i): AppNode => ({ id: `l${i}`, type: 'layer', position: { x: 0, y: 0 }, data: { label: '', thickness: d, layers2D: 1 } })),
      { id: 'st', type: 'combine', position: { x: 0, y: 0 }, data: { name: '', count: 4 } },
      { id: 'wl', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'lambda', mode: 'range', value: 550, min: 420, max: 720, step: 10 } },
      { id: 'th', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'theta', mode: 'constant', value: 0, min: 0, max: 80, step: 1 } },
      { id: 'tm', type: 'compute', position: { x: 0, y: 0 }, data: { name: 'AR', polarization: 's' } },
      { id: 'tol', type: 'tolerance', position: { x: 0, y: 0 }, data: { ...TOLERANCE_DEFAULTS, ...tol } },
    ],
    edges: [
      ...thick.map((_, i) => E(matsOf[i], `l${i}`, 'mat')),
      ...thick.map((_, i) => E(`l${i}`, 'st', `item-${i}`)),
      E('air', 'st', 'incident'),
      E('bk7', 'st', 'exit'),
      E('st', 'tm', 'stack'),
      E('wl', 'tm', 'lambda'),
      E('th', 'tm', 'theta'),
      E('tm', 'tol', 'in'),
    ],
  });
  const run = (tol: Partial<ToleranceData>) => {
    const g = graph(tol);
    const r = evaluateHeadless(g.nodes, g.edges, tlib).results.get('tol')!;
    if (r.errors.length) throw new Error(`tolerance: ${r.errors}`);
    const get = (h: string) => {
      const o = r.outs[h];
      if (o?.type !== 'data' || !o.dataset) throw new Error(`tolerance output ${h}`);
      return o.dataset;
    };
    return { r, info: r.info as ToleranceInfo, stats: get('out'), samples: get('samples'), errs: get('errors') };
  };
  const lams = rangeValues(420, 720, 10) as number[];
  const Rof = (ds: number[], lam: number, th = 0, dn: number[] = [0, 0, 0, 0]) =>
    tmmPoint([{ n: refractiveIndex('Air', tm, lam), d: 0 }, ...ds.map((d, i) => { const n = refractiveIndex(matsOf[i], tm, lam); return { n: c(n.re + dn[i], n.im), d }; }), { n: refractiveIndex('BK7', tm, lam), d: 0 }], lam, th, 's').R;

  // (1) σ = 0: every sample is the nominal structure
  const z = run({ samples: 20, dSigma: 0 });
  const nomR = lams.map((l) => Rof(thick, l));
  const e0 = Math.max(...Array.from(z.samples.fields.R, (v, k) => Math.abs(v - nomR[k % lams.length])), ...Array.from(z.stats.fields.R_std));
  if (e0 > 1e-14) throw new Error(`σ = 0 samples differ from the nominal (${e0})`);

  // (2) a sample reproduced from its error table, (3) statistics recomputed from the samples
  const a = run({ samples: 300, dSigma: 2 });
  const N = 300;
  const s7 = 7;
  const d7 = thick.map((_, k) => a.errs.fields[`d${k}`][s7]);
  const e7 = Math.max(...lams.map((l, i) => Math.abs(a.samples.fields.R[s7 * lams.length + i] - Rof(d7, l))));
  const li = 13; // 550 nm
  const col = Array.from({ length: N }, (_, s) => a.samples.fields.R[s * lams.length + li]).sort((x, y) => x - y);
  const mean = col.reduce((x, y) => x + y, 0) / N;
  const std = Math.sqrt(col.reduce((x, y) => x + (y - mean) ** 2, 0) / (N - 1));
  const med = (col[N / 2 - 1] + col[N / 2]) / 2;
  const eS = Math.max(Math.abs(a.stats.fields.R_mean[li] - mean), Math.abs(a.stats.fields.R_std[li] - std), Math.abs(a.stats.fields.R_median[li] - med), Math.abs(a.stats.fields.R_min[li] - col[0]), Math.abs(a.stats.fields.R_max[li] - col[N - 1]));
  const relErr = thick.map((d, k) => Array.from(a.errs.fields[`d${k}`], (v) => (v / d - 1) * 100));
  const sdRel = Math.sqrt(relErr[0].reduce((x, y) => x + y * y, 0) / N);
  const maxRel = Math.max(...relErr.flat().map(Math.abs));
  if (e7 > 1e-13 || eS > 1e-14) throw new Error(`tolerance sample / statistics: ${e7}, ${eS}`);
  if (Math.abs(sdRel - 2) > 0.3 || maxRel > 6 + 1e-9) throw new Error(`thickness errors: σ ${sdRel}, max ${maxRel}% (limit 3σ = 6%)`);
  const rep = run({ samples: 300, dSigma: 2 });
  if (rep.samples.fields.R.some((v, k) => v !== a.samples.fields.R[k])) throw new Error('same seed must give the same samples');

  // (4) small errors: the spread matches the linear prediction from the analytic gradient
  const sig = 0.3; // %
  const b = run({ samples: 3000, dSigma: sig, clip: 10 });
  const pred = lams.map((lam) => {
    const k0 = (2 * Math.PI) / lam;
    const g = coherent(thick.map((d, i) => ({ n: refractiveIndex(matsOf[i], tm, lam), d })), refractiveIndex('Air', tm, lam), refractiveIndex('BK7', tm, lam), 0, k0, 's', { grad: true }).grad!;
    return Math.sqrt(g.reduce((s, x, i) => s + (x.R * (thick[i] * sig) / 100) ** 2, 0));
  });
  const ratio = lams.map((_, i) => b.stats.fields.R_std[i] / pred[i]);
  const worst = Math.max(...ratio.map((r) => Math.abs(r - 1)));
  if (worst > 0.1) throw new Error(`MC spread vs linear prediction: ${worst}`);

  // (5) yield = fraction of samples inside the limits; (6) ranking: the layer with a large σ comes first
  // limit = the median of the samples' worst R in the band (a yield near 50 % tests both outcomes)
  const worstR = Array.from({ length: 300 }, (_, s) => Math.max(...lams.flatMap((l, i) => (l >= 450 && l <= 700 ? [a.samples.fields.R[s * lams.length + i]] : []))));
  const lim = [...worstR].sort((p2, q2) => p2 - q2)[150];
  const y = run({ samples: 300, dSigma: 2, spec: true, specBands: [{ lo: 450, hi: 700, q: 'R', min: 0, max: lim }], dOverride: { '1': 6 } });
  const passManual = Array.from({ length: 300 }, (_, s) => lams.every((l, i) => l < 450 || l > 700 || y.samples.fields.R[s * lams.length + i] <= lim));
  const yieldManual = (100 * passManual.filter(Boolean).length) / 300;
  if (Math.abs(y.info.yieldPct - yieldManual) > 1e-9) throw new Error(`yield ${y.info.yieldPct} vs ${yieldManual}`);
  if (!y.info.ranking[0].label.startsWith('d 2 TiO')) throw new Error(`ranking: ${y.info.ranking[0].label}`);

  // (7) systematic, index and angle errors: a sample reproduced from its errors
  const w = run({ samples: 50, dSigma: 1, dSys: 1, index: true, nSigma: 0.01, nSys: 0.005, angle: true, aSigma: 2 });
  const s3 = 3;
  const dd = thick.map((_, k) => w.errs.fields[`d${k}`][s3]);
  const sysN: Record<string, number> = { SiO2: w.errs.fields.sn0[s3], TiO2: w.errs.fields.sn1[s3] };
  const dn = thick.map((_, k) => w.errs.fields[`n${k}`][s3] + sysN[matsOf[k]]);
  const th3 = w.errs.fields.dtheta[s3];
  const ew = Math.max(...lams.map((l, i) => Math.abs(w.samples.fields.R[s3 * lams.length + i] - Rof(dd, l, th3, dn))));
  if (ew > 1e-13) throw new Error(`systematic / index / angle sample not reproduced (${ew})`);

  // histogram helpers
  const hb = binsOf(y.info.dev, 0);
  if (hb.counts.reduce((p, q2) => p + q2, 0) !== 300) throw new Error('histogram bins');
  const hs = histStats(y.info.dev)!;
  console.log(
    [
      `tolerance: σ = 0 → samples = nominal (${e0.toExponential(1)}); a sample from its error table = TMM (${e7.toExponential(1)}); statistics vs recomputed (${eS.toExponential(1)})`,
      `thickness errors: σ ${sdRel.toFixed(2)} % (asked 2 %), max ${maxRel.toFixed(2)} % (limit 3σ = 6 %); same seed → same samples`,
      `linear check (σ = 0.3 %, 3000 samples): MC std(R) / analytic-gradient prediction = ${Math.min(...ratio).toFixed(3)} … ${Math.max(...ratio).toFixed(3)}`,
      `yield R ≤ ${(100 * lim).toFixed(2)} % on 450–700 nm = ${y.info.yieldPct.toFixed(1)} % (= manual count); most critical: ${y.info.ranking[0].label} (${(100 * y.info.ranking[0].share).toFixed(0)} % of the spread)`,
      `systematic + index + angle errors reproduced (${ew.toExponential(1)}); RMS deviation: median ${hs.median.toFixed(4)}, p95 ${hs.p95.toFixed(4)}`,
    ].join('\n'),
  );
}

// ---- Cross-validation against RETICOLO (stored reference: npm run bench:reticolo) ----
{
  type Ref = { R: Record<string, number>; T: Record<string, number>; RTE?: Record<string, number>; RTM?: Record<string, number>; TTE?: Record<string, number>; TTM?: Record<string, number> };
  const ref = JSON.parse(readFileSync(new URL('./reference/reticolo.json', import.meta.url), 'utf8')) as { reticolo: string; results: Record<string, Ref> };
  const cz = (z: [number, number]) => c(z[0], z[1]);
  let worst = 0;
  let worstId = '';
  let orders = 0;
  for (const rc of RETICOLO_CASES) {
    const L: RcwaLayer[] = [{ n: cz(rc.top), d: 0 }, ...rc.layers.map((q) => (q.segs ? { d: q.d, segs: q.segs.map((g) => ({ from: g.from, to: g.to, n: g.eps ? csqrt(cz(g.eps[0])) : cz(g.n), ...(g.eps ? { eps: g.eps.map(cz) as [C, C, C] } : {}) })) } : q.eps ? { d: q.d, eps: q.eps.map(cz) } : { d: q.d, n: cz(q.n!) })), { n: cz(rc.bottom), d: 0 }];
    const got = ref.results[rc.id];
    if (!got) throw new Error(`no Reticolo reference for ${rc.id} (run npm run bench:reticolo)`);
    if (rc.phi !== undefined) continue; // conical: below
    const r = rcwaPoint(L, rc.period, rc.lam, rc.theta, rc.pol, rc.N);
    for (const [q, arr] of [['R', r.R], ['T', r.T]] as const)
      for (const [o, v] of Object.entries(got[q])) {
        const e = Math.abs(arr[rc.N + Number(o)] - v);
        orders++;
        if (e > worst) [worst, worstId] = [e, `${rc.id} ${q}${o}`];
      }
  }
  if (worst > 1e-9) throw new Error(`RCWA vs Reticolo: ${worst} (${worstId})`);
  const planar = RETICOLO_CASES.filter((c) => c.phi === undefined).length;
  console.log(`RCWA = RETICOLO ${ref.reticolo} on ${planar} planar cases (${orders} diffraction efficiencies: Li/Granet metal grating, Reticolo exemple1/5/6/10/11/pertes, two gratings + films, thin-film stack): max |Δη| ${worst.toExponential(1)}`);

  // conical incidence: every order, its total efficiency and its TE / TM parts (Reticolo efficiency_TE / _TM)
  let cw = 0;
  let cwId = '';
  let cn = 0;
  for (const rc of RETICOLO_CASES) {
    if (rc.phi === undefined) continue;
    const L: RcwaLayer[] = [{ n: cz(rc.top), d: 0 }, ...rc.layers.map((q) => (q.segs ? { d: q.d, segs: q.segs.map((g) => ({ from: g.from, to: g.to, n: cz(g.n) })) } : q.eps ? { d: q.d, eps: q.eps.map(cz) } : { d: q.d, n: cz(q.n!) })), { n: cz(rc.bottom), d: 0 }];
    const r = rcwaConical(L, rc.period, rc.lam, rc.theta, rc.phi, rc.pol, rc.N);
    const got = ref.results[rc.id];
    if (!got.RTE) throw new Error(`the Reticolo reference of ${rc.id} has no TE / TM parts (run npm run bench:reticolo)`);
    const cols = [['R', r.R, got.R], ['T', r.T, got.T], ['R TE', r.RTE, got.RTE], ['R TM', r.RTM, got.RTM!], ['T TE', r.TTE, got.TTE!], ['T TM', r.TTM, got.TTM!]] as const;
    for (const [q, arr, want] of cols)
      for (const [o, v] of Object.entries(want)) {
        const e = Math.abs(arr[rc.N + Number(o)] - v);
        cn++;
        if (e > cw) [cw, cwId] = [e, `${rc.id} ${q} ${o}`];
      }
    // every propagating order of ours is in Reticolo's list (a lossy exit medium: its orders are not listed by Reticolo)
    for (const [q, arr, want] of cols.slice(0, rc.bottom[1] ? 1 : 2))
      arr.forEach((v, i) => {
        if (v > 1e-12 && !(String(i - rc.N) in want)) throw new Error(`conical ${rc.id}: order ${q} ${i - rc.N} (${v}) is not in Reticolo's list`);
      });
  }
  if (cw > 1e-9) throw new Error(`conical RCWA vs Reticolo: ${cw} (${cwId})`);
  const nCon = RETICOLO_CASES.length - planar;
  console.log(`conical RCWA = RETICOLO ${ref.reticolo} (res1 with delta0: its 2D solver) on ${nCon} cases (${cn} values: efficiency and its TE / TM parts of every order — Li/Granet metal φ 30/60°, exemple1_conique, dielectric φ 45/89/−70°, lossy, two gratings + films, film stack, echelette, anisotropic films: exemple_V9_0D_anisotrope, tilted nematic layers, absorbing tensor, Liu et al. 2023 PhC + 2.75 µm uniaxial layer on its sharp TE-mode resonances incl. the FW-BIC): max |Δη| ${cw.toExponential(1)}`);
}

// ---- Literature benchmark: Tamm plasmon induced reflection, H. Lu et al., Opt. Express 27, 5383 (2019) ----
if (full('Lu 2019 Tamm EIT (12 s)')) {
  const tp = tammExample();
  const tlib = makeLibrary(tp.materials);
  const HC = 1239.84193;
  const HBARC = 197.3269804; // eV·nm
  // without the defect: the TPP dip (paper: 0.796 eV by TMM) and the analytic ωT = ω0/[1 + 2ω0(nB − nA)/(π ωp)] (0.790 eV)
  const noDefect = tp.nodes.map((n) => (n.type === 'dbr' ? ({ ...n, data: { ...n.data, cavities: [] } } as AppNode) : n));
  const r0 = evaluateHeadless(noDefect, tp.edges.filter((e) => e.target !== 'dbr' || (e.targetHandle !== 'c0' && e.targetHandle !== 'pos0')), tlib).results.get('tmm')!.outs.out;
  if (r0?.type !== 'data' || !r0.dataset) throw new Error('Tamm example without the defect');
  const lam0 = r0.dataset.axes.find((a) => a.id === 'lambda')!.values;
  const R0 = r0.dataset.fields.R;
  let k0 = 0;
  for (let i = 1; i < lam0.length; i++) if (R0[i] < R0[k0]) k0 = i;
  const dipEv = HC / lam0[k0];
  const w0 = (Math.PI * HBARC) / (2.2 * 160 + 1.45 * 275);
  const wT = w0 / (1 + (2 * w0 * (2.2 - 1.45)) / (Math.PI * 9.1));
  // with the defect (M = 12): the induced peak (paper 1556 nm)
  const ev = evaluateHeadless(tp.nodes, tp.edges, tlib);
  const tv = ev.results.get('tmm')!.outs.out;
  if (tv?.type !== 'data' || !tv.dataset) throw new Error('Tamm example');
  const nl = lam0.length;
  const iM = 4; // M = 12
  let kp = -1;
  for (let i = 1; i < nl - 1; i++) {
    const v = tv.dataset.fields.R[iM * nl + i];
    if (v > tv.dataset.fields.R[iM * nl + i - 1] && v >= tv.dataset.fields.R[iM * nl + i + 1] && v < 0.995 && (kp < 0 || v > tv.dataset.fields.R[iM * nl + kp])) kp = i;
  }
  // coupled oscillators through the Fit node (fit, then its metrics): κ, κT (10¹² rad/s)
  const kappaAt = (idx: number) => {
    const nodes = tp.nodes.map((n) => (n.type === 'fit' ? ({ ...n, data: { ...n.data, fixed: { 'sweep:pos': idx } } } as AppNode) : n));
    const info = evaluateHeadless(nodes, tp.edges, tlib).results.get('fit')!.info as FitInfo;
    const comps = (nodes.find((n) => n.id === 'fit')!.data as FitData).components;
    const f = fitSpectrum(comps, info.xs.slice(info.i0, info.i1 + 1), Array.from(info.ys!).slice(info.i0, info.i1 + 1), { energy: info.energy, xref: info.xref });
    const n2 = nodes.map((n) => (n.id === 'fit' ? ({ ...n, data: { ...n.data, components: f.comps } } as AppNode) : n));
    const m = evaluateHeadless(n2, tp.edges, tlib).results.get('fit')!.outs.metrics;
    if (m?.type !== 'data' || !m.dataset) throw new Error('Tamm fit metrics');
    return { kappa: m.dataset.fields['co.kappa'][0], kappaT: m.dataset.fields['co.kappaT'][0], r2: f.stats.r2 };
  };
  const k8 = kappaAt(0);
  const k12 = kappaAt(4);
  const B = TAMM_LU2019;
  const ok =
    Math.abs(dipEv - B.tppEv) < 0.002 &&
    Math.abs(wT - B.tppAnalyticEv) < 0.002 &&
    Math.abs(lam0[kp] - B.peakNm) < 1 &&
    Math.abs(k8.kappa - B.kappa8) / B.kappa8 < 0.02 &&
    Math.abs(k8.kappaT - B.kappaT8) < 0.03 &&
    Math.abs(k12.kappa - B.kappaFig8b[2]) / B.kappaFig8b[2] < 0.05 &&
    k8.r2 > 0.99 &&
    k12.r2 > 0.99;
  if (!ok) throw new Error(`Tamm benchmark: dip ${dipEv}, ωT ${wT}, peak ${lam0[kp]}, κ8 ${k8.kappa} κT8 ${k8.kappaT}, κ12 ${k12.kappa}`);
  console.log(
    `Lu et al. 2019 (Tamm EIT): TPP dip ${dipEv.toFixed(4)} eV (paper ${B.tppEv}), analytic ωT ${wT.toFixed(4)} eV (paper ${B.tppAnalyticEv}), induced peak ${lam0[kp].toFixed(2)} nm (paper ${B.peakNm}); ` +
      `coupled oscillators: M = 8 κ = ${k8.kappa.toFixed(2)}, κT = ${k8.kappaT.toFixed(2)} (paper ${B.kappa8}, ${B.kappaT8}); M = 12 κ = ${k12.kappa.toFixed(2)} (Fig. 8b ≈ ${B.kappaFig8b[2]}) ×10¹² rad/s`,
  );
}

// ---- Literature benchmark: Rabi-like splitting of Tamm plasmon + cavity modes, S. Jena et al., arXiv:2105.01888 ----
{
  const jp = rabiJenaExample();
  const jlib = makeLibrary(jp.materials);
  const HC = 1239.84193;
  const ev = evaluateHeadless(jp.nodes, jp.edges, jlib);
  const info = ev.results.get('fit')!.info as FitInfo;
  const xs = info.xs.slice(info.i0, info.i1 + 1);
  const ctx = { energy: info.energy, xref: info.xref };
  const g = guessDispersion(xs, info.short!, info.long!, info.xref, ctx);
  const r = fitDispersion(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { value: v, fixed: false }])), { xs, short: info.short!, long: info.long! }, ctx);
  const n2 = jp.nodes.map((n) => (n.id === 'fit' ? ({ ...n, data: { ...n.data, disp: r.params } } as AppNode) : n));
  const fi = evaluateHeadless(n2, jp.edges, jlib).results.get('fit')!.info as FitInfo;
  const k141 = xs.indexOf(141);
  const up = HC / info.short![k141];
  const lo = HC / info.long![k141];
  const B = RABI_JENA;
  if (Math.abs(up - B.upperEv) > 0.004 || Math.abs(lo - B.lowerEv) > 0.004 || Math.abs(fi.omegaMeV! - B.rabiMeV) > 4 || Math.abs(fi.crossing! - B.anticrossNm[0]) > 2 || r.stats.r2 < 0.999)
    throw new Error(`Jena benchmark: ${lo} / ${up} eV, Ω ${fi.omegaMeV} meV, crossing ${fi.crossing}`);
  console.log(
    `Jena et al. (Tamm–cavity Rabi splitting): hybrid modes at ds = 141 nm ${lo.toFixed(4)} / ${up.toFixed(4)} eV (paper ${B.lowerEv} / ${B.upperEv}); ` +
      `dispersion fit Ω = ${fi.omegaMeV!.toFixed(1)} meV (paper ${B.rabiMeV}), zero detuning at ds = ${fi.crossing!.toFixed(1)} nm (paper ${B.anticrossNm[0]})`,
  );
}

// ---- RCWA fast paths vs the dense reference ----
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mats = [c(1), c(1.46), c(2.4), c(1.52, 1e-4), c(0.18, 3.4), c(3.6, 0.01)];
  const pick = () => mats[Math.floor(rnd() * mats.length)];
  let worst = 0;
  for (let k = 0; k < 60; k++) {
    const layers: RcwaLayer[] = [{ n: c(rnd() < 0.5 ? 1 : 1.52), d: 0 }];
    const nl = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < nl; i++) {
      if (rnd() < 0.4) {
        const f = 0.2 + 0.6 * rnd();
        layers.push({ d: 20 + 200 * rnd(), segs: [{ from: 0, to: f, n: pick() }, { from: f, to: 1, n: pick() }] });
      } else layers.push({ n: pick(), d: 10 + 200 * rnd() });
    }
    layers.push({ n: rnd() < 0.3 ? c(0.18, 3.4) : pick(), d: 0 });
    const pol = rnd() < 0.5 ? 'p' : 's';
    const N = [0, 3, 8, 15][Math.floor(rnd() * 4)];
    const args = [layers, 300 + 400 * rnd(), 450 + 400 * rnd(), 60 * rnd(), pol, N] as const;
    RCWA_FAST.on = false;
    const a = rcwaSolve(...args).result;
    RCWA_FAST.on = true;
    const b = rcwaSolve(...args).result;
    const e = Math.max(...[...a.R].map((v, i) => Math.abs(v - b.R[i])), ...[...a.T].map((v, i) => Math.abs(v - b.T[i])),
      ...[...a.r[0]].map((v, i) => Math.hypot(v - b.r[0][i], a.r[1][i] - b.r[1][i]) / (1 + Math.hypot(v, a.r[1][i]))));
    worst = Math.max(worst, e);
  }
  if (worst > 1e-12) throw new Error(`RCWA fast paths vs dense: ${worst}`);

  // field map identical
  {
    const layers: RcwaLayer[] = [{ n: c(1), d: 0 }, { n: c(1.46), d: 50 }, { d: 40, segs: [{ from: 0, to: 0.5, n: c(0.18, 3.4) }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(2.4), d: 60 }, { n: c(0.18, 3.4), d: 0 }];
    const opts = { quantity: 'E2' as const, part: 'abs' as const, periods: 1, nx: 30, nz: 40, zIn: 100, zOut: 100 };
    RCWA_FAST.on = false;
    const A = fieldMap(rcwaSolve(layers, 500, 633, 10, 'p', 10), layers, 500, 'p', opts as never);
    RCWA_FAST.on = true;
    const B = fieldMap(rcwaSolve(layers, 500, 633, 10, 'p', 10), layers, 500, 'p', opts as never);
    const eMap = Math.max(...A.values.map((v, i) => Math.abs(v - B.values[i]) / (1 + Math.abs(v))));
    if (eMap > 1e-12) throw new Error(`RCWA fast field map: ${eMap}`);
    console.log(`RCWA fast paths (diagonal uniform layers, folded, final solve) = dense reference: 60 random structures ${worst.toExponential(1)}, field map ${eMap.toExponential(1)}`);
  }
}

// ---- RCWA with adaptive spatial resolution (ASR) ----
{
  const auA = c(0.18, 3.4);
  const pt = (L: RcwaLayer[], pol: 's' | 'p', N: number, eta = 0, th = 17, per = 700) => rcwaPoint(L, per, 633, th, pol, N, 'li', eta);
  // η → 0 = plain RCWA
  const G: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 40, segs: [{ from: 0, to: 0.5, n: auA }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(1.5), d: 30 }, { n: auA, d: 0 }];
  let e0 = 0;
  for (const pol of ['s', 'p'] as const) {
    const a = pt(G, pol, 10, 0, 10, 500);
    const b = pt(G, pol, 10, 1e-9, 10, 500);
    e0 = Math.max(e0, ...a.R.map((v, i) => Math.abs(v - b.R[i])), ...a.T.map((v, i) => Math.abs(v - b.T[i])));
  }
  // a "grating" of one material = the TMM stack (the modes of uniform media are the same in every layer)
  let eU = 0;
  for (const pol of ['s', 'p'] as const)
    for (const th of [0, 30, 60]) {
      const L: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 80, segs: [{ from: 0, to: 0.3, n: c(2.3) }, { from: 0.3, to: 1, n: c(2.3) }] }, { n: auA, d: 30 }, { n: c(1.5), d: 0 }];
      const r = pt(L, pol, 16, 0.9, th, 500);
      const t = tmmPoint([{ n: c(1), d: 0 }, { n: c(2.3), d: 80 }, { n: auA, d: 30 }, { n: c(1.5), d: 0 }], 633, th, pol);
      eU = Math.max(eU, Math.abs(r.Rtot - t.R), Math.abs(r.Ttot - t.T));
    }
  // lossless: the energy balance is not exact at finite N with ASR but converges; R, T converge to the plain RCWA
  const D: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 150, segs: [{ from: 0, to: 0.4, n: c(2.4) }, { from: 0.4, to: 1, n: c(1) }] }, { n: c(1.52), d: 0 }];
  const bal = [8, 16, 32].map((N) => {
    const r = pt(D, 'p', N, 0.9);
    return Math.abs(1 - r.Rtot - r.Ttot);
  });
  const dConv = Math.abs(pt(D, 'p', 32, 0.9).Rtot - pt(D, 'p', 32).Rtot);
  // metal in TM: ASR converges faster (gold lamellar grating, 100 nm deep, normal incidence)
  const Au: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 100, segs: [{ from: 0, to: 0.5, n: auA }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(1.5), d: 0 }];
  const refA = pt(Au, 'p', 60, 0.9, 0, 500);
  const refS = pt(Au, 'p', 100, 0, 0, 500);
  const a40 = pt(Au, 'p', 40, 0.9, 0, 500);
  const s40 = pt(Au, 'p', 40, 0, 0, 500);
  const errA = Math.abs(a40.Rtot - refA.Rtot);
  const errS = Math.abs(s40.Rtot - refS.Rtot);
  const absA = 1 - a40.Rtot - a40.Ttot;
  const absS = 1 - s40.Rtot - s40.Ttot;
  const absRef = 1 - refA.Rtot - refA.Ttot;
  if (e0 > 1e-8 || eU > 1e-5 || !(Math.max(bal[1], bal[2]) < 1e-6 && bal[0] > 100 * Math.max(bal[1], bal[2])) || dConv > 1e-4 || !(errA < errS) || !(Math.abs(absA - absRef) < Math.abs(absS - absRef)) || Math.abs(refA.Rtot - refS.Rtot) > 1e-3)
    throw new Error(`ASR: η→0 ${e0}, uniform ${eU}, balance ${bal}, conv ${dConv}, Au ${errA} vs ${errS}, A ${absA} ${absS} ${absRef}, refs ${refA.Rtot} ${refS.Rtot}`);
  // through the graph: Compute RCWA with ASR on = the direct computation with η = 0.9
  const gs = gratingSprExample();
  const gNodes = gs.nodes.map((n) => (n.type === 'rcwa' ? ({ ...n, data: { ...n.data, asr: true } } as AppNode) : n));
  const gRes = evaluateHeadless(gNodes, gs.edges, makeLibrary(gs.materials)).results.get('rc')!;
  const gOut = gRes.outs.out;
  if (gOut?.type !== 'data' || !gOut.dataset?.spec?.rcwa?.asr) throw new Error(`ASR through the graph: ${gRes.errors}`);
  const gSpec = gOut.dataset.spec;
  const st0 = rcwaLayersAt(gSpec, gSpec.sweeps.map(() => 0), gSpec.lambda[0]);
  let eG = 0;
  for (const k of [0, 100, 200]) eG = Math.max(eG, Math.abs(rcwaPoint(st0.layers, st0.period, gSpec.lambda[0], gSpec.theta[k], gSpec.pol, gSpec.rcwa!.orders, 'li', 0.9).Rtot - gOut.dataset.fields.R[k]));
  if (eG > 1e-12) throw new Error(`ASR graph vs direct: ${eG}`);
  console.log(
    `ASR through Compute RCWA = direct (${eG.toExponential(1)}); ASR: η → 0 = plain RCWA (${e0.toExponential(1)}); one-material grating = TMM (${eU.toExponential(1)}); lossless balance at N = 8/16/32: ${bal.map((v) => v.toExponential(1)).join(' / ')}; R → plain RCWA (${dConv.toExponential(1)}); ` +
      `gold grating TM, N = 40: |ΔR| ${errA.toExponential(1)} (ASR) vs ${errS.toExponential(1)} (plain), absorption ${absA.toFixed(4)} / ${absS.toFixed(4)} → ${absRef.toFixed(4)}`,
  );
}

// ---- RCWA on a thick incoherent substrate ----
{
  // 1) no grating = TMM incoherent
  let e1 = 0;
  for (const pol of ['s', 'p'] as const)
    for (const th of [0, 30, 60])
      for (const nS of [c(1.52, 0), c(1.52, 2e-5), c(3.5, 1e-3)]) {
        const front: RcwaLayer[] = [{ n: c(1), d: 0 }, { n: c(2.3), d: 80 }, { n: c(1.46, 1e-3), d: 120 }, { n: nS, d: 0 }];
        const back: RcwaLayer[] = [{ n: nS, d: 0 }, { n: c(0.2, 3), d: 20 }, { n: c(1.33), d: 0 }];
        const t = incoherentPoint(front as never, back as never, 1e6, 633, th, pol);
        const r = rcwaThickPoint(front, back, 1e6, 500, 633, th, pol, 0);
        e1 = Math.max(e1, Math.abs(t.R - r.Rtot), Math.abs(t.T - r.Ttot));
      }
  if (e1 > 1e-12) throw new Error(`RCWA thick without grating vs TMM thick: ${e1}`);

  // 2) lossless: R + T = 1 ; 3) index-matched back = semi-infinite
  const g = (f: number): RcwaLayer => ({ d: 150, segs: [{ from: 0, to: f, n: c(2.4) }, { from: f, to: 1, n: c(1) }] });
  let e2 = 0;
  let e3 = 0;
  for (const pol of ['s', 'p'] as const)
    for (const th of [0, 17]) {
      const front: RcwaLayer[] = [{ n: c(1), d: 0 }, g(0.4), { n: c(1.52), d: 0 }];
      const r = rcwaThickPoint(front, [{ n: c(1.52), d: 0 }, { n: c(1.46), d: 90 }, g(0.6), { n: c(1), d: 0 }], 1e6, 700, 633, th, pol, 12);
      e2 = Math.max(e2, Math.abs(r.Rtot + r.Ttot - 1));
      const m = rcwaThickPoint(front, [{ n: c(1.52), d: 0 }, { n: c(1.52), d: 0 }], 1e6, 700, 633, th, pol, 12);
      const s = rcwaPoint(front, 700, 633, th, pol, 12);
      e3 = Math.max(e3, Math.abs(m.Rtot - s.Rtot), Math.abs(m.Ttot - s.Ttot), ...m.R.map((v, i) => Math.abs(v - s.R[i])));
    }
  if (e2 > 1e-12 || e3 > 1e-12) throw new Error(`RCWA thick: R + T − 1 = ${e2}, matched back vs semi-infinite ${e3}`);

  // 4) incoherent = average of coherent over thickness (oblique incidence, weak grating, few orders)
  {
    const pol = 'p';
    const th = 10;
    const front: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 60, segs: [{ from: 0, to: 0.5, n: c(1.6) }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(1.52, 1e-6), d: 0 }];
    const inc = rcwaThickPoint(front, [{ n: c(1.52, 1e-6), d: 0 }, { n: c(1), d: 0 }], 20000, 900, 633, th, pol, 4);
    let R = 0;
    let T = 0;
    const K = 4000; // (coherent multi-pass terms that survive the average: ~1e-4)
    for (let i = 0; i < K; i++) {
      const d = 20000 + (i / K) * 4000;
      const r = rcwaPoint([...front.slice(0, -1), { n: c(1.52, 1e-6), d }, { n: c(1), d: 0 }], 900, 633, th, pol, 4);
      R += r.Rtot / K;
      T += r.Ttot / K;
    }
    const eAvg = Math.max(Math.abs(inc.Rtot - R), Math.abs(inc.Ttot - T));
    if (eAvg > 1e-3) throw new Error(`RCWA thick vs thickness-averaged coherent: ${eAvg}`);
    console.log(`RCWA thick substrate: no grating = TMM thick (${e1.toExponential(1)}); lossless R + T = 1 (${e2.toExponential(1)}); index-matched back = semi-infinite (${e3.toExponential(1)}); incoherent R/T ${inc.Rtot.toFixed(5)} / ${inc.Ttot.toFixed(5)} vs coherent averaged over 4000 thicknesses ${R.toFixed(5)} / ${T.toFixed(5)}`);
  }
  // graph: Combine “thick” → Compute RCWA uses the incoherent substrate (GMR on a 1 mm BK7 plate, back in air)
  {
    const gp = gmrExample();
    const glib = makeLibrary(gp.materials);
    const thickNodes = gp.nodes.map((n) => (n.type === 'combine' ? ({ ...n, data: { ...n.data, thick: true, dSub: 1 } } as AppNode) : n));
    const semi = evaluateHeadless(gp.nodes, gp.edges, glib).results.get('rc')!.outs.out;
    const thick = evaluateHeadless(thickNodes, gp.edges, glib).results.get('rc')!;
    const tv = thick.outs.out;
    if (thick.errors.length || tv?.type !== 'data' || !tv.dataset?.spec?.back || semi?.type !== 'data' || !semi.dataset) throw new Error(`RCWA thick in the graph: ${thick.errors}`);
    const spec = tv.dataset.spec;
    let eW = 0;
    spec.lambda.forEach((lam, i) => {
      const idx0 = spec.sweeps.map(() => 0);
      const fr = rcwaLayersAt(spec, idx0, lam);
      const bk = rcwaLayersAt(spec, idx0, lam, spec.back!.layers);
      const r = rcwaThickPoint(fr.layers, bk.layers, spec.back!.d, fr.period, lam, spec.theta[0], spec.pol, spec.rcwa!.orders);
      eW = Math.max(eW, Math.abs(r.Rtot - tv.dataset!.fields.R[i]), Math.abs(r.Ttot - tv.dataset!.fields.T[i]));
    });
    // at 660 nm only the zeroth order propagates in BK7 (λ/Λ = 1.83 > 1.52): the plate adds the back-surface reflection
    // (~4 %); at 540 nm the ±1 orders travel in the glass at ~81°, are totally reflected at the back and trapped, and part
    // of them is diffracted out through the front: R rises much more
    const last = spec.lambda.length - 1;
    const dR = tv.dataset.fields.R[last] - semi.dataset.fields.R[last];
    const dR0 = tv.dataset.fields.R[0] - semi.dataset.fields.R[0];
    const minA = Math.min(...tv.dataset.fields.A);
    if (eW > 1e-12 || !(dR > 0.02 && dR < 0.06) || !(dR0 > 0.1) || minA < -1e-12) throw new Error(`RCWA thick graph: ${eW}, ΔR ${dR} / ${dR0}, min A ${minA}`);
    console.log(`Compute RCWA with Combine “thick”: graph = direct (${eW.toExponential(1)}); 1 mm BK7 plate: ΔR = ${dR.toFixed(4)} at 660 nm (back surface only), ${dR0.toFixed(3)} at 540 nm (±1 orders trapped by total reflection)`);
  }
}

// ---- Stage 6: RCWA (1D gratings) ----
if (full('stage 6 RCWA (59 s)')) {
  const rows: string[] = [];
  // (a) eigen decomposition of general complex matrices
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  let eigErr = 0;
  for (const n of [3, 17, 41]) {
    const A = cmat(n);
    for (let i = 0; i < n * n; i++) [A.re[i], A.im[i]] = [rnd(), rnd()];
    const e = eig(A);
    const AV = cmul(A, e.vec);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++) {
        const [vr, vi] = [e.vec.re[i * n + k], e.vec.im[i * n + k]];
        eigErr = Math.max(eigErr, Math.hypot(AV.re[i * n + k] - (e.valRe[k] * vr - e.valIm[k] * vi), AV.im[i * n + k] - (e.valRe[k] * vi + e.valIm[k] * vr)));
      }
  }
  if (eigErr > 1e-12) throw new Error(`eigen decomposition residual ${eigErr}`);
  rows.push(`complex eigen decomposition: ‖AV − VΛ‖ ≤ ${eigErr.toExponential(1)} (n = 3, 17, 41)`);

  // (b) uniform layers (and a one-material "grating") = TMM
  const nAg = c(0.056, 4.28);
  let eT = 0;
  for (const pol of ['s', 'p'] as const)
    for (const th of [0, 30, 67]) {
      const r = rcwaPoint([{ n: c(1.52), d: 0 }, { n: nAg, d: 48 }, { segs: [{ from: 0, to: 0.4, n: c(2.2, 0.01) }, { from: 0.4, to: 1, n: c(2.2, 0.01) }], d: 120 }, { n: c(1.33), d: 0 }], 500, 633, th, pol, 7);
      const t = tmmPoint([{ n: c(1.52), d: 0 }, { n: nAg, d: 48 }, { n: c(2.2, 0.01), d: 120 }, { n: c(1.33), d: 0 }], 633, th, pol);
      eT = Math.max(eT, Math.abs(r.R[7] - t.R), Math.abs(r.T[7] - t.T), r.Rtot - r.R[7]);
    }
  if (eT > 1e-13) throw new Error(`RCWA vs TMM ${eT}`);
  rows.push(`RCWA with uniform layers = TMM (${eT.toExponential(1)}; s, p; 0/30/67°; silver)`);

  // (c) lossless dielectric grating: energy conservation and convergence
  const G1: RcwaLayer[] = [{ n: c(1), d: 0 }, { segs: [{ from: 0, to: 0.5, n: c(2) }, { from: 0.5, to: 1, n: c(1) }], d: 300 }, { n: c(1.5), d: 0 }];
  let eE = 0;
  const conv: string[] = [];
  for (const pol of ['s', 'p'] as const) {
    const v = [10, 20, 40].map((N) => rcwaPoint(G1, 800, 633, 20, pol, N));
    for (const r of v) eE = Math.max(eE, Math.abs(r.Rtot + r.Ttot - 1));
    conv.push(`${pol === 's' ? 'TE' : 'TM'} T(−1) ${v.map((r, k) => r.T[[10, 20, 40][k] - 1].toFixed(5)).join(' → ')}`);
    if (Math.abs(v[2].T[39] - v[1].T[19]) > 2e-4) throw new Error('RCWA convergence (dielectric grating)');
  }
  if (eE > 1e-10) throw new Error(`energy conservation ${eE}`);
  rows.push(`lossless grating: |ΣR + ΣT − 1| ≤ ${eE.toExponential(1)}; N = 10/20/40: ${conv.join('; ')}`);

  // (d) metallic grating, TM: Li's rule converges, Laurent's does not
  const Gm: RcwaLayer[] = [{ n: c(1), d: 0 }, { segs: [{ from: 0, to: 0.5, n: c(0.22, 6.71) }, { from: 0.5, to: 1, n: c(1) }], d: 100 }, { n: c(0.22, 6.71), d: 0 }];
  const li = [10, 20, 40].map((N) => rcwaPoint(Gm, 1000, 1000, 30, 'p', N, 'li').R[N]);
  const la = [10, 20, 40].map((N) => rcwaPoint(Gm, 1000, 1000, 30, 'p', N, 'laurent').R[N]);
  if (!(Math.abs(li[2] - li[1]) < 0.002 && Math.abs(la[2] - la[1]) > 5 * Math.abs(li[2] - li[1]))) throw new Error('Li factorization convergence');
  rows.push(`metal grating TM, R₀ at N = 10/20/40: Li ${li.map((v) => v.toFixed(4)).join(' → ')}; Laurent ${la.map((v) => v.toFixed(4)).join(' → ')}`);

  // (e) subwavelength limit: TE → ⟨ε⟩, TM → uniaxial (ε_x = 1/⟨1/ε⟩, ε_z = ⟨ε⟩); error ∝ Λ²
  const f = 0.3;
  const e1 = 2.25;
  const G2 = (_P: number): RcwaLayer[] => [{ n: c(1), d: 0 }, { segs: [{ from: 0, to: f, n: c(1.5) }, { from: f, to: 1, n: c(1) }], d: 200 }, { n: c(1.5), d: 0 }];
  const rTE = tmmPoint([{ n: c(1), d: 0 }, { n: c(Math.sqrt(f * e1 + 1 - f)), d: 200 }, { n: c(1.5), d: 0 }], 1000, 25, 's').R;
  const ex = 1 / (f / e1 + (1 - f));
  const ez = f * e1 + 1 - f;
  const kxu = Math.sin((25 * Math.PI) / 180);
  const kzu = Math.sqrt(ex * (1 - (kxu * kxu) / ez));
  const eta = kzu / ex;
  const eta1 = Math.sqrt(1 - kxu * kxu);
  const eta3 = Math.sqrt(2.25 - kxu * kxu) / 2.25;
  const dl = kzu * ((2 * Math.PI) / 1000) * 200;
  const B = cadd(c(Math.cos(dl)), cmulC(c(0, -Math.sin(dl) / eta), c(eta3)));
  const Cc = cadd(c(0, -eta * Math.sin(dl)), c(Math.cos(dl) * eta3));
  const rTM = cabs2(cdiv(csub(cmulC(c(eta1), B), Cc), cadd(cmulC(c(eta1), B), Cc)));
  const eTE = [20, 10].map((P) => Math.abs(rcwaPoint(G2(P), P, 1000, 25, 's', 25).R[25] - rTE));
  const eTM = [20, 10].map((P) => Math.abs(rcwaPoint(G2(P), P, 1000, 25, 'p', 25).R[25] - rTM));
  // TE: bulk correction ∝ Λ²; TM: an interface correction ∝ Λ (evanescent orders at the grating boundaries, it does not grow with the thickness)
  if (!(eTE[1] < eTE[0] / 3.5 && eTM[1] < eTM[0] / 1.8 && eTE[1] < 2e-6 && eTM[1] < 4e-5)) throw new Error(`EMT limit ${eTE} ${eTM}`);
  rows.push(`subwavelength limit (Λ = 20 → 10 nm; TE ∝ Λ², TM ∝ Λ): TE vs ⟨ε⟩ ${eTE.map((v) => v.toExponential(1)).join(' → ')}, TM vs uniaxial EMT ${eTM.map((v) => v.toExponential(1)).join(' → ')}`);

  // (f) field map: uniform structure = 1D TMM profile; tangential continuity at the grating interfaces
  const Ls: RcwaLayer[] = [{ n: c(1.52), d: 0 }, { n: nAg, d: 48 }, { n: c(2.2, 0.01), d: 120 }, { n: c(1.33), d: 0 }];
  let eF = 0;
  for (const pol of ['s', 'p'] as const) {
    const sol = rcwaSolve(Ls, 400, 633, 50, pol, 3);
    const fm = fieldMap(sol, Ls, 400, pol, { quantity: 'E2', part: 'abs', periods: 1, nx: 5, nz: 81, zIn: 100, zOut: 150 });
    const prof = fieldProfile(Ls.map((L) => ({ n: L.n!, d: L.d })), 633, 50, pol, fm.zs, layerOfZ(Ls.map((L) => L.d), fm.zs));
    fm.zs.forEach((_, k) => (eF = Math.max(eF, Math.abs(fm.values[k * 5 + 2] - prof.E2[k]))));
  }
  const Gc: RcwaLayer[] = [{ n: c(1), d: 0 }, { segs: [{ from: 0, to: 0.4, n: c(0.2, 3.5) }, { from: 0.4, to: 1, n: c(1) }], d: 60 }, { n: c(1.5), d: 0 }];
  let eC = 0;
  for (const pol of ['s', 'p'] as const) {
    const sol = rcwaSolve(Gc, 600, 700, 10, pol, 20);
    const q = pol === 's' ? 'Ey' : 'Hy';
    const a = fieldMap(sol, Gc, 600, pol, { quantity: q, part: 're', periods: 1, nx: 7, nz: 3, zIn: 1e-6, zOut: 1e-6 });
    const b = fieldMap(sol, Gc, 600, pol, { quantity: q, part: 're', periods: 1, nx: 7, nz: 3, zIn: -1e-6, zOut: -1e-6 });
    for (const row of [0, 2]) for (let i = 0; i < 7; i++) eC = Math.max(eC, Math.abs(a.values[row * 7 + i] - b.values[row * 7 + i]));
  }
  if (eF > 1e-12 || eC > 1e-6) throw new Error(`RCWA field map: ${eF}, ${eC}`);
  rows.push(`field map: uniform stack = TMM field profile (${eF.toExponential(1)}); Ey / Hy continuous at the grating interfaces (${eC.toExponential(1)})`);

  // (g) profiles: trapezoid with equal fills = lamellar; pixel map of the same ridge = lamellar; flip mirrors the slices
  const base = { period: 500, fill: 0.4, fillTop: 0.4, shift: 0.5, slices: 6, nx: 20, pixels: [] as number[], mats: ['A', 'B'] };
  const lam = gratingSlices({ ...base, profile: 'lamellar' as const });
  const tra = gratingSlices({ ...base, profile: 'trapezoid' as const });
  const pix = gratingSlices({ ...base, profile: 'pixel' as const, pixels: defaultPixels(20, 6, 0.4) });
  const same = (a: typeof lam[0]['segs'], b: typeof lam[0]['segs']) => a.length === b.length && a.every((s, i) => Math.abs(s.from - b[i].from) < 1e-12 && Math.abs(s.to - b[i].to) < 1e-12 && s.m === b[i].m);
  if (!tra.every((s) => same(s.segs, lam[0].segs)) || !pix.every((s) => same(s.segs, lam[0].segs))) throw new Error('grating profiles');
  const tz = gratingSlices({ ...base, profile: 'trapezoid' as const, fill: 0.6, fillTop: 0.2 });
  const tzf = gratingSlices({ ...base, profile: 'trapezoid' as const, fill: 0.6, fillTop: 0.2, flip: true });
  if (!tz.every((s, i) => same(s.segs, tzf[tz.length - 1 - i].segs))) throw new Error('grating flip');
  // sinusoidal staircase converges with Nz; blazed grating is asymmetric (R₋₁ ≠ R₊₁) and conserves energy
  const sinR = [10, 20, 40].map((nz) => {
    const sl = gratingSlices({ ...base, profile: 'sinus' as const, slices: nz });
    const L: RcwaLayer[] = [{ n: c(1), d: 0 }, ...sl.map((s) => ({ d: s.h * 150, segs: s.segs.map((q) => ({ ...q, n: q.m === 0 ? c(1.6) : c(1) })) })), { n: c(1.6), d: 0 }];
    return rcwaPoint(L, 600, 700, 0, 's', 12).T[12 - 1];
  });
  if (Math.abs(sinR[2] - sinR[1]) > Math.abs(sinR[1] - sinR[0])) throw new Error('sinusoidal staircase convergence');
  const bl = gratingSlices({ ...base, profile: 'blazed' as const, slices: 16 });
  const Lb: RcwaLayer[] = [{ n: c(1), d: 0 }, ...bl.map((s) => ({ d: s.h * 600, segs: s.segs.map((q) => ({ ...q, n: q.m === 0 ? c(1.5) : c(1) })) })), { n: c(1.5), d: 0 }];
  const rb = rcwaPoint(Lb, 1000, 633, 0, 's', 15);
  if (Math.abs(rb.Rtot + rb.Ttot - 1) > 1e-10 || Math.abs(rb.T[14] - rb.T[16]) < 0.05) throw new Error('blazed grating');
  rows.push(`profiles: trapezoid (equal fills) and pixel map = lamellar; flip mirrors the slices; sinus Nz = 10/20/40: T(−1) ${sinR.map((v) => v.toFixed(5)).join(' → ')}; blazed T(−1) ${rb.T[14].toFixed(3)} vs T(+1) ${rb.T[16].toFixed(3)}`);

  // (h) through the graph: SPR by grating coupling; the dip tends to the analytic angle for shallow gratings
  const sp = gratingSprExample();
  const slib = makeLibrary(sp.materials);
  const sev = evaluateHeadless(sp.nodes, sp.edges, slib);
  for (const [id, r] of sev.results) if (r.errors.length) throw new Error(`SPR grating example ${id}: ${r.errors}`);
  const so = sev.results.get('rc')!.outs.out;
  const sds = so?.type === 'data' ? so.dataset! : null;
  if (!sds || !sds.fields.R_m1 || !sds.spec?.rcwa) throw new Error('Compute RCWA output');
  const sm = Object.fromEntries([...slib].map(([id, dd]) => [id, dd.model]));
  const nAu = refractiveIndex('Au', sm, 633);
  // same point directly
  const thv = sds.axes.at(-1)!.values;
  const k0 = 40;
  const direct = rcwaPoint([{ n: c(1), d: 0 }, { d: 40, segs: [{ from: 0, to: 0.25, n: c(1) }, { from: 0.25, to: 0.75, n: nAu }, { from: 0.75, to: 1, n: c(1) }] }, { n: nAu, d: 0 }], 500, 633, thv[k0], 'p', 15);
  const eG = Math.max(Math.abs(direct.Rtot - sds.fields.R[k0]), Math.abs(direct.R[14] - sds.fields.R_m1[k0]));
  if (eG > 1e-12) throw new Error(`graph RCWA vs direct: ${eG}`);
  const epsAu = cmulC(nAu, nAu);
  const nsp = csqrt(cdiv(epsAu, cadd(epsAu, c(1)))).re;
  const thA = (Math.asin(633 / 500 - nsp) * 180) / Math.PI;
  const dip = (depth: number) => {
    let best = 0;
    let rmin = 9;
    for (let th = 11; th <= 13.5; th += 0.01) {
      const r = rcwaPoint([{ n: c(1), d: 0 }, { d: depth, segs: [{ from: 0, to: 0.25, n: c(1) }, { from: 0.25, to: 0.75, n: nAu }, { from: 0.75, to: 1, n: c(1) }] }, { n: nAu, d: 0 }], 500, 633, th, 'p', 15).Rtot;
      if (r < rmin) [rmin, best] = [r, th];
    }
    return best;
  };
  const d5 = dip(5);
  const d2 = dip(2);
  if (!(Math.abs(d2 - thA) < 0.05 && Math.abs(d2 - thA) < Math.abs(d5 - thA))) throw new Error(`grating SPR vs analytic: ${d5}, ${d2}, ${thA}`);
  rows.push(`grating SPR: graph = direct RCWA (${eG.toExponential(1)}); dip at depth 5 / 2 nm: ${d5.toFixed(2)}° / ${d2.toFixed(2)}° → analytic ${thA.toFixed(2)}°`);

  // (i) period sweep through the graph = separate computations; Draw grating sees the layer; Reverse flips it
  const sweepNodes: AppNode[] = [
    ...sp.nodes.filter((n) => n.id !== 'fm'),
    { id: 'sw', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'Λ', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: '480, 520' } },
    { id: 'rev', type: 'reverse', position: { x: 0, y: 0 }, data: { name: '', swapMedia: false } },
  ];
  const sweepEdges = [...sp.edges.filter((e) => e.target !== 'fm'), { id: 'x1', source: 'sw', sourceHandle: 'out', target: 'gr', targetHandle: 'period' }, { id: 'x2', source: 'stack', sourceHandle: 'out', target: 'rev', targetHandle: 'in' }];
  const wev = evaluateHeadless(sweepNodes, sweepEdges, slib);
  const wo = wev.results.get('rc')!.outs.out;
  const wds = wo?.type === 'data' ? wo.dataset! : null;
  const nth = thv.length;
  let eS = 0;
  [480, 520].forEach((P, k) => {
    const r = rcwaPoint([{ n: c(1), d: 0 }, { d: 40, segs: [{ from: 0, to: 0.25, n: c(1) }, { from: 0.25, to: 0.75, n: nAu }, { from: 0.75, to: 1, n: c(1) }] }, { n: nAu, d: 0 }], P, 633, thv[k0], 'p', 15).Rtot;
    eS = Math.max(eS, Math.abs(r - wds!.fields.R[k * nth + k0]));
  });
  const dgi = wev.results.get('dg')!.info as DrawGratingInfo;
  const rv = wev.results.get('rev')!.outs.out;
  if (eS > 1e-12 || dgi.layers.length !== 1 || dgi.source !== 'gr' || rv?.type !== 'stack' || !rv.stack.layers[0].grating?.flip) throw new Error(`period sweep / draw grating / reverse: ${eS}`);
  rows.push(`period sweep through the graph = separate runs (${eS.toExponential(1)}); Draw grating finds the layer; Reverse flips it`);

  // (j) RCWA field map node: job from the evaluator, result shown once stored with the same key
  const fev = evaluateHeadless(sp.nodes, sp.edges, slib).results.get('fm')!;
  const fi = fev.info as RcwaFieldInfo;
  if (!fi.job || fi.map || Math.abs(fi.theta.value - thv[Array.from(sds.fields.R).reduce((k, v, j, R) => (v < R[k] ? j : k), 0)]) > 1e-9) throw new Error('field map job');
  const st = rcwaLayersAt(fi.job.spec, fi.job.idx, fi.job.lam);
  const sol = rcwaSolve(st.layers, st.period, fi.job.lam, fi.job.theta, fi.job.pol, fi.job.spec.rcwa!.orders);
  const map = fieldMap(sol, st.layers, st.period, fi.job.pol, { quantity: fi.job.quantity, part: fi.job.part, periods: fi.job.periods, nx: 40, nz: 40, zIn: fi.job.zIn, zOut: fi.job.zOut });
  fieldResults.set('fm', { key: fi.key, map, period: st.period });
  const fo = evaluateHeadless(sp.nodes, sp.edges, slib).results.get('fm')!;
  const fds = fo.outs.out;
  if (fds?.type !== 'data' || !fds.dataset || fds.dataset.axes[1].id !== 'x') throw new Error('field map output');
  // a Field profile node cuts the map along z at the chosen x: ridge (Au) at x = Λ/2, groove (Air) at x = 0
  const cutAt = (xi: number) => {
    const nodes: AppNode[] = [...sp.nodes, { id: 'fp', type: 'field', position: { x: 0, y: 0 }, data: { ...FIELD_DEFAULTS, at: { x: xi } } }];
    const edges = [...sp.edges, { id: 'c1', source: 'fm', sourceHandle: 'out', target: 'fp', targetHandle: 'in' }];
    return evaluateHeadless(nodes, edges, slib).results.get('fp')!;
  };
  const nxm = map.xs.length;
  const iRidge = map.xs.findIndex((x) => x >= st.period / 2);
  const cR = cutAt(iRidge);
  const cG = cutAt(0);
  const ci = cR.info as FieldInfo;
  const co = cR.outs.out;
  if (cR.errors.length || co?.type !== 'data' || !co.dataset) throw new Error(`profile cut of the RCWA map: ${cR.errors}`);
  let eCut = 0;
  map.zs.forEach((_, r) => (eCut = Math.max(eCut, Math.abs(co.dataset!.fields.f[r] - map.values[r * nxm + iRidge]))));
  const bandAt = (inf: FieldInfo, zmid: number) => inf.bands.find((b) => zmid >= b.lo && zmid < b.hi)?.label;
  const lR = bandAt(ci, 20);
  const lG = bandAt(cG.info as FieldInfo, 20);
  if (eCut > 0 || lR !== 'Au' || lG !== 'Air') throw new Error(`map cut: ${eCut}, bands ${lR} / ${lG}`);
  rows.push(`Field profile cut of the RCWA map at x = ${ci.rcwa!.x.toFixed(0)} nm = map column (${eCut}); grating band at the cut: ${lR} (ridge) / ${lG} (groove)`);
  fieldResults.delete('fm');
  const peak = Math.max(...map.values);
  rows.push(`RCWA field map at the dip (${fi.point}): max |E|²/|E₀|² = ${peak.toFixed(1)} (plasmon enhancement)`);
  if (!(peak > 5)) throw new Error('no field enhancement at the grating SPR dip');

  // (k) optimization through RCWA (GMR filter) and tolerance with grating errors
  const gp = gmrExample();
  const glib = makeLibrary(gp.materials);
  const gev = evaluateHeadless(gp.nodes, gp.edges, glib);
  const gvars = (gev.results.get('opt')!.info as OptimizerInfo).variables;
  const gbox: Box = { lo: gvars.map((v) => v.min), hi: gvars.map((v) => v.max), integer: gvars.map(() => false) };
  const gf = (x: number[]) => meritOf(gp.nodes, gp.edges, glib, gvars, ['zones'], x).merit;
  const gt = new Tracker(fromScalar(gf), gbox);
  const tg0 = performance.now();
  await nelderMead(gt, gbox, gvars.map((v) => v.value), { iterations: 25, step: 0.1 }, { stopped: () => false, waitIfPaused: async () => {}, report: () => {} });
  const m0 = gf(gvars.map((v) => v.value));
  if (!(gt.best < m0 - 0.05)) throw new Error('GMR optimization did not improve');
  // the optimizer outputs re-run Compute RCWA with the optimized values
  const grun = { id: 'r1', algorithm: 'nm' as const, started: 0, seconds: 1, evaluations: gt.evaluations, merit: gt.best, values: Object.fromEntries(gvars.map((v, i) => [v.id, gt.bestX[i]])), names: {}, history: [], stopped: false };
  const gopt = evaluateHeadless(gp.nodes.map((n) => (n.type === 'optimizer' ? ({ ...n, data: { ...n.data, runs: [grun] } } as AppNode) : n)), gp.edges, glib).results.get('opt')!;
  const gout = gopt.outs.out;
  const gst = gopt.outs.stack;
  if (gout?.type !== 'data' || !gout.dataset?.spec?.rcwa || gst?.type !== 'stack' || Math.abs(gst.stack.layers[0].grating!.period - gt.bestX[0]) > 1e-9) throw new Error('optimizer outputs with Compute RCWA');
  rows.push(`GMR optimization (RCWA inside the optimizer): merit ${m0.toFixed(3)} → ${gt.best.toFixed(3)} in ${gt.evaluations} evaluations (${((performance.now() - tg0) / 1000).toFixed(1)} s)`);

  const tn: AppNode[] = [...sp.nodes.filter((n) => n.id !== 'fm'), { id: 'tol', type: 'tolerance', position: { x: 0, y: 0 }, data: { ...TOLERANCE_DEFAULTS, samples: 20, thickness: false, grating: true, fillSigma: 0.03, periodSigma: 5 } }];
  const te = [...sp.edges.filter((e) => e.target !== 'fm'), { id: 't1', source: 'rc', sourceHandle: 'out', target: 'tol', targetHandle: 'in' }];
  const tr = evaluateHeadless(tn, te, slib).results.get('tol')!;
  if (tr.errors.length) throw new Error(`tolerance on RCWA: ${tr.errors}`);
  const terr = tr.outs.errors;
  const tsm = tr.outs.samples;
  if (terr?.type !== 'data' || tsm?.type !== 'data' || !terr.dataset || !tsm.dataset) throw new Error('tolerance RCWA outputs');
  const s5 = 5;
  const gfE = terr.dataset.fields.gf0[s5];
  const gpE = terr.dataset.fields.gp[s5];
  const fillS = 0.5 + gfE;
  const r5 = rcwaPoint([{ n: c(1), d: 0 }, { d: 40, segs: [{ from: 0, to: 0.5 - fillS / 2, n: c(1) }, { from: 0.5 - fillS / 2, to: 0.5 + fillS / 2, n: nAu }, { from: 0.5 + fillS / 2, to: 1, n: c(1) }] }, { n: nAu, d: 0 }], 500 + gpE, 633, thv[k0], 'p', 15).Rtot;
  const eTol = Math.abs(r5 - tsm.dataset.fields.R[s5 * nth + k0]);
  if (eTol > 1e-12) throw new Error(`tolerance grating sample not reproduced (${eTol})`);
  const top = (tr.info as ToleranceInfo).ranking[0];
  rows.push(`tolerance with grating errors: sample reproduced from its fill / period errors (${eTol.toExponential(1)}); most critical: ${top.label} (${(100 * top.share).toFixed(0)} %)`);
  // Run / Stop: with `armed` (the app), Compute RCWA asks for no job until Run arms its key
  const arm: JobState = { cache: new Map(), lastDone: new Map(), failed: new Map(), armed: new Map() };
  const rcJobs = () => evaluateGraph(sp.nodes, sp.edges, arm, slib).jobs.filter((j) => j.requester === 'rc');
  const e0 = evaluateGraph(sp.nodes, sp.edges, arm, slib);
  const job0 = (e0.results.get('rc')!.info as ComputeInfo).job;
  if (e0.jobs.some((j) => j.requester === 'rc') || job0?.state !== 'idle') throw new Error('Compute RCWA started without Run');
  arm.armed!.set('rc', job0.key);
  const [j1] = rcJobs();
  if (!j1 || j1.key !== job0.key) throw new Error('Run did not start Compute RCWA');
  arm.armed!.delete('rc');
  if (rcJobs().length) throw new Error('Stop did not cancel the job');
  const f1 = runSpec(j1.spec);
  arm.cache.set(j1.key, { key: j1.key, spec: j1.spec, axes: j1.axes, fields: f1, meta: metaOfSpec(j1.spec), size: f1.R.length });
  arm.lastDone.set('rc', j1.key);
  const sp2 = sp.nodes.map((n) => (n.type === 'rcwa' ? ({ ...n, data: { ...n.data, orders: n.data.orders + 1 } } as AppNode) : n));
  const e2 = evaluateGraph(sp2, sp.edges, arm, slib).results.get('rc')!;
  const o2 = e2.outs.out;
  if ((e2.info as ComputeInfo).job?.state !== 'stale' || o2?.type !== 'data' || o2.dataset?.key !== j1.key) throw new Error('changed inputs: the previous result should stay, marked stale');
  // convergence check: the values at N are the grid values; the change against 2N shrinks with N
  {
    const spec = (e0.results.get('rc')!.info as ComputeInfo).spec!;
    const grid = runRcwa(spec).R;
    const pts = convergencePoints(grid.length, 16, [0, grid.length - 1]);
    const Ns = convergenceOrders(spec.rcwa!.orders);
    const cr = rcwaConvergence(spec, pts, Ns);
    const eGrid = Math.max(...pts.map((k, i) => Math.abs(cr[0].R[i] - grid[k])));
    const dev = convDeviation(cr);
    if (eGrid > 1e-13 || Ns.join() !== '15,23,30' || !(dev[0] > dev[1] && dev[2] === 0)) throw new Error(`convergence check: ${eGrid}, ${Ns}, ${dev}`);
    rows.push(`convergence check (grating SPR, ${pts.length} points): N = ${Ns.join(' / ')} → max |ΔR|, |ΔT| vs 2N ${dev[0].toExponential(1)} / ${dev[1].toExponential(1)}; values at N = the computed grid (${eGrid.toExponential(1)})`);
  }
  rows.push('Compute RCWA Run / Stop: no job before Run, job after Run, cancelled by Stop; changed inputs keep the previous result (stale)');
  console.log(rows.join('\n'));
}

// ---- Layer list (View Stack, Draw grating): every real layer, periodic blocks expanded, grating geometry and slices ----
{
  const dp = dbrExample();
  const dst = (evaluateHeadless(dp.nodes, dp.edges, makeLibrary(dp.materials)).results.get('draw')!.info as { stack: StackValue }).stack;
  const dl = layerList(dst);
  const real = dst.layers.filter((L) => !L.pad);
  const films = dl.rows.filter((r) => /^\d+$/.test(r.no));
  const sumD = real.reduce((a, L) => a + L.d, 0);
  const periodic = films.filter((r) => /period \d+ of \d+/.test(r.details)).length;
  const csv = layerListCsv(dl).trim().split(/\n/);
  const tsv = layerListTsv(dl).trim().split(/\n/);
  if (films.length !== real.length || dl.count !== real.length || Math.abs(dl.total - sumD) > 1e-9 || !periodic || csv.length !== dl.rows.length + 2 || tsv[0].split(/\t/).length !== 5)
    throw new Error('layer list of the DBR example');
  if (dl.rows[0].no !== 'in' || dl.rows[dl.rows.length - 1].no !== 'out') throw new Error('layer list: media');
  const gp = gratingSprExample();
  const gst = (evaluateHeadless(gp.nodes, gp.edges, makeLibrary(gp.materials)).results.get('dg')!.info as { stack?: StackValue }).stack;
  const gl = gst && layerList(gst);
  const gr = gl?.rows.find((r) => r.material.startsWith('ridge'));
  if (!gl || !gr || !/lamellar.*period 500 nm.*fill 0\.5 \(ridge 250 nm\)/.test(gr.details) || gr.d !== 40) throw new Error(`layer list of the grating example: ${JSON.stringify(gr)}`);
  // a trapezoid: one sub-row per slice, thicknesses summing to the depth, segments covering the period
  const gL = gst!.layers.find((L) => L.grating)!;
  const trap = { ...gL, grating: { ...gL.grating!, profile: 'trapezoid' as const, fill: 0.6, fillTop: 0.3, slices: 5 } };
  const tl = layerList({ layers: [trap] });
  const subs = tl.rows.filter((r) => r.sub);
  if (subs.length !== 5 || Math.abs(subs.reduce((a, r) => a + r.d!, 0) - trap.d) > 1e-9 || !subs.every((r) => /0–.* nm.*–500 nm$/.test(r.details))) throw new Error(`layer list of a trapezoid: ${JSON.stringify(subs[0])}`);
  console.log(`layer list: DBR example ${dl.count} layers (${periodic} in periodic blocks), total ${dl.total.toFixed(1)} nm = Σ d; CSV ${csv.length} lines, TSV 5 columns; grating “${gr.details}”; trapezoid → ${subs.length} slices, Σ = depth`);
}

// ---- Porous material filled by its neighbour: BK7 / porous Au / water with the water index swept (sensitivity) ----
{
  const models = {
    bk7: { type: 'constant', n: 1.515, k: 0 },
    au: { type: 'constant', n: 0.18, k: 3.4 },
    air: { type: 'constant', n: 1, k: 0 },
    water: { type: 'constant', n: 1.33, k: 0 },
    w134: { type: 'constant', n: 1.34, k: 0 },
    pAu: { type: 'ema', method: 'bruggeman', host: 'au', filler: 'air', porosity: 0.3 }, // library filler: air
    pAuW: { type: 'ema', method: 'bruggeman', host: 'au', filler: 'water', porosity: 0.3 }, // reference: water 1.33
    pAuW4: { type: 'ema', method: 'bruggeman', host: 'au', filler: 'w134', porosity: 0.3 }, // reference: water 1.34
  } as unknown as TmmSpec['models'];
  const spec = (fill?: 'prev' | 'next'): TmmSpec => ({
    models,
    instances: { bk7: { lib: 'bk7' }, pAu: { lib: 'pAu', ...(fill ? { fill } : {}) }, water: { lib: 'water', n: { s: [0], v: [1.33, 1.34] } } },
    layers: [
      { mat: 'bk7', d: 0, dn: 0, bind: {} },
      { mat: 'pAu', d: 45, dn: 0, bind: {} },
      { mat: 'water', d: 0, dn: 0, bind: {} },
    ],
    lambda: [633],
    theta: [70],
    pol: 'p',
    sweeps: [2],
  });
  const n = (s: TmmSpec, step: number) => layersAt(s, [step], 633)[1].n;
  const ref = (id: string) => refractiveIndex(id, models, 633);
  const dz = (a: { re: number; im: number }, b: { re: number; im: number }) => Math.hypot(a.re - b.re, a.im - b.im);
  const e0 = dz(n(spec('next'), 0), ref('pAuW'));
  const e1 = dz(n(spec('next'), 1), ref('pAuW4'));
  const lib = dz(n(spec(), 1), ref('pAu')); // default: the library filler, the water sweep does not reach the gold
  const moved = dz(n(spec('next'), 1), n(spec('next'), 0));
  // RCWA uses the same indices for the plain layers
  const eR = dz(rcwaLayersAt(spec('next'), [1], 633).layers[1].n, ref('pAuW4'));
  if (!(e0 < 1e-12 && e1 < 1e-12 && lib < 1e-12 && moved > 1e-4 && eR < 1e-12)) throw new Error(`porous filler: ${e0} ${e1} ${lib} ${moved} ${eR}`);
  console.log(`porous Au filled by the next layer (water swept 1.33 → 1.34): ñ = EMA with that water at every step (${Math.max(e0, e1).toExponential(1)}), moves by ${moved.toFixed(4)}; library filler unchanged; RCWA same (${eR.toExponential(1)})`);
}

// ---- Tolerance criteria: a Min / max node's metric recomputed on every Monte Carlo sample, pass / fail on it ----
{
  const tp = toleranceExample();
  const evalWith = (max: number) => {
    const nodes = [
      ...tp.nodes.map((n) => (n.id === 'tol' ? ({ ...n, data: { ...n.data, samples: 60, spec: false, criteria: [{ source: 'mn', field: 'y', min: NaN, max }, { source: 'mn', field: 'x', min: NaN, max: NaN }] } } as AppNode) : n)),
      { id: 'mn', type: 'extremum', position: { x: 0, y: 0 }, data: { ...ANALYSIS_DEFAULTS.extremum, lo: 450, hi: 650 } } as AppNode,
    ];
    const edges = [...tp.edges, { id: 'e-tmm-mn', source: 'tmm', sourceHandle: 'out', target: 'mn', targetHandle: 'in' }, { id: 'e-mn-tol', source: 'mn', sourceHandle: 'metrics', target: 'tol', targetHandle: 'criteria' }];
    const r = evaluateHeadless(nodes, edges, makeLibrary(tp.materials)).results.get('tol')!;
    return { r, ti: r.info as ToleranceInfo };
  };
  const first = evalWith(NaN); // statistics only: no condition, no yield
  const c0 = first.ti.criteria?.[0];
  const row0 = c0?.rows.find((x) => x.index === 0);
  const samples = first.r.outs.samples?.type === 'data' ? first.r.outs.samples.dataset : null;
  if (first.r.errors.length || !c0 || c0.error || !row0 || !samples || Number.isFinite(first.ti.yieldPct)) throw new Error(`tolerance criteria: ${first.r.errors} ${c0?.error} ${first.ti.yieldPct}`);
  // the metric of each sample ≈ the minimum of R in 450–650 nm of that sample's curve (Min / max refines between points)
  const sAx = samples.axes.findIndex((a) => a.id === 'sample');
  const lAx = samples.axes.findIndex((a) => a.id === 'lambda');
  const xs = samples.axes[lAx].values;
  const st = strides(samples.axes);
  let worst = 0;
  row0.values.forEach((v, s) => {
    let m = Infinity;
    xs.forEach((x, i) => {
      if (x >= 450 && x <= 650) m = Math.min(m, samples.fields.R[s * st[sAx] + i * st[lAx]]);
    });
    worst = Math.max(worst, Math.abs(v - m));
  });
  // a limit at the median: about half the samples pass
  const limit = [...row0.values].sort((a, b) => a - b)[30];
  const { ti } = evalWith(limit);
  const passN = ti.pass.reduce((a, b) => a + b, 0);
  const expect = row0.values.filter((v) => v <= limit).length;
  if (!(worst < 1e-4 && row0.values.length === 60 && passN === expect && expect > 10 && expect < 50 && Math.abs(ti.yieldPct - (100 * expect) / 60) < 1e-9 && ti.where && ti.specWhere))
    throw new Error(`tolerance criteria: worst ${worst}, pass ${passN} vs ${expect}, yield ${ti.yieldPct}`);
  console.log(`tolerance criteria: Min/max (R min, 450–650 nm) recomputed on 60 samples ≈ grid minimum (${worst.toExponential(1)}); R_min ≤ ${limit.toPrecision(3)} → yield ${ti.yieldPct.toFixed(1)} % (${passN} = direct count); nominal ${row0.nominal}, samples ${row0.mean.toPrecision(3)} ± ${row0.std.toPrecision(2)}`);
}

// ---- Tolerance criterion from a Sensitivity node: S recomputed on every sample (its n + Δn run over the samples) ----
{
  const sp = sprExample();
  const lib = makeLibrary(sp.materials);
  const tolNode = { id: 'tol', type: 'tolerance', position: { x: 0, y: 0 }, data: { ...TOLERANCE_DEFAULTS, samples: 24, seed: 7, thickness: true, dMode: 'rel', dSigma: 4, dSys: 0, index: false, angle: false, spec: false, criteria: [{ source: 'sens', field: 'S', min: NaN, max: NaN }] } } as AppNode;
  const withTol = (limit: number) => ({
    nodes: [...sp.nodes, { ...tolNode, data: { ...tolNode.data, criteria: [{ source: 'sens', field: 'S', min: limit, max: NaN }] } } as AppNode],
    edges: [...sp.edges, { id: 'e-tmm-tol', source: 'tmm', sourceHandle: 'out', target: 'tol', targetHandle: 'in' }, { id: 'e-sens-tol', source: 'sens', sourceHandle: 'metrics', target: 'tol', targetHandle: 'criteria' }],
  });
  const g0 = withTol(NaN);
  const r0 = evaluateHeadless(g0.nodes, g0.edges, lib).results.get('tol')!;
  const t0 = r0.info as ToleranceInfo;
  const row = t0.criteria?.[0]?.rows[0];
  const errs = r0.outs.errors?.type === 'data' ? r0.outs.errors.dataset : null;
  if (r0.errors.length || !row || !errs || row.values.length !== 24 || !row.values.every(Number.isFinite)) throw new Error(`tolerance sensitivity: ${r0.errors} ${t0.criteria?.[0]?.error}`);
  // sample 1 on its own: the SPR example with the Ag thickness of that sample → its Sensitivity S
  const d1 = errs.fields.d0[0];
  const one = sp.nodes.map((n) => (n.id === 'ag' ? ({ ...n, data: { ...n.data, thickness: d1 } } as AppNode) : n));
  const sOne = evaluateHeadless(one, sp.edges, lib).results.get('sens')!;
  const sm = sOne.outs.metrics?.type === 'data' ? sOne.outs.metrics.dataset : null;
  const direct = sm?.fields.S[0] ?? NaN;
  const eOne = Math.abs(direct - row.values[0]) / Math.abs(direct);
  // a limit at the median of S
  const limit = [...row.values].sort((a, b) => a - b)[12];
  const g1 = withTol(limit);
  const t1 = evaluateHeadless(g1.nodes, g1.edges, lib).results.get('tol')!.info as ToleranceInfo;
  const passN = t1.pass.reduce((a, b) => a + b, 0);
  const expect = row.values.filter((v) => v >= limit).length;
  if (!(eOne < 1e-9 && row.std > 0 && passN === expect)) throw new Error(`tolerance sensitivity: sample 1 ${row.values[0]} vs direct ${direct}; pass ${passN} vs ${expect}`);
  console.log(`tolerance criterion Sensitivity: S on 24 samples (Ag ±4 %), sample 1 = direct Sensitivity with its thickness (${eOne.toExponential(1)}); S ${row.mean.toPrecision(4)} ± ${row.std.toPrecision(2)} ${row.unit} (nominal ${row.nominal}); S ≥ median → ${passN}/24`);
}

// ---- Conical RCWA: checks that do not rely on Reticolo ----
if (full('conical RCWA without Reticolo (50 s)')) {
  const cz = (z: [number, number]) => c(z[0], z[1]);
  const toL = (rc: (typeof RETICOLO_CASES)[number]): RcwaLayer[] => [
    { n: cz(rc.top), d: 0 },
    ...rc.layers.map((q) => (q.segs ? { d: q.d, segs: q.segs.map((g) => ({ from: g.from, to: g.to, n: cz(g.n) })) } : q.eps ? { d: q.d, eps: q.eps.map(cz) } : { d: q.d, n: cz(q.n!) })),
    { n: cz(rc.bottom), d: 0 },
  ];
  const ph = (z: { re: number; im: number }) => Math.atan2(z.im, z.re);
  const dAng = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // 1) φ = 0: the conical system splits into the planar TE / TM problems — every planar Reticolo case, both
  //    polarizations, all orders, and the phases of the zeroth orders; no polarization conversion
  let e1 = 0;
  let p1 = 0;
  let x1 = 0;
  for (const rc of RETICOLO_CASES.filter((q) => q.phi === undefined))
    for (const pol of ['s', 'p'] as const) {
      const L = toL(rc);
      const a = rcwaConical(L, rc.period, rc.lam, rc.theta, 0, pol, rc.N);
      const b = rcwaSolve(L, rc.period, rc.lam, rc.theta, pol, rc.N).result;
      for (let i = 0; i < a.R.length; i++) e1 = Math.max(e1, Math.abs(a.R[i] - b.R[i]), Math.abs(a.T[i] - b.T[i]));
      x1 = Math.max(x1, ...(pol === 's' ? [...a.RTM, ...a.TTM] : [...a.RTE, ...a.TTE]));
      const [ra, ta] = pol === 's' ? [a.r0.te, a.t0.te] : [a.r0.tm, a.t0.tm];
      const rb = c(b.r[0][rc.N], b.r[1][rc.N]);
      const tb = c(b.t[0][rc.N], b.t[1][rc.N]);
      if (Math.hypot(rb.re, rb.im) > 1e-6) p1 = Math.max(p1, dAng(ph(ra), ph(rb)));
      if (Math.hypot(tb.re, tb.im) > 1e-6) p1 = Math.max(p1, dAng(ph(ta), ph(tb)));
    }
  if (!(e1 < 1e-10 && p1 < 1e-8 && x1 < 1e-20)) throw new Error(`conical at φ = 0 vs planar: |Δη| ${e1}, phase ${p1}, conversion ${x1}`);

  // 2) no grating: the azimuth does not matter — R, T = TMM (absorbing films, total internal reflection), no conversion
  const films: RcwaLayer[] = [{ n: c(1.515), d: 0 }, { n: c(3.1, 3.3), d: 2 }, { n: c(0.056, 4.28), d: 48 }, { n: c(2.1), d: 10 }, { n: c(1.33), d: 0 }];
  let e2 = 0;
  let x2 = 0;
  for (const th of [0, 40, 70])
    for (const phi of [0, 30, 77, 180, -123])
      for (const pol of ['s', 'p'] as const) {
        const a = rcwaConical(films, 500, 633, th, phi, pol, 3);
        const t = tmmPoint(films as never, 633, th, pol);
        e2 = Math.max(e2, Math.abs(a.Rtot - t.R), Math.abs(a.Ttot - t.T));
        x2 = Math.max(x2, ...(pol === 's' ? [...a.RTM, ...a.TTM] : [...a.RTE, ...a.TTE]));
      }
  if (!(e2 < 1e-12 && x2 < 1e-24)) throw new Error(`conical films vs TMM: ${e2}, conversion ${x2}`);

  // 3) lossless structures: R + T = 1 at random θ, φ (two dielectric gratings and films)
  const lossless: RcwaLayer[] = [
    { n: c(1), d: 0 },
    { d: 150, segs: [{ from: 0, to: 0.35, n: c(2.4) }, { from: 0.35, to: 1, n: c(1) }] },
    { n: c(1.46), d: 60 },
    { d: 90, segs: [{ from: 0, to: 0.1, n: c(2.1) }, { from: 0.1, to: 0.7, n: c(1.46) }, { from: 0.7, to: 1, n: c(2.1) }] },
    { n: c(1.52), d: 0 },
  ];
  const rnd3 = rngOpt(11);
  let e3 = 0;
  for (let k = 0; k < 12; k++) {
    const th = 70 * rnd3();
    const phi = 360 * rnd3() - 180;
    for (const pol of ['s', 'p'] as const) {
      const a = rcwaConical(lossless, 400, 633, th, phi, pol, 12);
      e3 = Math.max(e3, Math.abs(a.Rtot + a.Ttot - 1));
    }
  }
  if (e3 > 1e-11) throw new Error(`conical energy balance: ${e3}`);

  // 4) reciprocity of the specular order on an asymmetric, lossy grating (a metal echelette): φ ↔ φ + 180°, the
  //    co-polarized R equal, TE → TM equal to TM → TE.  5) mirror y → −y: φ ↔ −φ, every order and its TE / TM parts
  const steps = 8;
  const ech: RcwaLayer[] = [
    { n: c(1), d: 0 },
    ...Array.from({ length: steps }, (_, i) => ({ d: 12, segs: [{ from: 0, to: 1 - (i + 1) / (steps + 1), n: c(1) }, { from: 1 - (i + 1) / (steps + 1), to: 1, n: c(0.5, 2) }] })),
    { n: c(0.5, 2), d: 0 },
  ];
  let e4 = 0;
  let e5 = 0;
  const N4 = 15;
  for (const [th, phi] of [
    [25, 35],
    [50, 110],
    [10, -60],
  ]) {
    const s1 = rcwaConical(ech, 600, 633, th, phi, 's', N4);
    const p1r = rcwaConical(ech, 600, 633, th, phi, 'p', N4);
    const s2 = rcwaConical(ech, 600, 633, th, phi + 180, 's', N4);
    const p2 = rcwaConical(ech, 600, 633, th, phi + 180, 'p', N4);
    e4 = Math.max(e4, Math.abs(s1.RTE[N4] - s2.RTE[N4]), Math.abs(p1r.RTM[N4] - p2.RTM[N4]), Math.abs(s1.RTM[N4] - p2.RTE[N4]), Math.abs(p1r.RTE[N4] - s2.RTM[N4]));
    for (const pol of ['s', 'p'] as const) {
      const a = rcwaConical(ech, 600, 633, th, phi, pol, N4);
      const b = rcwaConical(ech, 600, 633, th, -phi, pol, N4);
      for (const k of ['RTE', 'RTM', 'TTE', 'TTM'] as const) a[k].forEach((v, i) => (e5 = Math.max(e5, Math.abs(v - b[k][i]))));
    }
  }
  if (!(e4 < 1e-10 && e5 < 1e-12)) throw new Error(`conical reciprocity ${e4}, mirror ${e5}`);

  // 6) convergence with the orders: metal grating (Li / Granet) in TM at φ = 45°
  const li: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 1, segs: [{ from: 0, to: 0.5, n: c(0.22, 6.71) }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(0.22, 6.71), d: 0 }];
  const Rn = [10, 20, 40, 80].map((N) => rcwaConical(li, 1, 1, 30, 45, 'p', N).R[N]);
  const dN = Rn.slice(0, 3).map((v) => Math.abs(v - Rn[3]));
  if (!(dN[0] > dN[1] && dN[1] > dN[2] && dN[2] < 1e-3)) throw new Error(`conical convergence: ${Rn}`);

  // 7) surface plasmon coupled by a shallow gold grating (Λ = 500 nm, 5 nm deep, λ = 633 nm) under conical incidence:
  //    from the absorption peak of unpolarized light at each φ, the plasmon index n_eff = |k∥ − K x̂| (order −1) must be
  //    the same for every φ (the plasmon does not know the azimuth) and ≈ Re √(ε/(ε + 1)) (a shallow grating)
  const au = refractiveIndex('Au', models, 633);
  const epsAu = CX.mul(au, au);
  const nspp = CX.sqrt(CX.div(epsAu, CX.add(epsAu, c(1)))).re;
  const g = 633 / 500;
  const thetaSpp = (phi: number) => {
    const f = (phi * Math.PI) / 180;
    return (Math.asin(g * Math.cos(f) - Math.sqrt(nspp ** 2 - (g * Math.sin(f)) ** 2)) * 180) / Math.PI;
  };
  const spp: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 5, segs: [{ from: 0, to: 0.5, n: au }, { from: 0.5, to: 1, n: c(1) }] }, { n: au, d: 0 }];
  const Run = (th: number, phi: number) => rcwaConical(spp, 500, 633, th, phi, 's', 15).Rtot + rcwaConical(spp, 500, 633, th, phi, 'p', 15).Rtot;
  const dip = (phi: number) => {
    const t0 = thetaSpp(phi);
    let best = t0;
    let rb = Infinity;
    for (let th = t0 - 1; th <= t0 + 1; th += 0.02) {
      const r = Run(th, phi);
      if (r < rb) [rb, best] = [r, th];
    }
    const [a, b, cc] = [Run(best - 0.02, phi), rb, Run(best + 0.02, phi)];
    return { theta: best + (0.02 * (a - cc)) / (2 * (a - 2 * b + cc)), Rmin: rb / 2 };
  };
  const rows7 = [0, 15, 30, 45].map((phi) => {
    const d = dip(phi);
    const st = Math.sin((d.theta * Math.PI) / 180);
    const f = (phi * Math.PI) / 180;
    return { phi, ...d, analytic: thetaSpp(phi), neff: Math.hypot(st * Math.cos(f) - g, st * Math.sin(f)) };
  });
  const nMean = rows7.reduce((a, r) => a + r.neff, 0) / rows7.length;
  const spread = Math.max(...rows7.map((r) => Math.abs(r.neff - nMean)));
  const depthSpread = Math.max(...rows7.map((r) => Math.abs(r.Rmin - rows7[0].Rmin)));
  if (!(spread < 3e-4 && Math.abs(nMean - nspp) < 3e-3 && depthSpread < 0.01)) throw new Error(`conical SPR coupling: ${JSON.stringify(rows7)} n_spp ${nspp}`);

  console.log(
    `conical RCWA: φ = 0 = planar on every planar case (|Δη| ${e1.toExponential(1)}, phases ${p1.toExponential(1)}, no conversion); films = TMM at any φ (${e2.toExponential(1)}); ` +
      `lossless R + T = 1 (${e3.toExponential(1)}); reciprocity φ ↔ φ + 180° incl. TE ↔ TM conversion (${e4.toExponential(1)}), mirror φ ↔ −φ (${e5.toExponential(1)}); ` +
      `metal TM at 45°: |ΔR| vs N = 80: ${dN.map((v) => v.toExponential(1)).join(' / ')} (N = 10 / 20 / 40); ` +
      `SPR on a 5 nm gold grating, unpolarized, φ = ${rows7.map((r) => `${r.phi}°: ${r.theta.toFixed(2)}° (analytic ${r.analytic.toFixed(2)}°)`).join(', ')} → n_eff ${nMean.toFixed(5)} ± ${spread.toExponential(1)} for every φ, Re √(ε/(ε+1)) = ${nspp.toFixed(5)}`,
  );
}

// ---- Conical RCWA through the graph: Compute RCWA with φ (a value, a Sweep), TE / TM outputs, unsupported cases ----
if (full('conical RCWA through the graph (50 s)')) {
  const gp = gratingSprExample();
  const glib = makeLibrary(gp.materials);
  const withRc = (patch: object, extraNodes: AppNode[] = [], extraEdges: typeof gp.edges = []) => {
    const nodes = [...gp.nodes.map((n) => (n.id === 'rc' ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n)), ...extraNodes];
    return evaluateHeadless(nodes, [...gp.edges, ...extraEdges], glib);
  };
  // φ = 20° on the node: the dataset has the TE / TM parts, their sum is the total, the values are the direct ones
  const ev1 = withRc({ phi: 20 });
  const o1 = ev1.results.get('rc')!.outs.out;
  const ds1 = o1?.type === 'data' ? o1.dataset : null;
  if (!ds1?.spec?.rcwa?.conical || !ds1.fields.R_TE || !ds1.fields.R_p1_TM) throw new Error(`conical Compute RCWA: ${ev1.results.get('rc')!.errors}`);
  const sp1 = ds1.spec;
  const st1 = rcwaLayersAt(sp1, [], sp1.lambda[0]);
  let eSum = 0;
  let eDirect = 0;
  for (let k = 0; k < ds1.size; k++) {
    const f = ds1.fields;
    eSum = Math.max(eSum, Math.abs(f.R_TE[k] + f.R_TM[k] - f.R[k]), Math.abs(f.T_TE[k] + f.T_TM[k] - f.T[k]), Math.abs(f.R_m1_TE[k] + f.R_m1_TM[k] - f.R_m1[k]));
    if (k % 60 === 0) {
      const r = rcwaConical(st1.layers, st1.period, sp1.lambda[0], sp1.theta[k], 20, sp1.pol, sp1.rcwa!.orders);
      eDirect = Math.max(eDirect, Math.abs(r.Rtot - f.R[k]), Math.abs(r.RTE[sp1.rcwa!.orders - 1] - f.R_m1_TE[k]), Math.abs(r.RTM[sp1.rcwa!.orders] - f.R_0_TM[k]));
    }
  }
  // the field map and the field profile refuse conical incidence with a message
  const fmInfo = ev1.results.get('fm')!.info as RcwaFieldInfo;
  if (!(eSum < 1e-12 && eDirect < 1e-12 && fmInfo.conical && fmInfo.job?.phi === 20)) throw new Error(`conical graph: sum ${eSum}, direct ${eDirect}, field map job φ ${fmInfo.job?.phi}`);

  // φ from a Sweep (0°, 20°): a φ axis; at φ = 0 all in the incident polarization (TM), at 20° = the node value case
  const sw: AppNode = { id: 'phs', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'φ', kind: 'number', mode: 'list', min: 0, max: 20, step: 20, list: '0, 20' } } as AppNode;
  const ev2 = withRc({}, [sw], [{ id: 'e-phs-rc', source: 'phs', sourceHandle: 'out', target: 'rc', targetHandle: 'phi' }]);
  const o2 = ev2.results.get('rc')!.outs.out;
  const ds2 = o2?.type === 'data' ? o2.dataset : null;
  if (!ds2 || ds2.axes[0].id !== 'sweep:phs' || !ds2.fields.R_TM) throw new Error(`conical φ sweep: ${ev2.results.get('rc')!.errors}`);
  const nTh = ds2.axes[ds2.axes.length - 1].values.length;
  let e0 = 0;
  let e20 = 0;
  const f2 = ds2.fields;
  for (let j = 0; j < nTh; j++) {
    e0 = Math.max(e0, Math.abs(f2.R_TM[j] - f2.R[j]), f2.R_TE[j], f2.T_TE[j]);
    e20 = Math.max(e20, Math.abs(f2.R[nTh + j] - ds1.fields.R[j]), Math.abs(f2.R_TE[nTh + j] - ds1.fields.R_TE[j]));
  }
  if (!(e0 < 1e-15 && e20 < 1e-15)) throw new Error(`conical φ sweep: φ = 0 split ${e0}, φ = 20 vs node value ${e20}`);

  // the azimuth does not change a planar job (φ = 0: no TE / TM fields, the planar solver)
  const ev3 = withRc({ phi: 0 });
  const o3 = ev3.results.get('rc')!.outs.out;
  const ds3 = o3?.type === 'data' ? o3.dataset : null;
  if (!ds3 || ds3.spec?.rcwa?.conical || ds3.fields.R_TE) throw new Error('φ = 0 must keep the planar job');

  // a thick substrate with φ ≠ 0: computed per (order, polarization) channel, = the direct conical thick solve
  const ev4 = evaluateHeadless(
    [...gp.nodes.map((n) => (n.id === 'rc' ? ({ ...n, data: { ...n.data, phi: 10 } } as AppNode) : n.id === 'stack' ? ({ ...n, data: { ...n.data, thick: true, dSub: 1 } } as AppNode) : n))],
    gp.edges,
    glib,
  );
  const o4 = ev4.results.get('rc')!.outs.out;
  const ds4 = o4?.type === 'data' ? o4.dataset : null;
  if (!ds4?.spec?.back || !ds4.fields.R_TE) throw new Error(`conical + thick substrate: ${ev4.results.get('rc')!.errors}`);
  const f4 = rcwaLayersAt(ds4.spec, [], 633);
  const b4 = rcwaLayersAt(ds4.spec, [], 633, ds4.spec.back.layers);
  let eThick = 0;
  for (const k of [0, 90, 180]) {
    const r = rcwaThickConical(f4.layers, b4.layers, ds4.spec.back.d, f4.period, 633, ds4.spec.theta[k], 10, ds4.spec.pol, ds4.spec.rcwa!.orders);
    eThick = Math.max(eThick, Math.abs(r.Rtot - ds4.fields.R[k]), Math.abs(ds4.fields.R_TE[k] + ds4.fields.R_TM[k] - ds4.fields.R[k]));
  }
  if (eThick > 1e-12) throw new Error(`conical + thick substrate through the graph: ${eThick}`);
  console.log(`Compute RCWA with φ = 20°: R_TE + R_TM = R, orders too (${eSum.toExponential(1)}), = direct conical RCWA (${eDirect.toExponential(1)}); φ Sweep 0 / 20°: φ = 0 all TM (${e0.toExponential(1)}), 20° = node value (${e20.toExponential(1)}); φ = 0 keeps the planar job; the field map job carries φ; thick substrate at φ = 10° = direct (${eThick.toExponential(1)})`);
}
// Check convergence of Compute RCWA at φ ≠ 0: the same points as the job at the job's N (the azimuth is used)
if (full('conical convergence check (15 s)')) {
  const gp = gratingSprExample();
  const ev = evaluateHeadless(gp.nodes.map((n) => (n.id === 'rc' ? ({ ...n, data: { ...n.data, phi: 25 } } as AppNode) : n)), gp.edges, makeLibrary(gp.materials));
  const o = ev.results.get('rc')!.outs.out;
  const ds = o?.type === 'data' ? o.dataset : null;
  if (!ds?.spec) throw new Error('conical convergence: no dataset');
  const rows = rcwaConvergence(ds.spec, [0, 120, 250], [ds.spec.rcwa!.orders]);
  const e = Math.max(...[0, 120, 250].map((k, i) => Math.abs(rows[0].R[i] - ds.fields.R[k])));
  if (e > 1e-12) throw new Error(`conical convergence check: ${e}`);
  console.log(`Check convergence at φ = 25°: the points of the job reproduced at its N (${e.toExponential(1)})`);
}
// The conical SPR example: the dip of each φ (Min / max) follows the matching condition, TE appears only at φ ≠ 0
if (full('conical SPR example (50 s)')) {
  const cp = conicalSprExample();
  const ev = evaluateHeadless(cp.nodes, cp.edges, makeLibrary(cp.materials));
  const bad = [...ev.results].filter(([, r]) => r.errors.length).map(([id, r]) => `${id}: ${r.errors[0]}`);
  const m = ev.results.get('dip')!.outs.metrics;
  const o = ev.results.get('rc')!.outs.out;
  if (bad.length || m?.type !== 'data' || !m.dataset || o?.type !== 'data' || !o.dataset) throw new Error(`conical SPR example: ${bad.join('; ')}`);
  const au = refractiveIndex('Au', models, 633);
  const e = CX.mul(au, au);
  const nsp = CX.sqrt(CX.div(e, CX.add(e, c(1)))).re;
  const g = 633 / 500;
  const phis = [0, 15, 30, 45];
  const an = phis.map((p) => (Math.asin(g * Math.cos((p * Math.PI) / 180) - Math.sqrt(nsp ** 2 - (g * Math.sin((p * Math.PI) / 180)) ** 2)) * 180) / Math.PI);
  const got = phis.map((_, i) => m.dataset!.fields.x[i]);
  const off = got.map((v, i) => v - an[i]);
  const f = o.dataset.fields;
  const nTh = o.dataset.axes[o.dataset.axes.length - 1].values.length;
  const te = phis.map((_, i) => Math.max(...Array.from(f.R_TE.slice(i * nTh, (i + 1) * nTh))));
  const fmi = ev.results.get('fm')!.info as RcwaFieldInfo;
  if (!(fmi.conical && fmi.job?.phi === 30 && Math.abs(fmi.theta.value - got[2]) < 0.1 && (fmi.point.match(/φ/g) ?? []).length === 1)) throw new Error(`conical SPR example: field map at φ ${fmi.job?.phi}, θ ${fmi.theta.value}`);
  if (!(off.every((d) => d < 0 && d > -0.5) && te[0] === 0 && te[3] > 1e-4)) throw new Error(`conical SPR example: dips ${got} vs ${an}, R into TE ${te}`);
  console.log(`conical SPR example: dips ${got.map((v) => v.toFixed(2)).join(' / ')}° vs analytic ${an.map((v) => v.toFixed(2)).join(' / ')}° (shallow-grating shift ${Math.min(...off).toFixed(2)}…${Math.max(...off).toFixed(2)}°); max R into TE ${te.map((v) => v.toExponential(1)).join(' / ')} for φ = 0 / 15 / 30 / 45°`);
}

// ---- Conical RCWA fields vs RETICOLO res3: the six complex components at points of every region ----
{
  const fref = JSON.parse(readFileSync(new URL('./reference/reticolo-fields.json', import.meta.url), 'utf8')) as { reticolo: string; results: Record<string, { z: number; x: number; f: [number, number][] }[]> };
  const cz = (z: [number, number]) => c(z[0], z[1]);
  const rows: string[] = [];
  let worstAll = 0;
  let points = 0;
  for (const fc of RETICOLO_FIELD_CASES) {
    const rc = RETICOLO_CASES.find((q) => q.id === fc.case)!;
    const L: RcwaLayer[] = [{ n: cz(rc.top), d: 0 }, ...rc.layers.map((q) => (q.segs ? { d: q.d, segs: q.segs.map((g) => ({ from: g.from, to: g.to, n: cz(g.n) })) } : q.eps ? { d: q.d, eps: q.eps.map(cz) } : { d: q.d, n: cz(q.n!) })), { n: cz(rc.bottom), d: 0 }];
    const sol = conicalSolve(L, rc.period, rc.lam, rc.theta, rc.phi!, rc.pol, rc.N);
    const regions = conicalRegions(sol, L);
    const bounds = [0];
    for (const q of rc.layers) bounds.push(bounds[bounds.length - 1] + q.d);
    const total = bounds[bounds.length - 1];
    const tol = 1e-9 * (total + 2 * fc.margin);
    const ours: CX.C[][] = [];
    const theirs: CX.C[][] = [];
    for (const p of fref.results[fc.case]) {
      // Reticolo z (up from the bottom of the drawing) → our depth; points on an interface are skipped (two values)
      const z = fc.margin + total - p.z;
      if (bounds.some((b) => Math.abs(z - b) < tol)) continue;
      let reg = 0;
      let zl = z * sol.k0;
      if (z > 0) {
        let j = 0;
        while (j < rc.layers.length && z > bounds[j + 1]) j++;
        reg = j < rc.layers.length ? j + 1 : rc.layers.length + 1;
        zl = (z - bounds[Math.min(j, rc.layers.length)]) * sol.k0;
      }
      const f = conicalFieldsAt(sol, L, rc.period, regions, reg, zl, [p.x])[0];
      ours.push([f.Ex, f.Ey, f.Ez, f.Hx, f.Hy, f.Hz]);
      // the mirror z → −z: E (Ex, Ey, −Ez), H a pseudovector (−Hx, −Hy, Hz)
      const g = p.f.map(cz);
      theirs.push([g[0], g[1], CX.mul(c(-1), g[2]), CX.mul(c(-1), g[3]), CX.mul(c(-1), g[4]), g[5]]);
    }
    // one complex factor (the normalization and phase origin of the incident wave): the largest component of the first
    // point above the structure
    let ri = 0;
    theirs[0].forEach((v, k) => CX.abs2(v) > CX.abs2(theirs[0][ri]) && (ri = k));
    const alpha = CX.div(theirs[0][ri], ours[0][ri]);
    let scale = 0;
    let worst = 0;
    theirs.forEach((row, i) =>
      row.forEach((v, k) => {
        scale = Math.max(scale, Math.sqrt(CX.abs2(v)));
        worst = Math.max(worst, Math.sqrt(CX.abs2(CX.sub(CX.mul(ours[i][k], alpha), v))));
      }),
    );
    const rel = worst / scale;
    worstAll = Math.max(worstAll, rel);
    points += ours.length;
    rows.push(`${fc.case} ${ours.length} pts ${rel.toExponential(1)}`);
  }
  if (worstAll > 1e-8) throw new Error(`conical fields vs Reticolo res3: ${rows.join(', ')}`);
  console.log(`conical RCWA fields = RETICOLO ${fref.reticolo} res3 at ${points} points (Ex … Hz, relative to the largest component): ${rows.join(', ')}`);
}

// ---- Conical field maps: φ = 0 = planar maps, films = TMM profiles, continuity, through the graph ----
if (full('conical field maps (45 s)')) {
  const out: string[] = [];
  // 1) φ = 0: every component, |E|², |H|² = the planar map; the components of the other polarization vanish
  const G: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 40, segs: [{ from: 0, to: 0.5, n: c(0.18, 3.4) }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(2.3, 0.01), d: 30 }, { n: c(1.52), d: 0 }];
  const grid = { part: 're' as const, periods: 2, nx: 29, nz: 31, zIn: 200, zOut: 150 };
  let e1 = 0;
  let z1 = 0;
  for (const pol of ['s', 'p'] as const) {
    const planar = rcwaSolve(G, 500, 633, 20, pol, 12);
    const con = conicalSolve(G, 500, 633, 20, 0, pol, 12);
    for (const q of (pol === 's' ? ['Ey', 'Hx', 'Hz', 'E2', 'H2'] : ['Hy', 'Ex', 'Ez', 'E2', 'H2']) as FieldQuantity[]) {
      const a = fieldMap(planar, G, 500, pol, { ...grid, quantity: q });
      const b = conicalFieldMap(con, G, 500, pol, { ...grid, quantity: q });
      a.values.forEach((v, i) => (e1 = Math.max(e1, Math.abs(v - b.values[i]))));
    }
    for (const q of (pol === 's' ? ['Ex', 'Ez', 'Hy'] : ['Ey', 'Hx', 'Hz']) as FieldQuantity[]) conicalFieldMap(con, G, 500, pol, { ...grid, part: 'abs', quantity: q }).values.forEach((v) => (z1 = Math.max(z1, v)));
  }
  if (!(e1 < 1e-10 && z1 === 0)) throw new Error(`conical map at φ = 0 vs planar: ${e1}, other polarization ${z1}`);
  out.push(`φ = 0 maps = planar (${e1.toExponential(1)}, other polarization 0)`);

  // 2) films at φ ≠ 0: |E|² = the TMM profile of the same polarization (the azimuth only turns the plane of incidence)
  const Ls: RcwaLayer[] = [{ n: c(1.52), d: 0 }, { n: c(0.056, 4.28), d: 48 }, { n: c(2.2, 0.01), d: 120 }, { n: c(1.33), d: 0 }];
  let e2 = 0;
  for (const phi of [35, 70])
    for (const pol of ['s', 'p'] as const) {
      const fm = conicalFieldMap(conicalSolve(Ls, 400, 633, 50, phi, pol, 3), Ls, 400, pol, { quantity: 'E2', part: 'abs', periods: 1, nx: 5, nz: 81, zIn: 100, zOut: 150 });
      const prof = fieldProfile(Ls.map((L) => ({ n: L.n!, d: L.d })), 633, 50, pol, fm.zs, layerOfZ(Ls.map((L) => L.d), fm.zs));
      fm.zs.forEach((_, k) => (e2 = Math.max(e2, Math.abs(fm.values[k * 5 + 2] - prof.E2[k]))));
    }
  if (e2 > 1e-10) throw new Error(`conical film map vs TMM profile: ${e2}`);
  out.push(`films at φ = 35 / 70° = TMM |E|² profile (${e2.toExponential(1)})`);

  // 3) continuity across the interfaces at φ = 30°: Ey, hx, hy, hz everywhere, Ex between uniform layers
  let e3 = 0;
  for (const pol of ['s', 'p'] as const) {
    const sol = conicalSolve(G, 500, 633, 20, 30, pol, 12);
    const reg = conicalRegions(sol, G);
    const xs = [37, 123, 310, 444];
    const k0 = sol.k0;
    for (const [ra, za, rb, withEx] of [
      [0, 0, 1, false],
      [1, 40 * k0, 2, false],
      [2, 30 * k0, 3, true],
    ] as const) {
      const A = conicalFieldsAt(sol, G, 500, reg, ra, za, xs);
      const B = conicalFieldsAt(sol, G, 500, reg, rb, 0, xs);
      A.forEach((f, i) => {
        for (const k of withEx ? (['Ex', 'Ey', 'Hx', 'Hy', 'Hz'] as const) : (['Ey', 'Hx', 'Hy', 'Hz'] as const)) e3 = Math.max(e3, Math.sqrt(CX.abs2(CX.sub(f[k], B[i][k]))));
      });
    }
  }
  if (e3 > 1e-11) throw new Error(`conical field continuity: ${e3}`);
  out.push(`tangential E, H continuous across the interfaces (${e3.toExponential(1)})`);

  // 4) through the graph: a field map of the grating SPR example at φ = 20° (the job carries φ, all six components)
  const gp = gratingSprExample();
  const glib = makeLibrary(gp.materials);
  const nodes = gp.nodes.map((n) => (n.id === 'rc' ? ({ ...n, data: { ...n.data, phi: 20 } } as AppNode) : n.id === 'fm' ? ({ ...n, data: { ...n.data, quantity: 'comp', component: 'Hx', part: 'abs' } } as AppNode) : n));
  const fi = evaluateHeadless(nodes, gp.edges, glib).results.get('fm')!.info as RcwaFieldInfo;
  if (!fi.job || fi.job.phi !== 20 || !fi.conical || fi.job.quantity !== 'Hx') throw new Error(`conical field map job: ${JSON.stringify(fi.job && { phi: fi.job.phi, q: fi.job.quantity })}`);
  const { map, period } = fieldMapOfJob(fi.job, { nx: 21, nz: 25 });
  const st = rcwaLayersAt(fi.job.spec, fi.job.idx, fi.job.lam);
  const sol = conicalSolve(st.layers, st.period, fi.job.lam, fi.job.theta, 20, fi.job.pol, fi.job.spec.rcwa!.orders);
  const reg = conicalRegions(sol, st.layers);
  // a point in the grating layer: map value = |Hx| from the direct field
  const iz = map.zs.findIndex((z) => z > 5 && z < 35);
  const direct = conicalFieldsAt(sol, st.layers, st.period, reg, 1, map.zs[iz] * sol.k0, map.xs).map((f) => Math.sqrt(CX.abs2(f.Hx)));
  const e4 = Math.max(...direct.map((v, i) => Math.abs(v - map.values[iz * map.xs.length + i])));
  fieldResults.set('fm', { key: fi.key, map, period });
  const fo = evaluateHeadless(nodes, gp.edges, glib).results.get('fm')!;
  const cut = evaluateHeadless(nodes, gp.edges, glib).results.get('cut')!;
  fieldResults.delete('fm');
  if (!(e4 < 1e-12 && fo.outs.out?.type === 'data' && fo.outs.out.dataset && !cut.errors.length)) throw new Error(`conical field map through the graph: ${e4}, ${fo.errors}, cut ${cut.errors}`);
  out.push(`through the graph: the job carries φ, |Hx| map = direct (${e4.toExponential(1)}), the Field profile cuts it`);
  // 5) a window of the map (x and z): its points are points of the whole map, with the same values (conical and planar)
  let e5 = 0;
  for (const job of [fi.job, (evaluateHeadless(gp.nodes, gp.edges, glib).results.get('fm')!.info as RcwaFieldInfo).job!]) {
    const whole = fieldMapOfJob({ ...job, periods: 1, nx: 41, nz: 41, zIn: 200, zOut: 200 }).map;
    const win = fieldMapOfJob({ ...job, periods: 1, nx: 11, nz: 17, zIn: 200, zOut: 200, x0: whole.xs[10], x1: whole.xs[20], z0: whole.zs[8], z1: whole.zs[24] }).map;
    const top = Math.max(...whole.values);
    win.zs.forEach((_, r) => win.xs.forEach((_, cI) => (e5 = Math.max(e5, Math.abs(win.values[r * 11 + cI] - whole.values[(8 + r) * 41 + 10 + cI]) / top))));
  }
  if (!(e5 < 1e-9)) throw new Error(`field map window: ${e5}`);
  out.push(`a window (x and z, conical and planar) = the whole map at the same points (${e5.toExponential(1)})`);
  console.log(`conical field maps: ${out.join('; ')}`);
}
// Conical fast path (uniform layers as 2×2 blocks per order) = the dense solve, on every conical Reticolo case and on
// stacks of many films with and without a grating
{
  const cz = (z: [number, number]) => c(z[0], z[1]);
  const g = (f: number, a: number, b: number): RcwaLayer => ({ d: 100, segs: [{ from: 0, to: f, n: c(a) }, { from: f, to: 1, n: c(b) }] });
  const films: RcwaLayer[] = Array.from({ length: 20 }, (_, i) => ({ n: c(i % 2 ? 1.46 : 2.3, i === 7 ? 0.02 : 0), d: 60 + i }));
  const cases: [RcwaLayer[], number, number, number, number, number][] = [
    [[{ n: c(1), d: 0 }, g(0.5, 2.4, 1), ...films, { n: c(1.52), d: 0 }], 500, 633, 25, 37, 10],
    [[{ n: c(1), d: 0 }, ...films, { n: c(1.52), d: 0 }], 500, 633, 25, 37, 10],
    [[{ n: c(1), d: 0 }, ...films.slice(0, 5), g(0.3, 0.18, 1), ...films.slice(5, 9), g(0.6, 1.46, 2.3), { n: c(3.5, 0.01), d: 0 }], 450, 700, 40, -65, 8],
    ...RETICOLO_CASES.filter((q) => q.phi !== undefined && !q.layers.some((l) => l.eps)).map((rc): [RcwaLayer[], number, number, number, number, number] => [
      [{ n: cz(rc.top), d: 0 }, ...rc.layers.map((q) => (q.segs ? { d: q.d, segs: q.segs.map((s) => ({ from: s.from, to: s.to, n: cz(s.n) })) } : q.eps ? { d: q.d, eps: q.eps.map(cz) } : { d: q.d, n: cz(q.n!) })), { n: cz(rc.bottom), d: 0 }],
      rc.period,
      rc.lam,
      rc.theta,
      rc.phi!,
      rc.N,
    ]),
  ];
  let e = 0;
  for (const [L, P, lam, th, phi, N] of cases)
    for (const pol of ['s', 'p'] as const) {
      const a = rcwaConical(L, P, lam, th, phi, pol, N);
      const b = conicalSolve(L, P, lam, th, phi, pol, N).result;
      for (const k of ['RTE', 'RTM', 'TTE', 'TTM'] as const) a[k].forEach((v, i) => (e = Math.max(e, Math.abs(v - b[k][i]))));
      e = Math.max(e, Math.hypot(a.r0.te.re - b.r0.te.re, a.r0.te.im - b.r0.te.im), Math.hypot(a.t0.tm.re - b.t0.tm.re, a.t0.tm.im - b.t0.tm.im));
    }
  if (e > 1e-12) throw new Error(`conical fast path vs dense: ${e}`);
  console.log(`conical fast path (uniform layers as 2×2 blocks per order) = dense solve on ${cases.length} structures × 2 polarizations (efficiencies, TE / TM parts, zeroth-order amplitudes): ${e.toExponential(1)}`);
}
// Conical incidence on a thick incoherent substrate: channels (order, polarization)
{
  let e1 = 0;
  for (const pol of ['s', 'p'] as const)
    for (const th of [0, 30, 60])
      for (const phi of [0, 25, 80])
        for (const nS of [c(1.52), c(1.52, 2e-5), c(3.5, 1e-3)]) {
          const front: RcwaLayer[] = [{ n: c(1), d: 0 }, { n: c(2.3), d: 80 }, { n: c(1.46, 1e-3), d: 120 }, { n: nS, d: 0 }];
          const back: RcwaLayer[] = [{ n: nS, d: 0 }, { n: c(0.2, 3), d: 20 }, { n: c(1.33), d: 0 }];
          const t = incoherentPoint(front as never, back as never, 1e6, 633, th, pol);
          const r = rcwaThickConical(front, back, 1e6, 500, 633, th, phi, pol, 0);
          e1 = Math.max(e1, Math.abs(t.R - r.Rtot), Math.abs(t.T - r.Ttot));
        }
  const g: RcwaLayer = { d: 150, segs: [{ from: 0, to: 0.35, n: c(2.4) }, { from: 0.35, to: 1, n: c(1) }] };
  let e2 = 0;
  for (const pol of ['s', 'p'] as const) {
    const front: RcwaLayer[] = [{ n: c(1), d: 0 }, g, { n: c(1.52, 1e-5), d: 0 }];
    const back: RcwaLayer[] = [{ n: c(1.52, 1e-5), d: 0 }, g, { n: c(1), d: 0 }];
    const a = rcwaThickConical(front, back, 5e5, 500, 633, 20, 0, pol, 8);
    const b = rcwaThickPoint(front, back, 5e5, 500, 633, 20, pol, 8);
    a.R.forEach((v, i) => (e2 = Math.max(e2, Math.abs(v - b.R[i]), Math.abs(a.T[i] - b.T[i]))));
  }
  let e3 = 0;
  let e4 = 0;
  for (const pol of ['s', 'p'] as const)
    for (const phi of [20, 55]) {
      const front: RcwaLayer[] = [{ n: c(1), d: 0 }, g, { n: c(1.52), d: 0 }];
      const back: RcwaLayer[] = [{ n: c(1.52), d: 0 }, g, { n: c(1), d: 0 }];
      const a = rcwaThickConical(front, back, 5e5, 500, 633, 20, phi, pol, 8);
      e3 = Math.max(e3, Math.abs(a.Rtot + a.Ttot - 1));
      const m = rcwaThickConical(front, [{ n: c(1.52), d: 0 }, { n: c(1.52), d: 0 }], 5e5, 500, 633, 20, phi, pol, 8);
      const s = rcwaConical(front, 500, 633, 20, phi, pol, 8);
      m.RTE.forEach((v, i) => (e4 = Math.max(e4, Math.abs(v - s.RTE[i]), Math.abs(m.RTM[i] - s.RTM[i]), Math.abs(m.TTE[i] - s.TTE[i]), Math.abs(m.TTM[i] - s.TTM[i]))));
    }
  if (!(e1 < 1e-12 && e2 < 1e-12 && e3 < 1e-11 && e4 < 1e-12)) throw new Error(`conical thick substrate: TMM ${e1}, planar ${e2}, balance ${e3}, matched ${e4}`);
  console.log(`conical thick substrate (channels order × polarization): no grating = TMM incoherent at any θ, φ (${e1.toExponential(1)}); φ = 0 = planar thick (${e2.toExponential(1)}); lossless R + T = 1 (${e3.toExponential(1)}); index-matched back = semi-infinite, TE / TM parts (${e4.toExponential(1)})`);
}
// Tolerance with azimuth errors (RCWA): every sample computed at its own φ = direct conical RCWA at that φ
if (full('tolerance with azimuth errors (RCWA, 110 s)')) {
  const gp = gratingSprExample();
  const tol: AppNode = { id: 'tol', type: 'tolerance', position: { x: 0, y: 0 }, data: { ...TOLERANCE_DEFAULTS, samples: 8, seed: 5, thickness: false, index: false, angle: false, azimuth: true, phiSigma: 3, spec: false } } as AppNode;
  const ev = evaluateHeadless([...gp.nodes, tol], [...gp.edges, { id: 'e-rc-tol', source: 'rc', sourceHandle: 'out', target: 'tol', targetHandle: 'in' }], makeLibrary(gp.materials));
  const r = ev.results.get('tol')!;
  const smp = r.outs.samples?.type === 'data' ? r.outs.samples.dataset : null;
  const er = r.outs.errors?.type === 'data' ? r.outs.errors.dataset : null;
  const ti = r.info as ToleranceInfo;
  if (r.errors.length || !smp || !er?.fields.dphi || !ti.ranking.some((q) => q.label === 'azimuth φ')) throw new Error(`tolerance azimuth: ${r.errors}`);
  const spec = smp.spec!;
  const st = rcwaLayersAt(spec, [0], 633);
  const nTh = spec.theta.length;
  let e = 0;
  for (const s of [0, 3, 7])
    for (const k of [0, 127, 250]) {
      const direct = rcwaConical(st.layers, st.period, 633, spec.theta[k], er.fields.dphi[s], spec.pol, spec.rcwa!.orders).Rtot;
      e = Math.max(e, Math.abs(direct - smp.fields.R[s * nTh + k]));
    }
  const sd = Math.sqrt(Array.from(er.fields.dphi).reduce((a, v) => a + v * v, 0) / 8);
  if (e > 1e-12) throw new Error(`tolerance azimuth: sample vs direct ${e}`);
  console.log(`Tolerance with azimuth errors (σ = 3°, RMS of the drawn φ ${sd.toFixed(2)}°): each sample = conical RCWA at its φ (${e.toExponential(1)}); “azimuth φ” in the ranking`);
}
// Incident polarization as a Jones state (ψ, δ): ψ = 0 / 90° = TM / TE, orthogonal pairs average to unpolarized, no
// interference at φ = 0, energy, fields = the superposition, thick substrate the same checks
{
  const G: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 120, segs: [{ from: 0, to: 0.4, n: c(2.4) }, { from: 0.4, to: 1, n: c(1) }] }, { n: c(1.46), d: 70 }, { d: 60, segs: [{ from: 0.2, to: 0.7, n: c(0.18, 3.4) }, { from: 0, to: 0.2, n: c(1) }, { from: 0.7, to: 1, n: c(1) }] }, { n: c(1.52), d: 0 }];
  const run = (phi: number, pol: 's' | 'p' | { psi: number; delta: number }) => rcwaConical(G, 500, 633, 28, phi, pol, 10);
  const keys = ['RTE', 'RTM', 'TTE', 'TTM'] as const;
  const diff = (a: ReturnType<typeof run>, b: ReturnType<typeof run>) => Math.max(...keys.flatMap((k) => Array.from(a[k], (v, i) => Math.abs(v - b[k][i]))));
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;
  for (const phi of [0, 35, -70]) {
    const s = run(phi, 's');
    const p = run(phi, 'p');
    e1 = Math.max(e1, diff(run(phi, { psi: 0, delta: 0 }), p), diff(run(phi, { psi: 90, delta: 0 }), s));
    for (const [d1, d2] of [
      [0, 180],
      [90, -90],
    ]) {
      const a = run(phi, { psi: 45, delta: d1 });
      const b = run(phi, { psi: 45, delta: d2 });
      e2 = Math.max(e2, ...keys.flatMap((k) => Array.from(a[k], (v, i) => Math.abs((v + b[k][i]) / 2 - (s[k][i] + p[k][i]) / 2))));
    }
    if (phi === 0)
      for (const [psi, delta] of [
        [30, 0],
        [60, 77],
      ]) {
        const m = run(0, { psi, delta });
        const [cc, ss] = [Math.cos((psi * Math.PI) / 180) ** 2, Math.sin((psi * Math.PI) / 180) ** 2];
        e3 = Math.max(e3, ...Array.from(m.R, (v, i) => Math.abs(v - (cc * p.R[i] + ss * s.R[i]))), ...Array.from(m.T, (v, i) => Math.abs(v - (cc * p.T[i] + ss * s.T[i]))));
      }
  }
  // circular light at φ ≠ 0 differs from unpolarized (interference of the TE and TM responses)
  const circ = run(35, { psi: 45, delta: 90 });
  const unp = (run(35, 's').Rtot + run(35, 'p').Rtot) / 2;
  const interference = Math.abs(circ.Rtot - unp);
  // lossless: R + T = 1 for an elliptical state
  const L2: RcwaLayer[] = [G[0], G[1], G[2], { d: 60, segs: [{ from: 0.2, to: 0.7, n: c(2.1) }, { from: 0, to: 0.2, n: c(1) }, { from: 0.7, to: 1, n: c(1) }] }, G[4]];
  const el = rcwaConical(L2, 500, 633, 28, 50, { psi: 33, delta: 61 }, 10);
  const e4 = Math.abs(el.Rtot + el.Ttot - 1);
  // fields: the Jones state = cos ψ · (TM wave of unit power) + sin ψ e^{iδ} · (TE wave of unit power)
  const psi = 33;
  const delta = 61;
  const kz0 = Math.cos((28 * Math.PI) / 180);
  const solJ = conicalSolve(G, 500, 633, 28, 50, { psi, delta }, 10);
  const solS = conicalSolve(G, 500, 633, 28, 50, 's', 10);
  const solP = conicalSolve(G, 500, 633, 28, 50, 'p', 10);
  const [rJ, rS, rP] = [solJ, solS, solP].map((sl) => conicalRegions(sl, G));
  const ca = CX.mul(CX.exp(c(0, (delta * Math.PI) / 180)), c(Math.sin((psi * Math.PI) / 180) / Math.sqrt(kz0))); // TE amplitude (unit power)
  const cp = c(Math.cos((psi * Math.PI) / 180) / Math.sqrt(kz0)); // TM (ε₀ = 1)
  let e5 = 0;
  for (const [reg, z] of [
    [0, -0.4],
    [1, 0.5],
    [3, 0.3],
    [4, 0.7],
  ] as const) {
    const xs = [40, 210, 380];
    const fj = conicalFieldsAt(solJ, G, 500, rJ, reg, z, xs);
    const fs = conicalFieldsAt(solS, G, 500, rS, reg, z, xs);
    const fp = conicalFieldsAt(solP, G, 500, rP, reg, z, xs);
    fj.forEach((f, i) => {
      for (const k of ['Ex', 'Ey', 'Ez', 'Hx', 'Hy', 'Hz'] as const) e5 = Math.max(e5, Math.sqrt(CX.abs2(CX.sub(f[k], CX.add(CX.mul(ca, fs[i][k]), CX.mul(cp, fp[i][k]))))));
    });
  }
  // thick substrate: ψ = 0 / 90° = TM / TE, orthogonal pair = unpolarized
  const back: RcwaLayer[] = [{ n: c(1.52, 1e-5), d: 0 }, { d: 80, segs: [{ from: 0, to: 0.5, n: c(2.4) }, { from: 0.5, to: 1, n: c(1) }] }, { n: c(1), d: 0 }];
  const front: RcwaLayer[] = [...G.slice(0, -1), { n: c(1.52, 1e-5), d: 0 }];
  const th = (pol: 's' | 'p' | { psi: number; delta: number }) => rcwaThickConical(front, back, 5e5, 500, 633, 28, 35, pol, 8);
  const [ts, tp] = [th('s'), th('p')];
  const [ta, tb] = [th({ psi: 45, delta: 90 }), th({ psi: 45, delta: -90 })];
  const e6 = Math.max(Math.abs(th({ psi: 0, delta: 0 }).Rtot - tp.Rtot), Math.abs(th({ psi: 90, delta: 0 }).Ttot - ts.Ttot), Math.abs((ta.Rtot + tb.Rtot) / 2 - (ts.Rtot + tp.Rtot) / 2), Math.abs((ta.Ttot + tb.Ttot) / 2 - (ts.Ttot + tp.Ttot) / 2));
  if (!(e1 < 1e-12 && e2 < 1e-12 && e3 < 1e-12 && interference > 1e-4 && e4 < 1e-11 && e5 < 1e-11 && e6 < 1e-12))
    throw new Error(`Jones incidence: TE/TM ${e1}, unpolarized ${e2}, φ = 0 ${e3}, interference ${interference}, balance ${e4}, fields ${e5}, thick ${e6}`);
  console.log(
    `Jones incidence (ψ, δ): ψ = 0 / 90° = TM / TE (${e1.toExponential(1)}); orthogonal pairs (±45° linear, both circulars) average to unpolarized (${e2.toExponential(1)}); ` +
      `φ = 0: R = cos²ψ R_p + sin²ψ R_s for any δ (${e3.toExponential(1)}); at φ = 35° circular ≠ unpolarized by ${interference.toExponential(1)} (TE–TM interference); lossless R + T = 1 (${e4.toExponential(1)}); ` +
      `fields = cos ψ TM + sin ψ e^{iδ} TE (${e5.toExponential(1)}); thick substrate: TE / TM limits and unpolarized pairs (${e6.toExponential(1)})`,
  );
}
// Compute RCWA with a Jones polarization: = direct conical solve with that state, TE / TM parts, no phases; the field map
// job carries the state (all six components)
if (full('Jones polarization in Compute RCWA (21 s)')) {
  const gp = gratingSprExample();
  const lib = makeLibrary(gp.materials);
  let e = 0;
  for (const phi of [0, 20]) {
    const nodes = gp.nodes.map((n) => (n.id === 'rc' ? ({ ...n, data: { ...n.data, phi, polMix: { psi: 45, delta: 90 } } } as AppNode) : n));
    const ev = evaluateHeadless(nodes, gp.edges, lib);
    const o = ev.results.get('rc')!.outs.out;
    const ds = o?.type === 'data' ? o.dataset : null;
    if (!ds?.spec?.rcwa?.jones || !ds.fields.R_TE) throw new Error(`Jones through the graph: ${ev.results.get('rc')!.errors}`);
    const st = rcwaLayersAt(ds.spec, [], 633);
    for (const k of [0, 130, 260]) {
      const r = rcwaConical(st.layers, st.period, 633, ds.spec.theta[k], phi, { psi: 45, delta: 90 }, ds.spec.rcwa!.orders);
      e = Math.max(e, Math.abs(r.Rtot - ds.fields.R[k]), Math.abs(ds.fields.R_TE[k] + ds.fields.R_TM[k] - ds.fields.R[k]));
      if (!Number.isNaN(ds.fields.phiR[k])) throw new Error('Jones: no phase expected');
    }
    const fi = ev.results.get('fm')!.info as RcwaFieldInfo;
    if (!fi.conical || !fi.job?.jones || !/ψ = 45°, δ = 90°/.test(fi.point)) throw new Error(`Jones field map job: ${fi.point}`);
  }
  if (e > 1e-12) throw new Error(`Jones through the graph: ${e}`);
  console.log(`Compute RCWA with a Jones state (ψ 45°, δ 90°) at φ = 0 / 20° = direct conical solve (${e.toExponential(1)}), R_TE + R_TM = R, no phases; the field map job carries the state`);
}
// Anisotropic layers (Berreman 4×4) — checks independent of Reticolo: isotropic tensor = isotropic layer (with a
// grating too); optic axis along x at normal incidence = TMM with n_e (TM) / n_o (TE); a λ-plate at 45° = Jones
// calculus; energy balance and reciprocity (with a grating); convergence in N of a grating on a tilted nematic layer
{
  const no = c(1.53);
  const ne = c(1.71);
  let e1 = 0;
  const g: RcwaLayer = { d: 120, segs: [{ from: 0, to: 0.5, n: c(2.1) }, { from: 0.5, to: 1, n: c(1) }] };
  for (const [th, phi, N] of [
    [0, 0, 0],
    [35, 40, 0],
    [65, -70, 0],
    [20, 30, 8],
  ])
    for (const pol of ['s', 'p'] as const) {
      const iso: RcwaLayer[] = [{ n: c(1.5), d: 0 }, ...(N ? [g] : []), { n: c(0.2, 3.3), d: 30 }, { n: c(2.1, 0.02), d: 150 }, { n: c(1.33), d: 0 }];
      const ani: RcwaLayer[] = [{ n: c(1.5), d: 0 }, ...(N ? [g] : []), { eps: isotropicTensor(c(0.2, 3.3)), d: 30 }, { eps: isotropicTensor(c(2.1, 0.02)), d: 150 }, { n: c(1.33), d: 0 }];
      const a = rcwaConical(iso, 450, 633, th, phi, pol, N);
      const b = rcwaConical(ani, 450, 633, th, phi, pol, N);
      for (const k of ['RTE', 'RTM', 'TTE', 'TTM'] as const) a[k].forEach((v, i) => (e1 = Math.max(e1, Math.abs(v - b[k][i]))));
    }
  const film = (n: CX.C): RcwaLayer[] => [{ n: c(1), d: 0 }, { n, d: 400 }, { n: c(1.52), d: 0 }];
  const af: RcwaLayer[] = [{ n: c(1), d: 0 }, { eps: uniaxial(no, ne, 0, 0), d: 400 }, { n: c(1.52), d: 0 }];
  const e2 = Math.max(Math.abs(rcwaConical(af, 500, 633, 0, 0, 'p', 0).Rtot - tmmPoint(film(ne) as never, 633, 0, 'p').R), Math.abs(rcwaConical(af, 500, 633, 0, 0, 's', 0).Rtot - tmmPoint(film(no) as never, 633, 0, 's').R));
  const amb = c(1.6);
  const r = rcwaConical([{ n: amb, d: 0 }, { eps: uniaxial(no, ne, 0, 45), d: 880 }, { n: amb, d: 0 }], 500, 633, 0, 0, 's', 0);
  const tAmp = (n: CX.C) => {
    const t = tmmPoint([{ n: amb, d: 0 }, { n, d: 880 }, { n: amb, d: 0 }] as never, 633, 0, 's');
    return CX.mul(c(Math.sqrt(t.T)), CX.exp(c(0, t.phit)));
  };
  const [te, to] = [tAmp(ne), tAmp(no)];
  const e3 = Math.max(Math.abs(r.TTE[0] - CX.abs2(CX.mul(CX.add(te, to), c(0.5)))), Math.abs(r.TTM[0] - CX.abs2(CX.mul(CX.sub(te, to), c(0.5)))));
  // energy and reciprocity, with and without a grating
  const stack = (tilt: number, az: number, grating: boolean): RcwaLayer[] => [{ n: c(1.2), d: 0 }, ...(grating ? [g] : []), { eps: uniaxial(no, ne, tilt, az), d: 700 }, { n: c(2.1), d: 90 }, { eps: uniaxial(c(1.6), c(1.9), -25, 110), d: 300 }, { n: c(1.45), d: 0 }];
  let e4 = 0;
  let e5 = 0;
  for (const [tl, az, th, phi, N] of [
    [30, 20, 40, 15, 0],
    [70, -50, 60, 100, 0],
    [20, 65, 20, 30, 6],
  ]) {
    const L = stack(tl, az, N > 0);
    for (const pol of ['s', 'p'] as const) {
      const q = rcwaConical(L, 450, 633, th, phi, pol, N);
      e4 = Math.max(e4, Math.abs(q.Rtot + q.Ttot - 1));
    }
    const [s1, p1, s2, p2] = [rcwaConical(L, 450, 633, th, phi, 's', N), rcwaConical(L, 450, 633, th, phi, 'p', N), rcwaConical(L, 450, 633, th, phi + 180, 's', N), rcwaConical(L, 450, 633, th, phi + 180, 'p', N)];
    e5 = Math.max(e5, Math.abs(s1.RTE[N] - s2.RTE[N]), Math.abs(p1.RTM[N] - p2.RTM[N]), Math.abs(s1.RTM[N] - p2.RTE[N]), Math.abs(p1.RTE[N] - s2.RTM[N]));
  }
  // a grating on a tilted nematic layer: T₋₁ TM converges (Reticolo: 0.0496 / 0.0455 / 0.0466 at nn = 8 / 16 / 30)
  const gl: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 120, segs: [{ from: 0, to: 0.5, n: c(2.1) }, { from: 0.5, to: 1, n: c(1) }] }, { eps: uniaxial(no, ne, 20, 65), d: 400 }, { n: c(1.52), d: 0 }];
  const tm = [8, 16, 24].map((N) => rcwaConical(gl, 450, 633, 20, 30, 'p', N).TTM[N - 1]);
  const conv = Math.max(Math.abs(tm[0] - tm[2]), Math.abs(tm[1] - tm[2]));
  if (!(e1 < 1e-12 && e2 < 1e-12 && e3 < 1e-12 && e4 < 1e-11 && e5 < 1e-11 && conv < 2e-4)) throw new Error(`Berreman: iso ${e1}, axis x ${e2}, λ-plate ${e3}, energy ${e4}, reciprocity ${e5}, convergence ${tm}`);
  console.log(
    `Berreman 4×4: isotropic tensor = isotropic layer, with a grating too (${e1.toExponential(1)}); axis along x at normal incidence = TMM n_e / n_o (${e2.toExponential(1)}); plate at 45° = Jones (${e3.toExponential(1)}); ` +
      `R + T = 1 (${e4.toExponential(1)}); reciprocity φ ↔ φ + 180° with TE ↔ TM (${e5.toExponential(1)}); grating on a tilted nematic: T₋₁ TM ${tm.map((v) => v.toFixed(5)).join(' / ')} at N = 8 / 16 / 24`,
  );
}
// Liquid crystals, analytic: a cholesteric (helix along z) reflects the circular polarization of its own handedness in
// the band n_o p … n_e p (de Vries), the other is transmitted; a 90° twisted nematic between crossed polarizers leaks
// sin²(π/2 √(1+u²)) / (1+u²), u = 2 d Δn / λ (Gooch & Tarry 1975)
if (full('cholesteric, Gooch–Tarry (16 s)')) {
  const no = c(1.53);
  const ne = c(1.71);
  const helix = (pitch: number, turns: number, perTurn: number, sense: number, amb: CX.C): RcwaLayer[] => [
    { n: amb, d: 0 },
    ...Array.from({ length: turns * perTurn }, (_, j) => ({ eps: uniaxial(no, ne, 0, (sense * 360 * (j + 0.5)) / perTurn), d: pitch / perTurn })),
    { n: amb, d: 0 },
  ];
  const pitch = 380;
  const amb = c((1.53 + 1.71) / 2);
  const L = helix(pitch, 40, 40, 1, amb);
  const circ = (lam: number, d: number) => rcwaConical(L, 500, lam, 0, 0, { psi: 45, delta: d }, 0).Rtot;
  const lc = amb.re * pitch;
  const [rA, rB] = [circ(lc, 90), circ(lc, -90)];
  const [refl, pass] = rA > rB ? [90, -90] : [-90, 90];
  // the band edges: from the band centre outwards, where R of the reflected circular state falls below 0.9 (outside,
  // the side lobes of a finite sample are high, so a crossing of 1/2 would not locate the edge)
  const edge = (dir: number) => {
    let l = lc;
    while (circ(l, refl) > 0.9) l += dir * 0.25;
    return l - (dir * 0.25) / 2;
  };
  const e0 = edge(-1);
  const e1 = edge(1);
  const errEdges = Math.max(Math.abs(e0 / (no.re * pitch) - 1), Math.abs(e1 / (ne.re * pitch) - 1));
  // the opposite helix reflects the other circular state
  const Lr = helix(pitch, 40, 40, -1, amb);
  const flip = rcwaConical(Lr, 500, lc, 0, 0, { psi: 45, delta: pass }, 0).Rtot;
  // twisted nematic, 90°: TE in (E along the entrance director, y), the leak = the TE part of T (the guided light is TM)
  const tn = (u: number) => {
    const d = (u * 633) / (2 * (ne.re - no.re));
    const S = 120;
    const layers: RcwaLayer[] = [{ n: amb, d: 0 }, ...Array.from({ length: S }, (_, j) => ({ eps: uniaxial(no, ne, 0, 90 - (90 * (j + 0.5)) / S), d: d / S })), { n: amb, d: 0 }];
    const r = rcwaConical(layers, 500, 633, 0, 0, 's', 0);
    return { leak: r.TTE[0] / r.Ttot, gt: Math.sin((Math.PI / 2) * Math.sqrt(1 + u * u)) ** 2 / (1 + u * u) };
  };
  const tnRows = [0.8, Math.sqrt(3), 3, Math.sqrt(15)].map(tn);
  const errTN = Math.max(...tnRows.map((q) => Math.abs(q.leak - q.gt)));
  if (!(Math.max(rA, rB) > 0.99 && Math.min(rA, rB) < 0.01 && errEdges < 0.005 && flip > 0.99 && errTN < 3e-3))
    throw new Error(`liquid crystals: cholesteric R ${rA} / ${rB}, edges ${e0} ${e1} (${errEdges}), flip ${flip}; TN ${JSON.stringify(tnRows)}`);
  console.log(
    `cholesteric (p = ${pitch} nm, 40 turns): at λ = n̄p the circular state of its handedness R = ${Math.max(rA, rB).toFixed(4)}, the other ${Math.min(rA, rB).toExponential(1)}; band edges ${e0.toFixed(1)} / ${e1.toFixed(1)} nm vs n_o p ${(no.re * pitch).toFixed(1)} / n_e p ${(ne.re * pitch).toFixed(1)} (${(100 * errEdges).toFixed(2)} %); ` +
      `opposite helix reflects the other state (${flip.toFixed(4)}); 90° twisted nematic leak between crossed polarizers vs Gooch–Tarry: ${tnRows.map((q) => `${q.leak.toFixed(4)} / ${q.gt.toFixed(4)}`).join(', ')} (u = 0.8, √3, 3, √15)`,
  );
}
// Anisotropic material node → Layer → Compute TMM (Berreman 4×4) and Compute RCWA, through the graph: = the direct
// conical solve built from the library indices; an isotropic "anisotropic" material (n_o = n_e) = plain TMM (R, T, phases);
// a swept tilt, a twisted layer (sublayers), a thick substrate; an anisotropic medium is refused
{
  const blib = makeLibrary([]);
  const bm = Object.fromEntries([...blib].map(([id, dd]) => [id, dd.model]));
  const E = (s: string, t: string, h: string, sh = 'out') => ({ id: `${s}-${sh}-${t}-${h}`, source: s, sourceHandle: sh, target: t, targetHandle: h });
  const P = { x: 0, y: 0 };
  type Opt = { e?: string; angles?: number[]; tiltSweep?: number[]; twist?: number; tiltEnd?: number; slices?: number; phi?: number; pol?: 's' | 'p'; polMix?: { psi: number; delta: number }; thick?: boolean; anisoIn?: boolean; rcwa?: boolean; exit?: string };
  const graph = (o: Opt) => ({
    nodes: [
      { id: 'air', type: 'material', position: P, data: materialData('Air') },
      { id: 'sio2', type: 'material', position: P, data: materialData('SiO2') },
      { id: 'tio2', type: 'material', position: P, data: materialData('TiO2') },
      { id: 'bk7', type: 'material', position: P, data: materialData('BK7') },
      { id: 'si', type: 'material', position: P, data: materialData('Si') },
      { id: 'an', type: 'aniso', position: P, data: { name: 'LC', kind: 'uniaxial', color: '#c98bd9', angles: o.angles ?? [25, 30, 0] } },
      { id: 'la', type: 'layer', position: P, data: { label: '', thickness: 420, layers2D: 1, twist: o.twist, tiltEnd: o.tiltEnd, slices: o.slices } },
      { id: 'lb', type: 'layer', position: P, data: { label: '', thickness: 95, layers2D: 1 } },
      { id: 'st', type: 'combine', position: P, data: { name: '', count: 2, ...(o.thick ? { thick: true, dSub: 1 } : {}) } },
      { id: 'wl', type: 'param', position: P, data: { quantity: 'lambda', mode: 'range', value: 550, min: 450, max: 750, step: 25 } },
      { id: 'th', type: 'param', position: P, data: { quantity: 'theta', mode: 'range', value: 0, min: 0, max: 60, step: 30 } },
      ...(o.tiltSweep ? [{ id: 'ts', type: 'sweep', position: P, data: { name: 'tilt', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: o.tiltSweep.join(', ') } }] : []),
      o.rcwa
        ? { id: 'tm', type: 'rcwa', position: P, data: { ...RCWA_DEFAULTS, name: 'B', polarization: o.pol ?? 's', phi: o.phi ?? 0 } }
        : { id: 'tm', type: 'compute', position: P, data: { name: 'B', polarization: o.pol ?? 's', phi: o.phi, polMix: o.polMix } },
    ] as unknown as AppNode[],
    edges: [
      E('sio2', 'an', 'o'),
      E(o.e ?? 'tio2', 'an', 'e'),
      E('an', 'la', 'mat'),
      E('tio2', 'lb', 'mat'),
      E('la', 'st', 'item-0'),
      E('lb', 'st', 'item-1'),
      E(o.anisoIn ? 'an' : 'air', 'st', 'incident'),
      E(o.exit ?? 'bk7', 'st', 'exit'),
      E('st', 'tm', 'stack'),
      E('wl', 'tm', 'lambda'),
      E('th', 'tm', 'theta'),
      ...(o.tiltSweep ? [E('ts', 'an', 'a0')] : []),
    ],
  });
  const run = (g: ReturnType<typeof graph>) => evaluateHeadless(g.nodes, g.edges, blib).results.get('tm')!;
  const dsOf = (o: Opt, g = graph(o)) => {
    const r = run(g);
    const out = r.outs.out;
    if (r.errors.length || out?.type !== 'data' || !out.dataset) throw new Error(`Berreman graph: ${r.errors} ${JSON.stringify(o)}`);
    return { ds: out.dataset, info: r.info as ComputeInfo };
  };
  const n = (id: string, l: number) => refractiveIndex(id, bm, l);
  const lams = rangeValues(450, 750, 25) as number[];
  const ths = [0, 30, 60];
  const direct = (l: number, th: number, phi: number, pol: 's' | 'p' | { psi: number; delta: number }, film: (l: number) => RcwaLayer[]) =>
    rcwaConical([{ n: n('Air', l), d: 0 }, ...film(l), { n: n('TiO2', l), d: 95 }, { n: n('BK7', l), d: 0 }], 1000, l, th, phi, pol, 0);
  // (1) tilt 25°, azimuth 30°, φ = 20°: s, p and a Jones state
  let e1 = 0;
  for (const inc of ['s', 'p', { psi: 30, delta: 60 }] as const) {
    const { ds, info } = dsOf({ phi: 20, ...(typeof inc === 'string' ? { pol: inc } : { polMix: inc }) });
    if (!info.berreman || !ds.fields.R_TE) throw new Error('Berreman graph: not routed to the 4×4 method');
    lams.forEach((l, i) =>
      ths.forEach((th, j) => {
        const q = direct(l, th, 20, inc, (x) => [{ eps: uniaxial(n('SiO2', x), n('TiO2', x), 25, 30), d: 420 }]);
        const k = i * ths.length + j;
        e1 = Math.max(e1, Math.abs(q.Rtot - ds.fields.R[k]), Math.abs(q.Ttot - ds.fields.T[k]), Math.abs(q.RTM[0] - ds.fields.R_TM[k]), Math.abs(q.TTE[0] - ds.fields.T_TE[k]));
      }),
    );
  }
  // (2) n_o = n_e: = plain TMM (R, T, phases), whatever the angles and φ; glass and an absorbing exit (Si)
  let e2 = 0;
  const dph = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  for (const [pol, ex] of [['s', 'BK7'], ['p', 'BK7'], ['s', 'Si'], ['p', 'Si']] as const) {
    const { ds } = dsOf({ e: 'sio2', phi: 35, pol, angles: [40, 70, 0], exit: ex === 'Si' ? 'si' : 'bk7' });
    lams.forEach((l, i) =>
      ths.forEach((th, j) => {
        const t = tmmPoint([{ n: n('Air', l), d: 0 }, { n: n('SiO2', l), d: 420 }, { n: n('TiO2', l), d: 95 }, { n: n(ex, l), d: 0 }], l, th, pol);
        const k = i * ths.length + j;
        const es = [Math.abs(t.R - ds.fields.R[k]), Math.abs(t.T - ds.fields.T[k]), dph((t.phir * 180) / Math.PI, ds.fields.phiR[k]) / 360, dph((t.phit * 180) / Math.PI, ds.fields.phiT[k]) / 360];
        e2 = Math.max(e2, ...es);
      }),
    );
  }
  // (3) a swept tilt (port a0)
  const tilts = [0, 45, 90];
  const sw = dsOf({ tiltSweep: tilts, phi: 10, pol: 'p' }).ds;
  let e3 = 0;
  tilts.forEach((tl, s) =>
    lams.forEach((l, i) =>
      ths.forEach((th, j) => {
        const q = direct(l, th, 10, 'p', (x) => [{ eps: uniaxial(n('SiO2', x), n('TiO2', x), tl, 30), d: 420 }]);
        e3 = Math.max(e3, Math.abs(q.Rtot - sw.fields.R[(s * lams.length + i) * ths.length + j]));
      }),
    ),
  );
  // (4) a twisted, tilting layer = its sublayers
  const tw = dsOf({ twist: 90, tiltEnd: 60, slices: 30, phi: 15, pol: 's' }).ds;
  let e4 = 0;
  lams.forEach((l, i) =>
    ths.forEach((th, j) => {
      const q = direct(l, th, 15, 's', (x) => Array.from({ length: 30 }, (_, m) => ({ eps: uniaxial(n('SiO2', x), n('TiO2', x), 25 + (35 * (m + 0.5)) / 30, 30 + (90 * (m + 0.5)) / 30), d: 14 })));
      e4 = Math.max(e4, Math.abs(q.Rtot - tw.fields.R[i * ths.length + j]));
    }),
  );
  // (5) thick substrate, n_o = n_e: = the TMM thick-substrate result of the same stack with a plain layer
  const tk = dsOf({ thick: true, phi: 25, pol: 's', e: 'sio2' }).ds;
  const gT = graph({ thick: true, pol: 's', e: 'sio2' });
  gT.edges = gT.edges.map((x) => (x.source === 'an' && x.target === 'la' ? E('sio2', 'la', 'mat') : x));
  const tkT = dsOf({}, gT).ds;
  const e5 = Math.max(...Array.from(tk.fields.R, (v, k) => Math.abs(v - tkT.fields.R[k])), ...Array.from(tk.fields.T, (v, k) => Math.abs(v - tkT.fields.T[k])));
  // (6) Compute RCWA with the same stack = Compute TMM (R, T and the phases, Si exit: the TM phase convention); the planar
  // RCWA path too (the anisotropic layer replaced by SiO2, φ = 0)
  let e6 = 0;
  const cmp = (a: typeof tk, b: typeof tk) => {
    for (const f of ['R', 'T'] as const) a.fields[f].forEach((v, k) => (e6 = Math.max(e6, Math.abs(v - b.fields[f][k]))));
    for (const f of ['phiR', 'phiT'] as const) a.fields[f].forEach((v, k) => (e6 = Math.max(e6, dph(v, b.fields[f][k]) / 360)));
  };
  const plainG = (o: Opt) => {
    const g = graph(o);
    g.edges = g.edges.map((x) => (x.source === 'an' && x.target === 'la' ? E('sio2', 'la', 'mat') : x));
    return dsOf(o, g).ds;
  };
  for (const pol of ['s', 'p'] as const) {
    cmp(dsOf({ rcwa: true, phi: 20, pol, exit: 'si' }).ds, dsOf({ phi: 20, pol, exit: 'si' }).ds);
    cmp(plainG({ rcwa: true, pol, exit: 'si' }), plainG({ pol, exit: 'si' }));
  }
  // (7) an anisotropic incident medium is refused
  const gb = graph({ anisoIn: true });
  const bad = evaluateHeadless(gb.nodes, gb.edges, blib).results.get('st')!;
  const refused = bad.errors.some((m) => /anisotropic/.test(m)) && run(gb).errors.length > 0;
  if (!(e1 < 1e-12 && e2 < 1e-12 && e3 < 1e-12 && e4 < 1e-12 && e5 < 1e-12 && e6 < 1e-12 && refused))
    throw new Error(`Berreman graph: direct ${e1}, iso = TMM ${e2}, tilt sweep ${e3}, twist ${e4}, thick ${e5}, RCWA ${e6}, refused ${refused} ${bad.errors}`);
  console.log(
    `Anisotropic material → Compute TMM (Berreman 4×4) = direct conical solve for s, p and a Jones state at φ = 20° (${e1.toExponential(1)}); n_o = n_e = plain TMM with phases (${e2.toExponential(1)}); ` +
      `swept tilt (${e3.toExponential(1)}); twisted + tilting layer = 30 sublayers (${e4.toExponential(1)}); thick substrate (${e5.toExponential(1)}); Compute RCWA = Compute TMM, phases too with a Si exit, conical and planar (${e6.toExponential(1)}); anisotropic incident medium refused`,
  );
}
// Liquid-crystal microcavity example: at normal incidence the x-polarized wave in the tilted nematic sees exactly
// n(θ_c) = n_o n_e / √(n_o² cos²θ_c + n_e² sin²θ_c) and the y wave n_o, uncoupled: T for ψ = 45° = (T_x + T_y) / 2 of
// two isotropic TMM stacks
if (full('LC microcavity example (11 s)')) {
  const p = lcCavityExample();
  const llib = makeLibrary(p.materials);
  const ev = evaluateHeadless(p.nodes, p.edges, llib);
  const errs = [...ev.results].filter(([, r]) => r.errors.length);
  if (errs.length) throw new Error(`LC cavity example: ${errs.map(([id, r]) => `${id}: ${r.errors}`)}`);
  const o = ev.results.get('tmm')!.outs.out;
  if (o?.type !== 'data' || !o.dataset) throw new Error('LC cavity example: no data');
  const ds = o.dataset;
  const tilts = ds.axes[0].values as number[];
  const lams = ds.axes[1].values as number[];
  const [no, ne] = [1.52, 1.74];
  let e = 0;
  for (const s of [0, 15, 45]) {
    const tc = (tilts[s] * Math.PI) / 180;
    const nx = (no * ne) / Math.sqrt(no * no * Math.cos(tc) ** 2 + ne * ne * Math.sin(tc) ** 2);
    for (let i = 0; i < lams.length; i += 7) {
      const L = rcwaLayersAt(ds.spec!, [s], lams[i]).layers;
      const iso = (n: number) => L.map((q) => (q.eps ? { n: c(n), d: q.d } : { n: q.n!, d: q.d }));
      const T = (tmmPoint(iso(nx), lams[i], 0, 'p').T + tmmPoint(iso(no), lams[i], 0, 's').T) / 2;
      e = Math.max(e, Math.abs(T - ds.fields.T[s * lams.length + i]));
    }
  }
  if (e > 1e-12) throw new Error(`LC cavity example vs TMM: ${e}`);
  console.log(`LC microcavity example (tilt map 0–90°): T for ψ = 45° = (T_x(n(θ_c)) + T_y(n_o)) / 2 by TMM at θ_c = 0, 30, 90° (${e.toExponential(1)})`);
}
// Bound state in the continuum (Pankin et al., JOSA B 39, 968 (2022)): the Fano line of y-polarized light vanishes when
// the defect is a full-wave plate, (n_e − n_o) L = λ; near it the width grows as (L − L_BIC)² (a BIC's Q ∝ 1/δ²); at
// λ = L_BIC exactly, R does not depend on the defect's rotation φ. Through the graph: the map has the line at L = 960 nm
// and none at 1000 nm.
if (full('BIC, Pankin 2022 (49 s)')) {
  const { armPeriods, dA, dB, lBic } = PANKIN2022;
  const A: RcwaLayer = { eps: uniaxial(c(1), c(2), 0, 0), d: dA };
  const B: RcwaLayer = { n: c(1), d: dB };
  const arm: RcwaLayer[] = [];
  for (let i = 0; i < armPeriods; i++) arm.push(A, B);
  const stack = (L: number, phi: number): RcwaLayer[] => [{ n: c(1), d: 0 }, ...arm, { eps: uniaxial(c(1), c(2), 0, phi), d: L }, ...[...arm].reverse(), { n: c(1), d: 0 }];
  const R = (L: number, phi: number, l: number) => rcwaConical(stack(L, phi), 1000, l, 0, 0, 's', 0).Rtot;
  // the peak (golden search on a bracket from a coarse scan) and the half-maximum points (bisection)
  const line = (L: number) => {
    let [a, b] = [900, 1100];
    let best = a;
    for (let l = a; l <= b; l += 0.02) if (R(L, 45, l) > R(L, 45, best)) best = l;
    [a, b] = [best - 0.02, best + 0.02];
    for (let k = 0; k < 60; k++) {
      const m1 = b - (b - a) * 0.618;
      const m2 = a + (b - a) * 0.618;
      if (R(L, 45, m1) > R(L, 45, m2)) b = m2;
      else a = m1;
    }
    const lr = (a + b) / 2;
    const half = R(L, 45, lr) / 2;
    const cross = (dir: number) => {
      let [x0, x1] = [lr, lr + dir * 0.02];
      while (R(L, 45, x1) > half) x1 += dir * 0.02;
      for (let k = 0; k < 50; k++) {
        const m = (x0 + x1) / 2;
        if (R(L, 45, m) > half) x0 = m;
        else x1 = m;
      }
      return x0;
    };
    return { lr, peak: 2 * half, w: cross(1) - cross(-1) };
  };
  const [l1, l2] = [line(960), line(980)];
  const ratio = l1.w / l2.w;
  const inv = Math.max(...[0, 22.5, 45, 67.5, 90].map((ph) => Math.abs(R(lBic, ph, lBic) - R(lBic, 0, lBic))));
  const ex = anisoBicExample();
  const bev = evaluateHeadless(ex.nodes, ex.edges, makeLibrary(ex.materials));
  const bo = bev.results.get('tmm')!.outs.out;
  if (bo?.type !== 'data' || !bo.dataset) throw new Error(`BIC example: ${bev.results.get('tmm')!.errors} ${bev.results.get('pc')!.errors}`);
  const bds = bo.dataset;
  const Ls = bds.axes[0].values as number[];
  const bl = bds.axes[1].values as number[];
  const maxR = (L: number) => Math.max(...Array.from(bds.fields.R.slice(Ls.indexOf(L) * bl.length, (Ls.indexOf(L) + 1) * bl.length)));
  const [m960, m1000] = [maxR(960), maxR(1000)];
  if (!(l1.peak > 0.99 && l2.peak > 0.99 && Math.abs(ratio - 4) < 0.4 && inv < 1e-12 && l2.lr > l1.lr && Math.abs(l2.lr - 1000) < Math.abs(l1.lr - 1000) && m960 > 0.9 && m1000 < 0.05))
    throw new Error(`BIC: lines ${JSON.stringify([l1, l2])}, width ratio ${ratio}, φ-independence ${inv}, map ${m960} / ${m1000}`);
  console.log(
    `BIC, anisotropic defect (Pankin et al. 2022): Fano line of y light at L = 960 / 980 nm: λ ${l1.lr.toFixed(2)} / ${l2.lr.toFixed(2)} nm, R ${l1.peak.toFixed(3)} / ${l2.peak.toFixed(3)}, width ${l1.w.toFixed(4)} / ${l2.w.toFixed(4)} nm (ratio ${ratio.toFixed(2)}, (L − L_BIC)² → 4); ` +
      `at the full-wave plate R(λ = L = 1 µm) independent of φ (${inv.toExponential(1)}); example map: max R ${m960.toFixed(3)} at L = 960 nm, ${m1000.toFixed(3)} at 1000 nm (no line)`,
  );
}
// Semi-infinite anisotropic exit medium (Berreman): isotropic tensor = isotropic medium (R, T, TE / TM of R, and the whole
// S-matrix); normal incidence on a uniaxial half-space = Fresnel along / across the axis; lossless R + T = 1 (tilted axis,
// conical, with a grating); a layer of the exit material on top changes nothing; a lossy half-space = a thick layer of it
// (whatever follows)
{
  const no = c(1.53);
  const ne = c(1.71);
  const g: RcwaLayer = { d: 120, segs: [{ from: 0, to: 0.5, n: c(2.1) }, { from: 0.5, to: 1, n: c(1) }] };
  // (a)
  let ea = 0;
  for (const [th, phi, N] of [
    [0, 0, 0],
    [40, 25, 0],
    [60, -70, 0],
    [25, 30, 6],
  ])
    for (const pol of ['s', 'p'] as const) {
      const top: RcwaLayer[] = [{ n: c(1.2), d: 0 }, ...(N ? [g] : []), { n: c(2.1, 0.02), d: 150 }];
      const a = rcwaConical([...top, { n: c(1.6), d: 0 }], 450, 633, th, phi, pol, N);
      const b = rcwaConical([...top, { eps: isotropicTensor(c(1.6)), d: 0 }], 450, 633, th, phi, pol, N);
      ea = Math.max(ea, Math.abs(a.Rtot - b.Rtot), Math.abs(a.Ttot - b.Ttot), ...Array.from(a.RTE, (v, i) => Math.abs(v - b.RTE[i])), ...Array.from(a.T, (v, i) => Math.abs(v - b.T[i])));
    }
  const kxs = Float64Array.from([-0.7, 0.2, 1.1]);
  const Sa = conicalSMatrix([{ n: c(1.2), d: 0 }, { n: c(2.1), d: 150 }, { n: c(1.6), d: 0 }], kxs, 0.3, 633);
  const Sb = conicalSMatrix([{ n: c(1.2), d: 0 }, { n: c(2.1), d: 150 }, { eps: isotropicTensor(c(1.6)), d: 0 }], kxs, 0.3, 633);
  for (const blk of ['S11', 'S12', 'S21', 'S22'] as const) Sa[blk].re.forEach((v, i) => (ea = Math.max(ea, Math.abs(v - Sb[blk].re[i]), Math.abs(Sa[blk].im[i] - Sb[blk].im[i]))));
  // (b)
  let eb = 0;
  const fres = (n: CX.C) => CX.abs2(CX.div(CX.sub(c(1), n), CX.add(c(1), n)));
  for (const az of [0, 30, 90]) {
    const r = rcwaConical([{ n: c(1), d: 0 }, { eps: uniaxial(no, ne, 0, az), d: 0 }], 500, 633, 0, 0, 'p', 0);
    const ca = Math.cos((az * Math.PI) / 180) ** 2;
    const want = ca * fres(ne) + (1 - ca) * fres(no);
    eb = Math.max(eb, Math.abs(r.Rtot - want), Math.abs(r.Ttot - (1 - want)));
  }
  // (c)
  let ec = 0;
  for (const [tl, az, th, phi, N] of [
    [30, 20, 40, 15, 0],
    [70, -50, 60, 100, 0],
    [-25, 110, 20, 0, 0],
    [20, 65, 20, 30, 6],
  ])
    for (const pol of ['s', 'p', { psi: 30, delta: 70 }] as const) {
      const q = rcwaConical([{ n: c(1.9), d: 0 }, ...(N ? [g] : []), { n: c(2.1), d: 90 }, { eps: uniaxial(c(1.5), c(1.8), 10, 40), d: 300 }, { eps: uniaxial(no, ne, tl, az), d: 0 }], 450, 633, th, phi, pol, N);
      ec = Math.max(ec, Math.abs(q.Rtot + q.Ttot - 1));
    }
  // (d)
  let ed = 0;
  for (const d of [50, 700, 3000]) {
    const ex = uniaxial(no, ne, 35, 25);
    const a = rcwaConical([{ n: c(1.4), d: 0 }, { n: c(2.1), d: 80 }, { eps: ex, d: 0 }], 500, 633, 50, 30, 's', 0);
    const b = rcwaConical([{ n: c(1.4), d: 0 }, { n: c(2.1), d: 80 }, { eps: ex, d }, { eps: ex, d: 0 }], 500, 633, 50, 30, 's', 0);
    ed = Math.max(ed, Math.abs(a.Rtot - b.Rtot), Math.abs(a.Ttot - b.Ttot));
  }
  // (e)
  const lossy = uniaxial(c(1.53, 0.02), c(1.71, 0.03), 35, 25);
  const half = rcwaConical([{ n: c(1.4), d: 0 }, { n: c(2.1), d: 80 }, { eps: lossy, d: 0 }], 500, 633, 50, 30, 'p', 0).Rtot;
  const thick = (after: RcwaLayer) => rcwaConical([{ n: c(1.4), d: 0 }, { n: c(2.1), d: 80 }, { eps: lossy, d: 200000 }, after], 500, 633, 50, 30, 'p', 0).Rtot;
  const ee = Math.max(Math.abs(half - thick({ n: c(1), d: 0 })), Math.abs(half - thick({ n: c(3.5, 0.1), d: 0 })));
  if (!(ea < 1e-12 && eb < 1e-14 && ec < 1e-11 && ed < 1e-12 && ee < 1e-12))
    throw new Error(`anisotropic exit medium: iso ${ea}, Fresnel ${eb}, balance ${ec}, layer on top ${ed}, lossy vs thick ${ee}`);
  console.log(
    `semi-infinite anisotropic exit medium: isotropic tensor = isotropic medium incl. the whole S-matrix (${ea.toExponential(1)}); normal incidence on a uniaxial half-space = Fresnel along / across the axis (${eb.toExponential(1)}); ` +
      `lossless R + T = 1, tilted axis, conical, Jones, grating (${ec.toExponential(1)}); a layer of the exit material on top changes nothing (${ed.toExponential(1)}); lossy half-space = 200 µm of it on anything (${ee.toExponential(1)})`,
  );
}
// Through the graph: an Anisotropic material as the exit medium of Combine → Compute TMM (Berreman) and Compute RCWA =
// the direct solve; T into TE / TM and φt are NaN there (the outgoing waves are the medium's own modes); an anisotropic
// incident medium or thick substrate is refused
{
  const xlib = makeLibrary([]);
  const xm = Object.fromEntries([...xlib].map(([id, dd]) => [id, dd.model]));
  const E = (s: string, t: string, h: string) => ({ id: `${s}-${t}-${h}`, source: s, sourceHandle: 'out', target: t, targetHandle: h });
  const P = { x: 0, y: 0 };
  const graph = (o: { rcwa?: boolean; thick?: boolean; inc?: boolean }) => ({
    nodes: [
      { id: 'air', type: 'material', position: P, data: materialData('Air') },
      { id: 'sio2', type: 'material', position: P, data: materialData('SiO2') },
      { id: 'tio2', type: 'material', position: P, data: materialData('TiO2') },
      { id: 'an', type: 'aniso', position: P, data: { name: 'sub', kind: 'uniaxial', color: '#c98bd9', angles: [30, 40, 0] } },
      { id: 'lb', type: 'layer', position: P, data: { label: '', thickness: 95, layers2D: 1 } },
      { id: 'st', type: 'combine', position: P, data: { name: '', count: 1, ...(o.thick ? { thick: true, dSub: 1 } : {}) } },
      { id: 'wl', type: 'param', position: P, data: { quantity: 'lambda', mode: 'range', value: 550, min: 450, max: 750, step: 50 } },
      { id: 'th', type: 'param', position: P, data: { quantity: 'theta', mode: 'range', value: 0, min: 0, max: 60, step: 30 } },
      o.rcwa
        ? { id: 'tm', type: 'rcwa', position: P, data: { ...RCWA_DEFAULTS, name: 'B', polarization: 's', phi: 20 } }
        : { id: 'tm', type: 'compute', position: P, data: { name: 'B', polarization: 's', phi: 20 } },
    ] as unknown as AppNode[],
    edges: [E('sio2', 'an', 'o'), E('tio2', 'an', 'e'), E('tio2', 'lb', 'mat'), E('lb', 'st', 'item-0'), E(o.inc ? 'an' : 'air', 'st', 'incident'), E(o.inc ? 'air' : 'an', 'st', 'exit'), E('st', 'tm', 'stack'), E('wl', 'tm', 'lambda'), E('th', 'tm', 'theta')],
  });
  const n = (id: string, l: number) => refractiveIndex(id, xm, l);
  let e = 0;
  for (const rcwa of [false, true]) {
    const g = graph({ rcwa });
    const r = evaluateHeadless(g.nodes, g.edges, xlib).results.get('tm')!;
    const out = r.outs.out;
    if (r.errors.length || out?.type !== 'data' || !out.dataset) throw new Error(`anisotropic exit through the graph: ${r.errors}`);
    const ds = out.dataset;
    [450, 500, 550, 600, 650, 700, 750].forEach((l, i) =>
      [0, 30, 60].forEach((th, j) => {
        const q = rcwaConical([{ n: n('Air', l), d: 0 }, { n: n('TiO2', l), d: 95 }, { eps: uniaxial(n('SiO2', l), n('TiO2', l), 30, 40), d: 0 }], 1000, l, th, 20, 's', 0);
        const k = i * 3 + j;
        e = Math.max(e, Math.abs(q.Rtot - ds.fields.R[k]), Math.abs(q.Ttot - ds.fields.T[k]), Math.abs(q.RTM[0] - ds.fields.R_TM[k]));
        if (!Number.isNaN(ds.fields.phiT[k]) || !Number.isNaN(ds.fields.T_TE[k]) || Number.isNaN(ds.fields.phiR[k])) throw new Error('anisotropic exit: φt / T_TE should be NaN, φr defined');
      }),
    );
  }
  const refused = (o: { thick?: boolean; inc?: boolean }) => {
    const g = graph(o);
    const res = evaluateHeadless(g.nodes, g.edges, xlib).results;
    return [...res.get('tm')!.errors, ...res.get('st')!.errors].some((m) => /isotropic/.test(m));
  };
  if (!(e < 1e-12 && refused({ thick: true }) && refused({ inc: true }))) throw new Error(`anisotropic exit through the graph: ${e}, refusals ${refused({ thick: true })} ${refused({ inc: true })}`);
  console.log(`anisotropic exit medium through Combine → Compute TMM and Compute RCWA = direct (${e.toExponential(1)}); T into TE / TM and φt NaN; anisotropic incident medium and thick substrate refused`);
}
// Liu et al., Opt. Express 31, 8384 (2023) example: the map = the direct solve (prism / (TiO₂ SiO₂)×10 / uniaxial / air);
// around the FW-BIC e the narrow Fano dip (its depth under the chord ±3 nm) shrinks to nothing at ϕ = 37.2° and is deep
// at 30° and 44°; SP-BIC: no narrow dip at ϕ = 0 on the TE mode that couples at ϕ = 1°
if (full('Liu 2023 example, chiral Tamm (27 s)')) {
  const p = liuBicExample();
  const llib = makeLibrary(p.materials);
  const t0 = performance.now();
  const ev = evaluateHeadless(p.nodes, p.edges, llib);
  const secs = (performance.now() - t0) / 1000;
  const errs = [...ev.results].filter(([, r]) => r.errors.length);
  if (errs.length) throw new Error(`Liu example: ${errs.map(([id, r]) => `${id}: ${r.errors}`)}`);
  const dsOf = (id: string) => {
    const o = ev.results.get(id)!.outs.out;
    if (o?.type !== 'data' || !o.dataset) throw new Error(`Liu example: no data from ${id}`);
    return o.dataset;
  };
  const map = dsOf('tm');
  const near = dsOf('tm2');
  const { pairs, dTiO2, dSiO2, L, thB } = LIU2023;
  const stackAt = (phi: number): RcwaLayer[] => {
    const pc: RcwaLayer[] = [];
    for (let i = 0; i < pairs; i++) pc.push({ n: c(2.16), d: dTiO2 }, { n: c(1.47), d: dSiO2 });
    return [{ n: c(1.52), d: 0 }, ...pc, { eps: uniaxial(c(1.52, 0.001), c(1.72, 0.001), 0, phi), d: L }, { n: c(1), d: 0 }];
  };
  const lams = map.axes[1].values as number[];
  let e = 0;
  for (const [s, i] of [
    [0, 100],
    [37, 250],
    [60, 700],
    [90, 400],
  ])
    e = Math.max(e, Math.abs(rcwaConical(stackAt(s), 1000, lams[i], thB, 0, 'p', 0).Rtot - map.fields.R[s * lams.length + i]));
  // dip depth on the curves near e: max over λ of (chord through λ ± 3 nm − R)
  const nl = near.axes[1].values as number[];
  const phis = near.axes[0].values as number[];
  const depth = (s: number, lo: number, hi: number) => {
    const R = near.fields.R.slice(s * nl.length, (s + 1) * nl.length);
    const at = (l: number) => R[Math.round((l - nl[0]) / 0.01)];
    let d = 0;
    for (let l = lo; l <= hi; l += 0.01) d = Math.max(d, (at(l - 3) + at(l + 3)) / 2 - at(l));
    return d;
  };
  const dep = phis.map((ph, s) => depth(s, 537, 551));
  const iB = phis.indexOf(37.2);
  const ok = e < 1e-12 && dep[iB] < 0.005 && dep[0] > 0.2 && dep[phis.length - 1] > 0.2 && dep.every((d, s) => s === iB || d > 5 * dep[iB]);
  if (!ok) throw new Error(`Liu example: map vs direct ${e}, dip depths ${dep.map((d) => d.toFixed(4))} at ϕ ${phis}`);
  console.log(
    `Liu et al. 2023 example (${secs.toFixed(1)} s headless): map = direct solve (${e.toExponential(1)}); Fano dip depth near the FW-BIC e at ϕ = ${phis.join(' / ')}°: ${dep.map((d) => d.toFixed(4)).join(' / ')} — vanishes at 37.2° (article: 38.34°, 545.8 nm by FEM)`,
  );
}
// circular light, exact cholesterics, the Berreman field profile, Reverse stack, chiral optical Tamm states
await import('./check-circular.ts');
// formatted notes and Combine notes
await import('./check-notes.ts');
// the material library in every project: the anisotropic pairs (refractiveindex.info) against handbook values at the
// sodium D line (LiNbO₃ at 632.8 nm), and the article materials = the materials of the examples (scripts/gen-articles.ts)
{
  const { EXAMPLES } = await import('../src/examples.ts');
  const { articleMaterials, BUILTINS: BI, makeLibrary: ml } = await import('../src/physics/library.ts');
  const articles = BI.filter((m) => m.group === 'From articles (examples)');
  const want = articleMaterials(EXAMPLES.map((e) => e.make()));
  if (JSON.stringify(want) !== JSON.stringify(articles)) throw new Error('src/physics/articles.json differs from the materials of the examples: run node scripts/gen-articles.ts');
  const lib0 = ml([]);
  const mods = Object.fromEntries([...lib0].map(([id, d]) => [id, d.model]));
  const ref: [string, number, number][] = [
    ['Quartz-o', 589.3, 1.5443], ['Quartz-e', 589.3, 1.5534], ['Calcite-o', 589.3, 1.6584], ['Calcite-e', 589.3, 1.4864],
    ['Sapphire-o', 589.3, 1.768], ['Sapphire-e', 589.3, 1.760], ['MgF2-e', 589.3, 1.390], ['Rutile-o', 589.3, 2.613], ['Rutile-e', 589.3, 2.909],
    ['LiNbO3-o', 632.8, 2.286], ['LiNbO3-e', 632.8, 2.203],
  ];
  const worstRef = Math.max(...ref.map(([id, l, v]) => Math.abs(refractiveIndex(id, mods, l).re - v)));
  // every example opens with its materials from the library alone (nothing missing when the project's own list is empty)
  const missing = EXAMPLES.flatMap((e) => {
    const p = e.make();
    return p.nodes.flatMap((n) => (n.type === 'material' && !lib0.has((n.data as { materialId: string }).materialId) ? [`${e.name}: ${(n.data as { materialId: string }).materialId}`] : []));
  });
  console.log(`material library: ${BI.length} built-in (${articles.length} from the articles of the examples, the same as in them); anisotropic pairs vs handbook values within ${worstRef.toFixed(4)}; every example's materials in the library`);
  if (!(worstRef < 0.002) || missing.length) throw new Error(`library: handbook ${worstRef}, missing ${missing.join('; ')}`);
}
// penetration depth (Field profile): |E| falls to 1/e of its edge value; in the exit medium = 1/Im k_z; in a finite layer
// = an independent search on a fine grid; none in a medium where the wave propagates; δ(θ) over a map as an output
{
  const sp = sprExample();
  const slib = makeLibrary(sp.materials);
  const withDepth = (region: string, extra: object = {}) =>
    sp.nodes.map((n) => (n.id === 'field' ? ({ ...n, data: { ...n.data, depth: { on: true, region, edge: 'auto', overlay: true }, ...extra } } as AppNode) : n));
  const run = (region: string, extra: object = {}) => evaluateHeadless(withDepth(region, extra), sp.edges, slib).results.get('field')!;
  const fx = run('exit');
  const ix = fx.info as FieldInfo;
  const dExit = ix.depth!;
  const relExit = Math.abs(dExit.delta - dExit.analytic!) / dExit.analytic!;
  // the Ag film (layer 1): direct profile on 200 001 points from the edge where |E| is larger
  const fa = run('layer:1');
  const dAg = (fa.info as FieldInfo).depth!;
  const lamF = ix.lambda.value;
  const thF = ix.theta.value;
  const nOf = (id: string) => refractiveIndex(id, Object.fromEntries([...slib].map(([k, v]) => [k, v.model])), lamF);
  const Ls: Layer[] = [{ n: nOf('BK7'), d: 0 }, { n: nOf('Ag'), d: 50 }, { n: nOf('Water'), d: 0 }];
  const M = 200001;
  const zs = Float64Array.from({ length: M }, (_, i) => (50 * i) / (M - 1));
  const P = fieldProfile(Ls, lamF, thF, 'p', zs, Int32Array.from(zs, () => 1));
  const E = Array.from(P.E2, Math.sqrt);
  const fromTop = E[0] >= E[M - 1];
  const seq = fromTop ? E : [...E].reverse();
  const lvl = seq[0] / Math.E;
  const k = seq.findIndex((v) => v <= lvl);
  const dDirect = k > 0 ? (50 * (k - 1 + (seq[k - 1] - lvl) / (seq[k - 1] - seq[k]))) / (M - 1) : NaN;
  const fin = run('incident');
  const dIn = (fin.info as FieldInfo).depth!;
  // a map vs θ: δ(θ) on the 'depth' output, equal to the point values
  const fm = run('exit', { view: 'map', mapAxis: 'theta' });
  const dm = (fm.outs.depth as { dataset: Dataset }).dataset;
  const im = fm.info as FieldInfo;
  const j = Math.floor(im.depthMap!.ys.length / 2);
  const thJ = im.depthMap!.ys[j];
  const one = run('exit', { at: { theta: thJ } });
  const dJ = (one.info as FieldInfo).depth!.delta;
  console.log(
    `penetration depth (SPR, ${lamF} nm, ${thF.toFixed(2)}°): water δ = ${dExit.delta.toFixed(2)} nm vs 1/Im k_z ${dExit.analytic!.toFixed(2)} (${relExit.toExponential(1)}); ` +
      `Ag film from its ${dAg.dir === 1 ? 'top' : 'bottom'} δ = ${dAg.delta.toFixed(3)} nm vs a direct search ${dDirect.toFixed(3)} nm; prism: ${Number.isNaN(dIn.delta) ? 'none (propagates)' : dIn.delta}; ` +
      `map vs θ: ${dm.size} values on the output, at ${thJ.toFixed(2)}° ${dm.fields.delta[j].toFixed(3)} = point ${dJ.toFixed(3)} nm`,
  );
  if (!(relExit < 1e-4 && Math.abs(dAg.delta - dDirect) < 1e-3 && (dAg.dir === 1) === fromTop && Number.isNaN(dIn.delta) && dm.size === im.depthMap!.ys.length && Math.abs(dm.fields.delta[j] - dJ) < 1e-6 * dJ))
    throw new Error(`penetration depth: exit ${relExit}, Ag ${dAg.delta} vs ${dDirect}, prism ${dIn.delta}, map ${dm.fields.delta[j]} vs ${dJ}`);
}
// data nodes: Extract data (all curves, single values), Merge data (each source its own points), Custom data (formulas
// point by point, a single value used everywhere), and the map of three quantities (points → grid)
{
  const sc = strongCouplingExample();
  const lib1 = makeLibrary(sc.materials);
  const E = (s: string, sh: string, t: string, th: string) => ({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th });
  const nodes = [
    ...sc.nodes,
    { id: 'ex', type: 'extract', position: { x: 0, y: 0 }, data: { name: 'dips', fields: ['c0', 'w0'], fixed: {} } },
    { id: 'ex1', type: 'extract', position: { x: 0, y: 0 }, data: { name: 'one', fields: ['w1'], fixed: { 'sweep:dc': 5 } } },
    { id: 'mg', type: 'merge', position: { x: 0, y: 0 }, data: { name: '', labels: { ex1: 'single' } } },
    { id: 'cu', type: 'custom', position: { x: 0, y: 0 }, data: { name: '', rows: [{ name: 'r', expr: 'a_FWHM1 / b_FWHM2 + a_cavity_d / 1000' }] } },
  ] as AppNode[];
  const edges = [...sc.edges, E('fwhm', 'metrics', 'ex', 'in'), E('fwhm', 'metrics', 'ex1', 'in'), E('ex', 'out', 'mg', 'in'), E('ex1', 'out', 'mg', 'in'), E('ex', 'out', 'cu', 'in'), E('ex1', 'out', 'cu', 'in')];
  const r = evaluateHeadless(nodes, edges, lib1).results;
  const errs = ['ex', 'ex1', 'mg', 'cu'].flatMap((k) => r.get(k)!.errors.map((e) => `${k}: ${e}`));
  if (errs.length) throw new Error(`data nodes: ${errs.join('; ')}`);
  const dsOf = (k: string) => (r.get(k)!.outs.out as { dataset: Dataset }).dataset;
  const met = (r.get('fwhm')!.outs.metrics as { dataset: Dataset }).dataset;
  const ex = dsOf('ex');
  const ex1 = dsOf('ex1');
  const N = met.axes[0].values.length;
  const sameAll = ex.size === N && ex.meta.map((m) => m.key).join() === 'c0,w0' && [...Array(N).keys()].every((i) => ex.fields.c0[i] === met.fields.c0[i] && ex.fields.w0[i] === met.fields.w0[i]);
  const single = ex1.size === 1 && ex1.fields.w1[0] === met.fields.w1[5];
  const mg = dsOf('mg');
  const pad = mg.axes[0].labels!.join() === 'dips,single' && mg.axes[1].values.length === N && mg.fields.w1[N] === met.fields.w1[5] && Number.isNaN(mg.fields.w1[N + 1]) && Number.isNaN(mg.fields.w1[0]) && mg.fields['ax:sweep:dc'][3] === met.axes[0].values[3];
  const cu = dsOf('cu');
  let dc = 0;
  for (let i = 0; i < N; i++) dc = Math.max(dc, Math.abs(cu.fields.c0[i] - (met.fields.w0[i] / met.fields.w1[5] + met.axes[0].values[i] / 1000)));
  // three quantities → a map: a full grid comes back exactly; scattered points are averaged into cells
  const gx: number[] = [];
  const gy: number[] = [];
  const gz: number[] = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) [gx[gx.length], gy[gy.length], gz[gz.length]] = [10 + 2 * i, 0.5 * j, i * 100 + j];
  const gm = gridFromPoints(gx.reverse(), gy.reverse(), gz.reverse())!;
  const gridOk = gm.x.length === 7 && gm.y.length === 5 && gm.values[3 * 7 + 4] === 403;
  console.log(`data nodes: Extract ${N} points of 2 quantities = the FWHM metrics, a single value at step 5; Merge: sources with their own points (NaN after the shorter); Custom data = the formula by hand (${dc.toExponential(1)}); a 7 × 5 grid from shuffled points`);
  if (!(sameAll && single && pad && dc < 1e-12 && gridOk)) throw new Error(`data nodes: extract ${sameAll}, single ${single}, merge ${pad}, custom ${dc}, grid ${gridOk}`);
}

// Rough interfaces: the profile statistics, the flat limit, the thickness kept, RCWA pixels = the arithmetic mean of ε in
// the quasi-static TE limit, a thin film conformal, the Roughness node through the graph (seed sweep, Extract mean)
{
  const R = (o: Partial<RoughSpec> = {}): RoughSpec => ({ kind: 'rms', size: 2, cl: 20, cell: 1000, px: 1000, seed: 1, slices: 10, ema: 'bruggeman', side: 'bottom', bind: {}, ...o });
  const rl = (mat: string, d = 0, rough?: RoughSpec[]): LayerSpec => ({ ...layer(mat, d), ...(rough ? { rough } : {}) });
  // (1) RMS and peak-to-peak exact, the correlation length on average over 20 realizations
  const cls: number[] = [];
  let eRms = 0;
  for (let s = 1; s <= 20; s++) {
    const shape = roughShape(1000, 0.02, s);
    const h = scaledProfile(shape, 'rms', 2);
    eRms = Math.max(eRms, Math.abs(statsOf(h).rms - 2), Math.abs(statsOf(scaledProfile(shape, 'pp', 7)).pp - 7), Math.abs(h.reduce((a, b) => a + b, 0)) / 1000);
    cls.push(corrLength(h));
  }
  const clMean = cls.reduce((a, b) => a + b, 0) / cls.length;
  if (eRms > 1e-12 || Math.abs(clMean - 20) > 1) throw new Error(`rough profile: rms/pp/mean ${eRms}, cl ${clMean}`);
  // (2) zero height = flat; (3) the plan keeps each material's thickness (flat parts + fractions of the slices)
  const theta = rangeValues(60, 80, 0.1) as number[];
  const sp = (rough?: RoughSpec[], extra: Partial<TmmSpec> = {}): TmmSpec => ({ models, instances: inst(), layers: [rl('BK7'), rl('Ag', 50, rough), rl('Water')], lambda: [633], theta, pol: 'p', sweeps: [], ...extra });
  const flat = runTmm(sp()).R;
  const zero = runTmm(sp([R({ size: 0 })])).R;
  const eFlat = Math.max(...flat.map((v, i) => Math.abs(v - zero[i])));
  const plan = roughPlan(sp([R({ size: 3 })]).layers, [], [])!;
  const agD = plan.items.reduce((s, it) => s + (it.kind === 'layer' ? (it.i === 1 ? it.d : 0) : it.d * (it.frac[it.mats.indexOf(1)] ?? 0)), 0);
  const rough = runTmm(sp([R({ size: 3 })])).R;
  if (eFlat > 1e-15 || Math.abs(agD - 50) > 0.05 || Math.max(...rough) === Math.max(...flat)) throw new Error(`rough flat limit ${eFlat}, Ag thickness ${agD}`);
  // (4) RCWA of the pixel slices, cell ≪ λ, TE: each slice acts as ε = Σ f ε (E along the grooves)
  const qs = sp([R({ size: 3, cell: 20, px: 200, cl: 1 })], { theta: [45, 60, 70], pol: 's', rcwa: { orders: 12, show: 0 } });
  const fr = runRcwa(qs).R;
  const qplan = roughPlan(qs.layers, [], [])!;
  const nOf = (m: number) => n(['BK7', 'Ag', 'Water'][m]);
  const qL = qplan.items.map((it) => (it.kind === 'layer' ? { n: nOf(it.i), d: it.d } : { n: csqrt(it.mats.reduce((s, m, j) => cadd(s, cmulC(c(it.frac[j]), cmulC(nOf(m), nOf(m)))), c(0))), d: it.d }));
  const eQs = Math.max(...qs.theta.map((t, i) => Math.abs(fr[i] - tmmPoint(qL, 633, t, 's').R)));
  if (eQs > 1e-5) throw new Error(`rough RCWA quasi-static TE: ${eQs}`);
  // Berreman path (no RCWA) = the effective medium of TMM
  const bL = rcwaLayersAt(sp([R({ size: 3 })]), [], 633).layers;
  const tL = layersAt(sp([R({ size: 3 })]), [], 633);
  const eB = Math.max(...tL.map((q, i) => Math.hypot(q.n.re - bL[i].n!.re, q.n.im - bL[i].n!.im, q.d - bL[i].d)));
  if (bL.length !== tL.length || eB > 1e-14 || bL.some((q) => q.segs)) throw new Error(`rough Berreman layers ${eB}`);
  // (5) Cr 2 nm between two rough interfaces (RMS 1.5 + 1.5 > 2): one zone of three materials; Cr 20 nm: two zones
  const film = (dCr: number) => roughPlan([rl('BK7'), rl('Cr', dCr, [R({ side: 'top', size: 1.5 })]), rl('Au', 45, [R({ side: 'top', size: 1.5, seed: 2 })]), rl('Water')], [], [])!;
  const zonesOf = (p: Plan) => p.items.reduce((z, it, k) => z + (it.kind === 'slice' && p.items[k - 1]?.kind !== 'slice' ? 1 : 0), 0);
  const thin = film(2);
  const thick = film(20);
  if (!(thin.notes.length === 1 && zonesOf(thin) === 1 && thin.items.some((it) => it.kind === 'slice' && it.mats.length === 3) && thick.notes.length === 0 && zonesOf(thick) === 2))
    throw new Error(`rough conformal film: notes ${thin.notes.length}/${thick.notes.length}, zones ${zonesOf(thin)}/${zonesOf(thick)}`);
  // (6) the graph: Ag film → Roughness (bottom, seeds 1…3) → Combine → Compute TMM → Extract data (mean over the seeds)
  const p = sprExample();
  const nodes = [
    ...p.nodes,
    { id: 'rough', type: 'rough', position: { x: 0, y: 0 }, data: { ...ROUGH_DEFAULTS, side: 'bottom', size: 3, tmm: 'profile', ema: 'bruggeman' } },
    { id: 'seeds', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'seed', kind: 'number', mode: 'list', min: 1, max: 3, step: 1, list: '1, 2, 3' } },
    { id: 'avg', type: 'extract', position: { x: 0, y: 0 }, data: { name: '', fields: ['R'], fixed: {}, mean: ['sweep:seeds'] } },
  ] as AppNode[];
  const edges = [
    ...p.edges.map((e) => (e.source === 'ag' && e.target === 'stack' ? { ...e, id: 'rough-stack', source: 'rough' } : e)),
    { id: 'ag-rough', source: 'ag', sourceHandle: 'out', target: 'rough', targetHandle: 'in' },
    { id: 'seeds-rough', source: 'seeds', sourceHandle: 'out', target: 'rough', targetHandle: 'seed' },
    { id: 'tmm-avg', source: 'tmm', sourceHandle: 'out', target: 'avg', targetHandle: 'in' },
  ];
  const ev = evaluateHeadless(nodes, edges, makeLibrary(p.materials)).results;
  const errs = ['rough', 'stack', 'tmm', 'avg'].flatMap((k) => ev.get(k)!.errors.map((e) => `${k}: ${e}`));
  if (errs.length) throw new Error(`Roughness graph: ${errs.join('; ')}`);
  const avg = (ev.get('avg')!.outs.out as { dataset: Dataset }).dataset;
  const th = avg.axes.find((a) => a.id === 'theta')!.values;
  const runs = [1, 2, 3].map((s) => runTmm({ ...sp([R({ size: 3, seed: s })]), theta: th }).R);
  let eAvg = 0;
  let eStd = 0;
  th.forEach((_, i) => {
    const v = runs.map((r) => r[i]);
    const mu = (v[0] + v[1] + v[2]) / 3;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / 2);
    eAvg = Math.max(eAvg, Math.abs(avg.fields.R[i] - mu));
    eStd = Math.max(eStd, Math.abs(avg.fields['R:std'][i] - sd));
  });
  const iMin = argmin([...avg.fields.R]);
  if (eAvg > 1e-14 || eStd > 1e-14 || avg.axes.some((a) => a.id === 'sweep:seeds')) throw new Error(`Roughness graph mean over seeds: ${eAvg}, std ${eStd}`);
  // (7) TMM by the statistics: 'ensemble' = the Gaussian fractions Φ(z/σ) at the slice centres, the same for every seed;
  // 'ramp' + linear in n = n interpolated linearly over 2√3 σ; RCWA keeps the profile of the seed
  const sig = 3;
  const ens = (o: Partial<RoughSpec>) => roughPlan(sp([R({ size: sig, tmm: 'ensemble', ...o })]).layers, [], [], undefined, true)!;
  const pE = ens({});
  const Phi = (x: number) => {
    // the normal distribution function through its inverse (bisection): the same quantile function as the plan
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (normInv(mid) < x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let zc = 50 - sig * normInv(1 - 0.5 / 4096) * (1 + 1e-12);
  let ePhi = 0;
  for (const it of pE.items) {
    if (it.kind !== 'slice') continue;
    const fW = it.frac[it.mats.indexOf(2)] ?? 0;
    ePhi = Math.max(ePhi, Math.abs(fW - Phi((zc + it.d / 2 - 50) / sig)));
    zc += it.d;
  }
  const sameSeed = JSON.stringify(layersAt(sp([R({ size: sig, tmm: 'ensemble', seed: 1 })]), [], 633)) === JSON.stringify(layersAt(sp([R({ size: sig, tmm: 'ensemble', seed: 7, cl: 60 })]), [], 633));
  const rcwaKeeps = JSON.stringify(roughPlan(sp([R({ size: sig, tmm: 'ensemble' })]).layers, [], [], undefined, false)) === JSON.stringify(roughPlan(sp([R({ size: sig })]).layers, [], []));
  const ramp = layersAt(sp([R({ size: sig, tmm: 'ramp', ema: 'linear' })]), [], 633);
  const [nAg, nW] = [n('Ag'), n('Water')];
  let z = 50 - Math.sqrt(3) * sig;
  let eRamp = 0;
  for (const q of ramp.slice(2, -1)) {
    const f = (z + q.d / 2 - (50 - Math.sqrt(3) * sig)) / (2 * Math.sqrt(3) * sig);
    eRamp = Math.max(eRamp, Math.hypot(q.n.re - ((1 - f) * nAg.re + f * nW.re), q.n.im - ((1 - f) * nAg.im + f * nW.im)));
    z += q.d;
  }
  // (8) RCWA pixels, cell ≪ λ, TM: each slice acts as the anisotropic medium ε_xx = (Σ f/ε)⁻¹, ε_zz = Σ f ε (Berreman);
  // a rough Si film (high contrast) under air, a 5 nm cell: RCWA tends to it as the cell shrinks (20 nm: |ΔR| 0.011),
  // Bruggeman stays off (0.033). (A metal's TM staircase does not converge in N here: no reference.)
  const siSpec = (ema: RoughSpec['ema'], extra: Partial<TmmSpec> = {}): TmmSpec => ({ models, instances: inst(), layers: [rl('Air'), rl('Si', 80, [R({ size: 3, cell: 5, px: 200, cl: 0.25, ema })]), rl('BK7')], lambda: [633], theta: [20, 45, 60, 70], pol: 'p', sweeps: [], ...extra });
  const frp = runRcwa(siSpec('bruggeman', { rcwa: { orders: 25, show: 0 } })).R;
  const fb = runSpec(siSpec('aniso', { b4: { phi: 0 } })).R as Float64Array;
  const brugTM = runTmm(siSpec('bruggeman')).R;
  const eTM = Math.max(...[0, 1, 2, 3].map((i) => Math.abs(frp[i] - fb[i])));
  const eBrug = Math.max(...[0, 1, 2, 3].map((i) => Math.abs(frp[i] - brugTM[i])));
  // (9) a film replicating the interface before it: the correlation of the two surfaces = ρ (Cr 20 nm, two zones)
  const corrPlan = (rho: number) => roughPlan([rl('BK7'), rl('Cr', 20, [R({ side: 'top', size: 1.5 })]), rl('Au', 45, [R({ side: 'top', size: 1.5, seed: 2, corr: rho })]), rl('Water')], [], [])!;
  const ccOf = (p: Plan) => {
    const [a, b] = [p.zones[0].S[0], p.zones[1].S[0]];
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let [sab, saa, sbb] = [0, 0, 0];
    a.forEach((v, i) => ((sab += (v - ma) * (b[i] - mb)), (saa += (v - ma) ** 2), (sbb += (b[i] - mb) ** 2)));
    return sab / Math.sqrt(saa * sbb);
  };
  const cc = [0, 0.5, 1].map((rho) => ccOf(corrPlan(rho)));
  const okCorr = Math.abs(cc[0]) < 0.15 && Math.abs(cc[1] - 0.5) < 0.15 && cc[2] > 0.999999;
  // (10) the shape medium: L = 0 / 1 = the Wiener means, 1/3 = Bruggeman; depolarization factors (sum 1, limits); its
  // tensor tends to the horizontal (q → 0) and vertical (q → ∞) Wiener bounds
  const eA = n('Au'), eWt = n('Water');
  const es = [cmulC(eA, eA), cmulC(eWt, eWt)];
  const fs = [0.37, 0.63];
  const ar = cadd(cmulC(c(fs[0]), es[0]), cmulC(c(fs[1]), es[1]));
  const hm = cdiv(c(1), cadd(cdiv(c(fs[0]), es[0]), cdiv(c(fs[1]), es[1])));
  const dz = (a: { re: number; im: number }, b: { re: number; im: number }) => Math.hypot(a.re - b.re, a.im - b.im) / Math.hypot(b.re, b.im);
  const eL = Math.max(dz(brugL(es, fs, 0), ar), dz(brugL(es, fs, 1), hm), dz(brugL(es, fs, 1 / 3), emaMix('bruggeman', es, fs)), dz(brugL([...es, es[0]], [0.2, 0.63, 0.17], 1 / 3), emaMix('bruggeman', es, fs)));
  const f1 = shapeFactors(0.2, '1d'), f2 = shapeFactors(0.2, '2d'), f3 = shapeFactors(5, '2d'), f4 = shapeFactors(1, '2d');
  const okL = Math.abs(f1[0] + f1[2] - 1) < 1e-15 && f1[1] === 0 && Math.abs(f2[0] + f2[1] + f2[2] - 1) < 1e-14 && f2[2] > 0.7 && f3[2] < 0.1 && Math.abs(f4[2] - 1 / 3) < 1e-12 && shapeFactors(1e-6, '2d')[2] > 0.9999 && shapeFactors(1e6, '1d')[0] > 0.9999;
  // (11) against RCWA of the smooth profile (scripts/bench-rough.ts, FFF N 40, 3 seeds): rough gold RMS 3 / cl 15 → dip
  // 74.16°, RMS 1 / cl 15 → 72.33°; TiO₂ 120 nm RMS 3 → R(450 nm) 0.1392; the 1D shape medium, nothing fitted
  const shapeDip = (size: number, cl: number) => {
    const ths = rangeValues(70, 77, 0.01) as number[];
    const Rs = runSpec({ models, instances: inst(), layers: [rl('BK7'), rl('Au', 50, [R({ size, cl, cell: 300, slices: 20, tmm: 'ensemble', ema: 'shape' })]), rl('Water')], lambda: [633], theta: ths, pol: 'p', sweeps: [], b4: { phi: 0 } }).R as Float64Array;
    return ths[argmin(Rs)];
  };
  const dAu3 = shapeDip(3, 15) - 74.16;
  const dAu1 = shapeDip(1, 15) - 72.33;
  const rTi = (runSpec({ models, instances: inst(), layers: [rl('Air'), rl('TiO2', 120, [R({ side: 'top', size: 3, cl: 20, cell: 300, slices: 20, tmm: 'ensemble', ema: 'shape' })]), rl('BK7')], lambda: [450], theta: [0], pol: 'p', sweeps: [], b4: { phi: 0 } }).R as Float64Array)[0] - 0.1392;
  const okBench = Math.abs(dAu3) < 0.25 && Math.abs(dAu1) < 0.1 && Math.abs(rTi) < 1e-3;
  // (12) the tensor slices in plain TMM (diagonal ε: TE ε_yy, TM ε_xx / ε_zz) = Berreman: a 1D profile at φ = 0, a 2D
  // surface and Wiener at any φ; R, T, r, t
  const tensSpec = (ema: RoughSpec['ema'], surf: '1d' | '2d', pol: 'p' | 's', extra: Partial<TmmSpec> = {}): TmmSpec => ({ models, instances: inst(), layers: [rl('BK7'), rl('Au', 50, [R({ size: 3, cl: 15, cell: 300, slices: 12, tmm: 'ensemble', ema, surf })]), rl('Water')], lambda: [633, 700], theta: [40, 65, 72, 75], pol, sweeps: [], ...extra });
  let eTens = 0;
  for (const [ema, surf, phi] of [['shape', '1d', 0], ['shape', '2d', 30], ['wiener', '1d', 45], ['aniso', '1d', 0]] as const)
    for (const pol of ['p', 's'] as const) {
      const a = runTmm(tensSpec(ema, surf, pol));
      const b = runSpec(tensSpec(ema, surf, pol, { b4: { phi } }));
      for (const f of ['R', 'T', 'rRe', 'rIm'] as const) eTens = Math.max(eTens, ...Array.from(a[f], (v, i) => Math.abs(v - (b[f] as Float64Array)[i])));
    }
  if (!(ePhi < 5e-4 && sameSeed && rcwaKeeps && eRamp < 2e-3 && eTM < 5e-3 && eTM < eBrug / 5 && okCorr && eL < 1e-10 && okL && okBench && eTens < 1e-10))
    throw new Error(`rough statistics: Φ ${ePhi}, seeds ${sameSeed}, RCWA profile ${rcwaKeeps}, ramp ${eRamp}, TM anisotropic ${eTM} (Bruggeman ${eBrug}), correlation ${cc}, shape medium ${eL} ${okL}, vs RCWA Au ${dAu3} / ${dAu1}, TiO₂ ${rTi}, TMM tensor slices vs Berreman ${eTens}`);
  console.log(
    `roughness: RMS / pp exact, mean cl over 20 seeds ${clMean.toFixed(2)} (20); RMS 0 = flat; Ag thickness kept ${agD.toFixed(3)} nm; RCWA pixels, TE quasi-static = Σfε slices (${eQs.toExponential(1)}); Cr 2 nm conformal (one zone), 20 nm two zones; graph: seeds 1–3 averaged = runs (${eAvg.toExponential(1)}), SPR dip ${th[iMin].toFixed(2)}° R ${avg.fields.R[iMin].toFixed(4)} ± ${avg.fields['R:std'][iMin].toFixed(4)}; ensemble = Φ(z/σ) (${ePhi.toExponential(1)}), no seed; ramp + linear n (${eRamp.toExponential(1)}); RCWA pixels TM quasi-static = anisotropic slices (${eTM.toExponential(1)}; Bruggeman ${eBrug.toExponential(1)}); replicated faces ρ 0 / 0.5 / 1 → ${cc.map((v) => v.toFixed(2)).join(' / ')}; shape medium: L 0 / 1 / ⅓ = Wiener / Bruggeman (${eL.toExponential(1)}), vs RCWA (smooth profile): Au dip ${dAu3 >= 0 ? '+' : ''}${dAu3.toFixed(2)}° (RMS 3) / ${dAu1 >= 0 ? '+' : ''}${dAu1.toFixed(2)}° (RMS 1), TiO₂ R ${rTi >= 0 ? '+' : ''}${rTi.toExponential(1)}; tensor slices in plain TMM = Berreman (${eTens.toExponential(1)})`,
  );
}

// RCWA map orders and Gibbs smoothing: σ factors; no smoothing = the exact sums; the node's own N reaches the job; the
// Lanczos map converges (gold grating, TM, at the plasmon: the raw derivatives Ex, Ez ripple across the whole grating)
if (full('RCWA map orders, Lanczos (12 s)')) {
  const sl = sigmaFactors(7, 'lanczos');
  const sf = sigmaFactors(7, 'fejer');
  const s0 = sigmaFactors(7);
  const sOk = s0.every((v) => v === 1) && sl[3] === 1 && sf[3] === 1 && Math.abs(sl[0] - Math.sin(0.75 * Math.PI) / (0.75 * Math.PI)) < 1e-15 && Math.abs(sf[6] - 0.25) < 1e-15 && sl[1] === sl[5];
  const au = n('Au');
  const G: RcwaLayer[] = [{ n: c(1), d: 0 }, { d: 40, segs: [{ from: 0, to: 0.25, n: c(1) }, { from: 0.25, to: 0.75, n: au }, { from: 0.75, to: 1, n: c(1) }] }, { n: au, d: 0 }];
  const nx = 400;
  const lineAt = (N: number, sigma?: 'lanczos' | 'fejer') => Array.from(fieldMap(rcwaSolve(G, 500, 633, 10.45, 'p', N, 'li'), G, 500, 'p', { quantity: 'E2', part: 'abs', periods: 1, nx, nz: 2, zIn: 0, zOut: 0, x0: 0, x1: 500, z0: 20, z1: 20.000001, sigma }).values.subarray(0, nx));
  const xs = Array.from({ length: nx }, (_, i) => (i / (nx - 1)) * 500);
  const far = xs.map((x) => Math.min(Math.abs(x - 125), Math.abs(x - 375)) > 15);
  const rel = (a: number[], r: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (far[i] ? (v - r[i]) ** 2 : 0), 0) / r.reduce((s, v, i) => s + (far[i] ? v * v : 0), 0));
  const ref = lineAt(160, 'lanczos');
  const [raw, lan] = [rel(lineAt(60), ref), rel(lineAt(60, 'lanczos'), ref)];
  if (!(sOk && lan < 0.03 && raw > 0.1)) throw new Error(`Gibbs smoothing: factors ${sOk}, |E|² error N = 60 raw ${raw}, Lanczos ${lan}`);
  // through the graph: the map's N and the smoothing go into the job; the job's map = the direct map at that N
  const gp = gratingSprExample();
  const glib = makeLibrary(gp.materials);
  const withFm = (patch: object) => gp.nodes.map((m) => (m.id === 'fm' ? ({ ...m, data: { ...m.data, ...patch } } as AppNode) : m));
  const info = (patch: object) => evaluateHeadless(withFm(patch), gp.edges, glib).results.get('fm')!;
  const i0 = info({}).info as RcwaFieldInfo;
  const i1 = info({ orders: 40, sigma: 'lanczos' }).info as RcwaFieldInfo;
  const same = info({ orders: 15, sigma: 'none' }).info as RcwaFieldInfo; // = the Compute's N, no smoothing: the same job
  const bad = info({ orders: 2.5 });
  const j = i1.job!;
  const direct = fieldMapOfJob(j, { nx: 9, nz: 9 }).map;
  const st = rcwaLayersAt(j.spec, j.idx, j.lam);
  const ref2 = fieldMap(rcwaSolve(st.layers, st.period, j.lam, j.theta, j.pol, 40, 'li'), st.layers, st.period, j.pol, { quantity: j.quantity, part: j.part, periods: j.periods, nx: 9, nz: 9, zIn: j.zIn, zOut: j.zOut, sigma: 'lanczos' });
  const e2 = Math.max(...direct.values.map((v, i) => Math.abs(v - ref2.values[i])));
  const jobOk = j.orders === 40 && j.sigma === 'lanczos' && i1.key !== i0.key && same.key === i0.key && !i0.job!.orders && bad.errors.some((e) => e.startsWith('Orders N of the map'));
  if (!(jobOk && e2 < 1e-12)) throw new Error(`map orders through the graph: job ${jobOk}, map ${e2}`);
  console.log(`RCWA map orders / Gibbs smoothing: σ factors (Lanczos sinc, Fejér 1 − |p|/(N+1)); gold grating |E|² in the grating at N = 60 vs N = 160 (Lanczos): raw ${(100 * raw).toFixed(1)} %, Lanczos ${(100 * lan).toFixed(1)} %; the node's N and smoothing reach the job (map = direct, ${e2.toExponential(1)}), N = the Compute's = the same job; N 2.5 refused`);
}

// Field profile cut from an RCWA field map along x at a depth z: the row of the map, the grating's materials as bands
{
  const gp = gratingSprExample();
  const glib = makeLibrary(gp.materials);
  const fi = evaluateHeadless(gp.nodes, gp.edges, glib).results.get('fm')!.info as RcwaFieldInfo;
  const { map, period } = fieldMapOfJob(fi.job!, { nx: 41, nz: 31 });
  fieldResults.set('fm', { key: fi.key, map, period });
  const withCut = (patch: object) => gp.nodes.map((m) => (m.id === 'cut' ? ({ ...m, data: { ...m.data, ...patch } } as AppNode) : m));
  const iz = map.zs.findIndex((z) => z > 10 && z < 30);
  const r = evaluateHeadless(withCut({ cut: 'x', at: { z: iz } }), gp.edges, glib).results.get('cut')!;
  const rz = evaluateHeadless(withCut({ cut: 'z', at: { x: 7 } }), gp.edges, glib).results.get('cut')!;
  fieldResults.delete('fm');
  const ds = (r.outs.out as { dataset: Dataset }).dataset;
  const inf = r.info as FieldInfo;
  const e = Math.max(...map.xs.map((_, i) => Math.abs(ds.fields.f[i] - map.values[iz * map.xs.length + i])));
  const dz = (rz.outs.out as { dataset: Dataset }).dataset;
  const ez = Math.max(...map.zs.map((_, k) => Math.abs(dz.fields.f[k] - map.values[k * map.xs.length + 7])));
  // two periods of a lamellar grating: ridge / groove bands, walls inside the view
  const ok2 = ds.axes[0].id === 'x' && inf.rcwa?.along === 'x' && inf.bands.length >= 4 && inf.boundaries.length >= 3 && Math.abs(inf.rcwa.zAt - map.zs[iz]) < 1e-12;
  if (!(e === 0 && ez === 0 && ok2 && !r.errors.length)) throw new Error(`RCWA map cut along x: ${e}, along z ${ez}, bands ${inf.bands.length}, walls ${inf.boundaries.length}`);
  console.log(`RCWA map cut along x at z = ${map.zs[iz].toFixed(1)} nm = the map row (exact), ${inf.bands.length} material bands, ${inf.boundaries.length} walls; along z = the map column (exact)`);
}

// Tolerance: layers and materials left out or with their own σ; the instrument (blur and detector noise, engine/
// instrument.ts) and the dip position by a polynomial fit or the centroid (engine/metrics.ts locate)
{
  // (a) per layer / material: layer 2 without thickness errors, layer 3 without Δn, layer 1 with its own σ(Δn),
  // SiO₂ without a systematic thickness error, TiO₂ with its own systematic σ(Δn)
  const p = toleranceExample();
  const lib2 = makeLibrary(p.materials);
  const tolOf = (patch: Partial<ToleranceData>, more: AppNode[] = [], moreEdges: typeof p.edges = []) => {
    const nodes = [...p.nodes.map((m) => (m.id === 'tol' ? ({ ...m, data: { ...m.data, ...patch } } as AppNode) : m)), ...more];
    const r = evaluateHeadless(nodes, [...p.edges, ...moreEdges], lib2).results.get('tol')!;
    if (r.errors.length) throw new Error(`tolerance: ${r.errors}`);
    return r;
  };
  const mats = (tolOf({ samples: 2 }).info as ToleranceInfo).materials;
  const sio2 = mats.find((m) => m.name.startsWith('SiO'))!.key;
  const tio2 = mats.find((m) => m.name.startsWith('TiO'))!.key;
  const N = 400;
  const r = tolOf({ samples: N, dSigma: 2, dSys: 1, dSkip: [1], index: true, nSigma: 0.01, nSys: 0.004, nSkip: [2], nOverride: { '0': 0.03 }, sysSkipD: [sio2], nSysOverride: { [tio2]: 0.02 } });
  const er = (r.outs.errors as { dataset: Dataset }).dataset;
  const sd = (k: string) => {
    const v = Array.from(er.fields[k]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  };
  const keys = er.meta.map((m) => m.key);
  const sysKeys = er.meta.filter((m) => m.key.startsWith('sd')).map((m) => m.label);
  const nSysT = er.meta.find((m) => m.label.startsWith('Δn TiO') && m.label.includes('systematic'))!.key;
  const okSkip = !keys.includes('d1') && keys.includes('d0') && keys.includes('d2') && !keys.includes('n2') && keys.includes('n1') && sysKeys.length === 1 && sysKeys[0].includes('TiO');
  const okSig = Math.abs(sd('n0') / 0.03 - 1) < 0.12 && Math.abs(sd('n1') / 0.01 - 1) < 0.12 && Math.abs(sd(nSysT) / 0.02 - 1) < 0.12;
  if (!(okSkip && okSig)) throw new Error(`tolerance per layer / material: skip ${okSkip} (${keys.join(',')}), σ n0 ${sd('n0')}, n1 ${sd('n1')}, sys TiO₂ ${sd(nSysT)}`);

  // (b) the convolution: Gaussian σ on y = x² adds σ² (kernel cut at ±4σ), uniform ± a adds a²/3; a line is unchanged
  const xs = Array.from({ length: 2001 }, (_, i) => -10 + i * 0.01);
  const synth = (f: (x: number) => number, id: string): Dataset => ({ key: 'syn', axes: [{ id, label: id, unit: '', values: xs }], fields: { R: Float64Array.from(xs, f), T: new Float64Array(xs.length), A: Float64Array.from(xs, (x) => 1 - f(x)) }, meta: [], size: xs.length });
  const inst0 = { along: 'theta', spread: 0, shape: 'gauss' as const, band: 0, add: 0, shot: 0, source: 0, avg: 1, bits: 0, seed: 1 };
  const gq = degrade(synth((x) => x * x, 'theta'), { ...inst0, spread: 0.5 }, 0, false).fields.R[1000];
  const uq = degrade(synth((x) => x * x, 'theta'), { ...inst0, spread: 0.6, shape: 'uniform' }, 0, false).fields.R[1000];
  const bq = degrade(synth((x) => x * x, 'lambda'), { ...inst0, along: 'lambda', band: 2.3548 }, 0, false).fields.R[1000]; // FWHM 2.3548 nm = σ 1
  const lin = degrade(synth((x) => 0.3 + 0.01 * x, 'theta'), { ...inst0, spread: 0.5 }, 0, false).fields.R;
  const eLin = Math.max(...Array.from(lin.subarray(300, 1700), (v, i) => Math.abs(v - (0.3 + 0.01 * xs[i + 300]))));
  if (!(Math.abs(gq / 0.25 - 1) < 3e-3 && Math.abs(uq / 0.12 - 1) < 2e-3 && Math.abs(bq - 1) < 3e-3 && eLin < 1e-12)) throw new Error(`instrument blur: Gaussian ${gq} (0.25), uniform ${uq} (0.12), bandwidth ${bq} (1), line ${eLin}`);

  // (c) detector noise (no fabrication errors: the nominal repeated): additive σ, shot √(R/N), K scans, ADC steps
  const noiseStd = (patch: Partial<ToleranceData>) => {
    const rr = tolOf({ samples: N, thickness: false, noise: true, noiseAdd: 0, ...patch });
    const smp = (rr.outs.samples as { dataset: Dataset }).dataset;
    const st = (rr.outs.out as { dataset: Dataset }).dataset;
    const L = smp.size / N;
    let s2 = 0;
    let pred = 0;
    for (let i = 0; i < L; i++) {
      const R0 = st.fields.R[i];
      for (let s = 0; s < N; s++) s2 += (smp.fields.R[s * L + i] - R0) ** 2;
      pred += patch.noiseShot ? R0 / patch.noiseShot : 0;
    }
    return { std: Math.sqrt(s2 / (N * L)), shot: Math.sqrt(pred / L), smp };
  };
  const nAdd = noiseStd({ noiseAdd: 0.002 }).std;
  const nAvg = noiseStd({ noiseAdd: 0.002, noiseAvg: 4 }).std;
  const shot = noiseStd({ noiseShot: 1e4 });
  const q = noiseStd({ noiseBits: 8 }).smp.fields.R;
  const qOk = Array.from(q).every((v) => Math.abs(v * 256 - Math.round(v * 256)) < 1e-9);
  if (!(Math.abs(nAdd / 0.002 - 1) < 0.03 && Math.abs(nAvg / 0.001 - 1) < 0.03 && Math.abs(shot.std / shot.shot - 1) < 0.05 && qOk))
    throw new Error(`detector noise: additive ${nAdd} (0.002), 4 scans ${nAvg} (0.001), shot ${shot.std} vs ${shot.shot}, ADC steps ${qOk}`);

  // (d) the dip of a noisy Lorentzian: the polynomial fit and the centroid scatter far less than the 3-point parabola
  const xl = Array.from({ length: 401 }, (_, i) => 60 + i * 0.05);
  const clean = xl.map((x) => 1 - 0.9 / (1 + ((x - 70.123) / 0.6) ** 2));
  const rnd = rngOpt(5);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const pos: Record<string, number[]> = { parabola: [], poly: [], centroid: [] };
  for (let t = 0; t < 200; t++) {
    const ys = clean.map((y) => y + 0.002 * gauss());
    for (const m of ['parabola', 'poly', 'centroid'] as const) pos[m].push(locate(xl, ys, 0, 400, 'min', { method: m, level: 0.5, deg: 2 }).x);
  }
  const msd = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return [m - 70.123, Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)];
  };
  const sP = msd(pos.parabola)[1];
  const [bF, sF] = msd(pos.poly);
  const [bC, sC] = msd(pos.centroid);
  if (!(sF < sP / 5 && sC < sP / 5 && Math.abs(bF) < 1e-3 && Math.abs(bC) < 1e-3)) throw new Error(`dip position with noise: parabola σ ${sP}, poly σ ${sF} (bias ${bF}), centroid σ ${sC} (bias ${bC})`);

  // (e) SPR: Sensitivity as a criterion of noisy samples (centroid): its n + Δn curves get the same instrument, so the
  // samples' S scatter around the S of the blurred nominal, without a bias; blur only: every sample's S is that S
  const sp = sprExample();
  const slib = makeLibrary(sp.materials);
  const sens = (patch: Partial<ToleranceData>) => {
    const nodes = sp.nodes.map((m) => (m.id === 'sens' ? ({ ...m, data: { ...m.data, locate: 'centroid', locLevel: 0.5 } } as AppNode) : m));
    const tol: AppNode = { id: 'tol', type: 'tolerance', position: { x: 0, y: 0 }, data: { ...TOLERANCE_DEFAULTS, samples: 60, thickness: false, spreadOn: true, spread: 0.1, criteria: [{ source: 'sens', field: 'S', min: NaN, max: NaN }], ...patch } };
    const edges = [...sp.edges, { id: 'e1', source: 'tmm', sourceHandle: 'out', target: 'tol', targetHandle: 'in' }, { id: 'e2', source: 'sens', sourceHandle: 'metrics', target: 'tol', targetHandle: 'criteria' }];
    const rr = evaluateHeadless([...nodes, tol], edges, slib).results.get('tol')!;
    if (rr.errors.length) throw new Error(`SPR tolerance: ${rr.errors}`);
    return (rr.info as ToleranceInfo).criteria![0].rows[0];
  };
  const blurOnly = sens({});
  const noisyS = sens({ noise: true, noiseAdd: 0.003 });
  const okBlur = blurOnly.std < 1e-9 * Math.abs(blurOnly.mean);
  const okNoise = noisyS.std > 0 && Math.abs(noisyS.mean - blurOnly.mean) < 4 * (noisyS.std / Math.sqrt(60)) + 1e-6 * Math.abs(blurOnly.mean);
  if (!(okBlur && okNoise)) throw new Error(`SPR sensitivity with the instrument: blur only ${blurOnly.mean} ± ${blurOnly.std}, noisy ${noisyS.mean} ± ${noisyS.std}`);

  console.log(
    [
      `tolerance per layer / material: layers without d or Δn errors get none, own σ(Δn) ${sd('n0').toFixed(4)} (0.03), SiO₂ without systematic d, TiO₂ systematic σ(Δn) ${sd(nSysT).toFixed(4)} (0.02)`,
      `instrument blur: Gaussian σ 0.5 on x² → +${gq.toFixed(4)} (σ² = 0.25), uniform ±0.6 → +${uq.toFixed(4)} (a²/3 = 0.12), bandwidth FWHM 2.355 nm → +${bq.toFixed(4)} (1), a line unchanged; noise: additive ${nAdd.toFixed(5)} (0.002), 4 scans ${nAvg.toFixed(5)} (0.001), shot ${shot.std.toFixed(5)} vs √(R/N) ${shot.shot.toFixed(5)}, 8-bit ADC steps`,
      `dip of a noisy Lorentzian (σ 0.002): position σ parabola ${sP.toExponential(1)}, polynomial ${sF.toExponential(1)}, centroid ${sC.toExponential(1)}; SPR sensitivity (centroid) on noisy samples ${noisyS.mean.toFixed(2)} ± ${noisyS.std.toFixed(2)} vs blurred nominal ${blurOnly.mean.toFixed(2)} °/RIU`,
    ].join('\n'),
  );
}

// Tolerance with λ and θ both ranges: the λ limits follow λ (before: θ, the limits tested nothing, yield 100 %); a sample
// passes only when all of its angles do; limits along θ are reported as testing nothing
{
  const p = toleranceExample();
  const lib2 = makeLibrary(p.materials);
  const nodes = (patch: object) =>
    p.nodes.map((m) =>
      m.id === 'th' ? ({ ...m, data: { ...m.data, mode: 'range', min: 0, max: 20, step: 10 } } as AppNode) : m.id === 'tol' ? ({ ...m, data: { ...m.data, samples: 200, ...patch } } as AppNode) : m,
    );
  const r = evaluateHeadless(nodes({}), p.edges, lib2).results.get('tol')!;
  const inf = r.info as ToleranceInfo;
  const smp = (r.outs.samples as { dataset: Dataset }).dataset;
  // axes: sample × λ × θ (no sweeps)
  const [sA, lA, tA] = ['sample', 'lambda', 'theta'].map((id) => smp.axes.findIndex((a) => a.id === id));
  const st = strides(smp.axes);
  const lams = smp.axes[lA].values;
  const nT = smp.axes[tA].values.length;
  const passManual = Array.from({ length: 200 }, (_, s) =>
    lams.every((l, i) => l < 450 || l > 700 || Array.from({ length: nT }, (_, t) => smp.fields.R[s * st[sA] + i * st[lA] + t * st[tA]]).every((v) => v <= 0.005)),
  );
  const yManual = (100 * passManual.filter(Boolean).length) / 200;
  const rT = evaluateHeadless(nodes({ along: 'theta' }), p.edges, lib2).results.get('tol')!;
  const okAxis = inf.along === 'lambda' && inf.axes.length === 2 && (rT.info as ToleranceInfo).along === 'theta' && (rT.info as ToleranceInfo).yieldPct === 100 && rT.warnings.some((w) => w.includes('tests nothing'));
  if (!(okAxis && Math.abs(inf.yieldPct - yManual) < 1e-9 && inf.yieldPct < 100 && !r.warnings.some((w) => w.includes('tests nothing'))))
    throw new Error(`Tolerance λ limits with a θ range: along ${inf.along}, yield ${inf.yieldPct} vs ${yManual}, θ-axis warning ${okAxis}`);
  console.log(`Tolerance with λ and θ ranges: the λ limits follow λ (auto), yield ${inf.yieldPct.toFixed(1)} % = direct count over all 3 angles (was 100 % along θ); limits along θ reported as testing nothing`);
}

// Group delay: a BK7 plate inside BK7 (no reflection) delays by n_g d / c, its GDD = (d/c)(2 dn/dω + ω d²n/dω²); phases
// of the RCWA orders: the zeroth = φr, φt; shifting the grating by s periods turns order m by −360·m·s
{
  const lamG = Array.from({ length: 201 }, (_, i) => 700 + i);
  const dG = 5000;
  const fG = runSpec({ models, instances: inst(), layers: [layer('BK7'), layer('BK7', dG), layer('BK7')], lambda: lamG, theta: [0], pol: 's', sweeps: [] }) as unknown as Record<string, Float64Array>;
  const cN = 299.792458;
  const nw = (om: number) => n('BK7', (2 * Math.PI * cN) / om).re;
  const W = (2 * Math.PI * cN) / lamG[100];
  const dW = W * 1e-5;
  const n1 = (nw(W + dW) - nw(W - dW)) / (2 * dW);
  const n2 = (nw(W + dW) - 2 * nw(W) + nw(W - dW)) / dW ** 2;
  const gd = (dG / cN) * (nw(W) + W * n1);
  const gdd = (dG / cN) * (2 * n1 + W * n2);
  const eGd = Math.abs(fG.GDT[100] / gd - 1);
  const eGdd = Math.abs(fG.GDDT[100] / gdd - 1);
  const metaOk = metaOfSpec({ models, instances: inst(), layers: [], lambda: lamG, theta: [0], pol: 's', sweeps: [] }).some((m) => m.key === 'GDDR') && !metaOfSpec({ models, instances: inst(), layers: [], lambda: [600, 700], theta: [0], pol: 's', sweeps: [] }).some((m) => m.key === 'GDR');
  if (!(eGd < 1e-6 && eGdd < 1e-3 && Math.abs(fG.GDR[100]) < 1e-6 && metaOk)) throw new Error(`group delay: GD ${fG.GDT[100]} vs ${gd}, GDD ${fG.GDDT[100]} vs ${gdd}, meta ${metaOk}`);
  const Gr = (shift: number): LayerSpec => ({ ...layer('Air', 300), grating: { profile: 'trapezoid', period: 900, fill: 0.6, fillTop: 0.3, shift, slices: 8, nx: 32, pixels: [], mats: ['TiO2', 'Air'] } });
  let ePh = 0;
  let e0 = 0;
  let nanOk = true;
  for (const pol of ['s', 'p'] as const) {
    const run = (s: number) => runSpec({ models, instances: inst(), layers: [layer('Air'), Gr(s), layer('BK7')], lambda: [633], theta: [7], pol, sweeps: [], rcwa: { orders: 20, show: 2 } }) as unknown as Record<string, Float64Array>;
    const a = run(0);
    const b = run(0.13);
    const wr = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
    e0 = Math.max(e0, Math.abs(a.R_0_ph[0] - a.phiR[0]), Math.abs(a.T_0_ph[0] - a.phiT[0]));
    for (const m of [-2, -1, 1, 2])
      for (const q of ['R', 'T']) {
        const k = `${q}_${m < 0 ? `m${-m}` : `p${m}`}`;
        if (a[k][0] > 0) ePh = Math.max(ePh, Math.abs(wr(b[`${k}_ph`][0] - a[`${k}_ph`][0] + 360 * m * 0.13)));
        else nanOk &&= Number.isNaN(a[`${k}_ph`][0]);
      }
  }
  if (!(ePh < 1e-9 && e0 === 0 && nanOk)) throw new Error(`RCWA order phases: shift ${ePh}, zeroth ${e0}, evanescent NaN ${nanOk}`);
  console.log(`group delay: BK7 plate 5 µm GD = n_g d/c (${eGd.toExponential(1)}), GDD (${eGdd.toExponential(1)}), GD r = 0; RCWA order phases: zeroth = φr, φt (exact), grating shifted by 0.13 Λ → order m turns by −360·m·s (${ePh.toExponential(1)}, TE and TM, R and T), evanescent orders NaN`);
}

// GD sampling: the DBR microcavity mode every 0.5 nm is undersampled (a note on Compute, GD far from converged); every
// 0.05 nm around it the GD converges (vs 0.01 nm) and there is no note
{
  const p = dbrExample();
  const at = (lo: number, hi: number, step: number) => {
    const nodes = p.nodes.map((m) => (m.id === 'wl' ? ({ ...m, data: { ...m.data, min: lo, max: hi, step } } as AppNode) : m));
    const r = evaluateHeadless(nodes, p.edges, makeLibrary(p.materials)).results.get('tmm0')!;
    const ds = (r.outs.out as { dataset: Dataset }).dataset;
    const lam = ds.axes.find((a) => a.id === 'lambda')!.values;
    let k = -1;
    for (let i = 0; i < lam.length; i++) if (lam[i] > 640 && lam[i] < 665 && (k < 0 || Math.abs(ds.fields.GDR[i]) > Math.abs(ds.fields.GDR[k]))) k = i;
    return { gd: ds.fields.GDR[k], note: (r.info as ComputeInfo).gdNote };
  };
  const [coarse, fine, finer] = [at(450, 900, 0.5), at(640, 665, 0.05), at(640, 665, 0.01)];
  if (!(coarse.note && !fine.note && Math.abs(fine.gd / finer.gd - 1) < 0.05 && Math.abs(coarse.gd / finer.gd - 1) > 0.5))
    throw new Error(`GD sampling note: coarse ${coarse.gd} (${!!coarse.note}), fine ${fine.gd} (${!!fine.note}), finer ${finer.gd}`);
  console.log(`GD sampling: DBR cavity mode GD r = ${finer.gd.toFixed(0)} fs (0.01 nm step), ${fine.gd.toFixed(0)} fs at 0.05 nm (no note), ${coarse.gd.toFixed(0)} fs at 0.5 nm with the undersampling note`);
}

// Complex r and t: |r|² = R, arg = φr / φt, T_s = |t|² Re(q_exit) / q₀ (absorbing exit medium Si); the same r, t from the
// Berreman 4×4 solver and from RCWA (no grating: planar path), and of a grating between the planar and the conical RCWA
// (φ → 0); complex formulas of Custom data (real, imag, abs, arg, conj, i) and a complex result read again downstream
{
  const st = [layer('BK7'), layer('Au', 38), layer('TiO2', 85), layer('Si')];
  const lamC = [550, 633, 780];
  const thC = [0, 25, 50];
  const base = { models, instances: inst(), layers: st, lambda: lamC, theta: thC, sweeps: [] as number[] };
  let eSelf = 0;
  let eB4 = 0;
  let eRc = 0;
  for (const pol of ['s', 'p'] as const) {
    const t = runSpec({ ...base, pol }) as unknown as Record<string, Float64Array>;
    const b = runSpec({ ...base, pol, b4: { phi: 0 } }) as unknown as Record<string, Float64Array>;
    const r = runSpec({ ...base, pol, rcwa: { orders: 5, show: 0 } }) as unknown as Record<string, Float64Array>;
    for (let k = 0; k < t.R.length; k++) {
      const wr = (x: number) => Math.abs(((((x + 180) % 360) + 360) % 360) - 180);
      const toDeg = 180 / Math.PI;
      eSelf = Math.max(eSelf, Math.abs(t.rRe[k] ** 2 + t.rIm[k] ** 2 - t.R[k]), wr(Math.atan2(t.rIm[k], t.rRe[k]) * toDeg - t.phiR[k]) / 360, wr(Math.atan2(t.tIm[k], t.tRe[k]) * toDeg - t.phiT[k]) / 360);
      if (pol === 's') {
        const th = thC[k % thC.length];
        const lam = lamC[Math.floor(k / thC.length)];
        const n0 = n('BK7', lam).re;
        const kx = n0 * Math.sin((th * Math.PI) / 180);
        const q = csqrt(csub(cmulC(n('Si', lam), n('Si', lam)), c(kx * kx)));
        eSelf = Math.max(eSelf, Math.abs(((t.tRe[k] ** 2 + t.tIm[k] ** 2) * q.re) / (n0 * Math.cos((th * Math.PI) / 180)) - t.T[k]));
      }
      for (const f of ['rRe', 'rIm', 'tRe', 'tIm']) {
        eB4 = Math.max(eB4, Math.abs(b[f][k] - t[f][k]));
        eRc = Math.max(eRc, Math.abs(r[f][k] - t[f][k]));
      }
    }
  }
  // a grating: planar RCWA vs the conical solver at φ = 1e-7° (TM: t of E from t of H in both)
  const Gr: LayerSpec = { ...layer('Air', 120), grating: { profile: 'trapezoid', period: 500, fill: 0.5, fillTop: 0.5, shift: 0, slices: 1, nx: 32, pixels: [], mats: ['Au', 'Air'] } };
  let eCon = 0;
  for (const pol of ['s', 'p'] as const) {
    const g = { models, instances: inst(), layers: [layer('BK7'), Gr, layer('Si')], lambda: [633], theta: [20], pol, sweeps: [] as number[] };
    const a = runSpec({ ...g, rcwa: { orders: 12, show: 0 } }) as unknown as Record<string, Float64Array>;
    const b = runSpec({ ...g, rcwa: { orders: 12, show: 0, conical: true, phi: 1e-7 } }) as unknown as Record<string, Float64Array>;
    for (const f of ['rRe', 'rIm', 'tRe', 'tIm']) eCon = Math.max(eCon, Math.abs(a[f][0] - b[f][0]));
  }
  const jonesNaN = runSpec({ ...base, pol: 'p', b4: { phi: 0, jones: { psi: 45, delta: 90 } } }) as unknown as Record<string, Float64Array>;
  const nanOk = Number.isNaN(jonesNaN.rRe[0]) && Number.isNaN(jonesNaN.tIm[0]);
  if (!(eSelf < 1e-12 && eB4 < 1e-9 && eRc < 1e-9 && eCon < 1e-6 && nanOk)) throw new Error(`complex r, t: self ${eSelf}, Berreman ${eB4}, RCWA ${eRc}, conical ${eCon}, Jones NaN ${nanOk}`);

  // complex expressions
  const z = (e: string, v: Record<string, { re: number; im: number }> = {}) => {
    const cc = compileComplex(e);
    if (typeof cc === 'string') throw new Error(`complex expression ${e}: ${cc}`);
    return cc.fn(v);
  };
  const near = (a: { re: number; im: number }, re: number, im: number) => Math.abs(a.re - re) < 1e-12 && Math.abs(a.im - im) < 1e-12;
  const cases: [string, number, number][] = [
    ['sqrt(-4)', 0, 2], ['exp(i*pi)', -1, 0], ['(1+i)^2', 0, 2], ['arg(i)', Math.PI / 2, 0], ['abs(3+4*i)', 5, 0], ['conj(2-3i)', 2, 3],
    ['real(x*conj(x))', 13, 0], ['imag(x)', 3, 0], ['(-8)^(1/3)', 1, Math.sqrt(3)], ['2^10 - max(1, 3)', 1021, 0], ['1/(1-i)', 0.5, 0.5],
  ];
  for (const [e, re, im] of cases) {
    const got = e === 'conj(2-3i)' ? z('conj(2-3*i)') : z(e, { x: { re: 2, im: 3 } });
    if (!near(got, re, im)) throw new Error(`complex expression ${e} = ${got.re}+${got.im}i, expected ${re}+${im}i`);
  }
  if (typeof compileComplex('real(a') !== 'string' || typeof compileComplex('foo(a)') !== 'string') throw new Error('complex expression errors not reported');

  // Custom data: the complex r, t of a computation; a complex formula → Re / Im, read as one complex quantity again
  const f = runSpec({ ...base, pol: 'p' }) as unknown as Record<string, Float64Array>;
  const ds: Dataset = {
    key: 'cx',
    axes: [{ id: 'lambda', label: 'λ', unit: 'nm', values: lamC }, { id: 'theta', label: 'θ', unit: '°', values: thC }],
    fields: f,
    meta: metaOfSpec({ ...base, pol: 'p' }),
    size: 9,
  };
  const c1 = customData([['a', ds]], [{ name: 'R2', expr: 'abs(a_r)^2' }, { name: 'rt', expr: 'a_r * a_t' }, { name: 'phi', expr: 'arg(a_r) * 180 / pi' }, { name: 'rr', expr: 'real(a_r)' }], 'c1');
  if (!c1.dataset) throw new Error(`Custom data complex: ${c1.errors.join('; ')}`);
  const d1 = c1.dataset;
  const varsOk = c1.vars.some((v) => v.name === 'a_r' && v.complex) && c1.vars.some((v) => v.name === 'a_t' && v.complex) && !c1.vars.some((v) => v.name === 'a_Re_r');
  const metaOk = d1.meta.map((m) => m.key).join(',') === 'c0,c1re,c1im,c2,c3';
  const c2 = customData([['b', d1]], [{ name: 'back', expr: 'b_rt / a' }], 'c2');
  let eCd = 0;
  for (let k = 0; k < 9; k++) {
    const rt = cmulC(c(f.rRe[k], f.rIm[k]), c(f.tRe[k], f.tIm[k]));
    eCd = Math.max(eCd, Math.abs(d1.fields.c0[k] - f.R[k]), Math.abs(d1.fields.c1re[k] - rt.re), Math.abs(d1.fields.c1im[k] - rt.im), Math.abs(d1.fields.c2[k] - f.phiR[k]), Math.abs(d1.fields.c3[k] - f.rRe[k]));
  }
  const c3 = customData([['b', d1]], [{ name: 'back', expr: 'real(b_rt) + imag(b_rt)' }], 'c3');
  const chainOk = c2.errors.some((e) => e.includes('unknown a')) && !!c3.dataset && c3.vars.some((v) => v.name === 'b_rt' && v.complex) && Math.abs(c3.dataset.fields.c0[4] - d1.fields.c1re[4] - d1.fields.c1im[4]) < 1e-15;
  if (!(varsOk && metaOk && eCd < 1e-12 && chainOk)) throw new Error(`Custom data complex: vars ${varsOk}, meta ${d1.meta.map((m) => m.key)}, values ${eCd}, chain ${chainOk}`);
  console.log(`complex r, t: |r|² = R, arg = φr, φt, T_s = |t|² Re q_exit / q₀ (${eSelf.toExponential(1)}); Berreman ${eB4.toExponential(1)}, RCWA without grating ${eRc.toExponential(1)}, grating planar vs conical φ → 0 ${eCon.toExponential(1)}, Jones NaN; complex formulas (${cases.length} cases), Custom data a_r, a_t → |r|², r·t (Re, Im), read again as b_rt`);
}

// Trigonometric functions of the formulas (real and complex): identities, principal branches, degrees ↔ radians
{
  const z = (e: string, v: Record<string, { re: number; im: number }> = {}) => {
    const cc = compileComplex(e);
    if (typeof cc === 'string') throw new Error(`complex expression ${e}: ${cc}`);
    return cc.fn(v);
  };
  const W = { w: { re: 0.7, im: 1.3 } };
  const d = (a: { re: number; im: number }, re: number, im = 0) => Math.hypot(a.re - re, a.im - im);
  const eId = Math.max(
    d(z('sin(w)^2 + cos(w)^2', W), 1),
    d(z('tan(w) - sin(w)/cos(w)', W), 0),
    d(z('cot(w) * tan(w)', W), 1),
    d(z('ctan(w) - cot(w)', W), 0),
    d(z('asin(sin(w)) - w', W), 0),
    d(z('acos(cos(w)) - w', W), 0),
    d(z('atan(tan(w)) - w', W), 0),
    d(z('sinh(w) + i*sin(i*w)', W), 0),
    d(z('cosh(w) - cos(i*w)', W), 0),
    d(z('tanh(w) - sinh(w)/cosh(w)', W), 0),
    d(z('cosh(w)^2 - sinh(w)^2', W), 1),
    d(z('exp(i*w) - cos(w) - i*sin(w)', W), 0),
    d(z('deg(pi)'), 180),
    d(z('sin(rad(30))'), 0.5),
    d(z('atan2(-1, -1)'), (-3 * Math.PI) / 4),
    d(z('atan2(1, -1)'), (3 * Math.PI) / 4),
    d(z('asin(0.5)'), Math.PI / 6),
    d(z('acos(-1)'), Math.PI),
    d(z('atan(1)'), Math.PI / 4),
    // a value beyond ±1 (a complex angle, as sin θ > 1 of an evanescent wave) comes back through sin, cos
    d(z('sin(asin(2.5))'), 2.5),
    d(z('cos(acos(-3))'), -3),
  );
  const r = compile('sin(a)^2 + cos(a)^2 + deg(atan2(1, 1)) + cot(pi/4) - ctan(pi/4) + tanh(0) + asin(1) - acos(0)');
  const rv = typeof r === 'string' ? NaN : r.fn({ a: 0.3 });
  if (!(Math.abs(rv - 46) < 1e-12 && eId < 1e-12)) throw new Error(`trigonometric formulas: identities ${eId}, real ${typeof r === 'string' ? r : rv}`);
  console.log(`trigonometric formulas: sin, cos, tan, cot, asin, acos, atan, atan2, sinh, cosh, tanh, deg, rad — identities at z = 0.7 + 1.3i and principal branches (${eId.toExponential(1)}); the same functions in objective formulas`);
}

// Compute RCWA with the orders N swept: an axis "orders N", every step = the node at that N; FWHM per N; Extract data at a
// value (interpolated); the field map takes the step's N
{
  const gp = gratingSprExample();
  const glib = makeLibrary(gp.materials);
  const sw = { id: 'ns', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'N', kind: 'number', mode: 'list', min: 5, max: 15, step: 5, list: '5, 10, 15' } } as AppNode;
  const ex1 = { id: 'x1', type: 'extract', position: { x: 0, y: 0 }, data: { name: '', fields: ['R'], fixed: {}, at: { theta: 10.37 } } } as AppNode;
  const nodes = [...gp.nodes.map((n) => (n.id === 'fm' ? ({ ...n, data: { ...n.data, at: { 'sweep:ns': 0 } } } as AppNode) : n)), sw, ex1];
  const edges = [...gp.edges, { id: 'e-ns', source: 'ns', sourceHandle: 'out', target: 'rc', targetHandle: 'orders' }, { id: 'e-x1', source: 'rc', sourceHandle: 'out', target: 'x1', targetHandle: 'in' }];
  const ev = evaluateHeadless(nodes, edges, glib);
  const rc = ev.results.get('rc')!;
  const o = rc.outs.out;
  const ds = o?.type === 'data' ? o.dataset : null;
  if (!ds || ds.axes[0].id !== 'sweep:ns' || ds.axes[0].values.join() !== '5,10,15') throw new Error(`orders N sweep: ${rc.errors} ${ds?.axes.map((a) => a.id)}`);
  const nTh = ds.axes[ds.axes.length - 1].values.length;
  let eStep = 0;
  for (const [j, N] of [5, 10, 15].entries()) {
    const one = evaluateHeadless(gp.nodes.map((n) => (n.id === 'rc' ? ({ ...n, data: { ...n.data, orders: N } } as AppNode) : n)), gp.edges, glib).results.get('rc')!.outs.out;
    const d1 = one?.type === 'data' ? one.dataset! : null;
    for (let t = 0; t < nTh; t++) eStep = Math.max(eStep, Math.abs(ds.fields.R[j * nTh + t] - d1!.fields.R[t]), Math.abs(ds.fields.R_m1[j * nTh + t] - d1!.fields.R_m1[t]));
  }
  // FWHM of the dip for every N: a metrics dataset along the N axis
  const fm = ev.results.get('fwhm')!.outs.metrics;
  const fds = fm?.type === 'data' ? fm.dataset : null;
  const fOk = !!fds && fds.axes.some((a) => a.id === 'sweep:ns' && a.values.length === 3);
  // Extract data: R at θ = 10.37° (between two steps of 0.1°), linear
  const xo = ev.results.get('x1')!.outs.out;
  const xds = xo?.type === 'data' ? xo.dataset : null;
  const th = ds.axes[ds.axes.length - 1].values;
  const i0 = th.findIndex((v, i) => v <= 10.37 && th[i + 1] >= 10.37);
  const wgt = (10.37 - th[i0]) / (th[i0 + 1] - th[i0]);
  let eAt = 0;
  for (let j = 0; j < 3; j++) {
    const ref = ds.fields.R[j * nTh + i0] * (1 - wgt) + ds.fields.R[j * nTh + i0 + 1] * wgt;
    eAt = Math.max(eAt, Math.abs(xds!.fields.R[j] - ref));
  }
  const xOk = !!xds && xds.size === 3 && xds.axes[0].id === 'sweep:ns';
  // outside the axis: NaN and a warning
  const evOut = evaluateHeadless(nodes.map((n) => (n.id === 'x1' ? ({ ...n, data: { ...n.data, at: { theta: 45 } } } as AppNode) : n)), edges, glib).results.get('x1')!;
  const outOk = evOut.warnings.some((w2) => w2.includes('outside')) && Number.isNaN((evOut.outs.out as { dataset: Dataset }).dataset.fields.R[0]);
  // the field map at the first step computes with N = 5 (its own N empty)
  const fmJob = (ev.results.get('fm')!.info as RcwaFieldInfo).job;
  const cost = (rc.info as ComputeInfo).orderCost!;
  if (!(eStep === 0 && fOk && eAt < 1e-15 && xOk && outOk && fmJob?.orders === 5 && Math.abs(cost - (11 ** 3 + 21 ** 3 + 31 ** 3) / 11 ** 3) < 1e-9))
    throw new Error(`orders N sweep: steps ${eStep}, FWHM per N ${fOk}, at value ${eAt} (${xOk}), outside ${outOk}, field map N ${fmJob?.orders}, cost ${cost}`);
  console.log(`orders N swept (5, 10, 15): every step = Compute RCWA at that N (exact), FWHM along N, Extract R at θ = 10.37° (interpolated, ${eAt.toExponential(1)}: ${Array.from(xds!.fields.R).map((v) => v.toFixed(4)).join(', ')}); outside the axis NaN + warning; field map at the step's N; cost ${cost.toFixed(1)}× N = 5`);
}

// Materials in Custom data: n, k, nc, ε at the λ of every point (= the library); a Material sweep follows its axis in the
// data; materials with a λ Parameter only; errors without wavelengths
{
  const p = sprExample();
  const slib = makeLibrary([...p.materials]);
  const smodels: Models = Object.fromEntries([...slib].map(([id, dd]) => [id, dd.model]));
  const au = { id: 'aum', type: 'material', position: { x: 0, y: 0 }, data: materialData('Au') } as AppNode;
  const ms = { id: 'ms', type: 'matsweep', position: { x: 0, y: 0 }, data: { name: 'metal' } } as AppNode;
  const cu = { id: 'cu', type: 'custom', position: { x: 0, y: 0 }, data: { name: 'with n', rows: [{ name: 'n', expr: 'b_n' }, { name: 'k', expr: 'b_k' }, { name: 'e2', expr: 'imag(b_eps)' }, { name: 'chk', expr: 'abs(b_nc^2 - b_eps)' }], aliases: {} } } as AppNode;
  // the Ag layer takes a Material sweep (Ag, Au)
  const edges = [
    ...p.edges.filter((e) => !(e.source === 'agm' && e.target === 'ag')),
    { id: 'm1', source: 'agm', sourceHandle: 'out', target: 'ms', targetHandle: 'in' },
    { id: 'm2', source: 'aum', sourceHandle: 'out', target: 'ms', targetHandle: 'in' },
    { id: 'm3', source: 'ms', sourceHandle: 'out', target: 'ag', targetHandle: 'mat' },
    { id: 'c1', source: 'tmm', sourceHandle: 'out', target: 'cu', targetHandle: 'in' },
    { id: 'c2', source: 'ms', sourceHandle: 'out', target: 'cu', targetHandle: 'in' },
  ];
  const ev = evaluateHeadless([...p.nodes, au, ms, cu], edges, slib);
  const r = ev.results.get('cu')!;
  const cds = r.outs.out?.type === 'data' ? r.outs.out.dataset : null;
  if (!cds) throw new Error(`Custom data with a material: ${r.errors} ${ev.results.get('tmm')!.errors}`);
  const ax = cds.axes.findIndex((a) => a.id === 'sweep:ms');
  const stA = strides(cds.axes);
  let eN = 0;
  for (let k = 0; k < cds.size; k += 37) {
    const m = ax >= 0 ? Math.floor(k / stA[ax]) % 2 : -1;
    const ref = refractiveIndex(m === 0 ? 'Ag' : 'Au', smodels, 633);
    eN = Math.max(eN, Math.abs(cds.fields.c0[k] - ref.re), Math.abs(cds.fields.c1[k] - ref.im), Math.abs(cds.fields.c2[k] - 2 * ref.re * ref.im), cds.fields.c3[k]);
  }
  // a material with a λ Parameter only: n(λ) on that axis
  const lp = { id: 'lp', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'lambda', mode: 'range', value: 600, min: 500, max: 900, step: 100 } } as AppNode;
  const cu2 = { id: 'cu2', type: 'custom', position: { x: 0, y: 0 }, data: { name: 'n(λ)', rows: [{ name: 'n', expr: 'a_n' }, { name: 'lam', expr: 'b_lambda' }], aliases: { 'agm:out': 'a', 'lp:out': 'b' } } } as AppNode;
  const ev2 = evaluateHeadless([...p.nodes, lp, cu2], [...p.edges, { id: 'd1', source: 'agm', sourceHandle: 'out', target: 'cu2', targetHandle: 'in' }, { id: 'd2', source: 'lp', sourceHandle: 'out', target: 'cu2', targetHandle: 'in' }], slib);
  const r2 = ev2.results.get('cu2')!;
  const d2 = r2.outs.out?.type === 'data' ? r2.outs.out.dataset : null;
  const lamOk = !!d2 && d2.size === 5 && [500, 600, 700, 800, 900].every((l, i) => Math.abs(d2.fields.c0[i] - refractiveIndex('Ag', smodels, l).re) < 1e-15 && d2.fields.c1[i] === l);
  // a material alone: asks for wavelengths
  const ev3 = evaluateHeadless([...p.nodes, cu2], [...p.edges, { id: 'd1', source: 'agm', sourceHandle: 'out', target: 'cu2', targetHandle: 'in' }], slib);
  const noLam = ev3.results.get('cu2')!.errors.some((e) => e.includes('wavelengths'));
  const chips = (r.info as CustomInfo).vars.filter((v) => v.input === 'b').map((v) => v.name).join(',');
  if (!(ax >= 0 && eN < 1e-12 && lamOk && noLam && chips === 'b_n,b_k,b_nc,b_eps'))
    throw new Error(`materials in Custom data: axis ${ax}, n / k / ε ${eN}, λ Parameter ${lamOk} (${r2.errors}), no λ ${noLam}, vars ${chips}`);
  console.log(`materials in Custom data: n, k, Im ε = 2nk, |nc² − ε| of a Material sweep (Ag, Au) following its axis in the SPR data (${eN.toExponential(1)}); Ag with a λ Parameter only (5 wavelengths, = library); no wavelengths → message`);
}

// The example "RCWA convergence vs the orders N": no errors; n_sp of gold from Custom data = Re √(ε/(ε + 1)), the
// shallow-grating angle asin(λ/Λ − n_sp), the shift = the FWHM dip angle − that angle for every N; the dip angle between
// N = 30 and 40 within 0.01°; R at 10.5° for each N
if (full('RCWA convergence example (30 s)')) {
  const p = rcwaConvergenceExample();
  const clib = makeLibrary(p.materials);
  const cmodels: Models = Object.fromEntries([...clib].map(([id, dd]) => [id, dd.model]));
  const ev = evaluateHeadless(p.nodes, p.edges, clib);
  const bad = [...ev.results].filter(([, r]) => r.errors.length || r.warnings.length);
  const get = (id: string, h = 'out') => (ev.results.get(id)!.outs[h] as { dataset: Dataset }).dataset;
  const f = get('fwhm', 'metrics').fields;
  const cu = get('cu').fields;
  const x = get('xR').fields;
  const eps = CX.mul(refractiveIndex('Au', cmodels, 633), refractiveIndex('Au', cmodels, 633));
  const nsp = CX.sqrt(CX.div(eps, CX.add(eps, c(1)))).re;
  const thS = (Math.asin(633 / 500 - nsp) * 180) / Math.PI;
  const nN = CONV_N.length;
  let e = 0;
  for (let j = 0; j < nN; j++) e = Math.max(e, Math.abs(cu.c0[j] - nsp), Math.abs(cu.c1[j] - thS), Math.abs(cu.c2[j] - (f.c0[j] - thS)));
  const dTh = Math.abs(f.c0[nN - 1] - f.c0[nN - 2]);
  if (!(bad.length === 0 && e < 1e-9 && dTh < 0.01 && x.R.length === nN && Math.abs(nsp - 1.04487) < 1e-5))
    throw new Error(`RCWA convergence example: ${bad.map(([id, r]) => `${id}: ${[...r.errors, ...r.warnings]}`)}; Custom data ${e}, dip N 30 / 40 ${dTh}, n_sp ${nsp}`);
  console.log(`RCWA convergence example (N = ${CONV_N.join(', ')}): dip ${Array.from(f.c0).map((v) => v.toFixed(3)).join(' / ')}°, R at the dip ${Array.from(f.e0).map((v) => v.toFixed(3)).join(' / ')}; n_sp = ${nsp.toFixed(5)}, shallow-grating angle ${thS.toFixed(2)}° (Custom data = direct, ${e.toExponential(1)}); dip N 30 → 40 moves ${dTh.toFixed(3)}°`);
}

// OIC 2025 (Kruschwitz, Trubetskov, Keck, Appl. Opt. 65, A12 (2026)): the committee's example designs (figshare Data Files
// 2, 3) give the official merit functions through the nodes (Extract data, Custom data with step()): Problem A 7.006763
// (the castle target, 8001 points), Problem B 1.8540762059025715 (Ts/Tp at 450 / 550 / 650 nm + #(Rs ≥ 99 %) / #(Ts ≥ 99 %))
{
  const mfOf = (p: Project, id: string) => {
    const ev = evaluateHeadless(p.nodes, p.edges, makeLibrary(p.materials));
    const bad = [...ev.results].filter(([, r]) => r.errors.length);
    const o = ev.results.get(id)!.outs.out as { dataset?: Dataset } | undefined;
    return { mf: o?.dataset?.fields.c0[0] ?? NaN, bad: bad.map(([k, r]) => `${k}: ${r.errors}`) };
  };
  const a = mfOf(oicCastleExample(), 'mf');
  const b = mfOf(oicNotchExample(), 'mfB');
  const st = compile('step(x) + 2*step(-x) + 4*step(x - 1)');
  const stOk = typeof st !== 'string' && st.fn({ x: 0 }) === 3 && st.fn({ x: -1e-12 }) === 2 && st.fn({ x: 2 }) === 5;
  if (!(a.bad.length === 0 && b.bad.length === 0 && Math.abs(a.mf - OIC_A_MF) < 5e-7 && Math.abs(b.mf - OIC_B_MF) < 1e-12 && stOk))
    throw new Error(`OIC 2025 examples: A ${a.mf} (${a.bad}), B ${b.mf} (${b.bad}), step ${stOk}`);
  console.log(`OIC 2025 committee designs through the nodes: Problem A MF ${a.mf.toFixed(7)} (official ${OIC_A_MF}), Problem B MF ${b.mf} (official ${OIC_B_MF}, ${Math.abs(b.mf - OIC_B_MF).toExponential(1)}); step() = Heaviside`);
}

// Tene et al., Front. Bioeng. Biotechnol. 13, 1580344 (2025), graphene SPR biosensor for malaria: the five initial
// configurations (dip angle and depth, §3.1) and the optimized Sys3 / Sys4 through the example's nodes — dip angles,
// Δθ, S = Δθ/Δn, R at the dip and LoD as in their Tables 3, 4 (their widths follow an undeclared definition: DA, QF, FoM,
// CSF are reported, not asserted)
{
  const BK = c(1.5151), AGt = c(0.056253, 4.276), SN = c(2.0394), Gt = c(3, 1.1491), DN = c(1.462);
  const dip = (films: Layer[], ns: number) => {
    let best = { th: 0, R: 2 };
    for (let t = 60; t <= 89.99; t += 0.001) {
      const R = tmmPoint([{ n: BK, d: 0 }, ...films, { n: c(ns), d: 0 }], 633, t, 'p').R;
      if (R < best.R) best = { th: t, R };
    }
    return best;
  };
  const init: [Layer[], number, number, number][] = [
    [[{ n: AGt, d: 55 }], 1.34, 68.6, 0.02],
    [[{ n: AGt, d: 55 }], 1.402, 78.2, 0.55],
    [[{ n: AGt, d: 55 }, { n: SN, d: 5 }], 1.402, 84.2, 10.34],
    [[{ n: AGt, d: 55 }, { n: SN, d: 5 }, { n: Gt, d: 0.34 }], 1.402, 85.3, 35.45],
    [[{ n: AGt, d: 55 }, { n: SN, d: 5 }, { n: Gt, d: 0.34 }, { n: DN, d: 3.2 }], 1.402, 86.2, 45.37],
  ];
  let eTh0 = 0;
  let eR0 = 0;
  for (const [f, ns, th, rp] of init) {
    const r = dip(f, ns);
    eTh0 = Math.max(eTh0, Math.abs(r.th - th));
    eR0 = Math.max(eR0, Math.abs(100 * r.R - rp));
  }
  const rows: string[] = [];
  let eTh = 0, eS = 0, eR = 0, eL = 0;
  for (const sys of [3, 4] as const) {
    const P = TENE2025[sys === 3 ? 'sys3' : 'sys4'];
    const p = teneMalariaExample(sys);
    const ev = evaluateHeadless(p.nodes, p.edges, makeLibrary(p.materials));
    const bad = [...ev.results].filter(([, r]) => r.errors.length);
    if (bad.length) throw new Error(`Tene example Sys${sys}: ${bad.map(([k, r]) => `${k}: ${r.errors}`)}`);
    const get = (id: string, h = 'out') => (ev.results.get(id)!.outs[h] as { dataset: Dataset }).dataset;
    const fm = get('fwhm', 'metrics').fields;
    const se = get('sens').fields;
    const pe = get('perf').fields;
    for (let j = 0; j < 4; j++) {
      eTh = Math.max(eTh, Math.abs(fm.c0[j] - P.theta[j]));
      eR = Math.max(eR, Math.abs(100 * fm.e0[j] - P.Rmin[j]));
    }
    for (let j = 1; j < 4; j++) {
      eS = Math.max(eS, Math.abs(se.c2[j] / P.S[j - 1] - 1));
      eL = Math.max(eL, Math.abs(pe.c3[j] - P.LoD[j - 1]));
    }
    rows.push(`Sys${sys} S ${Array.from(se.c2).slice(1).map((v) => v.toFixed(2)).join(' / ')} (paper ${P.S.join(' / ')}), FWHM ${Array.from(fm.w0).map((v) => v.toFixed(2)).join(' / ')}° (paper ${P.FWHM.join(' / ')}), QF ${Array.from(pe.c1).slice(1).map((v) => v.toFixed(1)).join(' / ')} (paper ${P.QF.join(' / ')})`);
  }
  if (!(eTh0 < 0.06 && eR0 < 0.006 && eTh < 0.006 && eR < 0.006 && eS < 5e-4 && eL < 1.5e-3))
    throw new Error(`Tene 2025: initial θ ${eTh0}, Rmin ${eR0}; optimized θ ${eTh}, Rmin ${eR}, S ${eS}, LoD ${eL}`);
  console.log(`Tene et al. 2025 (graphene SPR, malaria): initial Sys0–4 dip angles within ${eTh0.toFixed(3)}° of 68.6 / 78.2 / 84.2 / 85.3 / 86.2°, depths within ${eR0.toFixed(3)} %; optimized, through the nodes: dip angles within ${eTh.toFixed(4)}°, R at the dip ${eR.toFixed(4)} %, S within ${(100 * eS).toFixed(3)} %, LoD ${eL.toFixed(4)}·10⁻⁵ — ${rows.join('; ')}`);
}

// The compute pool (engine/computePool.ts): a job cut into 2, 3 or 7 parts and joined = the whole job, every field and
// point exactly (group delay added after joining) — TMM with sweeps and a λ range, a thick substrate, Berreman 4×4, RCWA
// planar and conical, rough interfaces; the parts follow the cost (TMM below 6·10⁵ point-layers: one part; at most 4 per slot)
{
  const specs: { name: string; spec: TmmSpec }[] = [];
  for (const [name, mk] of [['DBR', dbrExample], ['AR both faces', arBothSidesExample], ['LC cavity', lcCavityExample], ['grating SPR', gratingSprExample], ['conical SPR', conicalSprExample], ['rough SPR', roughSprExample], ['BIC', anisoBicExample]] as const) {
    const p = mk();
    // the jobs the graph asks for (not computed here)
    const ev = evaluateGraph(p.nodes, p.edges, { cache: new Map(), lastDone: new Map(), failed: new Map() }, makeLibrary(p.materials));
    for (const { requester: id, spec: sp } of ev.jobs) {
      if (specs.some((x) => JSON.stringify(x.spec) === JSON.stringify(sp))) continue;
      // RCWA and Berreman: a few λ and θ (and N ≤ 15) are enough — the parts cut through the λ / θ rows anyway
      const few = { theta: sp.theta.slice(0, 4), lambda: sp.lambda.slice(0, 3) };
      specs.push({ name: `${name}/${id}`, spec: sp.rcwa ? { ...sp, ...few, rcwa: { ...sp.rcwa, orders: Math.min(15, sp.rcwa.orders) } } : sp.b4 ? { ...sp, ...few } : sp });
    }
  }
  let worst = 0;
  let checked = 0;
  const kinds = new Set<string>();
  for (const { name, spec } of specs) {
    const whole = runSpec(spec) as unknown as Record<string, Float64Array>;
    const size = whole.R.length;
    for (const n of [2, 3, 7]) {
      if (n > size) continue;
      const parts = splitRange(size, n).map((range) => ({ range, fields: runSpec(spec, undefined, range) }));
      const joined = joinParts(spec, parts) as unknown as Record<string, Float64Array>;
      const keys = Object.keys(whole);
      if (keys.length !== Object.keys(joined).length) throw new Error(`compute pool ${name}: fields ${keys.length} vs ${Object.keys(joined).length}`);
      for (const k of keys)
        for (let i = 0; i < size; i++) {
          const [a, b] = [whole[k][i], joined[k][i]];
          if (Number.isNaN(a) && Number.isNaN(b)) continue;
          worst = Math.max(worst, Math.abs(a - b));
        }
      checked++;
    }
    kinds.add(spec.rcwa ? (spec.rcwa.conical ? 'RCWA conical' : 'RCWA') : spec.b4 ? 'Berreman' : spec.back ? 'thick substrate' : spec.layers.some((L) => L.rough) ? 'rough' : 'TMM');
  }
  const cheap = partsFor(specs.find((x) => x.name.startsWith('DBR'))!.spec, 15);
  const big: TmmSpec = { ...specs.find((x) => x.name.startsWith('DBR'))!.spec, lambda: Array.from({ length: 4000 }, (_, i) => 400 + i * 0.1), theta: Array.from({ length: 50 }, (_, i) => i) };
  const rc = partsFor(specs.find((x) => x.spec.rcwa)!.spec, 15);
  if (!(worst === 0 && checked >= 15 && kinds.size >= 5 && cheap === 1 && partsFor(big, 15) >= 15 && partsFor(big, 15) <= 60 && rc > 1))
    throw new Error(`compute pool: |Δ| ${worst}, ${checked} splits, kinds ${[...kinds]}, parts small TMM ${cheap}, big ${partsFor(big, 15)}, RCWA ${rc}`);
  console.log(`compute pool: ${specs.length} job specs of the examples (${[...kinds].join(', ')}) cut into 2 / 3 / 7 parts and joined = whole (${checked} splits, max |Δ| ${worst}); parts: small TMM 1, 200 000-point DBR ${partsFor(big, 15)}, RCWA ${rc}`);
}

// Hu, Optik 122, 1881 (2011): grating-coupled SPR with the −1st order at 900 nm (Drude Au / Al of the paper, Λ = 350 nm,
// metal fraction 0.9, N = 20): the dip angles for n = 1.32 / 1.37 — gold 40 nm deep (Fig. 2(d)), gold 30 nm (Fig. 4(a),
// 54.37° for their printed 53.37°), aluminium 30 nm (Fig. 4(b)) — within the convergence band of metal gratings in TM
// (±0.2° between N = 10 and 50; their N is not given); and the example (Al 27 nm + conformal 3 nm Au): shift ≈ their 9.39°
if (full('Hu 2011 grating SPR (9 s)')) {
  const hp = huGratingExample();
  const hlib = makeLibrary(hp.materials);
  const hmodels: Models = Object.fromEntries([...hlib].map(([id, d]) => [id, d.model]));
  const hm: Models = { ...hmodels, n132: { type: 'constant', n: 1.32, k: 0 }, n137: { type: 'constant', n: 1.37, k: 0 } };
  const hinst = Object.fromEntries(Object.keys(hm).map((k) => [k, { lib: k }]));
  const lam = (metal: string, an: string): LayerSpec['grating'] => ({ profile: 'lamellar', period: 350, fill: 0.9, fillTop: 0.9, shift: 0, slices: 1, nx: 64, pixels: [], mats: [metal, an] });
  const dipNear = (metal: string, an: string, depth: number, guess: number) => {
    const theta = Array.from({ length: 41 }, (_, i) => +(guess - 1 + i * 0.05).toFixed(3));
    const f = runSpec({ models: hm, instances: hinst, layers: [layer(an), { ...layer(an, depth), grating: lam(metal, an) }, layer(metal)], lambda: [900], theta, pol: 'p', sweeps: [], rcwa: { orders: 20, show: 0 } }) as unknown as Record<string, Float64Array>;
    let k = 1;
    for (let i = 1; i < theta.length - 1; i++) if (f.R[i] < f.R[k]) k = i;
    const [a, b, cc] = [f.R[k - 1], f.R[k], f.R[k + 1]];
    return theta[k] + (0.05 * (a - cc)) / (2 * (a - 2 * b + cc));
  };
  const AU = 'user-au-hu2011', AL = 'user-al-hu2011';
  const got: [string, number, number, number][] = [
    ['Au 40 nm, n 1.32', dipNear(AU, 'n132', 40, HU2011.base350.theta[0]), HU2011.base350.theta[0], 0.3],
    ['Au 40 nm, n 1.37', dipNear(AU, 'n137', 40, HU2011.base350.theta[1]), HU2011.base350.theta[1], 0.3],
    ['Au 30 nm, n 1.32', dipNear(AU, 'n132', 30, HU2011.au30.theta[0]), HU2011.au30.theta[0], 0.3],
    ['Au 30 nm, n 1.37', dipNear(AU, 'n137', 30, HU2011.au30.theta[1]), HU2011.au30.theta[1], 0.3],
    ['Al 30 nm, n 1.32', dipNear(AL, 'n132', 30, HU2011.al30.theta[0]), HU2011.al30.theta[0], 0.4],
    ['Al 30 nm, n 1.37', dipNear(AL, 'n137', 30, HU2011.al30.theta[1]), HU2011.al30.theta[1], 0.4],
  ];
  const bad = got.filter(([, v, ref, tol]) => !(Math.abs(v - ref) < tol));
  // the example's coated grating at its two extreme indices (two narrow windows of its own spec)
  const ev = evaluateGraph(hp.nodes, hp.edges, { cache: new Map(), lastDone: new Map(), failed: new Map() }, hlib);
  const spec = ev.jobs[0].spec;
  const nT = spec.theta.length;
  const dipOfStep = (step: number, guess: number) => {
    const sub: TmmSpec = { ...spec, theta: Array.from({ length: 41 }, (_, i) => +(guess - 1 + i * 0.05).toFixed(3)), sweeps: [1], layers: spec.layers.map((L) => L) };
    // the index sweep at one step: the analyte instance with that n only
    const inst = Object.fromEntries(Object.entries(spec.instances).map(([k, v]) => [k, v.n ? { ...v, n: { s: [0], v: [v.n.v[step]] } } : v]));
    const f = runSpec({ ...sub, instances: inst }) as unknown as Record<string, Float64Array>;
    let k = 1;
    for (let i = 1; i < 40; i++) if (f.R[i] < f.R[k]) k = i;
    const [a, b, cc] = [f.R[k - 1], f.R[k], f.R[k + 1]];
    return sub.theta[k] + (0.05 * (a - cc)) / (2 * (a - 2 * b + cc));
  };
  const shift = dipOfStep(0, 67.45) - dipOfStep(HU_N.length - 1, 58.2);
  if (bad.length || !(nT > 100 && Math.abs(shift - HU2011.alAu.shift) < 0.25))
    throw new Error(`Hu 2011: ${bad.map(([n, v, r]) => `${n} ${v.toFixed(2)} vs ${r}`).join('; ')}; coated shift ${shift}`);
  console.log(`Hu 2011 (grating SPR, −1st order, N = 20): ${got.map(([n, v, r]) => `${n} ${v.toFixed(2)}° (${r})`).join(', ')}; Al + 3 nm Au shift ${shift.toFixed(2)}° (${HU2011.alAu.shift})`);
}

// Robustness: a job larger than MAX_JOB_BYTES is refused with a message (never sent to the workers); project files — a
// newer format is refused with its own message, a damaged file opens with a note of what was left out (the note is not
// saved); the project files of the published version (commit 107bcf8, every example saved by it) open with nothing left
// out and evaluate without an error (those with RCWA / Berreman jobs in the slow block below)
{
  const cp = conicalSprExample();
  const big = cp.nodes.map((n) =>
    n.id === 'phi' ? ({ ...n, data: { ...n.data, list: Array.from({ length: 99 }, (_, i) => i * 0.5).join(', ') } } as AppNode) : n.type === 'param' && (n.data as { quantity: string }).quantity === 'theta' ? ({ ...n, data: { ...n.data, mode: 'range', min: 0, max: 80, step: 0.004 } } as AppNode) : n,
  );
  const evBig = evaluateGraph(big, cp.edges, { cache: new Map(), lastDone: new Map(), failed: new Map() }, makeLibrary(cp.materials));
  const rcErr = evBig.results.get('rc')!.errors.join(' ');
  const memOk = /memory/.test(rcErr) && !evBig.jobs.some((j) => j.requester === 'rc');
  // project files
  const base = stringifyProject(sprExample());
  const newer = parseProject(base.replace('"version":3', '"version":4'));
  const older = parseProject(base.replace('"version":3', '"version":2'));
  const raw = JSON.parse(base);
  raw.nodes.push({ id: 'zz', type: 'hologram', position: { x: 0, y: 0 }, data: {} });
  raw.edges.push({ id: 'ez', source: 'zz', target: 'tmm', targetHandle: 'stack' });
  const repaired = parseProject(JSON.stringify(raw));
  const noteSaved = typeof repaired !== 'string' && stringifyProject(repaired).includes('repaired');
  const filesOk =
    typeof newer === 'string' && /newer version/.test(newer) && typeof older === 'string' && /older version/.test(older) && typeof repaired !== 'string' && /1 node left out \(unknown type: hologram\), 1 connection left out/.test(repaired.repaired ?? '') && !noteSaved;
  // the published version's files: all open intact; the TMM-only ones evaluate fully here
  const dir = 'scripts/fixtures/projects-107bcf8/';
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  let intact = 0;
  const heavy: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    const text = readFileSync(dir + f, 'utf8');
    const p = parseProject(text);
    if (typeof p === 'string' || p.repaired) {
      failed.push(`${f}: ${typeof p === 'string' ? p : p.repaired}`);
      continue;
    }
    intact++;
    const jobs = evaluateGraph(p.nodes, p.edges, { cache: new Map(), lastDone: new Map(), failed: new Map() }, makeLibrary(p.materials)).jobs;
    if (jobs.some((j) => j.spec.rcwa || j.spec.b4)) {
      heavy.push(f);
      continue;
    }
    const ev = evaluateHeadless(p.nodes, p.edges, makeLibrary(p.materials));
    for (const [id, r] of ev.results) if (r.errors.length) failed.push(`${f} ${id}: ${r.errors[0]}`);
  }
  PUBLISHED_HEAVY.push(...heavy);
  if (!(memOk && filesOk && files.length >= 27 && intact === files.length && !failed.length))
    throw new Error(`robustness: memory ${memOk} (${rcErr}), files ${filesOk}, published ${intact} / ${files.length}: ${failed.join('; ')}`);
  console.log(`robustness: conical RCWA of ${(99 * 20001).toLocaleString('en')} points refused for its memory (“${rcErr.slice(0, 80)}…”), not sent to the workers; newer / older formats refused with their messages; a damaged file opens with “${(repaired as Project).repaired}” (not saved); the ${files.length} project files of the published version (107bcf8) open intact, ${files.length - heavy.length} TMM ones evaluated without an error (${heavy.length} with RCWA / Berreman in the slow block)`);
}
if (full('published project files with RCWA / Berreman (2 min)')) {
  const failed: string[] = [];
  for (const f of PUBLISHED_HEAVY) {
    const p = parseProject(readFileSync(`scripts/fixtures/projects-107bcf8/${f}`, 'utf8')) as Project;
    const ev = evaluateHeadless(p.nodes, p.edges, makeLibrary(p.materials));
    for (const [id, r] of ev.results) if (r.errors.length) failed.push(`${f} ${id}: ${r.errors[0]}`);
  }
  if (failed.length) throw new Error(`published project files: ${failed.join('; ')}`);
  console.log(`published project files with RCWA / Berreman jobs (${PUBLISHED_HEAVY.join(', ')}): evaluated without an error`);
}

// Anisotropic grating segments: a segment given as a diagonal ε equal on its three axes = the isotropic segment (TE, TM;
// Li and Laurent); the anisotropic segments themselves are checked against RETICOLO (aniso-seg, aniso-mix above)
{
  const au = n('Au'), wat = n('Water');
  const segs = (aniso: boolean) => [
    { from: 0, to: 0.35, n: au, ...(aniso ? { eps: [CX.mul(au, au), CX.mul(au, au), CX.mul(au, au)] as [C, C, C] } : {}) },
    { from: 0.35, to: 1, n: wat },
  ];
  let eIso = 0;
  for (const pol of ['s', 'p'] as const)
    for (const fact of ['li', 'laurent'] as const) {
      const run = (aniso: boolean) => rcwaPoint([{ n: n('BK7'), d: 0 }, { d: 30, segs: segs(aniso) }, { n: wat, d: 0 }], 500, 633, 60, pol, 15, fact);
      const [a, b] = [run(false), run(true)];
      for (let m = 0; m < a.R.length; m++) eIso = Math.max(eIso, Math.abs(a.R[m] - b.R[m]), Math.abs(a.T[m] - b.T[m]));
    }
  if (!(eIso < 1e-12)) throw new Error(`anisotropic segments: isotropic ε segments ${eIso}`);
  console.log(`anisotropic grating segments: ε equal on x, y, z = isotropic (${eIso.toExponential(1)}, TE / TM, Li / Laurent)`);
}

// Smooth profiles, differential method with fast Fourier factorization (physics/rcwaFff.ts): (a) a lamellar layer
// integrated through z (N = x̂) → the eigenmodes of rcwa.ts, second order in the step; (b) a film → TMM; (c) a lossless
// dielectric sinus: R + T = 1; (d) TE (no factorization issue): FFF = a fine staircase; (e) through the graph: Compute
// RCWA "profiles: smooth (FFF)" makes the sinus one FFF layer, absent = the staircase (saved projects unchanged)
{
  const P = 500;
  const gp = (profile: GratingParams<number>['profile'], extra: Partial<GratingParams<number>> = {}): GratingParams<number> => ({ profile, period: P, fill: 0.5, fillTop: 0.5, shift: 0.5, slices: 1, nx: 32, pixels: [], mats: [0, 1], ...extra });
  const au = n('Au'), glass = c(1.5), air = c(1);
  const lam: RcwaLayer = { d: 100, segs: gratingSlices(gp('lamellar')).flatMap((s) => s.segs).map((q) => ({ from: q.from, to: q.to, n: [au, air][q.m] })) };
  const lamF = (steps: number): RcwaLayer => ({ d: 100, fff: { segsAt: () => lam.segs!, normals: [{ from: 0, to: 1, nx: 1, nz: 0 }], steps, key: 'lamellar-test' } });
  const errLam = (pol: 'p' | 's', steps: number) => {
    const [e, f] = [rcwaPoint([{ n: air, d: 0 }, lam, { n: au, d: 0 }], P, 633, 20, pol, 15), rcwaPoint([{ n: air, d: 0 }, lamF(steps), { n: au, d: 0 }], P, 633, 20, pol, 15)];
    return Math.max(...Array.from(e.R, (r, m) => Math.abs(r - f.R[m])));
  };
  const lamTM = [errLam('p', 64), errLam('p', 128), errLam('p', 256)];
  const lamTE = errLam('s', 256);
  const order = Math.log2(lamTM[1] / lamTM[2]);
  // a film (one material across the period) → TMM
  const filmF: RcwaLayer = { d: 120, fff: { segsAt: () => [{ from: 0, to: 1, n: glass }], normals: [{ from: 0, to: 1, nx: 0.6, nz: 0.8 }], steps: 256, key: 'film-test' } };
  let eFilm = 0;
  for (const pol of ['s', 'p'] as const) {
    const f = rcwaPoint([{ n: air, d: 0 }, filmF, { n: c(1.33), d: 0 }], P, 633, 35, pol, 6);
    eFilm = Math.max(eFilm, Math.abs(f.R[6] - tmmPoint([{ n: air, d: 0 }, { n: glass, d: 120 }, { n: c(1.33), d: 0 }], 633, 35, pol).R));
  }
  // a lossless dielectric sinus (glass in air, 300 nm deep): energy
  const sinG = gratingFff(gp('sinus'), 300, (m) => [glass, air][m]);
  let eE = 0;
  for (const pol of ['s', 'p'] as const) {
    const f = rcwaPoint([{ n: air, d: 0 }, { d: 300, fff: { ...sinG, steps: 400 } }, { n: glass, d: 0 }], P, 633, 25, pol, 15);
    eE = Math.max(eE, Math.abs(f.Rtot + f.Ttot - 1));
  }
  // TE gold sinus: FFF vs 400 staircase slices
  const sinAu = gratingFff(gp('sinus'), 60, (m) => [au, air][m]);
  const te = rcwaPoint([{ n: air, d: 0 }, { d: 60, fff: { ...sinAu, steps: 300 } }, { n: au, d: 0 }], P, 633, 10, 's', 15);
  const teStair = rcwaPoint([{ n: air, d: 0 }, ...gratingSlices(gp('sinus', { slices: 400 })).map((s) => ({ d: s.h * 60, segs: s.segs.map((q) => ({ from: q.from, to: q.to, n: [au, air][q.m] })) })), { n: au, d: 0 }], P, 633, 10, 's', 15);
  const eTE = Math.max(...Array.from(te.R, (r, m) => Math.abs(r - teStair.R[m])));
  // through the graph
  const gx = gratingSprExample();
  const set = (id: string, patch: object) => (gx.nodes as AppNode[]).forEach((nd) => nd.id === id && Object.assign(nd.data, patch));
  set('gr', { profile: 'sinus', slices: 12 });
  const specOf = () => evaluateGraph(gx.nodes, gx.edges, { cache: new Map(), lastDone: new Map(), failed: new Map() }, makeLibrary(gx.materials)).jobs.find((j) => j.spec.rcwa)!.spec;
  const stair = rcwaLayersAt(specOf(), [0], 633).layers;
  set('rc', { profiles: 'fff' });
  const smooth = rcwaLayersAt(specOf(), [0], 633).layers;
  const graphOk = stair.length === 14 && !stair.some((L) => L.fff) && smooth.length === 3 && !!smooth[1].fff && smooth[1].d === 40;
  const ok = lamTM[2] < 2e-5 && order > 1.7 && order < 2.3 && lamTE < 2e-5 && eFilm < 2e-5 && eE < 1e-4 && eTE < 2e-4 && graphOk;
  if (!ok) throw new Error(`FFF: lamellar TM ${lamTM.map((e) => e.toExponential(1))} (order ${order.toFixed(2)}), TE ${lamTE}, film ${eFilm}, energy ${eE}, TE vs staircase ${eTE}, graph ${graphOk} (${stair.length} / ${smooth.length})`);
  console.log(`smooth profiles (FFF): lamellar integrated = eigenmodes (TM |ΔR| ${lamTM.map((e) => e.toExponential(1)).join(' → ')} at 64 / 128 / 256 steps, order ${order.toFixed(2)}; TE ${lamTE.toExponential(1)}), film = TMM (${eFilm.toExponential(1)}), lossless sinus R + T = 1 (${eE.toExponential(1)}), TE gold sinus = 400 staircase slices (${eTE.toExponential(1)}), Compute RCWA "smooth (FFF)" → one FFF layer (staircase: ${stair.length - 2} slices)`);
}

// Popov's benchmark (Gratings: Theory and Numeric Applications, 2nd ed., 2014, ch. 7, Figs. 7.20, 7.24): sinusoidal
// aluminium grating, Λ 500 nm, 200 nm deep, n = 1.3 + 7.6i, 632.8 nm, −1 order Littrow, TM: η₋₁ = 0.878 (N = 20, the
// differential method converged); the staircase (20 slices) needs N ≳ 50 — here 0.742 at N = 20, 0.858 at N = 60
if (full('FFF: Popov aluminium sinus, gold trapezoid and blazed (80 s)')) {
  const P = 500, lam = 632.8;
  const al = c(1.3, 7.6), air = c(1);
  const g: GratingParams<number> = { profile: 'sinus', period: P, fill: 0.5, fillTop: 0.5, shift: 0.5, slices: 20, nx: 32, pixels: [], mats: [0, 1] };
  const th = (Math.asin(lam / (2 * P)) * 180) / Math.PI;
  const ffF = (N: number, steps: number) => rcwaPoint([{ n: air, d: 0 }, { d: 200, fff: { ...gratingFff(g, 200, (m) => [al, air][m]), steps } }, { n: al, d: 0 }], P, lam, th, 'p', N).R[N - 1];
  const stair = (N: number) => rcwaPoint([{ n: air, d: 0 }, ...gratingSlices(g).map((s) => ({ d: s.h * 200, segs: s.segs.map((q) => ({ from: q.from, to: q.to, n: [al, air][q.m] })) })), { n: al, d: 0 }], P, lam, th, 'p', N).R[N - 1];
  const f = [ffF(10, 400), ffF(20, 400), ffF(25, 400)];
  const s20 = stair(20);
  const ok = Math.abs(f[1] - 0.8781) < 0.0015 && Math.abs(f[2] - f[1]) < 0.0015 && Math.abs(f[0] - f[1]) < 0.02 && s20 < 0.8;
  if (!ok) throw new Error(`FFF Popov benchmark: η−1 N 10 / 20 / 25 = ${f.map((v) => v.toFixed(4)).join(' / ')}, staircase N 20 ${s20.toFixed(4)}`);
  console.log(`FFF, Popov 2014 Al sinus (Λ 500, 200 nm, Littrow −1, TM): η−1 = ${f.map((v) => v.toFixed(4)).join(' / ')} at N = 10 / 20 / 25 (book 0.878); staircase 20 slices at N = 20: ${s20.toFixed(4)}`);
  // trapezoid and blazed gold gratings (Λ 600 nm, fill 0.7 → 0.2, 80 / 60 nm, 633 nm, 20°, TM): FFF steady with N, the
  // staircase (200 slices) still climbing towards it
  const au = c(0.18344, 3.4332);
  const rows: string[] = [];
  for (const [profile, D] of [['trapezoid', 80], ['blazed', 60]] as const) {
    const gg: GratingParams<number> = { profile, period: 600, fill: 0.7, fillTop: 0.2, shift: 0.5, slices: 200, nx: 32, pixels: [], mats: [0, 1] };
    const R0 = (N: number) => rcwaPoint([{ n: air, d: 0 }, { d: D, fff: { ...gratingFff(gg, D, (m) => [au, air][m]), steps: 300 } }, { n: au, d: 0 }], 600, 633, 20, 'p', N).R[N];
    const st = rcwaPoint([{ n: air, d: 0 }, ...gratingSlices(gg).map((s) => ({ d: s.h * D, segs: s.segs.map((q) => ({ from: q.from, to: q.to, n: [au, air][q.m] })) })), { n: au, d: 0 }], 600, 633, 20, 'p', 30).R[30];
    const [a, b] = [R0(30), R0(45)];
    if (!(Math.abs(a - b) < 0.003 && Math.abs(st - b) > 2 * Math.abs(a - b))) throw new Error(`FFF ${profile}: R0 N 30 / 45 ${a} / ${b}, staircase N 30 ${st}`);
    rows.push(`${profile} R0 ${a.toFixed(4)} / ${b.toFixed(4)} at N = 30 / 45 (staircase N 30: ${st.toFixed(4)})`);
  }
  console.log(`FFF, gold TM: ${rows.join('; ')}`);
}

// Filter designer, TFCalc-like additions: band means (flat and photopic, CIE V(λ)·D65), a cone of light (designer and
// Compute TMM), locked / tied layers and per-material limits, the layer sensitivity
{
  const flib = makeLibrary([]);
  const fm = Object.fromEntries([...flib].map(([id, dd]) => [id, dd.model]));
  const lams = [420, 470, 520, 570, 620, 670];
  const nx = (id: string) => lams.map((l) => refractiveIndex(id, fm, l));
  const base: DesignProblem = { lambdas: lams, angles: [0, 30, 33, 37], mats: [nx('TiO2'), nx('SiO2')], names: ['H', 'L'], n0: nx('Air'), nS: nx('BK7'), nOut: nx('Air'), thick: null, sides: ['front'], samples: [], minD: 0, maxD: 1000, maxLayers: 50, maxTotal: 1e6 };
  const des: Design = { front: [{ m: 0, d: 25 }, { m: 1, d: 40 }, { m: 0, d: 95 }, { m: 1, d: 88 }], back: [] };
  // (a) an averaged sample = the weighted mean of its points; its Jacobian and needle values vs finite differences
  const wts = [0.1, 0.25, 0.3, 0.2, 0.15];
  const avg = lams.slice(0, 5).map((_, li) => ({ li, ai: li % 2 ? 1 : 3, w: wts[li] }));
  const prob: DesignProblem = { ...base, samples: [{ li: 0, ai: 0, pol: 'avg', q: 'R', target: 0.01, w: 1, avg }, { li: 5, ai: 2, pol: 's', q: 'T', target: 0.97, w: 1, kind: 'ge', avg: [{ li: 5, ai: 2, w: 0.5 }, { li: 4, ai: 1, w: 0.5 }] }] };
  const single = (li: number, ai: number) => evaluateDesign({ ...base, samples: [{ li, ai, pol: 'avg', q: 'R', target: 0, w: 1 }] }, des).X[0];
  const meanMan = avg.reduce((a2, e) => a2 + e.w * single(e.li, e.ai), 0);
  const ev = evaluateDesign(prob, des, { grad: true });
  const eMean = Math.abs(ev.X[0] - meanMan);
  let jErr = 0;
  des.front.forEach((_, j) => {
    const h = 1e-5;
    const at = (dd: number) => evaluateDesign(prob, { ...des, front: des.front.map((L, k) => (k === j ? { ...L, d: L.d + dd } : L)) }).residuals;
    const [up, dn] = [at(h), at(-h)];
    prob.samples.forEach((_, k) => (jErr = Math.max(jErr, Math.abs((up[k] - dn[k]) / (2 * h) - ev.J![k][j]) / Math.max(1e-3, Math.abs(ev.J![k][j])))));
  });
  const evN = evaluateDesign(prob, des, { needle: { side: 'front', step: 25 } });
  let nErr = 0;
  for (const nd of evN.needle!.filter((_, i) => i % 3 === 0)) {
    const ins = (t: number): Design => {
      const f = des.front.map((x) => ({ ...x }));
      if (nd.layer >= f.length) f.push({ m: nd.m, d: t });
      else if (nd.z <= 1e-9) f.splice(nd.layer, 0, { m: nd.m, d: t });
      else f.splice(nd.layer, 1, { m: f[nd.layer].m, d: nd.z }, { m: nd.m, d: t }, { m: f[nd.layer].m, d: f[nd.layer].d - nd.z });
      return { front: f, back: [] };
    };
    const fd = (evaluateDesign(prob, ins(1e-4)).merit - evaluateDesign(prob, ins(0)).merit) / 1e-4;
    nErr = Math.max(nErr, Math.abs(fd - nd.value) / Math.max(1e-2, Math.abs(nd.value)));
  }
  if (!(eMean < 1e-15 && jErr < 1e-5 && nErr < 2e-3)) throw new Error(`averaged design samples: mean ${eMean}, Jacobian ${jErr}, needle ${nErr}`);

  // (b) photopic weights: Σ V·D65 (10 nm) = 1056.8 (the D65 normalization), the weights sum to 1, V(555) = 1 within the table
  const sVD = PHOTOPIC_TABLES.V.reduce((a2, v, i) => a2 + v * PHOTOPIC_TABLES.D65[i], 0);
  const bw = bandWeights(Array.from({ length: 401 }, (_, i) => 380 + i), true)!;
  const okPh = Math.abs(sVD - 1056.8) < 0.5 && Math.abs(bw.reduce((a2, b) => a2 + b, 0) - 1) < 1e-12 && Math.abs(photopicWeight(555) / photopicWeight(560) - 1) < 0.05 && bandWeights([200, 300], true) === null;

  // (c) the cone: its few angles reproduce a dense ray average (TiO2/SiO2 stack, unpolarized, 0° and 35°, ±12°)
  const L5 = (lam: number) => [{ n: refractiveIndex('Air', fm, lam), d: 0 }, ...des.front.map((L) => ({ n: refractiveIndex(L.m ? 'SiO2' : 'TiO2', fm, lam), d: L.d })), { n: refractiveIndex('BK7', fm, lam), d: 0 }];
  const Ru = (lam: number, th: number) => (tmmPoint(L5(lam), lam, th, 's').R + tmmPoint(L5(lam), lam, th, 'p').R) / 2;
  let eCone = 0;
  for (const th0 of [0, 35]) {
    const half = 12;
    const [c0, s0] = [Math.cos((th0 * Math.PI) / 180), Math.sin((th0 * Math.PI) / 180)];
    let dense = 0;
    const NR = 200, NP = 200;
    for (let i = 0; i < NR; i++) {
      const sa = Math.sqrt(((i + 0.5) / NR) * Math.sin((half * Math.PI) / 180) ** 2);
      for (let k = 0; k < NP; k++) dense += Ru(550, (Math.acos(c0 * Math.sqrt(1 - sa * sa) + s0 * sa * Math.cos((Math.PI * (k + 0.5)) / NP)) * 180) / Math.PI);
    }
    dense /= NR * NP;
    const q = coneRays(th0, half).reduce((a2, r) => a2 + r.w * Ru(550, r.theta), 0);
    eCone = Math.max(eCone, Math.abs(q - dense));
  }
  // through the graph: Compute TMM with a cone = the mean over the same rays; the designer's spectrum with a cone too
  const cp = toleranceExample();
  const cnodes = (cone: boolean) => cp.nodes.map((m) => (m.id === 'tmm' || m.type === 'compute' ? ({ ...m, data: { ...m.data, cone, coneHalf: 15 } } as AppNode) : m));
  const run2 = (cone: boolean) => {
    const r = evaluateHeadless(cnodes(cone), cp.edges, makeLibrary(cp.materials));
    const id = cp.nodes.find((m) => m.type === 'compute')!.id;
    return (r.results.get(id)!.outs.out as { dataset: Dataset }).dataset;
  };
  const [off, on] = [run2(false), run2(true)];
  const cspec = off.spec!;
  const thA = cspec.theta[0];
  const lamA = cspec.lambda;
  const manual = lamA.map((l, li) => coneRays(thA, 15).reduce((a2, r) => a2 + r.w * (runSpec({ ...cspec, lambda: [l], theta: [r.theta] }) as unknown as Record<string, Float64Array>).R[0], 0) - on.fields.R[li]);
  const eGraph = Math.max(...manual.map(Math.abs));
  const okGraph = eGraph < 1e-12 && on.fields.R.some((v, i) => Math.abs(v - off.fields.R[i]) > 1e-4) && Number.isNaN(on.fields.phiR[0]);
  if (!(okPh && eCone < 2e-4 && okGraph)) throw new Error(`photopic ${okPh} (Σ ${sVD}), cone vs dense rays ${eCone}, Compute TMM cone ${eGraph} (${okGraph})`);

  // (d) constraints: refinement keeps a locked layer, gives tied layers one thickness, keeps a material's maximum;
  // a needle run keeps the locked layer and its thickness, cleanup keeps a thin locked layer
  const tgt: DesignProblem = { ...base, angles: [0], samples: lams.map((_, li) => ({ li, ai: 0, pol: 's' as const, q: 'R' as const, target: 0, w: 1 })), matMax: [NaN, 70] };
  const start: Design = { front: [{ m: 0, d: 12, fix: true }, { m: 1, d: 60, tie: 'a' }, { m: 0, d: 30 }, { m: 1, d: 45, tie: 'a' }], back: [] };
  const rf = await refineCandidate(tgt, start, 60, null);
  const f2 = rf.design.front;
  const okRef = f2[0].d === 12 && f2[0].fix && Math.abs(f2[1].d - f2[3].d) < 1e-12 && f2[1].d <= 70 + 1e-12 && rf.merit < evaluateDesign(tgt, start).merit;
  const nd2 = await runDesign({ ...tgt, minD: 15 }, start, { algorithm: 'needle', iterations: 3, needleStep: 10, lambdaRef: 550 }, () => {});
  const lockKept = nd2.design.front.filter((L) => L.fix);
  const okNeedle = lockKept.length === 1 && lockKept[0].d === 12 && nd2.design.front.every((L) => L.m !== 1 || L.d <= 70 + 1e-9);
  if (!(okRef && okNeedle)) throw new Error(`design constraints: refine ${okRef} (${JSON.stringify(f2)}), needle ${okNeedle} (${JSON.stringify(nd2.design.front)})`);

  // (e) layer sensitivity: ΔMF ≥ 0 at the refined design, and = ½ Σ (∂r/∂d)² δ² · … to second order (compared with a
  // finite second difference)
  const sv = layerSensitivity(tgt, rf.design, 0.5, false);
  const mfOf = (d2: Design) => evaluateDesign(tgt, d2).mf;
  const j = 2;
  const sec = (mfOf({ ...rf.design, front: rf.design.front.map((L, k) => (k === j ? { ...L, d: L.d + 0.5 } : L)) }) + mfOf({ ...rf.design, front: rf.design.front.map((L, k) => (k === j ? { ...L, d: L.d - 0.5 } : L)) })) / 2 - sv.mf0;
  const okSens = sv.rows.length === 4 && sv.rows.every((r) => Number.isFinite(r.dmf)) && Math.abs(sv.rows[j].dmf - sec) < 1e-15;
  if (!okSens) throw new Error(`layer sensitivity: ${JSON.stringify(sv.rows)}`);
  console.log(
    [
      `designer band means: averaged sample = weighted mean of its points (${eMean.toExponential(1)}), Jacobian vs FD ${jErr.toExponential(1)}, needle vs FD ${nErr.toExponential(1)}; photopic Σ V·D65 = ${sVD.toFixed(1)} (1056.8)`,
      `cone of light: 8 angles vs 40 000 rays ${eCone.toExponential(1)} (0° and 35°, ±12°); Compute TMM with a cone = the ray mean (${eGraph.toExponential(1)}), phases NaN`,
      `constraints: refined with a locked layer (kept at 12 nm), two tied layers (${f2[1].d.toFixed(2)} = ${f2[3].d.toFixed(2)} nm, SiO₂ max 70), needle run keeps the lock; layer sensitivity = ΔMF of ±δ`,
    ].join('\n'),
  );
}

// Binding kinetics and Sensorgram: the rate equations against their analytic solutions; the sensorgram against direct
// transfer-matrix computations; benchmarks: Jung et al., Langmuir 14, 5636 (1998) (the response to an adlayer
// R = m Δn [1 − exp(−2d/l_d)], l_d = 368 nm for Cr 1 nm / Au 50 nm at 825 nm, m = 107°/RIU) and the Biacore calibration
// (1000 RU ≈ 1 ng/mm² of protein, Stenberg et al. 1991; 1 RU = 10⁻⁴°)
{
  const P0: KineticParams = { model: 'langmuir', ka: 1e5, kd: 1e-3, rmax: 1000, kt: 1e9, ka2: 0, kd2: 0, rmax2: 0, tau: 10, drift: 0 };
  const C = 50e-9;
  const prot = [{ label: 'a', t: 300, c: C }, { label: 'd', t: 600, c: 0 }];
  // (a) 1:1: association Req (1 − e^(−kobs t)), dissociation e^(−kd t)
  const r1 = simulate(P0, prot, 1);
  const kobs = P0.ka * C + P0.kd;
  const Req = (P0.ka * C * P0.rmax) / kobs;
  const ana = r1.t.map((t) => (t <= 300 ? Req * (1 - Math.exp(-kobs * t)) : Req * (1 - Math.exp(-kobs * 300)) * Math.exp(-P0.kd * (t - 300))));
  const eL = Math.max(...r1.R.map((v, i) => Math.abs(v - ana[i]))) / Req;
  // (b) mass transport: kt → ∞ is 1:1; transport-limited start: dR/dt = kt C
  const rT = simulate({ ...P0, model: 'transport', kt: 1e16 }, prot, 1);
  const eT = Math.max(...rT.R.map((v, i) => Math.abs(v - r1.R[i]))) / Req;
  const lim = simulate({ ...P0, model: 'transport', ka: 1e9, kd: 0, rmax: 1e6, kt: 1e8 }, [{ label: 'a', t: 10, c: 1e-8 }], 1);
  const eLim = Math.abs(lim.R[lim.R.length - 1] / 10 - 1); // kt·C = 1 RU/s
  // (c) heterogeneous = two 1:1 sites; two-state without the change and bivalent without the second step = 1:1 (2·ka for
  // the two sites of a bivalent analyte); regeneration empties the surface; swelling s∞(1 − e^(−t/τ))
  const h = simulate({ ...P0, model: 'hetero', ka2: 3e4, kd2: 5e-3, rmax2: 400 }, prot, 1);
  const s1 = simulate(P0, prot, 1).R;
  const s2 = simulate({ ...P0, ka: 3e4, kd: 5e-3, rmax: 400 }, prot, 1).R;
  const eH = Math.max(...h.R.map((v, i) => Math.abs(v - s1[i] - s2[i])));
  const eTS = Math.max(...simulate({ ...P0, model: 'twostate' }, prot, 1).R.map((v, i) => Math.abs(v - r1.R[i])));
  const biv = simulate({ ...P0, model: 'bivalent' }, prot, 1).R;
  const eB = Math.max(...simulate({ ...P0, ka: 2e5 }, prot, 1).R.map((v, i) => Math.abs(v - biv[i])));
  const rg = simulate(P0, [{ label: 'a', t: 100, c: C }, { label: 'r', t: 50, c: 0, regen: true }], 1);
  const okRegen = rg.R[99] > 100 && rg.R[100] === 0; // the regeneration step starts with an empty surface
  const sw = simulate({ ...P0, model: 'swelling', tau: 20 }, [{ label: 's', t: 100, c: 0, swell: 0.8 }], 1);
  const eS = Math.max(...sw.s.map((v, i) => Math.abs(v - 0.8 * (1 - Math.exp(-sw.t[i] / 20)))));
  if (!(eL < 1e-8 && eT < 1e-6 && eLim < 0.01 && eH < 1e-9 && eTS < 1e-9 && eB < 1e-9 && okRegen && eS < 1e-7))
    throw new Error(`kinetics: 1:1 ${eL}, kt→∞ ${eT}, transport-limited ${eLim}, hetero ${eH}, two-state ${eTS}, bivalent ${eB}, regen ${okRegen}, swelling ${eS}`);

  // the graph: BK7 / (Cr) / Au / water, a Binding kinetics → Sensorgram
  const sgGraph = (o: { lam: number; th: [number, number, number]; cr?: boolean; kin: Partial<KineticsData>; sg: Partial<SensorgramData>; seeds?: string }) => {
    const mat = (id: string, m: string): AppNode => ({ id, type: 'material', position: { x: 0, y: 0 }, data: materialData(m) });
    const lay = (id: string, d: number): AppNode => ({ id, type: 'layer', position: { x: 0, y: 0 }, data: { label: id, thickness: d, layers2D: 1 } });
    const E2 = (s2: string, t: string, hh: string, sh = 'out') => ({ id: `${s2}-${sh}-${t}-${hh}`, source: s2, sourceHandle: sh, target: t, targetHandle: hh });
    const nodes: AppNode[] = [
      mat('bk7', 'BK7'), mat('aum', 'Au'), mat('crm', 'Cr'), mat('water', 'Water'), lay('au', 50), lay('cr', 1),
      { id: 'st', type: 'combine', position: { x: 0, y: 0 }, data: { name: '', count: o.cr ? 2 : 1 } },
      { id: 'wl', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'lambda', mode: 'constant', value: o.lam, min: 400, max: 900, step: 1 } },
      { id: 'th', type: 'param', position: { x: 0, y: 0 }, data: { quantity: 'theta', mode: 'range', value: 70, min: o.th[0], max: o.th[1], step: o.th[2] } },
      { id: 'tm', type: 'compute', position: { x: 0, y: 0 }, data: { name: 'chip', polarization: 'p' } },
      { id: 'kin', type: 'kinetics', position: { x: 0, y: 0 }, data: { ...KINETICS_DEFAULTS, ...o.kin } },
      { id: 'sg', type: 'sensorgram', position: { x: 0, y: 0 }, data: { ...SENSORGRAM_DEFAULTS, ...o.sg } },
      ...(o.seeds ? [{ id: 'seeds', type: 'sweep', position: { x: 0, y: 0 }, data: { name: 'seed', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: o.seeds } } as AppNode] : []),
    ];
    const edges = [
      E2('aum', 'au', 'mat'), E2('crm', 'cr', 'mat'), E2('bk7', 'st', 'incident'), ...(o.cr ? [E2('cr', 'st', 'item-0'), E2('au', 'st', 'item-1')] : [E2('au', 'st', 'item-0')]),
      E2('water', 'st', 'exit'), E2('st', 'tm', 'stack'), E2('wl', 'tm', 'lambda'), E2('th', 'tm', 'theta'), E2('tm', 'sg', 'in'), E2('kin', 'sg', 'kinetics'),
      ...(o.seeds ? [E2('seeds', 'sg', 'seed')] : []),
    ];
    const r = evaluateHeadless(nodes, edges, makeLibrary([]));
    const res = r.results.get('sg')!;
    if (res.errors.length) throw new Error(`sensorgram: ${res.errors}`);
    const tmS = (r.results.get('tm')!.outs.out as { dataset: Dataset }).dataset.spec!;
    return { sens: (res.outs.sensorgram as { dataset: Dataset }).dataset, out: (res.outs.out as { dataset: Dataset }).dataset, info: res.info as SensorgramInfo, spec: tmS, warnings: res.warnings, kin: r.results.get('kin')! };
  };
  const goldenDip = (ls: (lam: number) => { n: ReturnType<typeof c>; d: number }[], lam: number, a: number, b: number) => {
    const g = (Math.sqrt(5) - 1) / 2;
    const f = (t: number) => tmmPoint(ls(lam), lam, t, 'p').R;
    for (let it = 0; it < 80; it++) {
      const [x1, x2] = [b - g * (b - a), a + g * (b - a)];
      if (f(x1) < f(x2)) b = x2;
      else a = x1;
    }
    return (a + b) / 2;
  };
  // (d) Γ = 0: the exact dip of the bare chip; bulk only (no binding): the dip of water + Δn, computed directly
  const mw = 150000;
  const cB = 2000; // nM
  const bulkRun = sgGraph({ lam: 633, th: [68, 76, 0.1], kin: { ka: 0, steps: [{ label: 'buffer', t: 10, c: 0 }, { label: 'injection', t: 10, c: cB }], dt: 1, analyte: 'custom', mw, dndc: 0.188, rho: 1.35, dims: [5, 5, 5] }, sg: { bulk: true } });
  const wl = (lam: number, dn: number) => [{ n: refractiveIndex('BK7', models, lam), d: 0 }, { n: refractiveIndex('Au', models, lam), d: 50 }, { n: c(refractiveIndex('Water', models, lam).re + dn, refractiveIndex('Water', models, lam).im), d: 0 }];
  const dn = (0.188 * cB * 1e-9 * mw) / 1000;
  const th0 = goldenDip(() => wl(633, 0), 633, 68, 76);
  const th1 = goldenDip(() => wl(633, dn), 633, 68, 76);
  const pos = bulkRun.sens.fields.pos;
  const eBase = Math.abs(pos[0] - th0);
  const eBulk = Math.abs(pos[pos.length - 1] - th1);
  // (e) de Feijter: the binding layer index = n_buffer + dn/dc · Γ / d (fixed 5 nm, no bulk)
  const fe = sgGraph({ lam: 633, th: [68, 76, 0.1], kin: { ka: 1e6, kd: 0, rmax: 1500, steps: [{ label: 'inj', t: 60, c: 100 }], dt: 2, analyte: 'custom', mw, dndc: 0.188, rho: 1.35, dims: [5, 5, 5] }, sg: { bulk: false, thick: 'auto', mixing: 'linear' } });
  const nb = refractiveIndex('Water', models, 633).re;
  const eFe = Math.max(...Array.from(fe.sens.fields.nL, (v, i) => Math.abs(v - (nb + (0.188 * fe.sens.fields.Gamma[i]) / 5))));
  // the exact dip at the end vs a dense grid (step 0.0005°) around it with a parabola
  const nEnd = fe.sens.fields.nL[fe.sens.fields.nL.length - 1];
  const lsEnd = (lam: number) => [wl(lam, 0)[0], wl(lam, 0)[1], { n: c(nEnd, 0), d: 5 }, wl(lam, 0)[2]];
  const pEnd = fe.sens.fields.pos[fe.sens.fields.pos.length - 1];
  const xsD = Array.from({ length: 401 }, (_, i) => pEnd - 0.1 + i * 0.0005);
  const ysD = xsD.map((t) => tmmPoint(lsEnd(633), 633, t, 'p').R);
  const eTrack = Math.abs(extremum(xsD, ysD, 0, 400, 'min').x - pEnd);

  // (f) Jung et al. 1998: a compact layer of index n_water + 0.01 growing to ~200 nm on Cr 1 nm / Au 50 nm, 825 nm:
  // R(d) = A [1 − exp(−2d/l_d)] fitted (A, l_d); the bulk sensitivity m = A / 0.01
  const jg = sgGraph({ lam: 825, cr: true, th: [62, 72, 0.05], kin: { ka: 1e5, kd: 0, rmax: 220000, steps: [{ label: 'grow', t: 400, c: 100 }], dt: 4, analyte: 'custom', mw: 1, dndc: 0.01, rho: 1, dims: [1, 1, 1] }, sg: { bulk: false, thick: 'compact', mixing: 'linear', maxTimes: 101 } });
  const dJ = Array.from(jg.sens.fields.dL);
  const rJ = Array.from(jg.sens.fields.shift);
  let best = { ld: NaN, A: NaN, res: Infinity };
  for (let ld = 150; ld <= 700; ld += 0.5) {
    const g = dJ.map((d) => 1 - Math.exp((-2 * d) / ld));
    const A = g.reduce((a, v, i) => a + v * rJ[i], 0) / g.reduce((a, v) => a + v * v, 0);
    const res = Math.sqrt(g.reduce((a, v, i) => a + (A * v - rJ[i]) ** 2, 0) / g.length);
    if (res < best.res) best = { ld, A, res };
  }
  const mJ = best.A / 0.01;
  const thJ0 = goldenDip((lam) => [{ n: refractiveIndex('BK7', models, lam), d: 0 }, { n: refractiveIndex('Cr', models, lam), d: 1 }, { n: refractiveIndex('Au', models, lam), d: 50 }, { n: refractiveIndex('Water', models, lam), d: 0 }], 825, 62, 72);
  const thJ1 = goldenDip((lam) => [{ n: refractiveIndex('BK7', models, lam), d: 0 }, { n: refractiveIndex('Cr', models, lam), d: 1 }, { n: refractiveIndex('Au', models, lam), d: 50 }, { n: c(refractiveIndex('Water', models, lam).re + 0.001, 0), d: 0 }], 825, 62, 72);
  const mBulk = (thJ1 - thJ0) / 0.001;
  const okJung = best.ld > 290 && best.ld < 420 && best.res < 0.02 * Math.abs(best.A) && Math.abs(mJ / mBulk - 1) < 0.1 && Math.max(...dJ) > 150;
  // (g) Biacore calibration: 1000 RU of protein (de Feijter, 5 nm) at 760 nm ≈ 0.1°
  const bc = sgGraph({ lam: 760, th: [62, 72, 0.05], kin: { ka: 1e7, kd: 0, rmax: 1000, steps: [{ label: 'inj', t: 60, c: 1000 }], dt: 2, analyte: 'custom', mw, dndc: 0.188, rho: 1.35, dims: [5, 5, 5] }, sg: { bulk: false, thick: 'auto' } });
  const dB = bc.sens.fields.shift[bc.sens.fields.shift.length - 1];
  const G1 = bc.sens.fields.Gamma[bc.sens.fields.Gamma.length - 1];
  const perNg = dB / G1;
  const okBia = perNg > 0.07 && perNg < 0.15 && G1 > 0.99;
  // (h) the examples run (the noisy one too)
  const exs = [sensorgramAntibodyExample(), sensorgramSwellingExample(), sensorgramSmallMoleculeExample(), startHereExample(), myoglobinRsaExample()].flatMap((p) => [...evaluateHeadless(p.nodes, p.edges, makeLibrary(p.materials)).results].filter(([id]) => id.startsWith('sg')).map(([, r]) => r));
  const okEx = exs.every((r) => !r.errors.length && Array.from((r.outs.sensorgram as { dataset: Dataset }).dataset.fields.shift).every(Number.isFinite));
  if (!(eBase < 1e-7 && eBulk < 1e-7 && eFe < 1e-12 && eTrack < 2e-5 && okJung && okBia && okEx))
    throw new Error(`sensorgram: base ${eBase}, bulk ${eBulk}, de Feijter ${eFe}, tracking ${eTrack}, Jung l_d ${best.ld} res ${best.res / best.A} m ${mJ} vs ${mBulk}, Biacore ${perNg}°/(ng/mm²), examples ${okEx}`);
  console.log(
    [
      `binding kinetics: 1:1 vs analytic ${eL.toExponential(1)}, kt → ∞ = 1:1 (${eT.toExponential(1)}), transport-limited start kt·C (${(100 * eLim).toFixed(2)} %), heterogeneous = two sites, two-state / bivalent limits = 1:1, regeneration, swelling vs analytic ${eS.toExponential(1)}`,
      `sensorgram: bare chip = exact dip (${eBase.toExponential(1)}°), bulk Δn ${dn.toExponential(2)} = water + Δn (${eBulk.toExponential(1)}°), de Feijter n = n_b + (dn/dc)Γ/d (${eFe.toExponential(1)}), exact tracking vs a 0.0005° grid ${eTrack.toExponential(1)}°`,
      `Jung et al. 1998 (Cr 1 / Au 50 nm, 825 nm): R(d) = A[1 − exp(−2d/l_d)] fits with l_d = ${best.ld} nm (paper 368, 320–370) to ${((100 * best.res) / Math.abs(best.A)).toFixed(2)} %, m = ${mJ.toFixed(1)}°/RIU (bulk ${mBulk.toFixed(1)}; paper 107 with its glass); Biacore: 1 ng/mm² at 760 nm → ${dB.toFixed(4)}° (1000 RU = 0.1°)`,
    ].join('\n'),
  );

  // (i) the surface: RSA blocking = 1 − 4θ at low coverage; Feder's law near jamming (θ∞ − θ ∝ t^(−1/2): 4× longer
  // halves the gap); the jamming capacity of myoglobin on silica against Wasilewska et al., IJERPH 18, 4944 (2021):
  // 0.60 ± 0.1 mg/m² at 0.01 M NaCl (ζ = 38 mV) and 1.3 ± 0.1 at 0.15 M (ζ = 15 mV), pH 3.5
  const eBlock = Math.abs(blocking(0.001 / THETA_JAM) - (1 - 4 * 0.001)) / 0.001;
  const Pr: KineticParams = { ...P0, ka: 1e6, kd: 0, rmax: 1000, rsa: true };
  const rr = simulate(Pr, [{ label: 'a', t: 40000, c: 1e-6 }], 100);
  const gap = (t: number) => 1000 - rr.R[Math.round(t / 100)];
  const feder = gap(8000) / gap(32000);
  const r0 = simulate(Pr, [{ label: 'a', t: 0.01, c: 1e-9 }], 0.01);
  const rate0 = r0.R[1] / 0.01; // ka C Rmax at the start = 1 RU/s
  const my10 = surfaceOf(ANALYTES.myoglobin, 'side', 10, 38).capacity;
  const my150 = surfaceOf(ANALYTES.myoglobin, 'side', 150, 15).capacity;
  const okMyo = Math.abs(my10 - 0.6) < 0.1 && Math.abs(my150 - 1.3) < 0.1 && surfaceOf(ANALYTES.myoglobin, 'side', 150, 15).gap === 0;
  // albumin, lying, 0.15 M: 1.4 ± 0.05 mg/m² (QCM) and 1.3 (OWLS), Wasilewska et al., Langmuir (2019), "Human serum albumin adsorption kinetics on silica"
  const hsa = surfaceOf(ANALYTES.bsa, 'side', 150, 10).capacity;
  // (j) the binding layer (auto): as high as the molecule below the capacity, h·Γ/Γ∞ above; the coverage fields agree
  const iggEnd = surfaceOf(ANALYTES.igg, 'end', 150, -10);
  const mono = sgGraph({ lam: 633, th: [68, 76, 0.1], kin: { ka: 1e6, kd: 0, rmax: 8000, analyte: 'igg', orient: 'end', steps: [{ label: 'inj', t: 300, c: 100 }], dt: 5 }, sg: { bulk: false, thick: 'auto', maxTimes: 61 } });
  const mf = mono.sens.fields;
  let eAuto = 0;
  let eCov = 0;
  for (let i = 0; i < mf.dL.length; i++) {
    const G = mf.Gamma[i];
    eAuto = Math.max(eAuto, Math.abs(mf.dL[i] - (G > iggEnd.capacity ? (iggEnd.height * G) / iggEnd.capacity : iggEnd.height)));
    eCov = Math.max(eCov, Math.abs(mf.cover[i] - mf.jam[i] * iggEnd.thetaMax), Math.abs(mf.num[i] / ((G * 1e-15) / iggEnd.mass) - 1) || 0);
  }
  const okWarn = mono.kin.warnings.some((w) => w.includes('monolayer'));
  // (k) drift: nothing bound, the buffer index grows by drift·t: the end = the dip of water + Δn
  const dr = sgGraph({ lam: 633, th: [68, 76, 0.1], kin: { ka: 0, steps: [{ label: 'buffer', t: 600, c: 0 }], dt: 10 }, sg: { bulk: false, drift: 5 } });
  const dnD = (5e-6 * 600) / 60;
  const eDrift = Math.abs(dr.sens.fields.pos[dr.sens.fields.pos.length - 1] - goldenDip(() => wl(633, dnD), 633, 68, 76));
  // (l) a swept seed: one noisy series per seed (the first axis), different noise, R exact = the noiseless curves
  const sd = sgGraph({ lam: 633, th: [68, 76, 0.1], kin: { ka: 1e6, kd: 0, rmax: 500, steps: [{ label: 'buffer', t: 100, c: 0 }, { label: 'inj', t: 100, c: 100 }], dt: 10 }, sg: { bulk: false, track: false, noise: true, noiseAdd: 0.001 }, seeds: '1, 2, 3' });
  const okSeedAx = sd.sens.axes[0].id === 'seed' && sd.sens.axes[0].values.length === 3 && sd.out.axes[0].id === 'seed';
  const half = sd.out.size / 3;
  const dR = Math.max(...Array.from({ length: half }, (_, i) => Math.abs(sd.out.fields.R[i] - sd.out.fields.R[half + i])));
  const exactSame = Array.from({ length: half }, (_, i) => sd.out.fields.Rexact[i] === sd.out.fields.Rexact[2 * half + i]).every(Boolean);
  const nNoise = Math.sqrt(Array.from({ length: half }, (_, i) => (sd.out.fields.R[i] - sd.out.fields.Rexact[i]) ** 2).reduce((a, v) => a + v, 0) / half);
  const okSeed = okSeedAx && dR > 1e-4 && exactSame && Math.abs(nNoise / 0.001 - 1) < 0.1;
  // (m) calibration: per RIU = the exact dip of water + Δn; per ng/mm² ≈ the Biacore run (1 ng/mm²: slightly nonlinear);
  // the detection limit = 3σ / (per ng/mm²) with σ of the analyte-free start
  const calB = bc.info.cal!;
  const perNx = (goldenDip(() => wl(633, 1e-5), 633, 68, 76) - th0) / 1e-5;
  const calA = bulkRun.info.cal!;
  const eCalN = Math.abs(calA.perN / perNx - 1);
  const eCalG = Math.abs(calB.perG! / perNg - 1);
  const cs = sd.info.cal!;
  const okLod = cs.sigma! > 1e-4 && Math.abs(cs.lodG! - (3 * cs.sigma!) / Math.abs(cs.perG!)) < 1e-12;
  // (n) steady state: single-cycle injections long enough to reach equilibrium give back KD and Rmax
  const ssr = sgGraph({ lam: 633, th: [68, 76, 0.1], kin: { ka: 1e6, kd: 1e-3, rmax: 800, steps: [1, 3, 10, 30, 100].map((cc) => ({ label: 'inj', t: 4000, c: cc })), dt: 20 }, sg: { bulk: false, maxTimes: 20 } }).kin;
  const ssd = (ssr.outs.steady as { dataset: Dataset }).dataset;
  const ssRows = (ssr.info as { steady?: string[] }).steady ?? [];
  const kdFit = Number(/KD ([\d.]+) nM/.exec(ssRows[0] ?? '')?.[1]);
  const okSteady = ssd.size === 5 && Math.abs(kdFit - 1) < 0.01 && Array.from(ssd.fields.reached).every((v) => v > 0.995) && Array.from(ssd.fields.fit).every((v, i) => Math.abs(v - ssd.fields.Req[i]) < 1);
  if (!(eCalN < 1e-4 && eCalG < 0.03 && okLod && okSteady)) throw new Error(`calibration ${eCalN} ${eCalG} (${calB.perG} vs ${perNg}), LOD ${okLod}, steady state ${okSteady} ${ssRows}`);
  console.log(`calibration: per RIU = exact (${eCalN.toExponential(1)}), ${calB.perG!.toFixed(4)}°/(ng/mm²) at 760 nm vs the 1 ng/mm² run ${perNg.toFixed(4)}; detection limit 3σ/S; steady state KD ${kdFit} nM (1), all injections at equilibrium`);
  if (!(eBlock < 0.01 && Math.abs(feder - 2) < 0.15 && Math.abs(rate0 - 1) < 1e-3 && okMyo && hsa > 1.25 && hsa < 1.45 && eAuto < 1e-9 && eCov < 1e-9 && okWarn && eDrift < 1e-7 && okSeed))
    throw new Error(`surface: blocking ${eBlock}, Feder ${feder}, rate ${rate0}, myoglobin ${my10} / ${my150}, albumin ${hsa}, auto layer ${eAuto}, coverage ${eCov}, warning ${okWarn}, drift ${eDrift}, seeds ${okSeedAx} ${dR} ${exactSame} ${nNoise}`);
  console.log(
    `surface: RSA blocking 1 − 4θ, Feder t^(−1/2) (gap ratio ${feder.toFixed(3)}), myoglobin on silica Γ∞ ${my10.toFixed(3)} / ${my150.toFixed(3)} mg/m² at 10 / 150 mM (Wasilewska et al. 2021: 0.60 ± 0.1 / 1.3 ± 0.1), albumin ${hsa.toFixed(2)} at 150 mM (2019: 1.3–1.4); auto layer = molecule height, then h·Γ/Γ∞; drift = water + Δn (${eDrift.toExponential(1)}°); swept seed: 3 noisy series, σ ${nNoise.toFixed(5)} (0.001)`,
  );
}

if (QUICK) console.log(`quick run: ${skipped.length} slow blocks skipped — ${skipped.join('; ')}. The full run: npm run check:tmm`);
