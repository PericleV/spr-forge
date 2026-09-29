// Pure evaluation of the node graph. TMM grids are not computed here: a Compute node either finds its
// dataset in the cache or emits a job that the engine runs in a worker.
import { asrKnots } from '../physics/asr.ts';
import type { Edge } from '@xyflow/react';
import { dependencies, refractiveIndex, validRange, type Models } from '../physics/materials.ts';
import type { Library } from '../physics/library.ts';
import type {
  AppNode,
  CombineNode,
  CompareNode,
  ComputeNode,
  DbrNode,
  DrawNode,
  ExtremumNode,
  FieldNode,
  FitNode,
  FormulaData,
  FormulaNode,
  FwhmNode,
  ImportNode,
  LayerNode,
  MatchData,
  MatchNode,
  MaterialNode,
  MaterialSweepNode,
  ObjectiveNode,
  OptimizerNode,
  ParamNode,
  PlotNode,
  RcwaNode,
  GratingNode,
  DrawGratingNode,
  RcwaFieldNode,
  ReverseNode,
  FilterNode,
  ToleranceNode,
  SensitivityNode,
  SweepNode,
  TargetNode,
  VariableNode,
  ZonesNode, AnisoNode, NotesNode } from '../types.ts';
import { axisValueText, forEachLine, hash, line, metaOf, otherIndex, strides, TMM_META } from './dataset.ts';
import { branches, COMPONENTS, coupledRates, crossingOf, dispersionParams, energyWidth, HBAR_EVS, mode2At, modelAt, paramUnit, values as fitValues, type ParamKind } from './fitmodels.ts';
import { paramId } from './fitrun.ts';
import { layersAt, phiAt, polAt } from './run.ts';
import { berremanProfile } from '../physics/berremanField.ts';
import type { NoteDoc } from '../notes/markup.ts';
import { fieldProfile, layerOfZ, profileGrid, type Complexes, type Profile } from '../physics/field.ts';
import { extremum, halfWidth, inWindow, windowOf } from './metrics.ts';
import { formulaStat, metricCost, statOf, zonesCost, type Outside, type Zone, type ZoneGoal } from './objectives.ts';
import { bandTerms, effectiveSlice, odOf, pMerit, sliceCurves, sliceInfo, sliceLines, sliceValues, termText, type MeritPoint, type Slice, type SliceInfo, type SpecTerm, type TargetSpec } from './spec.ts';
import { interp, parseSpectrum } from './match.ts';
import { gratingSlices, smallestFeature, type GratingParams } from './grating.ts';
import { fieldResults, type FieldJob } from './rcwaFieldRun.ts';
import { MAX_ORDERS, rcwaLayersAt, rcwaRegionsAt } from './runRcwa.ts';
import type { FieldMap, FieldQuantity } from '../physics/rcwaField.ts';
import { rng } from './optimize.ts';
import { compile } from './expr.ts';
import { evaluateDesign, MATERIAL_LETTERS, parseFormula, spectrum, type Design, type DesignLayer, type DesignProblem, type PolMode, type Quantity, type Sample, type Side } from './design.ts';
import { evaluateSensor, geneD, mergedGenes, SPR_CLASS_LABEL, SPR_CLASSES, sprClassOf, sprScan, type SprClass, type SprEval, type SprMaterial, type SprProblem, type SprStructure } from './sprDesign.ts';
import { layerGaOf } from '../defaults.ts';
import type { C } from '../physics/complex.ts';
import type {
  Annotation,
  Axis,
  Bound,
  Dataset,
  FieldMeta,
  InstanceSpec,
  LayerSpec,
  MaterialValue,
  MatSel,
  NodeResult,
  ObjectiveValue,
  PortValue,
  RcwaMapInfo,
  RcwaMapRegion,
  StackLayer,
  StackValue,
  SweepValue,
  TmmJob,
  TmmSpec,
  Vary,
  VaryAxis,
} from './types.ts';

export const MAX_POINTS = 2_000_000;
export const ASR_ETA = 0.9; // default strength of the adaptive spatial resolution
const LARGE_JOB = 1_000_000;
const MAX_AXIS = 20_001;
const MAX_SWEEP = 1_000;
const MAX_VARIANTS = 20_000; // structure variants a DBR may enumerate

export type JobState = {
  cache: Map<string, Dataset>;
  lastDone: Map<string, string>; // requester → key of its last finished job
  failed: Map<string, { key: string; message: string }>;
  // Present in the app: Compute RCWA runs only after Run (requester → job key armed by Run). Absent (scripts,
  // optimizer workers): every job runs.
  armed?: Map<string, string>;
};

export type Evaluation = { results: Map<string, NodeResult>; jobs: TmmJob[]; requesters: Set<string> };

type Ctx = JobState & {
  lib: Library;
  models: Models;
  nodes: Map<string, AppNode>;
  inputs: Map<string, Map<string, Edge[]>>; // target id → target handle → edges
  results: Map<string, NodeResult>;
  visiting: Set<string>;
  jobs: TmmJob[];
  requesters: Set<string>;
  tag?: string; // prefix of TMM requesters (evaluation of the graph with other variable values)
};

// Same axes (ids and lengths): a stale result of an earlier graph may have the same size but other axes.
const sameGrid = (a: Dataset, b: Dataset) =>
  a.size === b.size && a.axes.length === b.axes.length && a.axes.every((x, i) => x.id === b.axes[i].id && x.values.length === b.axes[i].values.length);

export function evaluateGraph(nodes: AppNode[], edges: Edge[], state: JobState, lib: Library): Evaluation {
  const ctx: Ctx = {
    ...state,
    lib,
    models: Object.fromEntries([...lib].map(([id, d]) => [id, d.model])),
    nodes: new Map(nodes.map((n) => [n.id, n])),
    inputs: new Map(),
    results: new Map(),
    visiting: new Set(),
    jobs: [],
    requesters: new Set(),
  };
  for (const e of edges) {
    if (!ctx.nodes.has(e.source)) continue;
    const byHandle = ctx.inputs.get(e.target) ?? new Map<string, Edge[]>();
    ctx.inputs.set(e.target, byHandle);
    byHandle.set(e.targetHandle ?? '', [...(byHandle.get(e.targetHandle ?? '') ?? []), e]);
  }
  for (const n of nodes) evalNode(ctx, n.id);
  return { results: ctx.results, jobs: ctx.jobs, requesters: ctx.requesters };
}

const fail = (errors: string[], warnings: string[] = [], info?: NodeResult['info']): NodeResult => ({
  errors,
  warnings,
  outs: {},
  info,
});

const ok = (out: PortValue | undefined, info?: NodeResult['info'], warnings: string[] = []): NodeResult => ({
  errors: [],
  warnings,
  outs: out ? { out } : {},
  info,
});

function evalNode(ctx: Ctx, id: string): NodeResult {
  const done = ctx.results.get(id);
  if (done) return done;
  if (ctx.visiting.has(id)) return fail(['Cycle in the graph.']);
  ctx.visiting.add(id);
  const node = ctx.nodes.get(id)!;
  let r: NodeResult;
  try {
    switch (node.type) {
      case 'material':
        r = evalMaterial(ctx, node);
        break;
      case 'matsweep':
        r = evalMaterialSweep(ctx, node);
        break;
      case 'aniso':
        r = evalAniso(ctx, node);
        break;
      case 'layer':
        r = evalLayer(ctx, node);
        break;
      case 'combine':
        r = evalCombine(ctx, node);
        break;
      case 'dbr':
        r = evalDbr(ctx, node);
        break;
      case 'param':
        r = evalParam(node);
        break;
      case 'sweep':
        r = evalSweep(node);
        break;
      case 'compute':
        r = evalCompute(ctx, node, 'tmm');
        break;
      case 'plot':
        r = evalPlot(ctx, node);
        break;
      case 'compare':
        r = evalCompare(ctx, node);
        break;
      case 'draw':
        r = evalDraw(ctx, node);
        break;
      case 'extremum':
        r = evalExtremum(ctx, node);
        break;
      case 'fwhm':
        r = evalFwhm(ctx, node);
        break;
      case 'sensitivity':
        r = evalSensitivity(ctx, node);
        break;
      case 'fit':
        r = evalFit(ctx, node);
        break;
      case 'field':
        r = evalField(ctx, node);
        break;
      case 'variable':
        r = evalVariable(node);
        break;
      case 'objective':
        r = evalObjective(ctx, node);
        break;
      case 'zones':
        r = evalZones(ctx, node);
        break;
      case 'optimizer':
        r = evalOptimizer(ctx, node);
        break;
      case 'import':
        r = evalImport(node);
        break;
      case 'target':
        r = evalTarget(ctx, node);
        break;
      case 'match':
        r = evalMatch(ctx, node);
        break;
      case 'formula':
        r = evalFormula(ctx, node);
        break;
      case 'info':
        r = ok({ type: 'note', doc: { title: node.data.title, body: node.data.text, children: [] } });
        break;
      case 'notes':
        r = evalNotes(ctx, node);
        break;
      case 'reverse':
        r = evalReverse(ctx, node);
        break;
      case 'filter':
        r = evalFilter(ctx, node);
        break;
      case 'tolerance':
        r = evalTolerance(ctx, node);
        break;
      case 'grating':
        r = evalGrating(ctx, node);
        break;
      case 'rcwa':
        r = evalCompute(ctx, node, 'rcwa');
        break;
      case 'drawgrating':
        r = evalDrawGrating(ctx, node);
        break;
      case 'rcwafield':
        r = evalRcwaField(ctx, node);
        break;
      case 'frame':
        r = ok(undefined);
        break;
    }
  } catch (err) {
    // A bug in one node must not stop the whole graph: report it on that node.
    console.error(`Evaluation of ${id} failed`, err);
    r = fail([`Internal error: ${err instanceof Error ? err.message : String(err)}`]);
  }
  ctx.visiting.delete(id);
  // only waiting for a Run / Start upstream: not an error of this node
  if (node.type !== 'optimizer' && r.errors.length && r.errors.every(isWaiting)) r = { ...r, errors: [], warnings: [...r.errors, ...r.warnings.filter((w) => !r.errors.includes(w))] };
  ctx.results.set(id, r);
  return r;
}

type Input = { connected: false } | { connected: true; value?: PortValue; source: string; handle: string };

function inputs(ctx: Ctx, id: string, handle: string): Input[] {
  return (ctx.inputs.get(id)?.get(handle) ?? []).map((e) => ({
    connected: true,
    value: evalNode(ctx, e.source).outs[e.sourceHandle ?? 'out'],
    source: e.source,
    handle: e.sourceHandle ?? 'out',
  }));
}

const input = (ctx: Ctx, id: string, handle: string): Input => inputs(ctx, id, handle)[0] ?? { connected: false };

// Evenly spaced values; returns an error message instead when invalid.
export function rangeValues(min: number, max: number, step: number, cap = MAX_AXIS): number[] | string {
  if (![min, max, step].every(Number.isFinite)) return 'Fill in min, max and step.';
  if (!(step > 0)) return 'Step must be > 0.';
  if (max < min) return 'Max must be ≥ min.';
  const n = Math.floor((max - min) / step + 1e-9) + 1;
  if (n > cap) return `Too many points (${n.toLocaleString('en')}); increase the step.`;
  return Array.from({ length: n }, (_, i) => +(min + i * step).toPrecision(12));
}

// `count` values from min to max, both ends included; an error message instead when invalid.
export function countValues(min: number, max: number, count: number, cap = MAX_AXIS): number[] | string {
  if (![min, max, count].every(Number.isFinite)) return 'Fill in min, max and the number of values.';
  if (!(Number.isInteger(count) && count >= 1)) return 'Number of values: an integer ≥ 1.';
  if (max < min) return 'Max must be ≥ min.';
  if (count > cap) return `Too many points (${count.toLocaleString('en')}); at most ${cap.toLocaleString('en')}.`;
  if (count === 1 || max === min) return [min];
  return Array.from({ length: count }, (_, i) => +(min + ((max - min) * i) / (count - 1)).toPrecision(12));
}
// A range node's values: by step or by number of values.
const rangeOf = (d: { min: number; max: number; step: number; by?: 'step' | 'count'; count?: number }, cap = MAX_AXIS) =>
  d.by === 'count' ? countValues(d.min, d.max, d.count ?? NaN, cap) : rangeValues(d.min, d.max, d.step, cap);

// All step combinations of the given sizes, row-major (last varies fastest).
function combinations(sizes: number[]): number[][] {
  const out: number[][] = [];
  const total = sizes.reduce((p, n) => p * n, 1);
  for (let k = 0; k < total; k++) {
    const idx = new Array<number>(sizes.length);
    for (let s = sizes.length - 1, rem = k; s >= 0; s--) {
      idx[s] = rem % sizes[s];
      rem = Math.floor(rem / sizes[s]);
    }
    out.push(idx);
  }
  return out;
}

// Registry of the sweeps a node depends on (unique by sweep node).
class Axes {
  list: VaryAxis[] = [];
  add(a: VaryAxis) {
    const i = this.list.findIndex((x) => x.sweep.id === a.sweep.id);
    return i >= 0 ? i : this.list.push(a) - 1;
  }
}

// Sweep arriving on a numeric sweep port (undefined if unconnected).
function numberSweep(ctx: Ctx, id: string, handle: string, what: string, errors: string[]): SweepValue | undefined {
  const inp = input(ctx, id, handle);
  if (!inp.connected) return undefined;
  if (inp.value?.type === 'sweep' && inp.value.sweep.kind === 'number') return inp.value.sweep;
  errors.push(`The ${what} sweep has errors.`);
  return undefined;
}

// ---- Materials ----

export const matName = (sel: MatSel) => (sel.kind === 'fixed' ? sel.mat.name : sel.mats.map((m) => m.name).join('/'));
export const nominalMat = (sel: MatSel) => (sel.kind === 'fixed' ? sel.mat : sel.mats[0]);

// iso: only isotropic materials (an anisotropic one goes into a Layer)
function materialInput(ctx: Ctx, id: string, handle: string, what: string, errors: string[], required = true, iso = false): MatSel | undefined {
  const inp = input(ctx, id, handle);
  if (!inp.connected) {
    if (required) errors.push(`${what}: connect a Material node.`);
    return undefined;
  }
  if (inp.value?.type === 'material') {
    const sel = inp.value.sel;
    if (iso && (sel.kind === 'fixed' ? [sel.mat] : sel.mats).some((m) => m.aniso)) {
      errors.push(`${what}: an anisotropic material goes into a Layer, a DBR layer or the exit medium (the incident medium, gratings and the Filter designer take isotropic materials).`);
      return undefined;
    }
    return sel;
  }
  errors.push(`${what}: the connected material has errors.`);
  return undefined;
}

// ---- Anisotropic material: principal indices from Material nodes, orientation angles (Berreman 4×4) ----

export type AnisoInfo = { comps: string[]; swept: boolean[] };
function evalAniso(ctx: Ctx, node: AnisoNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const uni = d.kind !== 'biaxial';
  const ports = uni ? [['o', 'n_o (ordinary)'], ['e', 'n_e (extraordinary)']] : [['o', 'n₁'], ['e', 'n₂'], ['z', 'n₃']];
  const comps: MaterialValue[] = [];
  for (const [h, what] of ports) {
    const s = materialInput(ctx, node.id, h, what, errors, true, true);
    if (s && s.kind !== 'fixed') errors.push(`${what}: a Material sweep cannot be used here.`);
    else if (s) comps.push(s.mat);
  }
  const nA = uni ? 2 : 3;
  const angleSweeps = [0, 1, 2].slice(0, nA).map((k) => numberSweep(ctx, node.id, `a${k}`, 'angle', errors) ?? null);
  const angles = [0, 1, 2].slice(0, nA).map((k) => d.angles[k] ?? 0);
  if (angles.some((a) => !Number.isFinite(a))) errors.push('Enter the orientation angles.');
  const info: AnisoInfo = { comps: comps.map((m) => m.name), swept: angleSweeps.map((s) => !!s) };
  if (errors.length) return fail(errors, [], info);
  const mat: MaterialValue = {
    key: node.id,
    id: `aniso:${node.id}`,
    name: d.name || (uni ? `uniaxial ${comps[0].name} / ${comps[1].name}` : `biaxial ${comps.map((m) => m.name).join(' / ')}`),
    color: d.color || '#c98bd9',
    aniso: { kind: uni ? 'uniaxial' : 'biaxial', comps, angles, angleSweeps },
  };
  return ok({ type: 'material', sel: { kind: 'fixed', mat } }, info);
}

const nAt = (ctx: Ctx, m: MaterialValue, lambda: number) => refractiveIndex(m.id, ctx.models, lambda, m.porosity).re;
const monolayer = (ctx: Ctx, m: MaterialValue) => ctx.lib.get(m.id)?.monolayer;

function evalMaterial(ctx: Ctx, node: MaterialNode): NodeResult {
  const d = node.data;
  const def = ctx.lib.get(d.materialId);
  if (!def) return fail([`Material "${d.materialId}" is not in the library.`]);
  const mat: MaterialValue = { key: node.id, id: def.id, name: def.name, color: d.color || def.color };
  const porous = def.model.type === 'ema';
  const errors: string[] = [];
  const index = numberSweep(ctx, node.id, 'n', 'index', errors);
  if (index) {
    if (d.indexMode === 'absolute' && index.values.some((v) => !(v > 0))) errors.push('Index sweep values must be > 0.');
    mat.index = { prop: d.indexMode === 'offset' ? 'dn' : 'n', sweep: index };
  }
  // the model parameter: pore fraction (effective medium) or carrier density (doped semiconductor, 10²⁰ cm⁻³)
  const doped = def.model.type === 'drude-carrier';
  const pores = numberSweep(ctx, node.id, 'p', doped ? 'carrier density' : 'pore fraction', errors);
  if (porous && Number.isFinite(d.porosity)) {
    if (!(d.porosity >= 0 && d.porosity <= 1)) errors.push('Pore fraction must be between 0 and 1.');
    mat.porosity = d.porosity;
  }
  if (doped && Number.isFinite(d.porosity)) {
    if (!(d.porosity > 0)) errors.push('The carrier density must be > 0.');
    mat.porosity = d.porosity;
  }
  if (pores) {
    if (doped) {
      if (pores.values.some((v) => !(v > 0))) errors.push('Carrier density values must be > 0.');
    } else if (!porous) errors.push('The pore-fraction sweep needs a porous (effective-medium) material (or a doped semiconductor: carrier density).');
    else if (pores.values.some((v) => !(v >= 0 && v <= 1))) errors.push('Pore fraction sweep values must be between 0 and 1.');
    mat.porositySweep = pores;
    if (doped) mat.paramLabel = 'N';
  }
  if (porous && (d.poresFill === 'prev' || d.poresFill === 'next')) mat.poresFill = d.poresFill;
  const info = { swept: index?.values.length, poresSwept: pores?.values.length, porous };
  if (errors.length) return fail(errors, [], info);
  return ok({ type: 'material', sel: { kind: 'fixed', mat } }, info);
}

function evalMaterialSweep(ctx: Ctx, node: MaterialSweepNode): NodeResult {
  const mats: MaterialValue[] = [];
  const errors: string[] = [];
  for (const inp of inputs(ctx, node.id, 'in')) {
    if (inp.connected && inp.value?.type === 'material' && inp.value.sel.kind === 'fixed') mats.push(inp.value.sel.mat);
    else errors.push('Inputs must be Material nodes without errors.');
  }
  if (!mats.length) errors.push('Connect two or more Material nodes.');
  if (errors.length) return fail([...new Set(errors)]);
  const sweep: SweepValue = {
    id: node.id,
    name: node.data.name.trim(),
    kind: 'material',
    values: mats.map((_, i) => i),
    labels: mats.map((m) => m.name),
  };
  return ok({ type: 'material', sel: { kind: 'swept', sweep, mats } }, { names: mats.map((m) => m.name) });
}

// ---- Layer ----

function evalLayer(ctx: Ctx, node: LayerNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const sel = materialInput(ctx, node.id, 'mat', 'Material', errors);
  const mono = sel?.kind === 'fixed' ? ctx.lib.get(sel.mat.id)?.monolayer : undefined;
  const dSweep = numberSweep(ctx, node.id, 'd', 'thickness', errors);
  if (!sel || errors.length) return fail(errors, [], { mono });
  const name = d.label || matName(sel);

  let thick = d.thickness;
  if (mono) {
    if (!(Number.isInteger(d.layers2D) && d.layers2D >= 1)) errors.push('Number of layers must be an integer ≥ 1.');
    thick = d.layers2D * mono;
  } else if (!dSweep && !(d.thickness >= 0)) errors.push('Invalid thickness.');
  if (dSweep?.values.some((v) => v < 0)) errors.push('Thickness sweep has negative values.');
  if (mono && dSweep?.values.some((v) => !Number.isInteger(v))) errors.push('2D material: the sweep gives the number of layers (integers).');
  if (errors.length) return fail(errors, [], { mono });

  // Nominal = first sweep step (a Design variable is a one-step sweep: drawings then show its value).
  const n2D = mono ? (dSweep ? dSweep.values[0] : d.layers2D) : undefined;
  if (dSweep) thick = mono ? dSweep.values[0] * mono : dSweep.values[0];
  const layer: StackLayer = { key: node.id, label: d.label, mat: nominalMat(sel), d: thick, layers2D: n2D };
  // an anisotropic material: the director may turn (twist) and tilt through the layer (liquid crystals)
  const aniso = (sel.kind === 'fixed' ? [sel.mat] : sel.mats).some((m) => m.aniso);
  const pitch = Number.isFinite(d.pitch) && d.pitch !== 0 ? d.pitch! : undefined;
  const twist = pitch ? (360 * thick) / pitch : Number.isFinite(d.twist) ? d.twist! : 0;
  if (aniso && (twist !== 0 || Number.isFinite(d.tiltEnd))) {
    // auto: a sublayer per 4.5° of twist, at least 20 (only an oblique incidence or a tilt profile slices a helix)
    const auto = !(Number.isFinite(d.slices) && d.slices! > 0);
    const slices = auto ? Math.max(20, Math.ceil(Math.abs(twist) / 4.5)) : Math.round(d.slices!);
    if (!(slices >= 1 && slices <= 5000)) return fail(['Sublayers: 1 – 5000.'], [], { mono, aniso });
    layer.lc = { twist, ...(pitch ? { pitch } : {}), ...(Number.isFinite(d.tiltEnd) ? { tiltEnd: d.tiltEnd } : {}), slices, ...(auto ? { autoSlices: true } : {}) };
  }
  const axes = new Axes();
  const matAxis = sel.kind === 'swept' ? axes.add({ sweep: sel.sweep, label: `material[${name}]`, unit: '', labels: sel.sweep.labels }) : -1;
  const dAxis = dSweep ? axes.add(mono ? { sweep: dSweep, label: `N[${name}]`, unit: '' } : { sweep: dSweep, label: `d[${name}]`, unit: 'nm' }) : -1;
  if (axes.list.length) {
    const steps = combinations(axes.list.map((a) => a.sweep.values.length));
    layer.vary = { axes: axes.list };
    if (dAxis >= 0) layer.vary.d = steps.map((ix) => dSweep!.values[ix[dAxis]] * (mono ?? 1));
    if (matAxis >= 0 && sel.kind === 'swept') layer.vary.mat = steps.map((ix) => sel.mats[ix[matAxis]]);
  }
  return ok({ type: 'stack', stack: { layers: [layer] } }, { mono, aniso, lcSlices: layer.lc?.slices, swept: dSweep?.values.length, d: thick, matText: matName(sel) });
}

// ---- Stack composition ----

function stackInput(ctx: Ctx, id: string, handle: string, what: string, errors: string[]): StackValue | undefined {
  const inp = input(ctx, id, handle);
  if (!inp.connected) return undefined;
  if (inp.value?.type === 'stack') return inp.value.stack;
  errors.push(missingInput(ctx, inp.source) ?? `${what}: the connected node has errors.`);
  return undefined;
}

const WAITING = ['The optimizer has no result yet', 'The RCWA field map has no', 'Compute RCWA has no result yet'];
const isWaiting = (m: string) => WAITING.some((w) => m.startsWith(w));

// Why an input has no value, when it is not an error of the source (an optimizer before its first run, a Compute RCWA
// or field map before Run — also through the nodes in between).
function missingInput(ctx: Ctx, source: string): string | undefined {
  const n = ctx.nodes.get(source);
  const r = ctx.results.get(source);
  if (r?.errors.some((e) => !isWaiting(e))) return undefined;
  if (n?.type === 'optimizer' && !n.data.runs.length) return 'The optimizer has no result yet: press Start in the Optimization Engine.';
  if (n?.type === 'rcwafield') return 'The RCWA field map has no (up-to-date) result: press Run in it.';
  if (n?.type === 'rcwa' && (r?.info as ComputeInfo | undefined)?.job?.state === 'idle') return 'Compute RCWA has no result yet: press Run in it.';
  return r?.warnings.find(isWaiting);
}

export type StackInfo = { rows: string[]; layers: number };

// Short description of a stack, with periodic blocks collapsed.
export function describeStack(s: StackValue): StackInfo {
  const rows: string[] = [];
  const layers = s.layers.filter((L) => !L.pad);
  const text = (L: StackLayer) =>
    L.grating
      ? `${L.label || 'grating'} ${L.grating.mats.map((m) => m.name).join('/')} Λ ${+L.grating.period.toFixed(1)} nm, ${L.grating.profile}, ${+L.d.toFixed(2)} nm${L.vary ? ' (swept)' : ''}`
      : `${L.label || L.mat.name} ${L.layers2D ? `${L.layers2D} ML` : `${+L.d.toFixed(2)} nm`}${L.vary ? ' (swept)' : ''}`;
  if (s.incident) rows.push(`in: ${matName(s.incident)}`);
  for (let i = 0; i < layers.length; ) {
    const g = layers[i].group;
    if (g && g.periods > 1) {
      rows.push(`[${layers.slice(i, i + g.size).map(text).join(' | ')}] ×${g.periods}`);
      while (i < layers.length && layers[i].group?.id === g.id) i++;
    } else rows.push(text(layers[i++]));
  }
  if (s.exit) rows.push(`${s.substrate ? 'substrate' : 'out'}: ${matName(s.exit)}${s.substrate ? ` ${+(s.substrate.d / 1e6).toFixed(3)} mm (incoherent)` : ''}`);
  if (s.substrate) {
    for (const L of s.substrate.back.filter((B) => !B.pad)) rows.push(`back: ${text(L)}`);
    rows.push(`out: ${s.substrate.out ? matName(s.substrate.out) : s.incident ? `${matName(s.incident)} (as incident)` : '—'}`);
  }
  return { rows, layers: layers.length };
}

function evalCombine(ctx: Ctx, node: CombineNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: StackValue[] = [];
  const itemText: (string | null)[] = [];
  for (let i = 0; i < d.count; i++) {
    const s = stackInput(ctx, node.id, `item-${i}`, `Item ${i + 1}`, errors);
    if (s) items.push(s);
    const rows = s ? describeStack({ layers: s.layers }).rows : [];
    itemText.push(!s ? null : rows.length <= 2 ? rows.join(' · ') || '(no layers)' : `${rows[0]} … (${rows.length} rows)`);
  }
  const incident = materialInput(ctx, node.id, 'incident', 'Incident medium', errors, false, true);
  const exit = materialInput(ctx, node.id, 'exit', 'Exit medium', errors, false);
  items.forEach((s, i) => {
    if (s.incident && i > 0) errors.push(`Item ${i + 1} has an incident medium in the middle of the stack.`);
    if (s.exit && i < items.length - 1) errors.push(`Item ${i + 1} has an exit medium in the middle of the stack.`);
  });
  if (incident && items[0]?.incident) warnings.push('The first item’s incident medium is overridden.');
  if (exit && items.at(-1)?.exit) warnings.push('The last item’s exit medium is overridden.');
  // Thick substrate: the exit medium is a plate of thickness dSub (mm), with an optional back coating and out medium.
  let substrate: StackValue['substrate'];
  if (d.thick) {
    const back = stackInput(ctx, node.id, 'back', 'Back coating', errors);
    const out = materialInput(ctx, node.id, 'backMedium', 'Back medium', errors, false, true);
    const dSub = d.dSub ?? 1;
    if (!(dSub > 0)) errors.push('The substrate thickness must be > 0 mm.');
    if (back?.incident || back?.exit) warnings.push('The back coating’s own media are ignored (substrate and back medium are set here).');
    if (items.at(-1)?.substrate || back?.substrate) errors.push('A thick substrate cannot be inside another one.');
    substrate = { d: dSub * 1e6, back: back?.layers ?? [], out };
  } else if (items.some((s) => s.substrate)) errors.push('An item has a thick substrate: it must be the whole structure (use it directly).');
  if (errors.length) return fail(errors, warnings, { items: itemText });
  const stack: StackValue = {
    incident: incident ?? items[0]?.incident,
    exit: exit ?? items.at(-1)?.exit,
    layers: items.flatMap((s) => s.layers),
    ...(substrate ? { substrate } : {}),
  };
  return ok({ type: 'stack', stack }, { ...describeStack(stack), items: itemText }, warnings);
}

// ---- DBR builder ----

type Built = { key: string; label: string; mat: MaterialValue; d: number; layers2D?: number; group?: StackLayer['group'] };

function evalDbr(ctx: Ctx, node: DbrNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = d.name || 'DBR';
  if (!(Number.isInteger(d.periods) && d.periods >= 1 && d.periods <= 500)) errors.push('Periods must be an integer in 1–500.');
  if (!d.period.length) errors.push('The period needs at least one layer.');
  if (!(d.lambda0 > 0)) errors.push('λ₀ must be > 0.');

  const letter = (j: number) => String.fromCharCode(65 + j);
  const periodMats = d.period.map((_, j) => materialInput(ctx, node.id, `p${j}`, `Layer ${letter(j)}`, errors));
  const cavityMats = d.cavities.map((_, i) => materialInput(ctx, node.id, `c${i}`, `Cavity ${i + 1}`, errors));
  const incident = materialInput(ctx, node.id, 'incident', 'Incident medium', errors, false, true);
  const exit = materialInput(ctx, node.id, 'exit', 'Exit medium', errors, false);

  const l0Sweep = numberSweep(ctx, node.id, 'lambda0', 'λ₀', errors);
  const cavSweep = numberSweep(ctx, node.id, 'cavd', 'cavity thickness', errors);
  // anisotropic layers (Berreman 4×4) have no single index: their thicknesses in nm
  const anisoSel = (sel: MatSel | undefined) => !!sel && (sel.kind === 'fixed' ? [sel.mat] : sel.mats).some((m) => m.aniso);
  d.period.forEach((p, j) => {
    if (p.mode === 'qw' && anisoSel(periodMats[j])) errors.push(`Layer ${letter(j)}: an anisotropic material has no single index for λ₀/4 — give its thickness in nm.`);
  });
  d.cavities.forEach((cv, i) => {
    if (cv.mode === 'half' && !cavSweep && anisoSel(cavityMats[i])) errors.push(`Cavity ${i + 1}: an anisotropic material has no single index for mλ₀/2 — give its thickness in nm.`);
  });
  const nSweep = numberSweep(ctx, node.id, 'periods', 'periods', errors);
  const posSweeps = d.cavities.map((_, i) => numberSweep(ctx, node.id, `pos${i}`, `cavity ${i + 1} position`, errors));
  // Thickness sweeps of the period layers (nm; number of layers for 2D materials). Ignored for λ₀/4 layers.
  const is2D = (j: number) => !!periodMats[j] && monolayer(ctx, nominalMat(periodMats[j]!)) !== undefined;
  const dSweeps = d.period.map((p, j) => {
    const s = numberSweep(ctx, node.id, `d${j}`, `layer ${letter(j)} thickness`, errors);
    if (s && p.mode === 'qw' && !is2D(j)) {
      warnings.push(`Layer ${letter(j)} is λ₀/4: its thickness sweep is ignored (switch it to nm).`);
      return undefined;
    }
    if (s?.values.some((v) => !(v >= 0))) errors.push(`Layer ${letter(j)}: the thickness sweep has negative values.`);
    if (s && is2D(j) && s.values.some((v) => !(Number.isInteger(v) && v >= 1))) errors.push(`Layer ${letter(j)} is 2D: its sweep gives numbers of layers (integers ≥ 1).`);
    return s;
  });
  const usesL0 = d.period.some((p, j) => p.mode === 'qw' && !is2D(j)) || d.cavities.some((c) => c.mode === 'half');
  if (l0Sweep && !usesL0 && !cavSweep) warnings.push('λ₀ is swept but no layer uses it (all thicknesses in nm).');
  if (l0Sweep?.values.some((v) => !(v > 0))) errors.push('λ₀ sweep values must be > 0.');
  if (cavSweep?.values.some((v) => v < 0)) errors.push('Cavity thickness sweep has negative values.');
  if (nSweep?.values.some((v) => !(Number.isInteger(v) && v >= 1 && v <= 500))) errors.push('Periods sweep values must be integers in 1–500.');
  posSweeps.forEach((s, i) => {
    if (s?.values.some((v) => !(Number.isInteger(v) && v >= 0))) errors.push(`Cavity ${i + 1} position sweep values must be integers ≥ 0.`);
  });
  if (errors.length) return fail(errors);

  // Sweeps this DBR depends on; `at(k, ix)` gives the step of axis k in a combination.
  const axes = new Axes();
  const role = (s: SweepValue | undefined, a: Omit<VaryAxis, 'sweep'>) => (s ? axes.add({ sweep: s, ...a }) : -1);
  const rL0 = role(l0Sweep, { label: `λ₀[${name}]`, unit: 'nm' });
  const rCav = role(cavSweep, { label: `d[${name} cavity]`, unit: 'nm' });
  const rN = role(nSweep, { label: `periods[${name}]`, unit: '' });
  const rPos = posSweeps.map((s, i) => role(s, { label: `cavity ${i + 1} position[${name}]`, unit: '' }));
  const rD = dSweeps.map((s, j) => role(s, is2D(j) ? { label: `N[${name} ${letter(j)}]`, unit: '' } : { label: `d[${name} ${letter(j)}]`, unit: 'nm' }));
  const rMat = (sel: MatSel | undefined, what: string) =>
    sel?.kind === 'swept' ? axes.add({ sweep: sel.sweep, label: `material[${name} ${what}]`, unit: '', labels: sel.sweep.labels }) : -1;
  const rP = periodMats.map((m, j) => rMat(m, letter(j)));
  const rC = cavityMats.map((m, i) => rMat(m, `cavity ${i + 1}`));

  const pick = (r: number, ix: number[], fallback: number) => (r >= 0 ? axes.list[r].sweep.values[ix[r]] : fallback);
  const matOf = (sel: MatSel, r: number, ix: number[]) => (sel.kind === 'fixed' ? sel.mat : sel.mats[ix[r]]);
  let clamped = false;

  // One concrete layer sequence for a combination of sweep steps.
  const build = (ix: number[]): Built[] => {
    const l0 = pick(rL0, ix, d.lambda0);
    const periods = pick(rN, ix, d.periods);
    const period = d.period.map((p, j) => {
      const mat = matOf(periodMats[j]!, rP[j], ix);
      const mono = monolayer(ctx, mat);
      const n2d = mono ? pick(rD[j], ix, p.layers2D) : undefined;
      const t = mono ? n2d! * mono : p.mode === 'qw' ? l0 / 4 / nAt(ctx, mat, l0) : pick(rD[j], ix, p.d);
      return { j, mat, label: p.label || mat.name, d: t, layers2D: n2d };
    });
    const cavities = d.cavities.map((cv, i) => {
      const mat = matOf(cavityMats[i]!, rC[i], ix);
      let after = pick(rPos[i], ix, cv.after);
      if (after > periods) {
        after = periods;
        clamped = true;
      }
      const mono = monolayer(ctx, mat);
      const n2d = mono ? (rCav >= 0 ? pick(rCav, ix, 0) : cv.layers2D) : undefined;
      const t = mono ? n2d! * mono : rCav >= 0 ? pick(rCav, ix, 0) : cv.mode === 'half' ? (cv.m * l0) / 2 / nAt(ctx, mat, l0) : cv.d;
      return { i, mat, after, d: t, layers2D: n2d };
    });
    const out: Built[] = [];
    let order = period;
    let segment = 0;
    const addCavities = (k: number) => {
      for (const c of cavities.filter((c) => c.after === k)) {
        out.push({ key: `${node.id}:c${c.i}`, label: 'cavity', mat: c.mat, d: c.d, layers2D: c.layers2D });
        segment++;
        if (d.mirrorAfterCavity) order = [...order].reverse();
      }
    };
    addCavities(0);
    for (let p = 1; p <= periods; p++) {
      for (const L of order)
        out.push({ key: `${node.id}:p${L.j}`, label: L.label, mat: L.mat, d: L.d, layers2D: L.layers2D, group: { id: `${node.id}:g${segment}`, name, periods: 0, size: order.length } });
      if (p === periods && d.closing) {
        const L = order[0];
        out.push({ key: `${node.id}:p${L.j}`, label: L.label, mat: L.mat, d: L.d, layers2D: L.layers2D });
      }
      addCavities(p);
    }
    const count = new Map<string, number>();
    for (const L of out) if (L.group) count.set(L.group.id, (count.get(L.group.id) ?? 0) + 1);
    for (const L of out) if (L.group) L.group = { ...L.group, periods: count.get(L.group.id)! / L.group.size };
    return out;
  };

  d.period.forEach((p, j) => {
    if (!dSweeps[j] && monolayer(ctx, nominalMat(periodMats[j]!)) !== undefined && !(Number.isInteger(p.layers2D) && p.layers2D >= 1))
      errors.push(`Layer ${letter(j)}: number of 2D layers must be an integer ≥ 1.`);
  });
  d.cavities.forEach((c, i) => {
    const mono = monolayer(ctx, nominalMat(cavityMats[i]!)) !== undefined;
    if (mono && !cavSweep && !(Number.isInteger(c.layers2D) && c.layers2D >= 1)) errors.push(`Cavity ${i + 1}: number of 2D layers must be an integer ≥ 1.`);
    if (mono && cavSweep?.values.some((v) => !Number.isInteger(v))) errors.push(`Cavity ${i + 1} is 2D: the thickness sweep gives numbers of layers (integers).`);
  });
  if (errors.length) return fail(errors);

  const steps = combinations(axes.list.map((a) => a.sweep.values.length));
  if (steps.length > MAX_VARIANTS) return fail([`Too many structure variants (${steps.length}).`]);
  const variants = steps.map(build);
  if (variants.some((v) => v.some((L) => !(L.d >= 0 && Number.isFinite(L.d))))) return fail(['Invalid layer thickness (check the materials at λ₀).']);
  if (clamped) warnings.push('Some cavity positions exceed the number of periods; placed after the last period.');

  // Align the variants slot by slot; slots missing in a variant get zero thickness (no optical effect).
  const nominal = variants[0];
  const slots = Math.max(...variants.map((v) => v.length));
  const layers: StackLayer[] = [];
  for (let i = 0; i < slots; i++) {
    const n = nominal[i];
    const filler = n?.mat ?? nominal[0]?.mat ?? variants.find((v) => v[i])![i].mat;
    const L: StackLayer = n
      ? { key: n.key, label: n.label, mat: n.mat, d: n.d, layers2D: n.layers2D, group: n.group }
      : { key: `${node.id}:slot${i}`, label: '', mat: filler, d: 0, pad: true };
    if (axes.list.length) {
      const vary: Vary = { axes: axes.list, d: variants.map((v) => v[i]?.d ?? 0) };
      const mats = variants.map((v) => v[i]?.mat ?? filler);
      if (mats.some((m) => m.key !== L.mat.key)) vary.mat = mats;
      L.vary = vary;
    }
    layers.push(L);
  }
  const stack: StackValue = { incident, exit, layers };
  const info = {
    ...describeStack(stack),
    thickness: d.period.map((_, j) => nominal.find((L) => L.key === `${node.id}:p${j}`)?.d),
    cavities: d.cavities.map((_, i) => nominal.find((L) => L.key === `${node.id}:c${i}`)?.d),
    names: periodMats.map((m) => (m ? matName(m) : '')),
    cavityNames: cavityMats.map((m) => (m ? matName(m) : '')),
    twoD: periodMats.map((m) => !!m && monolayer(ctx, nominalMat(m)) !== undefined),
    cavityTwoD: cavityMats.map((m) => !!m && monolayer(ctx, nominalMat(m)) !== undefined),
    variants: variants.length,
    usesL0,
  };
  return ok({ type: 'stack', stack }, info, warnings);
}

// ---- Parameter (θ or λ, constant or range) ----

function evalParam(node: ParamNode): NodeResult {
  const d = node.data;
  let values: number[] = [];
  const errors: string[] = [];
  if (d.mode === 'constant') {
    if (Number.isFinite(d.value)) values = [d.value];
    else errors.push('Enter a value.');
  } else {
    const r = rangeOf(d);
    if (typeof r === 'string') errors.push(r);
    else values = r;
  }
  if (d.quantity === 'theta' && values.some((v) => v < 0 || v >= 90)) errors.push('Angles must lie in [0°, 90°).');
  if (d.quantity === 'lambda' && values.some((v) => !(v > 0))) errors.push('Wavelengths must be > 0.');
  if (errors.length) return fail(errors);
  return ok({ type: 'param', quantity: d.quantity, values }, { count: values.length });
}

// ---- Sweep ----

export function parseList(text: string): number[] | string {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return 'Enter at least one value.';
  const bad = parts.find((p) => !Number.isFinite(Number(p)));
  if (bad !== undefined) return `Not a number: "${bad}".`;
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

function evalSweep(node: SweepNode): NodeResult {
  const d = node.data;
  let values: number[] = [];
  const errors: string[] = [];
  if (d.kind === 'number') {
    const r = d.mode === 'range' ? rangeOf(d, MAX_SWEEP) : parseList(d.list);
    if (typeof r === 'string') errors.push(r);
    else if (r.length > MAX_SWEEP) errors.push(`At most ${MAX_SWEEP} values.`);
    else values = r;
  } else values = [0, 1];
  if (errors.length) return fail(errors);
  const sweep: SweepValue = { id: node.id, name: d.name.trim(), kind: d.kind, values };
  return ok({ type: 'sweep', sweep }, { count: values.length });
}

// ---- Compute TMM ----

export type ComputeInfo = {
  lambdaText?: string;
  thetaText?: string;
  stackRows?: string[];
  polSwept: boolean;
  dims?: string;
  size?: number;
  job?: { requester: string; key: string; state: 'done' | 'running' | 'idle' | 'stale' }; // Compute RCWA Run / Stop
  conical?: boolean; // Compute RCWA at φ ≠ 0
  spec?: TmmSpec; // Compute RCWA: for the convergence check
  asrMinN?: number; // Compute RCWA with ASR: orders needed to resolve the mapping
  gratings?: number; // Compute RCWA: grating layers in the stack
  berreman?: boolean; // Compute TMM through the Berreman 4×4 method (anisotropic layers or a Jones state)
};

const rangeText = (v: number[], unit: string) =>
  v.length === 1 ? `${v[0]}${unit}` : `${v[0]}–${v[v.length - 1]}${unit} (${v.length} pts)`;

function evalCompute(ctx: Ctx, node: ComputeNode | RcwaNode, method: 'tmm' | 'rcwa'): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const warnings = new Set<string>();
  const info: ComputeInfo = { polSwept: false };
  const name = d.name || (method === 'rcwa' ? 'RCWA' : 'TMM');

  const param = (handle: 'lambda' | 'theta', what: string): number[] | null => {
    const inp = input(ctx, node.id, handle);
    const v = inp.connected ? inp.value : undefined;
    if (!inp.connected) errors.push(`Connect a ${what} parameter.`);
    else if (v?.type !== 'param') errors.push(`The ${what} input has errors.`);
    else if (v.quantity !== handle)
      errors.push(`The ${what} port is connected to ${v.quantity === 'theta' ? 'an angle' : 'a wavelength'} parameter.`);
    else return v.values;
    return null;
  };
  const lambda = param('lambda', 'wavelength (λ)');
  const theta = param('theta', 'angle (θ)');
  if (lambda) info.lambdaText = rangeText(lambda, ' nm');
  if (theta) info.thetaText = rangeText(theta, '°');

  const stackIn = input(ctx, node.id, 'stack');
  let stack: StackValue | undefined;
  if (!stackIn.connected) errors.push('Connect a stack.');
  else if (stackIn.value?.type !== 'stack') errors.push('The stack has errors.');
  else {
    stack = stackIn.value.stack;
    info.stackRows = describeStack(stack).rows;
    if (!stack.incident) errors.push('The stack has no incident medium.');
    if (!stack.exit) errors.push('The stack has no exit medium.');
    const gratings = [...stack.layers, ...(stack.substrate?.back ?? [])].filter((L) => L.grating);
    if (method === 'tmm' && gratings.length) errors.push('The stack has grating layers: compute it with Compute RCWA.');
    if (method === 'rcwa') {
      info.gratings = gratings.length;
      if (stack.substrate)
        warnings.add('Thick substrate: coherent RCWA above and below it, orders added in power inside it; T and its orders leave through the back.');
      // (swept periods are checked point by point when computing)
      if (new Set(gratings.map((L) => L.grating!.period)).size > 1)
        errors.push('All grating layers of the stack must have the same period (connect the same Design variable or Sweep to their period ports).');
      if (!gratings.length) warnings.add('No grating layer: the result equals Compute TMM (zeroth order only).');
      const rd = d as RcwaNode['data'];
      if (!(Number.isInteger(rd.orders) && rd.orders >= 0 && rd.orders <= MAX_ORDERS)) errors.push(`Orders N: an integer 0 – ${MAX_ORDERS}.`);
      if (!(Number.isInteger(rd.show) && rd.show >= 0 && rd.show <= 10)) errors.push('Orders shown: 0 – 10.');
      if (rd.asr) {
        const eta = rd.eta ?? ASR_ETA;
        if (!(eta > 0 && eta < 1)) errors.push('ASR strength η: between 0 and 1 (e.g. 0.9).');
        // the harmonics must resolve the mapping: N·Δ ≳ 4 for the narrowest interval Δ between two edges (in periods)
        const knots = asrKnots(gratings.flatMap((L) => gratingSlices(L.grating!).map((s) => s.segs)));
        const dMin = knots.length > 1 ? Math.min(...knots.map((k, i) => (i + 1 < knots.length ? knots[i + 1] : knots[0] + 1) - k)) : 1;
        info.asrMinN = Math.ceil(4 / dMin);
        if (rd.orders < info.asrMinN)
          warnings.add(`ASR: the narrowest part between two edges is ${(100 * dMin).toFixed(1)} % of the period; use N ≥ ${info.asrMinN} for the mapping to be resolved (below that ASR can be worse than no ASR).`);
        if (stack.substrate) warnings.add('ASR is not used with a thick substrate (plain RCWA there).');
      }
      // the orders must resolve the smallest feature of the profiles
      for (const L of gratings) {
        const w = smallestFeature(gratingSlices(L.grating!));
        if (rd.orders < Math.min(40, Math.ceil(1.5 / w))) {
          warnings.add(`${L.label || 'Grating'}: its smallest feature is ${(100 * w).toFixed(1)} % of the period; N ≥ ${Math.min(40, Math.ceil(1.5 / w))} orders are needed to resolve it.`);
          break;
        }
      }
    }
  }

  const polIn = input(ctx, node.id, 'pol');
  let polSweep: SweepValue | undefined;
  if (polIn.connected) {
    if (polIn.value?.type === 'sweep' && polIn.value.sweep.kind === 'polarization') polSweep = polIn.value.sweep;
    else errors.push('The polarization sweep has errors.');
    info.polSwept = true;
  }
  if (errors.length || !lambda || !theta || !stack) return fail(errors, [...warnings], info);

  // Sweep axes in order of first appearance (top of the stack first, polarization last).
  const sweeps: SweepValue[] = [];
  const axes: Axis[] = [];
  const sweepIndex = (a: VaryAxis) => {
    let i = sweeps.findIndex((x) => x.id === a.sweep.id);
    if (i < 0) {
      i = sweeps.push(a.sweep) - 1;
      axes.push({ id: `sweep:${a.sweep.id}`, label: a.sweep.name || a.label, unit: a.unit, values: a.sweep.values, labels: a.labels });
    }
    return i;
  };

  // Material instances (one per Material node), with their index sweeps.
  const instances: Record<string, InstanceSpec> = {};
  const used = new Set<string>();
  const instance = (m: MaterialValue): string => {
    if (m.aniso && !instances[m.key]) {
      const a = m.aniso;
      instances[m.key] = {
        lib: a.comps[0].id,
        aniso: {
          kind: a.kind,
          comps: a.comps.map(instance),
          angles: a.angles,
          angleB: a.angleSweeps.map((sw, k) => (sw ? { s: [sweepIndex({ sweep: sw, label: `${a.kind === 'uniaxial' ? ['tilt', 'azimuth'][k] : ['α', 'β', 'γ'][k]}[${m.name}]`, unit: '°' })], v: sw.values } : null)),
        },
      };
      return m.key;
    }
    if (!instances[m.key]) {
      const inst: InstanceSpec = { lib: m.id };
      if (m.porosity !== undefined) inst.p0 = m.porosity;
      if (m.poresFill) inst.fill = m.poresFill;
      if (m.porositySweep)
        inst.p = { s: [sweepIndex({ sweep: m.porositySweep, label: m.paramLabel === 'N' ? `N[${m.name}]` : `pore fraction[${m.name}]`, unit: m.paramLabel === 'N' ? '10²⁰ cm⁻³' : '' })], v: m.porositySweep.values };
      if (m.index) {
        const label = `${m.index.prop === 'n' ? 'n' : 'Δn'}[${m.name}]`;
        inst[m.index.prop] = { s: [sweepIndex({ sweep: m.index.sweep, label, unit: '' })], v: m.index.sweep.values };
      }
      instances[m.key] = inst;
      used.add(m.id);
    }
    return m.key;
  };
  const medium = (sel: MatSel, where: string): LayerSpec => {
    if (sel.kind === 'fixed') return { mat: instance(sel.mat), d: 0, dn: 0, bind: {} };
    const s = sweepIndex({ sweep: sel.sweep, label: `material[${where}]`, unit: '', labels: sel.sweep.labels });
    return { mat: instance(sel.mats[0]), d: 0, dn: 0, bind: { mat: { s: [s], v: sel.mats.map(instance) } } };
  };

  const layerSpec = (SL: StackLayer): LayerSpec => {
    const L: LayerSpec = { mat: instance(SL.mat), d: SL.d, dn: 0, bind: {} };
    if (SL.grating) L.grating = { ...SL.grating, mats: SL.grating.mats.map(instance) };
    if (SL.lc) L.lc = SL.lc;
    if (SL.flipZ) L.flipZ = true;
    if (SL.vary) {
      const s = SL.vary.axes.map(sweepIndex);
      if (SL.vary.d) L.bind.d = { s, v: SL.vary.d };
      if (SL.vary.mat) L.bind.mat = { s, v: SL.vary.mat.map(instance) };
      if (SL.vary.period) L.bind.period = { s, v: SL.vary.period };
      if (SL.vary.fill) L.bind.fill = { s, v: SL.vary.fill };
      if (SL.vary.fillTop) L.bind.fillTop = { s, v: SL.vary.fillTop };
    }
    return L;
  };
  const layers: LayerSpec[] = [medium(stack.incident!, 'in')];
  for (const SL of stack.layers) layers.push(layerSpec(SL));
  layers.push(medium(stack.exit!, 'out'));
  let back: TmmSpec['back'];
  if (stack.substrate) {
    const bl: LayerSpec[] = [layers[layers.length - 1]];
    for (const SL of stack.substrate.back) bl.push(layerSpec(SL));
    bl.push(medium(stack.substrate.out ?? stack.incident!, 'back out'));
    back = { d: stack.substrate.d, layers: bl };
  }
  // Compute RCWA: the azimuth φ of the plane of incidence from the grating vector (≠ 0: conical incidence, TE and TM
  // coupled), a value or a sweep / Design variable on its port
  let phi0 = 0;
  let phiBind: Bound<number> | undefined;
  let conical = false;
  // anisotropic layers (Berreman 4×4): the exit medium may be anisotropic (a semi-infinite Berreman medium), the incident
  // medium, a thick substrate and its back medium stay isotropic
  const isAniso = (k: string) => !!instances[k]?.aniso;
  const keysOf = (L: LayerSpec) => (L.bind.mat ? L.bind.mat.v : [L.mat]);
  const anisoUsed = [...layers, ...(back?.layers ?? [])].some((L) => keysOf(L).some(isAniso));
  if (keysOf(layers[0]).some(isAniso)) errors.push('The incident medium must be isotropic (an anisotropic material goes into a Layer, a DBR layer or the exit medium).');
  if (back && [layers[layers.length - 1], back.layers[back.layers.length - 1]].some((L) => keysOf(L).some(isAniso)))
    errors.push('A thick substrate and its back medium must be isotropic.');
  let jonesT: { psi: number; delta: number } | undefined;
  if (method === 'tmm') {
    const cd = d as ComputeNode['data'];
    const ph = numberSweep(ctx, node.id, 'phi', 'azimuth φ', errors);
    if (ph) phiBind = { s: [sweepIndex({ sweep: ph, label: 'φ', unit: '°' })], v: ph.values };
    else phi0 = Number.isFinite(cd.phi) ? cd.phi! : 0;
    if (cd.polMix && !polSweep) {
      if (![cd.polMix.psi, cd.polMix.delta].every(Number.isFinite)) errors.push('Polarization: enter ψ and δ.');
      jonesT = { psi: cd.polMix.psi, delta: cd.polMix.delta };
    }
    if (!anisoUsed && (ph || phi0 !== 0)) warnings.add('The azimuth φ has no effect on isotropic films (it matters with anisotropic layers).');
    info.berreman = anisoUsed || !!jonesT;
  }
  if (method === 'rcwa') {
    const rd = d as RcwaNode['data'];
    const ph = numberSweep(ctx, node.id, 'phi', 'azimuth φ', errors);
    if (ph) {
      phiBind = { s: [sweepIndex({ sweep: ph, label: 'φ', unit: '°' })], v: ph.values };
      conical = ph.values.some((v) => v !== 0);
    } else {
      phi0 = Number.isFinite(rd.phi) ? rd.phi! : 0;
      conical = phi0 !== 0;
    }
    // an incident Jones state (not with a polarization sweep): through the conical solver, TE / TM parts output
    if (rd.polMix && !polSweep) {
      if (![rd.polMix.psi, rd.polMix.delta].every(Number.isFinite)) errors.push('Polarization: enter ψ and δ.');
      conical = true;
    }
    if (anisoUsed) conical = true;
    if (conical && rd.asr) warnings.add('ASR is not used at φ ≠ 0 or with a Jones polarization (the conical solver): the plain RCWA with Li’s factorization.');
    info.conical = conical;
  }
  const polIdx = polSweep ? sweepIndex({ sweep: polSweep, label: 'polarization', unit: '', labels: ['p (TM)', 's (TE)'] }) : undefined;
  // porous materials filled by a neighbour: it must exist on that side (not beyond a medium); gratings keep the library filler
  const fillCheck = (list: LayerSpec[]) =>
    list.forEach((L, i) => {
      const keys = L.bind.mat ? L.bind.mat.v : [L.mat];
      for (const k of keys) {
        const f = instances[k]?.fill;
        if (f === 'prev' && i === 0) errors.push('A porous incident medium cannot be filled by the layer before it (there is none).');
        if (f === 'next' && i === list.length - 1) errors.push('A porous exit medium cannot be filled by the layer after it (there is none).');
      }
      if (L.grating?.mats.some((k) => instances[k]?.fill)) warnings.add('A porous material inside a grating keeps its library filler (the neighbour filling applies to plain layers).');
    });
  fillCheck(layers);
  if (back) fillCheck(back.layers);

  // Dispersion data range and a transparent incident medium.
  const lmin = Math.min(...lambda);
  const lmax = Math.max(...lambda);
  for (const id of used) {
    const [lo, hi] = validRange(id, ctx.lib);
    if (lmin < lo || lmax > hi)
      warnings.add(`${ctx.lib.get(id)!.name}: λ outside the data range (${+lo.toFixed(0)}–${+hi.toFixed(0)} nm), extrapolated.`);
  }
  const inc = stack.incident!;
  for (const m of inc.kind === 'fixed' ? [inc.mat] : inc.mats)
    if (lambda.some((l) => refractiveIndex(m.id, ctx.models, l, m.porosity).im > 1e-6))
      errors.push(`Incident medium must be transparent (k = 0); ${m.name} absorbs.`);

  axes.push({ id: 'lambda', label: 'λ', unit: 'nm', values: lambda }, { id: 'theta', label: 'θ', unit: '°', values: theta });
  const size = axes.reduce((p, a) => p * a.values.length, 1);
  info.size = size;
  info.dims = axes.filter((a) => a.values.length > 1).map((a) => `${a.label}:${a.values.length}`).join(' × ') || 'single point';
  if (size > MAX_POINTS)
    errors.push(`Too many points (${size.toLocaleString('en')} > ${MAX_POINTS.toLocaleString('en')}). Reduce ranges or sweeps.`);
  else if (size > LARGE_JOB) warnings.add(`Large job: ${size.toLocaleString('en')} points.`);
  if (errors.length) return fail(errors, [...warnings], info);

  const models: Models = {};
  for (const id of used) for (const dep of dependencies(id, ctx.lib)) models[dep] = ctx.models[dep];
  const spec: TmmSpec = {
    models,
    instances,
    layers,
    lambda,
    theta,
    pol: d.polarization,
    polSweep: polIdx,
    sweeps: sweeps.map((s) => s.values.length),
    ...(back ? { back } : {}),
    ...(method === 'tmm' && info.berreman ? { b4: { phi: phi0, ...(jonesT ? { jones: jonesT } : {}) }, ...(phiBind ? { phiBind } : {}) } : {}),
    ...(method === 'rcwa'
      ? (() => {
          const rd = d as RcwaNode['data'];
          return {
            rcwa: {
              orders: rd.orders,
              show: rd.show,
              ...(rd.asr && !conical ? { asr: rd.eta ?? ASR_ETA } : {}),
              ...(conical ? { conical: true, phi: phi0 } : {}),
              ...(rd.polMix && !polSweep ? { jones: { psi: rd.polMix.psi, delta: rd.polMix.delta } } : {}),
            },
            ...(phiBind ? { phiBind } : {}),
          };
        })()
      : {}),
  };
  if (method === 'rcwa') info.spec = spec;
  // Compute RCWA in the app waits for Run (the optimizer outputs, evaluated with a tag, run by themselves)
  const manual = method === 'rcwa' && !ctx.tag && ctx.armed ? ctx.armed : undefined;
  const out = requestDataset(ctx, `${ctx.tag ?? ''}${node.id}`, spec, axes, manual);
  if (out.error) errors.push(out.error);
  if (manual) {
    info.job = { requester: node.id, key: out.key, state: out.idle ? (out.dataset ? 'stale' : 'idle') : out.pending ? 'running' : 'done' };
    if (out.idle && out.dataset) warnings.add('The inputs changed: the output is the previous result — press Run to recompute.');
    // nothing computed yet: no output, the downstream nodes say "press Run"
    if (out.idle && !out.dataset) return { errors, warnings: [...warnings], outs: {}, info };
  }
  return {
    errors,
    warnings: [...warnings],
    outs: { out: { type: 'data', dataset: out.dataset, pending: out.pending, name, annotations: [], stack } },
    pending: out.pending,
    info,
  };
}

// Cached dataset for the spec, or a job for the worker (keeping the previous result visible meanwhile).
// With `armed`, a missing result is computed only when Run armed this key (idle: the previous result stays visible).
function requestDataset(ctx: Ctx, requester: string, spec: TmmSpec, axes: Axis[], armed?: Map<string, string>) {
  const key = JSON.stringify([spec, axes.map((a) => [a.id, a.label, a.unit, a.labels])]);
  ctx.requesters.add(requester);
  const hit = ctx.cache.get(key);
  if (hit) return { key, dataset: hit, pending: false };
  const failed = ctx.failed.get(requester);
  if (failed?.key === key) return { key, dataset: null, pending: false, error: `Computation failed: ${failed.message}` };
  const prev = ctx.lastDone.get(requester);
  const dataset = (prev && ctx.cache.get(prev)) || null;
  if (armed && armed.get(requester) !== key) return { key, dataset, pending: false, idle: true };
  ctx.jobs.push({ requester, key, spec, axes });
  return { key, dataset, pending: true };
}

// ---- Views (pass their input through so they can be chained) ----

function evalPlot(ctx: Ctx, node: PlotNode): NodeResult {
  const inp = input(ctx, node.id, 'in');
  if (!inp.connected) return fail([], [], { connected: false });
  if (inp.value?.type !== 'data') {
    const why = missingInput(ctx, inp.source);
    return why ? { ...fail([], [why], { connected: true }) } : fail([], [], { connected: true });
  }
  return { ...ok(inp.value, { connected: true }), pending: inp.value.pending };
}

export type CompareSource = { id: string; name: string; dataset: Dataset | null; pending: boolean; annotations: Annotation[] };

function evalCompare(ctx: Ctx, node: CompareNode): NodeResult {
  const sources: CompareSource[] = [];
  for (const inp of inputs(ctx, node.id, 'in'))
    if (inp.connected && inp.value?.type === 'data')
      sources.push({ id: inp.source, name: inp.value.name, dataset: inp.value.dataset, pending: inp.value.pending, annotations: inp.value.annotations });
  return ok(undefined, { sources });
}

// ---- Combine notes: the notes of the slots, in order, as sections of one document ----

export type NotesInfo = { items: (string | null)[]; count: number };
function evalNotes(ctx: Ctx, node: NotesNode): NodeResult {
  const children: NoteDoc[] = [];
  const items: (string | null)[] = [];
  for (let i = 0; i < node.data.count; i++) {
    const inp = input(ctx, node.id, `item-${i}`);
    const v = inp.connected ? inp.value : undefined;
    if (v?.type === 'note') {
      children.push(v.doc);
      items.push(v.doc.title.trim() || '(untitled)');
    } else items.push(null);
  }
  const info: NotesInfo = { items, count: children.length };
  return ok({ type: 'note', doc: { title: node.data.name, body: '', children } }, info);
}

function evalReverse(ctx: Ctx, node: ReverseNode): NodeResult {
  const errors: string[] = [];
  const s = stackInput(ctx, node.id, 'in', 'Input', errors);
  if (errors.length) return fail(errors);
  if (!s) return fail(['Connect a stack (Combine, DBR builder, a Layer…).']);
  const stack: StackValue = {
    incident: node.data.swapMedia ? s.exit : s.incident,
    exit: node.data.swapMedia ? s.incident : s.exit,
    // light from the other side = the sample turned by π about y: a grating's profile flips in x, an anisotropic layer's
    // tensor and director profile turn (flipZ)
    layers: [...s.layers].reverse().map((L) => ({ ...(L.grating ? { ...L, grating: { ...L.grating, flip: !L.grating.flip } } : L), flipZ: !L.flipZ })),
  };
  return ok({ type: 'stack', stack }, describeStack(stack));
}

function evalDraw(ctx: Ctx, node: DrawNode): NodeResult {
  const errors: string[] = [];
  const stack = stackInput(ctx, node.id, 'in', 'Input', errors);
  const waiting = errors.length > 0 && errors.every((e) => e.startsWith('The optimizer has no result'));
  if (errors.length) return waiting ? fail([], errors) : fail(errors);
  return ok(stack && { type: 'stack', stack }, { stack });
}

// ---- Analysis nodes: metrics along θ or λ for every curve of a dataset ----

type DataValue = Extract<PortValue, { type: 'data' }>;

function dataInput(ctx: Ctx, id: string, errors: string[]): DataValue | undefined {
  const inp = input(ctx, id, 'in');
  if (!inp.connected) errors.push('Connect a data output (Compute TMM, Plot or another analysis node).');
  else if (inp.value?.type !== 'data') errors.push(missingInput(ctx, inp.source) ?? 'The input has errors.');
  else return inp.value;
  return undefined;
}

// Axis to analyse along: the requested one, else θ, else λ, else the first range.
function resolveAlong(ds: Dataset, along: string): number {
  const free = (id: string) => ds.axes.findIndex((a) => a.id === id && a.values.length > 1);
  for (const id of [along, 'theta', 'lambda']) if (id && free(id) >= 0) return free(id);
  return ds.axes.findIndex((a) => a.values.length > 1);
}

export type AnalysisInfo = {
  axes: { id: string; label: string }[]; // axes the analysis can run along
  fields: FieldMeta[];
  along?: string;
  unit?: string;
  rows: string[]; // result summary
};

// Checks shared by the analysis nodes; returns the dataset, axis and field to work on.
function analysisSetup(ctx: Ctx, id: string, fieldKey: string, alongId: string, errors: string[]) {
  const value = dataInput(ctx, id, errors);
  const ds = value?.dataset;
  const info: AnalysisInfo = { axes: [], fields: [], rows: [] };
  if (!value || !ds) return { value, info };
  info.axes = ds.axes.filter((a) => a.values.length > 1).map((a) => ({ id: a.id, label: a.label }));
  info.fields = ds.meta;
  const along = resolveAlong(ds, alongId);
  if (along < 0) {
    errors.push('The data has no range (θ, λ or a sweep) to analyse along.');
    return { value, info };
  }
  const axis = ds.axes[along];
  info.along = axis.id;
  info.unit = axis.unit;
  const meta = metaOf(ds, fieldKey) ?? ds.meta[0];
  return { value, info, ds, along, axis, meta };
}

const curvesOf = (ds: Dataset, along: number) => ds.size / ds.axes[along].values.length;
const fmtAt = (v: number, unit: string) => (Number.isFinite(v) ? `${+v.toFixed(4)}${unit === '°' ? '°' : unit ? ` ${unit}` : ''}` : '—');
const hasSpan = (lo: number, hi: number) => Number.isFinite(lo) || Number.isFinite(hi);

// Metrics as a dataset over the remaining axes, for plotting against the swept parameters.
function metricsData(
  value: DataValue,
  ds: Dataset,
  along: number,
  key: string,
  name: string,
  meta: FieldMeta[],
  fields: Record<string, Float64Array>,
): DataValue {
  const axes = ds.axes.filter((_, i) => i !== along);
  return {
    type: 'data',
    dataset: { key: `${ds.key}|${key}`, axes, fields, meta, size: fields[meta[0].key].length },
    pending: value.pending,
    name,
    annotations: [],
  };
}

// Summary rows: the values of a single curve, or their range over all curves.
function summary(rows: [string, Float64Array, string][], count: number): string[] {
  return rows.map(([label, v, unit]) => {
    if (count === 1) return `${label} = ${fmtAt(v[0], unit)}`;
    const good = Array.from(v).filter(Number.isFinite);
    if (!good.length) return `${label}: —`;
    return `${label}: ${fmtAt(Math.min(...good), unit)} … ${fmtAt(Math.max(...good), unit)} (${count} curves)`;
  });
}

// Result that only passes the data through (waiting for data, or invalid settings).
const passThrough = (value: DataValue, errors: string[], info: AnalysisInfo): NodeResult => ({
  ...fail(errors, [], info),
  outs: { out: value },
  pending: value.pending,
});

function evalExtremum(ctx: Ctx, node: ExtremumNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const { value, info, ds, along, axis, meta } = analysisSetup(ctx, node.id, d.field, d.along, errors);
  if (!value) return fail(errors, [], info);
  if (!ds || !axis || !meta || along === undefined || errors.length) return passThrough(value, errors, info);

  const xs = axis.values;
  const [i0, i1] = windowOf(xs, d.lo, d.hi);
  if (i1 - i0 < 2) return passThrough(value, ['The interval contains fewer than 3 points.'], info);
  const n = curvesOf(ds, along);
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  forEachLine(ds, meta.key, along, (k, ys) => {
    const e = extremum(xs, ys, i0, i1, d.mode);
    X[k] = e.x;
    Y[k] = e.y;
  });
  const label = `${d.mode} ${meta.short}`;
  const base = { id: node.id, color: d.color, datasetKey: ds.key, along: axis.id };
  const annotations: Annotation[] = [{ ...base, kind: 'points', label, field: meta.key, x: X, y: Y }];
  if (hasSpan(d.lo, d.hi)) annotations.push({ ...base, id: `${node.id}:span`, kind: 'span', label: '', lo: d.lo, hi: d.hi });
  info.rows = summary([[`${axis.label} at ${label}`, X, axis.unit], [label, Y, meta.unit]], n);
  const metrics = metricsData(
    value,
    ds,
    along,
    `ext:${node.id}:${d.mode}:${meta.key}:${d.lo}:${d.hi}`,
    `${value.name} · ${label}`,
    [
      { key: 'x', label: `${axis.label} at ${label}`, short: `${axis.label}(${label})`, unit: axis.unit, of: axis.id },
      { key: 'y', label, short: label, unit: meta.unit },
    ],
    { x: X, y: Y },
  );
  return {
    errors: [],
    warnings: [],
    outs: { out: { ...value, annotations: [...value.annotations, ...annotations] }, metrics },
    pending: value.pending,
    info,
  };
}

function evalFwhm(ctx: Ctx, node: FwhmNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const { value, info, ds, along, axis, meta } = analysisSetup(ctx, node.id, d.field, d.along, errors);
  if (!value) return fail(errors, [], info);
  if (!ds || !axis || !meta || along === undefined || errors.length) return passThrough(value, errors, info);
  if (d.method === 'absolute' && !Number.isFinite(d.level)) errors.push('Enter the absolute level.');
  const xs = axis.values;
  const windows = (d.intervals.length ? d.intervals : [{ lo: NaN, hi: NaN }]).map((iv) => windowOf(xs, iv.lo, iv.hi));
  windows.forEach(([i0, i1], j) => {
    if (i1 - i0 < 2) errors.push(`Interval ${j + 1} contains fewer than 3 points.`);
  });
  if (errors.length) return passThrough(value, errors, info);

  const n = curvesOf(ds, along);
  const withQ = axis.id === 'lambda'; // quality factor λ/Δλ for spectra
  const fields: Record<string, Float64Array> = {};
  const fmeta: FieldMeta[] = [];
  const annotations: Annotation[] = [];
  const rows: [string, Float64Array, string][] = [];
  const base = { color: d.color, datasetKey: ds.key, along: axis.id };
  windows.forEach(([i0, i1], j) => {
    const tag = windows.length > 1 ? `${j + 1}` : '';
    const [C, W, X1, X2, L, E] = Array.from({ length: 6 }, () => new Float64Array(n));
    forEachLine(ds, meta.key, along, (k, ys) => {
      const w = halfWidth(xs, ys, i0, i1, d.kind, d.method, d.level);
      C[k] = w.center;
      W[k] = w.width;
      X1[k] = w.x1;
      X2[k] = w.x2;
      L[k] = w.level;
      E[k] = w.extreme;
    });
    fields[`w${j}`] = W;
    fields[`c${j}`] = C;
    fields[`e${j}`] = E;
    fmeta.push(
      { key: `w${j}`, label: `FWHM${tag}`, short: `FWHM${tag}`, unit: axis.unit, of: axis.id },
      { key: `c${j}`, label: `${axis.label} of ${d.kind}${tag}`, short: `${axis.label}${tag}`, unit: axis.unit, of: axis.id },
      { key: `e${j}`, label: `${meta.short} at the ${d.kind}${tag}`, short: `${meta.short}(${d.kind}${tag})`, unit: meta.unit, domain: meta.domain },
    );
    rows.push([`FWHM${tag}`, W, axis.unit], [`${d.kind}${tag} at`, C, axis.unit]);
    if (withQ) {
      const q = C.map((c, k) => c / W[k]);
      fields[`q${j}`] = q;
      fmeta.push({ key: `q${j}`, label: `Q${tag} = λ/FWHM`, short: `Q${tag}`, unit: '' });
      rows.push([`Q${tag}`, q, '']);
    }
    annotations.push(
      { ...base, id: `${node.id}:w${j}`, kind: 'width', label: `FWHM${tag}`, field: meta.key, x1: X1, x2: X2, level: L },
      { ...base, id: `${node.id}:c${j}`, kind: 'points', label: `${d.kind}${tag} (FWHM)`, field: meta.key, x: C, y: E },
    );
    const iv = d.intervals[j];
    if (iv && hasSpan(iv.lo, iv.hi)) annotations.push({ ...base, id: `${node.id}:s${j}`, kind: 'span', label: '', lo: iv.lo, hi: iv.hi });
  });
  info.rows = summary(rows, n);
  const metrics = metricsData(value, ds, along, `fwhm:${node.id}:${JSON.stringify(d)}`, `${value.name} · FWHM`, fmeta, fields);
  return {
    errors: [],
    warnings: [],
    outs: { out: { ...value, annotations: [...value.annotations, ...annotations] }, metrics },
    pending: value.pending,
    info,
  };
}

export type SensitivityInfo = AnalysisInfo & { targets: { value: string; label: string }[]; target?: string; pendingPert?: boolean };

// Materials and layers of the computed structure that can be perturbed.
function perturbTargets(spec: TmmSpec, lib: Library) {
  const name = (key: string) => lib.get(spec.instances[key]?.lib)?.name ?? key;
  const count = new Map<string, number>();
  for (const k of Object.keys(spec.instances)) count.set(name(k), (count.get(name(k)) ?? 0) + 1);
  const matLabel = (k: string) => (count.get(name(k))! > 1 ? `${name(k)} (${k})` : name(k));
  const last = spec.layers.length - 1;
  return [
    ...Object.keys(spec.instances).map((k) => ({ value: `mat:${k}`, label: `Material ${matLabel(k)} — every layer using it` })),
    ...spec.layers.map((L, i) => ({
      value: `layer:${i}`,
      label:
        i === 0 ? `Incident medium (${name(L.mat)})` : i === last ? `Exit medium (${name(L.mat)})` : `Layer ${i}: ${name(L.mat)}, ${+L.d.toFixed(2)} nm`,
    })),
  ];
}

function evalSensitivity(ctx: Ctx, node: SensitivityNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const setup = analysisSetup(ctx, node.id, d.field, d.along, errors);
  const { value, ds, along, axis, meta } = setup;
  const info: SensitivityInfo = { ...setup.info, targets: [] };
  if (!value) return fail(errors, [], info);
  if (!ds || !axis || !meta || along === undefined || errors.length) return passThrough(value, errors, info);
  const spec = ds.spec;
  if (!spec) return passThrough(value, ['Sensitivity needs the output of a Compute TMM node (directly or through Plot/analysis nodes).'], info);

  info.targets = perturbTargets(spec, ctx.lib);
  const target = info.targets.some((t) => t.value === d.target) ? d.target : `layer:${spec.layers.length - 1}`;
  info.target = target;
  if (!(Number.isFinite(d.dn) && d.dn !== 0)) errors.push('Δn must be a non-zero number.');
  const xs = axis.values;
  const [i0, i1] = windowOf(xs, d.lo, d.hi);
  if (i1 - i0 < 2) errors.push('The interval contains fewer than 3 points.');
  if (errors.length) return passThrough(value, errors, info);

  // The same computation with Re(ñ) + Δn on the chosen material or layer.
  const [kind, id] = target.split(':');
  const pert: TmmSpec =
    kind === 'mat'
      ? { ...spec, instances: { ...spec.instances, [id]: { ...spec.instances[id], dn0: (spec.instances[id].dn0 ?? 0) + d.dn } } }
      : { ...spec, layers: spec.layers.map((L, i) => (i === Number(id) ? { ...L, dn: L.dn + d.dn } : L)) };
  const req = requestDataset(ctx, `${ctx.tag ?? ''}${node.id}:pert`, pert, ds.axes);
  if (req.error) return passThrough(value, [req.error], info);
  const pds = req.dataset && sameGrid(req.dataset, ds) ? req.dataset : null;
  info.pendingPert = req.pending;
  if (!pds) return { errors: [], warnings: [], outs: { out: value }, pending: true, info };

  const n = curvesOf(ds, along);
  const [X0, X1, Y0, Y1, S, W, F] = Array.from({ length: 7 }, () => new Float64Array(n));
  const mode = d.kind === 'dip' ? 'min' : 'max';
  forEachLine(ds, meta.key, along, (k, ys) => {
    const e = extremum(xs, ys, i0, i1, mode);
    X0[k] = e.x;
    Y0[k] = e.y;
    W[k] = halfWidth(xs, ys, i0, i1, d.kind, 'local').width;
  });
  forEachLine(pds, meta.key, along, (k, ys) => {
    const e = extremum(xs, ys, i0, i1, mode);
    X1[k] = e.x;
    Y1[k] = e.y;
  });
  for (let k = 0; k < n; k++) {
    S[k] = (X1[k] - X0[k]) / d.dn;
    F[k] = Math.abs(S[k]) / W[k];
  }
  const sUnit = `${axis.unit || 'unit'}/RIU`;
  const base = { color: d.color, datasetKey: ds.key, along: axis.id };
  const annotations: Annotation[] = [
    { ...base, id: `${node.id}:curve`, kind: 'curve', label: `n + ${d.dn}`, dataset: pds },
    {
      ...base,
      id: `${node.id}:x0`,
      kind: 'points',
      label: `${d.kind} (sensitivity)`,
      field: meta.key,
      x: X0,
      y: Y0,
      text: Array.from(S, (s, k) => `S = ${Number.isFinite(s) ? +s.toPrecision(4) : '—'} ${sUnit}, FOM = ${Number.isFinite(F[k]) ? +F[k].toPrecision(3) : '—'} 1/RIU`),
    },
    { ...base, id: `${node.id}:x1`, kind: 'points', label: `${d.kind} (n + Δn)`, field: meta.key, x: X1, y: Y1 },
  ];
  if (hasSpan(d.lo, d.hi)) annotations.push({ ...base, id: `${node.id}:span`, kind: 'span', label: '', lo: d.lo, hi: d.hi });
  info.rows = summary(
    [
      ['S', S, sUnit],
      ['FOM = |S|/FWHM', F, '1/RIU'],
      [`${d.kind} at`, X0, axis.unit],
      ['FWHM', W, axis.unit],
    ],
    n,
  );
  const metrics = metricsData(
    value,
    ds,
    along,
    `sens:${node.id}:${JSON.stringify(d)}:${target}`,
    `${value.name} · sensitivity`,
    [
      { key: 'S', label: `S = Δ${axis.label}/Δn`, short: 'S', unit: sUnit },
      { key: 'FOM', label: 'FOM = |S|/FWHM', short: 'FOM', unit: '1/RIU' },
      { key: 'x0', label: `${axis.label} of ${d.kind}`, short: `${axis.label}0`, unit: axis.unit, of: axis.id },
      { key: 'x1', label: `${axis.label} of ${d.kind} (n + Δn)`, short: `${axis.label}1`, unit: axis.unit, of: axis.id },
      { key: 'w', label: 'FWHM', short: 'FWHM', unit: axis.unit, of: axis.id },
    ],
    { S, FOM: F, x0: X0, x1: X1, w: W },
  );
  return {
    errors: [],
    warnings: [],
    outs: { out: { ...value, annotations: [...value.annotations, ...annotations] }, metrics },
    pending: value.pending || req.pending,
    info,
  };
}

// ---- Fit ----

export type FitInfo = AnalysisInfo & {
  mode: FitNode['data']['mode'];
  slices: { id: string; label: string; labels: string[] }[]; // other axes: which curve is fitted
  fixedIdx: Record<string, number>;
  energy: boolean;
  xref: number;
  xUnit: string;
  yUnit: string;
  i0: number;
  i1: number;
  xs: number[];
  live: { r2: number; rmse: number }; // agreement of the current parameters
  hash: string; // identifies the fitted curve and window (stored fit statistics refer to it)
  hashAll: string; // identifies all curves (for “fit all”)
  batchValid: boolean;
  curves: number;
  k: number;
  // spectrum
  ys?: Float64Array;
  model?: Float64Array;
  parts?: Float64Array[];
  // dispersion (on the window)
  short?: number[];
  long?: number[];
  mShort?: number[];
  mLong?: number[];
  mode1?: number[];
  mode2?: number[];
  crossing?: number;
  minGap?: number; // smallest separation of the fitted branches over the x window
  omegaMeV?: number; // Ω in energy (branches on a wavelength scale)
};

const liveStats = (res: number[], ys: number[]) => {
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sst = ys.reduce((a, y) => a + (y - mean) ** 2, 0);
  const ssr = res.reduce((a, r) => a + r * r, 0);
  return { r2: 1 - ssr / sst, rmse: Math.sqrt(ssr / res.length) };
};

function evalFit(ctx: Ctx, node: FitNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const dispersion = d.mode === 'dispersion';
  const setup = analysisSetup(ctx, node.id, dispersion ? d.branch1 : d.field, d.along, errors);
  const { value, ds, along, axis, meta } = setup;
  const info: FitInfo = {
    ...setup.info,
    mode: d.mode,
    slices: [],
    fixedIdx: {},
    energy: false,
    xref: 0,
    xUnit: '',
    yUnit: '',
    i0: 0,
    i1: 0,
    xs: [],
    live: { r2: NaN, rmse: NaN },
    hash: '',
    hashAll: '',
    batchValid: false,
    curves: 0,
    k: 0,
  };
  if (!value) return fail(errors, [], info);
  if (!ds || !axis || !meta || along === undefined || errors.length) return passThrough(value, errors, info);

  // The fitted curve: the other axes are held at the chosen indices.
  const idx = ds.axes.map((a, i) => (i === along ? 0 : Math.min(a.values.length - 1, Math.max(0, d.fixed[a.id] ?? Math.floor((a.values.length - 1) / 2)))));
  info.slices = ds.axes.flatMap((a, i) => (i !== along && a.values.length > 1 ? [{ id: a.id, label: a.label, labels: a.values.map((_, j) => axisValueText(a, j)) }] : []));
  info.fixedIdx = Object.fromEntries(ds.axes.map((a, i) => [a.id, idx[i]]));
  const k = otherIndex(ds.axes, along, idx);
  const xs = axis.values;
  const [i0, i1] = windowOf(xs, d.lo, d.hi);
  if (i1 - i0 < 3) return passThrough(value, ['The fit interval contains fewer than 4 points.'], info);
  Object.assign(info, { k, i0, i1, xs, xref: (xs[i0] + xs[i1]) / 2, xUnit: axis.unit, curves: curvesOf(ds, along) });
  const win = <T,>(a: ArrayLike<T>) => Array.from(a).slice(i0, i1 + 1);
  const keyBase = `${ds.key}|${axis.id}|${d.lo}|${d.hi}`;
  const mark = { color: d.color, datasetKey: ds.key, along: axis.id };
  const annotations: Annotation[] = [];
  if (hasSpan(d.lo, d.hi)) annotations.push({ ...mark, id: `${node.id}:span`, kind: 'span', label: '', lo: d.lo, hi: d.hi });
  const point = (fields: [FieldMeta, number][]): DataValue => ({
    type: 'data',
    dataset: {
      key: `${ds.key}|fit:${node.id}:${JSON.stringify(fields.map(([m, v]) => [m.key, v]))}`,
      axes: [],
      meta: fields.map(([m]) => m),
      fields: Object.fromEntries(fields.map(([m, v]) => [m.key, Float64Array.of(v)])),
      size: 1,
    },
    pending: value.pending,
    name: `${value.name} · fit`,
    annotations: [],
  });

  if (!dispersion) {
    const ys = line(ds, meta.key, along, idx);
    const mctx = { energy: axis.id === 'lambda', xref: info.xref }; // energy physics only on a wavelength axis
    const parts = d.components.map((c) => Float64Array.from(xs, (x) => COMPONENTS[c.type].f(x, fitValues(c), mctx)));
    const model = Float64Array.from(xs, (_, i) => parts.reduce((s, p) => s + p[i], 0));
    info.live = liveStats(win(model).map((m, i) => m - ys[i0 + i]), win(ys));
    Object.assign(info, { ys, model, parts, energy: mctx.energy, yUnit: meta.unit });
    info.hash = hash(`${keyBase}|${meta.key}|${k}`);
    info.hashAll = hash(`${keyBase}|${meta.key}`);
    const defs = d.components.flatMap((c, ci) =>
      COMPONENTS[c.type].params.map((p) => ({ id: paramId(c.id, p.key), c, p, label: `${COMPONENTS[c.type].label} ${ci + 1} · ${p.label}` })),
    );
    const ids = defs.map((x) => x.id);
    info.batchValid = !!d.batch && d.batch.hash === info.hashAll && d.batch.ids.join() === ids.join() && d.batch.values.length === info.curves;
    annotations.push({ ...mark, id: node.id, kind: 'xy', label: 'fit', field: meta.key, k, x: win(xs), y: win(model) });
    const fmeta = defs.map((x) => ({
      key: x.id,
      label: x.label,
      short: x.label,
      unit: paramUnit(x.p.kind, axis.unit, meta.unit),
      of: x.p.kind === 'x' || x.p.kind === 'width' ? axis.id : undefined,
    }));
    const r2meta: FieldMeta = { key: 'r2', label: 'R² of the fit', short: 'R²', unit: '' };
    // coupled oscillators on a wavelength axis: the rates in angular frequency (κ = g/ħ, γ = FWHM/ħ) and κ_T
    const rateMeta: FieldMeta[] = [];
    const rateOf: ((vals: (id: string) => number) => number)[] = [];
    if (mctx.energy)
      d.components.forEach((c, ci) => {
        if (c.type !== 'coupled') return;
        const pv = (vals: (id: string) => number) => Object.fromEntries(COMPONENTS.coupled.params.map((q) => [q.key, vals(paramId(c.id, q.key))]));
        const tag = `Coupled oscillators ${ci + 1}`;
        const add = (key: string, label: string, short: string, f: (r: ReturnType<typeof coupledRates>) => number) => {
          rateMeta.push({ key: `${c.id}.${key}`, label: `${tag} · ${label}`, short, unit: '10¹² rad/s' });
          rateOf.push((vals) => f(coupledRates(pv(vals), mctx)) / HBAR_EVS / 1e12);
        };
        add('kappa', 'κ = g/ħ (coupling)', 'κ', (r) => r.g);
        add('gamma1', 'γ₁ (FWHM of mode 1)', 'γ₁', (r) => r.g1);
        add('gamma2', 'γ₂ (FWHM of mode 2)', 'γ₂', (r) => r.g2);
        add('kappaT', 'κ_T = (γ₁ − γ₂)/4 (splitting threshold)', 'κ_T', (r) => (r.g1 - r.g2) / 4);
      });

    let metrics: DataValue;
    if (info.batchValid) {
      // Every curve fitted: model curves on the plots and parameters vs the remaining axes.
      const b = d.batch!;
      if (info.curves <= 400)
        b.values.forEach((vals, kk) => {
          if (kk === k) return;
          const comps = d.components.map((c) => ({
            ...c,
            params: Object.fromEntries(Object.entries(c.params).map(([n, p]) => [n, { ...p, value: vals[ids.indexOf(paramId(c.id, n))] }])),
          }));
          annotations.push({ ...mark, id: `${node.id}:${kk}`, kind: 'xy', label: 'fit', field: meta.key, k: kk, x: win(xs), y: win(xs).map((x) => modelAt(comps, x, mctx)) });
        });
      const fields = Object.fromEntries(ids.map((id, j) => [id, Float64Array.from(b.values, (v) => v[j])]));
      const rates = Object.fromEntries(rateMeta.map((m, j) => [m.key, Float64Array.from(b.values, (v) => rateOf[j]((id) => v[ids.indexOf(id)]))]));
      metrics = metricsData(value, ds, along, `fitall:${node.id}:${b.hash}:${JSON.stringify(b.values)}`, `${value.name} · fit`, [...fmeta, ...rateMeta, r2meta], {
        ...fields,
        ...rates,
        r2: Float64Array.from(b.r2),
      });
    } else {
      const cur = (id: string) => defs.find((x) => x.id === id)!.c.params[defs.find((x) => x.id === id)!.p.key].value;
      metrics = point([
        ...defs.map((x, j): [FieldMeta, number] => [fmeta[j], x.c.params[x.p.key].value]),
        ...rateMeta.map((m, j): [FieldMeta, number] => [m, rateOf[j](cur)]),
        [r2meta, info.live.r2],
      ]);
    }

    return {
      errors: [],
      warnings: d.batch && !info.batchValid ? ['The stored “fit all” results no longer match the data or the model; run it again.'] : [],
      outs: { out: { ...value, annotations: [...value.annotations, ...annotations] }, metrics },
      pending: value.pending,
      info,
    };
  }

  // Coupled-oscillator dispersion: two branch positions vs the tuning axis.
  const m1 = metaOf(ds, d.branch1);
  const m2 = metaOf(ds, d.branch2);
  if (!m1 || !m2 || m1.key === m2.key) return passThrough(value, ['Choose two different fields for the two branches.'], info);
  const y1 = win(line(ds, m1.key, along, idx));
  const y2 = win(line(ds, m2.key, along, idx));
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const swapped = avg(y1) > avg(y2);
  const [short, long] = swapped ? [y2, y1] : [y1, y2];
  const mode2 = d.mode2 ?? 'linear';
  if (mode2 === 'angle' && axis.unit !== '°') return passThrough(value, ['The cavity-vs-angle model needs an angle axis (θ in degrees) as the tuning axis.'], info);
  const mctx = { energy: m1.of === 'lambda' && m2.of === 'lambda', xref: info.xref, mode2 }; // branches measured on λ
  const defs = dispersionParams(mode2);
  const p = Object.fromEntries(defs.map((q) => [q.key, d.disp[q.key]?.value ?? NaN]));
  const dx = win(xs);
  const model = dx.map((x) => branches(x, p, mctx));
  const mShort = model.map((m) => m[0]);
  const mLong = model.map((m) => m[1]);
  info.live = liveStats(
    [...mShort.map((m, i) => m - short[i]), ...mLong.map((m, i) => m - long[i])],
    [...short, ...long],
  );
  Object.assign(info, {
    short,
    long,
    mShort,
    mLong,
    mode1: dx.map(() => p.x1),
    mode2: dx.map((x) => mode2At(x, p, mctx)),
    energy: mctx.energy,
    yUnit: m1.unit,
    crossing: crossingOf(p, mctx),
  });
  // In wavelength the smallest gap is not exactly at zero detuning; report it too.
  let minGap = Infinity;
  for (let i = 0; i <= 400; i++) {
    const [s, l] = branches(dx[0] + ((dx[dx.length - 1] - dx[0]) * i) / 400, p, mctx);
    minGap = Math.min(minGap, l - s);
  }
  info.minGap = minGap;
  if (mctx.energy) info.omegaMeV = 1000 * energyWidth(p.W, p.x1);
  info.hash = hash(`${keyBase}|${m1.key}|${m2.key}|${k}`);
  annotations.push(
    { ...mark, id: `${node.id}:b1`, kind: 'xy', label: 'fit', field: m1.key, k, x: dx, y: swapped ? mLong : mShort },
    { ...mark, id: `${node.id}:b2`, kind: 'xy', label: 'fit', field: m2.key, k, x: dx, y: swapped ? mShort : mLong },
  );
  const unit = (kind: ParamKind) => (kind === 'slope' ? `${m1.unit || '1'}/${axis.unit || '1'}` : kind === 'index' ? '' : m1.unit);
  const metrics = point([
    ...defs.map((q): [FieldMeta, number] => [{ key: q.key, label: q.label, short: q.label, unit: unit(q.kind), of: q.kind === 'slope' || q.kind === 'index' ? undefined : m1.of }, p[q.key]]),
    [{ key: 'xc', label: `${axis.label} at zero detuning`, short: `${axis.label}*`, unit: axis.unit, of: axis.id }, info.crossing!],
    [{ key: 'gap', label: 'smallest branch gap', short: 'min gap', unit: m1.unit, of: m1.of }, minGap],
    // branches on a wavelength scale: the splitting (Rabi energy) in meV
    ...(mctx.energy ? [[{ key: 'omega_meV', label: 'Ω (Rabi splitting) in energy', short: 'Ω', unit: 'meV' }, 1000 * energyWidth(p.W, p.x1)] as [FieldMeta, number]] : []),
    [{ key: 'r2', label: 'R² of the fit', short: 'R²', unit: '' }, info.live.r2],
  ]);
  return {
    errors: [],
    warnings: [],
    outs: { out: { ...value, annotations: [...value.annotations, ...annotations] }, metrics },
    pending: value.pending,
    info,
  };
}

// ---- Field profile ----

export type FieldBand = { lo: number; hi: number; color: string; label: string };

export type FieldInfo = {
  sweeps: { id: string; label: string; labels: string[]; index: number }[];
  lambda: { value: number; min: number; max: number; free: boolean; auto: boolean }; // auto = placed at the R dip
  theta: { value: number; min: number; max: number; free: boolean; auto: boolean };
  pol: 'p' | 's';
  quantity: { label: string; unit: string };
  // profile
  z?: Float64Array;
  y?: Float64Array;
  // map
  mapX?: Axis;
  mapY?: Axis;
  map?: Float64Array;
  bands: FieldBand[];
  boundaries: number[];
  rows: { name: string; color: string; value: number }[]; // absorbed fraction per finite layer
  R: number;
  T: number;
  decay: number;
  point: string;
  rcwa?: { xs: number[]; index: number; x: number; period: number }; // profile cut from an RCWA field map at x
};

const QUANTITY: Record<FieldNode['data']['quantity'], { label: string; unit: string }> = {
  E2: { label: '|E|²/|E₀|²', unit: '' },
  H2: { label: '|H|²/|H₀|²', unit: '' },
  abs: { label: 'absorption density', unit: '1/nm' },
  comp: { label: '', unit: '' },
};

function pickQuantity(p: Profile, d: FieldNode['data']): Float64Array {
  if (d.quantity === 'E2') return p.E2;
  if (d.quantity === 'H2') return p.H2;
  if (d.quantity === 'abs') return p.absorption;
  const f: Complexes = p.fields[d.component];
  const out = new Float64Array(f.re.length);
  for (let i = 0; i < out.length; i++)
    out[i] =
      d.part === 're' ? f.re[i] : d.part === 'im' ? f.im[i] : d.part === 'abs' ? Math.hypot(f.re[i], f.im[i]) : (Math.atan2(f.im[i], f.re[i]) * 180) / Math.PI;
  return out;
}

// Small cache: maps and profiles are recomputed only when their inputs change.
const fieldCache = new Map<string, { info: Partial<FieldInfo>; out: Dataset; metrics: Dataset }>();

function evalField(ctx: Ctx, node: FieldNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const value = dataInput(ctx, node.id, errors);
  // waiting for a Run (RCWA field map) or a Start (optimizer) is not an error
  if (!value) return fail(errors);
  const ds = value.dataset;
  if (!ds) return { ...fail([]), pending: value.pending };
  if (value.rcwaMap) return fieldFromMap(node, value, ds, value.rcwaMap);
  const spec = ds.spec;
  if (!spec) return fail(['Field profile needs the output of a Compute TMM node (directly or through Plot/analysis nodes).']);
  if (spec.rcwa) return fail(['This result was computed by RCWA: connect the output of an RCWA field map node (the profile is a cut of the map).']);
  if (spec.back) warnings.push('Thick substrate: the profile shows the front coating on a semi-infinite substrate (the plate itself is incoherent).');

  const nS = spec.sweeps.length;
  const li = nS;
  const ti = nS + 1;
  const la = ds.axes[li];
  const ta = ds.axes[ti];
  const idx = ds.axes.map((a, i) => (i < nS ? Math.min(a.values.length - 1, Math.max(0, d.at[a.id] ?? Math.floor((a.values.length - 1) / 2))) : 0));
  // λ and θ: the value set on the node, else the resonance = the minimum of R (or the maximum of T / A) over the computed range(s).
  const pick = (a: Axis) => {
    const v = d.at[a.id];
    const [lo, hi] = [Math.min(...a.values), Math.max(...a.values)];
    const user = Number.isFinite(v) && v >= lo && v <= hi;
    return { value: user ? v : a.values[Math.floor((a.values.length - 1) / 2)], min: lo, max: hi, free: a.values.length > 1, auto: !user && a.values.length > 1 };
  };
  const lam = pick(la);
  const th = pick(ta);
  const nearestIndex = (a: Axis, v: number) => a.values.reduce((k, x, i) => (Math.abs(x - v) < Math.abs(a.values[k] - v) ? i : k), 0);
  const res = resonanceOf(ds, d.res);
  if ((lam.auto || th.auto) && res) {
    const st = strides(ds.axes);
    const base = idx.slice(0, nS).reduce((s, v, i) => s + v * st[i], 0);
    const lIdx = lam.auto ? la.values.map((_, i) => i) : [nearestIndex(la, lam.value)];
    const tIdx = th.auto ? ta.values.map((_, i) => i) : [nearestIndex(ta, th.value)];
    let best = [lIdx[0], tIdx[0]];
    let rMin = Infinity;
    for (const i of lIdx)
      for (const j of tIdx) {
        const r = res.sign * res.f[base + i * st[li] + j * st[ti]];
        if (r < rMin) [rMin, best] = [r, [i, j]];
      }
    if (lam.auto) lam.value = la.values[best[0]];
    if (th.auto) th.value = ta.values[best[1]];
  }
  idx[li] = nearestIndex(la, lam.value);
  idx[ti] = nearestIndex(ta, th.value);

  const sweepIdx = idx.slice(0, nS);
  const pol = polAt(spec, sweepIdx);
  const info: FieldInfo = {
    sweeps: ds.axes.slice(0, nS).map((a, i) => ({ id: a.id, label: a.label, labels: a.values.map((_, j) => axisValueText(a, j)), index: idx[i] })),
    lambda: lam,
    theta: th,
    pol,
    quantity: d.quantity === 'comp' ? { label: `${d.part === 'abs' ? `|${d.component}|` : d.part === 'phase' ? `arg ${d.component}` : `${d.part === 're' ? 'Re' : 'Im'} ${d.component}`}`, unit: d.part === 'phase' ? '°' : '' } : QUANTITY[d.quantity],
    bands: [],
    boundaries: [],
    rows: [],
    R: NaN,
    T: NaN,
    decay: NaN,
    point: `λ = ${+lam.value.toFixed(3)} nm, θ = ${+th.value.toFixed(3)}°, ${spec.b4 ? `φ = ${+phiAt(spec, sweepIdx).toFixed(3)}°, ${spec.b4.jones ? polText(spec.b4.jones) : pol}` : pol}${sweepIdx.length ? ` · ${sweepText(ds.axes, idx, nS)}` : ''}`,
  };
  if (!(d.zIn >= 0) || !(d.zOut >= 0)) return fail(['Offsets must be ≥ 0.'], warnings, info);

  // the layers of the solver: TMM, or Berreman 4×4 (a helix is one layer, a tilt profile its sublayers: `owner` = the
  // stack layer each comes from)
  const b4 = spec.b4;
  const solverAt = (lamV: number) => {
    if (!b4) {
      const L = layersAt(spec, sweepIdx, lamV);
      return { d: L.map((q) => q.d), owner: L.map((_, j) => j), prof: (lx: number, tx: number, zs: ArrayLike<number>, lay: ArrayLike<number>) => fieldProfile(L, lx, tx, pol, zs, lay) };
    }
    const st = rcwaLayersAt(spec, sweepIdx, lamV);
    const [phi, inc] = [phiAt(spec, sweepIdx), b4.jones ?? pol];
    return { d: st.layers.map((q) => q.d), owner: st.owner, prof: (lx: number, tx: number, zs: ArrayLike<number>, lay: ArrayLike<number>) => berremanProfile(st.layers, lx, tx, phi, inc, zs, lay) };
  };
  const sv = solverAt(lam.value);
  const ds_ = sv.d;
  const names = spec.layers.map((L, j) => {
    const s = value.stack;
    const lib = ctx.lib.get(spec.instances[L.mat]?.lib)?.name ?? '';
    if (!s) return { name: j === 0 ? `${lib} (incident)` : j === spec.layers.length - 1 ? `${lib} (exit)` : lib, color: '#999999' };
    if (j === 0) return { name: `${matName(s.incident!)} (incident)`, color: nominalMat(s.incident!).color };
    if (j === spec.layers.length - 1) return { name: `${matName(s.exit!)} (exit)`, color: nominalMat(s.exit!).color };
    const SL = s.layers[j - 1];
    const vm = SL.vary?.mat;
    const mat = vm ? (vm[varyIndex(SL, sweepIdx, ds.axes)] ?? SL.mat) : SL.mat;
    return { name: SL.label || mat.name, color: mat.color };
  });

  const cacheKey = hash(`${ds.key}|${JSON.stringify([d.view, d.quantity, d.component, d.part, d.mapAxis, d.zIn, d.zOut, lam.value, th.value, sweepIdx, names])}`);
  let cached = fieldCache.get(cacheKey);
  if (!cached) {
    const zAxis = (values: number[]): Axis => ({ id: 'z', label: 'z', unit: 'nm', values });
    const total = ds_.slice(1, -1).reduce((a, b) => a + b, 0);
    let prof: Profile;
    let part: Partial<FieldInfo> = {};
    if (d.view === 'map') {
      const mapAxis = d.mapAxis === 'theta' ? ta : la;
      if (mapAxis.values.length < 2) {
        errors.push(`The input has no ${d.mapAxis === 'theta' ? 'θ' : 'λ'} range for a map.`);
        return fail(errors, warnings, info);
      }
      const step = Math.ceil(mapAxis.values.length / 400);
      const ys = mapAxis.values.filter((_, i) => i % step === 0);
      const nz = 300;
      const zs = Float64Array.from({ length: nz }, (_, i) => -d.zIn + ((total + d.zIn + d.zOut) * i) / (nz - 1));
      const lay = layerOfZ(ds_, zs);
      const map = new Float64Array(nz * ys.length);
      ys.forEach((v, j) => {
        const lamJ = d.mapAxis === 'lambda' ? v : lam.value;
        const p = (d.mapAxis === 'lambda' ? solverAt(v) : sv).prof(lamJ, d.mapAxis === 'theta' ? v : th.value, zs, lay);
        map.set(pickQuantity(p, d), j * nz);
      });
      part = { mapX: zAxis(Array.from(zs)), mapY: { ...mapAxis, values: ys, labels: undefined }, map };
      const g = profileGrid(ds_, d.zIn, d.zOut, 1500);
      prof = sv.prof(lam.value, th.value, g.z, g.layer);
    } else {
      const g = profileGrid(ds_, d.zIn, d.zOut, 1500);
      prof = sv.prof(lam.value, th.value, g.z, g.layer);
      part = { z: prof.z, y: pickQuantity(prof, d) };
    }
    const bounds = [...new Set(prof.boundaries)];
    const bands: FieldBand[] = [{ lo: -d.zIn, hi: 0, ...names[0], label: names[0].name }];
    // one band and one absorption row per stack layer (its sublayers merged)
    let z = 0;
    const rowOf = new Map<number, { name: string; color: string; value: number }>();
    for (let j = 1; j < ds_.length - 1; j++) {
      const o = sv.owner[j];
      const last = bands[bands.length - 1];
      if (ds_[j] > 0) {
        if (bands.length > 1 && last.hi === z && sv.owner[j - 1] === o) last.hi = z + ds_[j];
        else bands.push({ lo: z, hi: z + ds_[j], color: names[o].color, label: names[o].name });
        const row = rowOf.get(o) ?? { ...names[o], value: 0 };
        row.value += prof.layerAbs[j];
        rowOf.set(o, row);
      }
      z += ds_[j];
    }
    bands.push({ lo: total, hi: total + d.zOut, color: names.at(-1)!.color, label: names.at(-1)!.name });
    const rows = [...rowOf.values()];
    Object.assign(part, { bands, boundaries: bounds, rows, R: prof.R, T: prof.T, decay: prof.decay });
    const meta: FieldMeta[] = [
      { key: 'E2', label: '|E|²/|E₀|²', short: '|E|²', unit: '' },
      { key: 'H2', label: '|H|²/|H₀|²', short: '|H|²', unit: '' },
      { key: 'abs', label: 'absorption density', short: 'abs', unit: '1/nm' },
    ];
    const out: Dataset = {
      key: `field:${cacheKey}`,
      axes: [zAxis(Array.from(prof.z))],
      fields: { E2: prof.E2, H2: prof.H2, abs: prof.absorption },
      meta,
      size: prof.z.length,
    };
    const metrics: Dataset = {
      key: `fieldabs:${cacheKey}`,
      axes: [{ id: 'layer', label: 'layer', unit: '', values: rows.map((_, i) => i), labels: rows.map((r) => r.name) }],
      fields: { A: Float64Array.from(rows, (r) => r.value) },
      meta: [{ key: 'A', label: 'absorbed fraction', short: 'A', unit: '' }],
      size: rows.length,
    };
    cached = { info: part, out, metrics };
    fieldCache.set(cacheKey, cached);
    if (fieldCache.size > 6) fieldCache.delete(fieldCache.keys().next().value!);
  }
  Object.assign(info, cached.info);
  const data = (dataset: Dataset, name: string): DataValue => ({ type: 'data', dataset, pending: value.pending, name, annotations: [] });
  return {
    errors: [],
    warnings,
    outs: { out: data(cached.out, `${value.name} · field`), metrics: data(cached.metrics, `${value.name} · absorption per layer`) },
    pending: value.pending,
    info,
  };
}

// A Jones state as text: circular (helicity ±1) named
export const polText = (j: { psi: number; delta: number }) => {
  const circ = Math.abs(j.psi - 45) < 1e-9 && Math.abs(Math.abs(j.delta) - 90) < 1e-9 ? `${j.delta > 0 ? 'σ+' : 'σ−'} circular, ` : '';
  return `${circ}ψ = ${j.psi}°, δ = ${j.delta}°`;
};

// "d[Ag] = 50 nm, …" for the chosen sweep steps.
function sweepText(axes: Axis[], idx: number[], nS: number) {
  return axes
    .slice(0, nS)
    .map((a, i) => `${a.label} = ${axisValueText(a, idx[i])}`)
    .join(', ');
}

// Row-major index into a layer's `vary` arrays for the chosen sweep steps (sweep axes are 'sweep:<node id>').
function varyIndex(SL: StackLayer, sweepIdx: number[], axes: Axis[]): number {
  let k = 0;
  for (const a of SL.vary!.axes) {
    const i = axes.findIndex((x) => x.id === `sweep:${a.sweep.id}`);
    k = k * a.sweep.values.length + (i >= 0 ? sweepIdx[i] : 0);
  }
  return k;
}

// ---- Optimization: design variables, objectives, optimizer ----

function evalVariable(node: VariableNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(Number.isFinite(d.min) && Number.isFinite(d.max) && d.min < d.max)) errors.push('Min must be smaller than max.');
  if (!Number.isFinite(d.value)) errors.push('Enter a value.');
  else if (d.value < d.min || d.value > d.max) warnings.push('The value is outside [min, max].');
  if (errors.length) return fail(errors);
  const v = d.integer ? Math.round(d.value) : d.value;
  const sweep: SweepValue = { id: node.id, name: d.name.trim() || 'variable', kind: 'number', values: [v] };
  return ok({ type: 'sweep', sweep }, { value: v }, warnings);
}

// Virtual quantity OD = −log₁₀ T, offered wherever the data has T.
const OD_META: FieldMeta = { key: 'OD', label: 'OD — optical density (−log₁₀ T)', short: 'OD', unit: '' };
const fieldsWithOD = (ds: Dataset): FieldMeta[] => (ds.fields.T && !ds.fields.OD ? [...ds.meta, OD_META] : ds.meta);
const quantityMeta = (ds: Dataset, q: string): FieldMeta | undefined => (q === 'OD' && ds.fields.T ? (metaOf(ds, 'OD') ?? OD_META) : metaOf(ds, q));
// The dataset with the OD field added (for plots of OD targets).
function withODField(ds: Dataset): Dataset {
  if (!ds.fields.T || ds.fields.OD) return ds;
  return { ...ds, key: `${ds.key}|OD`, meta: [...ds.meta, OD_META], fields: { ...ds.fields, OD: ds.fields.T.map(odOf) } };
}
const sliceOf = (d: { pol?: Slice['pol']; angle?: number }): Slice => ({ pol: d.pol ?? 'all', angle: d.angle ?? NaN });
const sliceLabel = (sl: Slice) => `${sl.pol !== 'all' ? ` ${sl.pol === 'avg' ? 'mean s,p' : sl.pol}` : ''}${Number.isFinite(sl.angle) ? ` ${sl.angle}°` : ''}`;

export type ObjectiveInfo = {
  fields: FieldMeta[];
  axes: { id: string; label: string; unit: string }[];
  value: number;
  cost: number;
  unit: string;
  slice?: SliceInfo;
};

function evalObjective(ctx: Ctx, node: ObjectiveNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const value = dataInput(ctx, node.id, errors);
  const info: ObjectiveInfo = { fields: [], axes: [], value: NaN, cost: NaN, unit: '' };
  if (!value) return fail(errors, [], info);
  const ds = value.dataset;
  if (!ds) return { ...fail([], [], info), pending: value.pending };
  info.fields = fieldsWithOD(ds);
  info.slice = sliceInfo(ds);
  info.axes = ds.axes.filter((a) => a.values.length > 1).map((a) => ({ id: a.id, label: a.label, unit: a.unit }));
  const meta = quantityMeta(ds, d.field) ?? ds.meta[0];
  info.unit = meta.unit;
  const along = d.along ? ds.axes.findIndex((a) => a.id === d.along) : -1;
  const sl = sliceOf(d);
  const vals: number[] = [];
  if (along >= 0) {
    const xs = ds.axes[along].values;
    const lines = sliceLines(ds, meta.key, along, sl);
    if (typeof lines === 'string') return fail([lines], [], info);
    for (const ys of lines)
      xs.forEach((x, i) => {
        if (inWindow(x, d.lo, d.hi)) vals.push(ys[i]);
      });
  } else {
    const all = sliceValues(ds, meta.key, sl);
    if (typeof all === 'string') return fail([all], [], info);
    vals.push(...all);
  }
  if (!vals.length) return fail(['No values of the field in the interval.'], [], info);
  info.value = statOf(vals, d.stat);
  info.cost = d.weight * metricCost(info.value, d.goal, d.target, d.scale);
  const goalText = { min: 'minimize', max: 'maximize', target: `target ${d.target}`, le: `≤ ${d.target}`, ge: `≥ ${d.target}` }[d.goal];
  const objective: ObjectiveValue = {
    id: node.id,
    name: d.name || `${goalText} ${d.stat} ${meta.short}${sliceLabel(sl)}`,
    cost: info.cost,
    value: info.value,
    parts: [],
  };
  return { ...ok({ type: 'objective', objective }, info), pending: value.pending };
}

export type ZonesInfo = {
  fields: FieldMeta[];
  axes: { id: string; label: string }[];
  along?: string;
  unit: string;
  xs: number[];
  curves: Record<string, Float64Array>; // first curve of each used quantity (in its slice), for the chart
  zoneValues: number[];
  outsideValue: number;
  cost: number;
  count: number; // curves averaged (most of any zone)
  slice?: SliceInfo; // what the data offers for the slice controls
};

function evalZones(ctx: Ctx, node: ZonesNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const value = dataInput(ctx, node.id, errors);
  const info: ZonesInfo = { fields: [], axes: [], unit: '', xs: [], curves: {}, zoneValues: [], outsideValue: NaN, cost: NaN, count: 0 };
  if (!value) return fail(errors, [], info);
  const ds = value.dataset;
  if (!ds) return { ...fail([], [], info), pending: value.pending };
  info.fields = fieldsWithOD(ds);
  info.slice = sliceInfo(ds);
  info.axes = ds.axes.filter((a) => a.values.length > 1).map((a) => ({ id: a.id, label: a.label }));
  const along = resolveAlong(ds, d.along);
  if (along < 0) return fail(['The data has no range (λ, θ or a sweep) for zones.'], [], info);
  const axis = ds.axes[along];
  info.along = axis.id;
  info.unit = axis.unit;
  info.xs = axis.values;
  const fieldKey = (f: string) => (quantityMeta(ds, f) ?? ds.meta[0]).key;
  d.zones.forEach((z, i) => {
    if (!(z.lo < z.hi)) errors.push(`Zone ${i + 1}: the start must be below the end.`);
    if (!z.field) errors.push(`Zone ${i + 1}: choose the quantity.`);
  });
  if (!d.zones.length) errors.push('Add at least one zone.');
  // only the chosen quantities are drawn (nothing before a zone has one)
  const outsideUsed = d.outside !== 'ignore' || d.reduce === 'contrast';
  if (outsideUsed && !d.outsideField) errors.push('Outside the zones: choose the quantity.');
  const def = sliceOf(d);
  const zones = d.zones.map((z) => ({ ...z, field: z.field ? fieldKey(z.field) : '' }));
  // every zone takes the curves of its slice of the data
  const lines = zones.map((z, i) => {
    if (!z.field) return [];
    const l = sliceLines(ds, z.field, along, effectiveSlice(z, def));
    if (typeof l === 'string') errors.push(`Zone ${i + 1}: ${l}`);
    return typeof l === 'string' ? [] : l;
  });
  let outLines: Float64Array[] = [];
  if (outsideUsed && d.outsideField) {
    const l = sliceLines(ds, fieldKey(d.outsideField), along, def);
    if (typeof l === 'string') errors.push(`Outside the zones: ${l}`);
    else outLines = l;
  }
  zones.forEach((z, i) => {
    if (z.field && lines[i].length && !info.curves[z.field]) info.curves[z.field] = lines[i][0];
  });
  if (outLines.length && !info.curves[fieldKey(d.outsideField)]) info.curves[fieldKey(d.outsideField)] = outLines[0];
  if (errors.length) return fail(errors, [], info);

  const r = zonesCost(axis.values, zones, lines, outLines, d.reduce, d.outside, d.outsideWeight, d.tau);
  Object.assign(info, { zoneValues: r.zoneValues, outsideValue: r.outsideValue, cost: d.weight * r.cost, count: Math.max(0, ...lines.map((l) => l.length)) });
  const targets = zonesTarget(node, value, ds, along, zones, outsideUsed ? fieldKey(d.outsideField) : '', d.outside);
  const goalText = (z: Zone) => (z.goal === 'ge' ? `≥ ${z.target}` : z.goal === 'le' ? `≤ ${z.target}` : z.goal);
  const objective: ObjectiveValue = {
    id: node.id,
    name: d.name || `zones (${zones.length})`,
    cost: d.weight * r.cost,
    value: r.cost,
    parts: [
      ...zones.map((z, i) => ({ label: `${z.field}${sliceLabel(effectiveSlice(z, def))} ${goalText(z)} ${+z.lo.toFixed(2)}–${+z.hi.toFixed(2)}`, value: r.zoneValues[i] })),
      ...(Number.isFinite(r.outsideValue) ? [{ label: 'outside the zones', value: r.outsideValue }] : []),
    ],
  };
  return { ...ok({ type: 'objective', objective }, info), outs: { out: { type: 'objective', objective }, ...targets }, pending: value.pending };
}

// The target of the zones as data: the input with the zones (bands) and the step target drawn on it ('marked'), and
// the step target alone ('target', one field per quantity; NaN where the quantity has no target). Levels: target, ≥, ≤
// = its value, maximize / minimize = the top / bottom of the quantity's range when it has one (R, T, A in [0, 1]).
function zonesTarget(node: ZonesNode, value: DataValue, ds0: Dataset, along: number, zones: Zone[], outsideField: string, outside: Outside) {
  const usesOD = zones.some((z) => z.field === 'OD') || outsideField === 'OD';
  const ds = usesOD ? withODField(ds0) : ds0;
  const axis = ds.axes[along];
  const xs = axis.values;
  const levelOf = (f: string, goal: ZoneGoal, t: number) => {
    const dom = metaOf(ds, f)?.domain;
    return goal === 'target' || goal === 'ge' || goal === 'le' ? t : goal === 'max' ? (dom ? dom[1] : NaN) : dom ? dom[0] : NaN;
  };
  const fields = [...new Set([...zones.map((z) => z.field), ...(outsideField && outside !== 'ignore' ? [outsideField] : [])])];
  const color = (g: ZoneGoal) => (g === 'max' || g === 'ge' ? '#59a14f' : g === 'min' || g === 'le' ? '#e15759' : '#4e79a7');
  const annotations: Annotation[] = zones.map((z, i) => ({ id: `${node.id}:z${i}`, kind: 'span', label: `zone ${i + 1}`, color: color(z.goal), datasetKey: ds.key, along: axis.id, lo: z.lo, hi: z.hi }));
  const targetFields: Record<string, Float64Array> = {};
  const n = Math.min(curvesOf(ds, along), 50);
  for (const f of fields) {
    const own = zones.filter((z) => z.field === f).sort((p, q) => p.lo - q.lo);
    const out = f === outsideField ? (outside === 'min' ? levelOf(f, 'min', 0) : outside === 'max' ? levelOf(f, 'max', 0) : NaN) : NaN;
    // step curve: vertical edges at the zone limits, gaps (NaN) where there is no target
    const px: number[] = [];
    const py: number[] = [];
    let at = xs[0];
    const seg = (x0: number, x1: number, y: number) => {
      px.push(x0, x1);
      py.push(y, y);
    };
    for (const z of own) {
      if (z.lo > at) seg(at, z.lo, out);
      seg(z.lo, z.hi, levelOf(f, z.goal, z.target));
      at = z.hi;
    }
    if (at < xs[xs.length - 1]) seg(at, xs[xs.length - 1], out);
    for (let k = 0; k < n; k++) annotations.push({ id: `${node.id}:t:${f}`, kind: 'xy', label: 'target', color: 'var(--text)', datasetKey: ds.key, along: axis.id, field: f, k, x: px, y: py, dash: true });
    targetFields[f] = Float64Array.from(xs, (x) => {
      const z = own.find((q) => x >= q.lo && x <= q.hi);
      return z ? levelOf(f, z.goal, z.target) : out;
    });
  }
  const name = node.data.name || 'zones';
  const target: DataValue = {
    type: 'data',
    dataset: {
      key: `${ds.key}|zones-target:${node.id}:${JSON.stringify([zones, outsideField, outside])}`,
      axes: [axis],
      meta: fields.map((f) => {
        const m = metaOf(ds, f)!;
        return { ...m, label: `${m.label} (target)`, short: `${m.short} target` };
      }),
      fields: targetFields,
      size: xs.length,
    },
    pending: value.pending,
    name: `${name} · target`,
    annotations: [],
  };
  return { marked: { ...value, dataset: ds, annotations: [...value.annotations, ...annotations] } as DataValue, target };
}

export type OptimizerInfo = {
  computes: { id: string; name: string }[]; // Compute nodes the outputs can re-run
  solution?: string; // description of the solution on the outputs
  objectives: ObjectiveValue[];
  merit: number;
  variables: { id: string; name: string; value: number; min: number; max: number; integer: boolean }[];
  ancestors: string[]; // every node the objectives depend on (the part of the graph to optimize)
  failed: string[]; // objective inputs with errors
};

function evalOptimizer(ctx: Ctx, node: OptimizerNode): NodeResult {
  if (node.data.algorithm === 'layerga') return evalLayerGa(ctx, node);
  const objectives: ObjectiveValue[] = [];
  const failed: string[] = [];
  for (const inp of inputs(ctx, node.id, 'obj')) {
    if (inp.connected && inp.value?.type === 'objective') objectives.push(inp.value.objective);
    else if (inp.connected) failed.push(inp.source);
  }
  const waiting = [...new Set(failed.map((f) => missingInput(ctx, f)))];
  // Upstream nodes, breadth first.
  const seen = new Set<string>();
  const queue = [node.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edges of ctx.inputs.get(id)?.values() ?? [])
      for (const e of edges)
        if (!seen.has(e.source)) {
          seen.add(e.source);
          queue.push(e.source);
        }
  }
  const variables = [...seen].flatMap((id) => {
    const n = ctx.nodes.get(id);
    return n?.type === 'variable' ? [{ id, name: n.data.name || id, value: n.data.value, min: n.data.min, max: n.data.max, integer: n.data.integer }] : [];
  });
  const computes = [...seen].flatMap((id) => {
    const n = ctx.nodes.get(id);
    return n?.type === 'compute' || n?.type === 'rcwa' ? [{ id, name: n.data.name || (n.type === 'rcwa' ? 'RCWA' : 'TMM') }] : [];
  });
  // Objectives only waiting for a Run (Compute RCWA) are placeholders: the optimizer's workers compute them by themselves,
  // so a run can start (their start cost is unknown here).
  const onlyWaiting = failed.length > 0 && waiting.every((w) => w);
  if (onlyWaiting)
    for (const id of failed) {
      const n = ctx.nodes.get(id);
      const name = (n?.data as { name?: string } | undefined)?.name || `${n?.type ?? 'objective'} ${id}`;
      objectives.push({ id, name, cost: NaN, value: NaN, parts: [] });
    }
  const info: OptimizerInfo = { computes, objectives, merit: objectives.reduce((s, o) => s + o.cost, 0), variables, ancestors: [...seen], failed: onlyWaiting ? [] : failed };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!objectives.length && !failed.length) errors.push('Connect one or more Objective / Zones / Formula / Curve match nodes.');
  if (onlyWaiting) warnings.push(...(waiting as string[]).map((w) => `${w} (to see the start merit; Start works anyway: the optimizer computes it)`));
  else if (failed.length) errors.push(`${failed.length} objective input(s) have errors.`);
  if (!variables.length) errors.push('No Design variable feeds the objectives.');
  if (seen.has(node.id)) return fail(['The optimizer output feeds its own objectives (cycle).'], [], info);

  // Outputs: the chosen solution (a run's best, or a point of its Pareto front; the live best during a run with
  // preview), re-simulated with the Compute node that feeds the objectives.
  const d = node.data;
  const computeId = computes.some((c) => c.id === d.outputCompute) ? d.outputCompute! : computes[0]?.id;
  const sol = solutionOf(d);
  info.solution = sol?.label;
  if (!sol || !computeId) return { ...fail(errors, warnings, info) };
  const o = designOutputs(ctx, node, computeId, sol.values);
  return { errors, warnings: [...warnings, ...o.warnings], outs: o.outs, pending: o.pending, info };
}

// ---- Measured data, targets and curve matching ----

const AXIS_OF: Record<string, Omit<Axis, 'values'>> = {
  lambda: { id: 'lambda', label: 'λ', unit: 'nm' },
  theta: { id: 'theta', label: 'θ', unit: '°' },
  x: { id: 'x', label: 'x', unit: '' },
};

export type ImportInfo = { rows: number; range: [number, number]; columns: string[] };

const importCache = new Map<string, DataValue | string>();

function evalImport(node: ImportNode): NodeResult {
  const d = node.data;
  if (!d.text.trim()) return fail(['Load a CSV / text file (x in the first column, values in the next ones).']);
  const key = hash(`${d.text}|${d.axis}|${d.unit}|${d.names}|${d.scale}`);
  let value = importCache.get(key);
  if (!value) {
    const t = parseSpectrum(d.text, d.axis === 'theta' ? 'deg' : d.unit, d.names, d.scale);
    value =
      typeof t === 'string'
        ? t
        : {
            type: 'data',
            dataset: {
              key: `import:${key}`,
              axes: [{ ...AXIS_OF[d.axis], values: t.xs }],
              meta: t.columns.map((c) => c.meta),
              fields: Object.fromEntries(t.columns.map((c) => [c.meta.key, c.values])),
              size: t.xs.length,
            },
            pending: false,
            name: 'measured',
            annotations: [],
          };
    if (importCache.size > 50) importCache.delete(importCache.keys().next().value!);
    importCache.set(key, value);
  }
  if (typeof value === 'string') return fail([value]);
  const ds = value.dataset!;
  const xs = ds.axes[0].values;
  const info: ImportInfo = { rows: xs.length, range: [xs[0], xs[xs.length - 1]], columns: ds.meta.map((m) => m.short) };
  return ok({ ...value, name: d.name || d.fileName || 'measured' }, info);
}

export type TargetInfo = {
  fields: FieldMeta[]; // data mode: fields of the input
  fits: { id: string; label: string }[]; // fit mode: fitted curves of the input
  xs: number[];
  target: number[];
  weight: number[];
  unit: string; // x unit
  terms: { label: string; text: string; points: number }[];
};

function evalTarget(ctx: Ctx, node: TargetNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const info: TargetInfo = { fields: [], fits: [], xs: [], target: [], weight: [], unit: AXIS_OF[d.axis].unit, terms: [] };
  let axis: Omit<Axis, 'values'> = AXIS_OF[d.axis];
  let xs: number[] = [];
  let ys: number[] = [];
  let ws: number[] = [];
  let yMeta: FieldMeta = { key: 'target', label: 'target', short: 'target', unit: '' };
  let pending = false;
  const grid = () => {
    const g = rangeValues(d.min, d.max, d.step);
    if (typeof g === 'string') errors.push(g);
    return typeof g === 'string' ? [] : g;
  };
  if (d.mode === 'components') {
    xs = grid();
    if (!d.components.length) errors.push('Add at least one component.');
    const mctx = { energy: d.axis === 'lambda', xref: (d.min + d.max) / 2 };
    ys = xs.map((x) => modelAt(d.components, x, mctx));
    ws = xs.map(() => 1);
  } else if (d.mode === 'bands') {
    xs = grid();
    if (!d.bands.length) errors.push('Add at least one band.');
    d.bands.forEach((b, i) => {
      if (!(b.lo < b.hi)) errors.push(`Band ${i + 1}: the start must be below the end.`);
      if (b.tol !== undefined && !(b.tol > 0)) errors.push(`Band ${i + 1}: the tolerance must be > 0.`);
    });
    // Later bands win where bands overlap; outside every band the target is undefined (not matched).
    ys = xs.map(() => NaN);
    ws = xs.map(() => 0);
    xs.forEach((x, i) =>
      d.bands.forEach((b) => {
        if (x >= b.lo && x <= b.hi) {
          ys[i] = b.value;
          ws[i] = b.weight;
        }
      }),
    );
  } else {
    const value = dataInput(ctx, node.id, errors);
    const ds = value?.dataset;
    pending = !!value?.pending;
    if (value && ds) {
      info.fields = ds.meta;
      info.fits = value.annotations.flatMap((a) => (a.kind === 'xy' ? [{ id: a.id, label: `${a.label} of ${a.field} (${a.id})` }] : []));
      const along = resolveAlong(ds, d.axis);
      if (along < 0) errors.push('The input has no range to take the target from.');
      else {
        axis = ds.axes[along];
        if (d.mode === 'data') {
          const meta = metaOf(ds, d.field) ?? ds.meta[0];
          yMeta = { ...yMeta, unit: meta.unit, domain: meta.domain, label: `target (${meta.short})` };
          xs = ds.axes[along].values;
          ys = Array.from(line(ds, meta.key, along, ds.axes.map(() => 0)));
        } else {
          const a = value.annotations.find((x) => x.kind === 'xy' && x.id === d.fitId) ?? value.annotations.find((x) => x.kind === 'xy');
          if (!a || a.kind !== 'xy') errors.push('The input has no fitted curve (connect a Fit node).');
          else {
            xs = Array.from(a.x);
            ys = Array.from(a.y);
            const m = metaOf(ds, a.field);
            yMeta = { ...yMeta, unit: m?.unit ?? '', domain: m?.domain, label: `target (fit of ${m?.short ?? a.field})` };
          }
        }
        // Optional window [min, max]
        const keep = xs.map((x) => inWindow(x, d.min, d.max));
        ys = ys.filter((_, i) => keep[i]);
        xs = xs.filter((_, i) => keep[i]);
        ws = xs.map(() => 1);
      }
    }
  }
  if (d.tol !== undefined && !(d.tol > 0)) errors.push('The tolerance must be > 0.');
  info.unit = axis.unit;
  if (errors.length) return { ...fail(errors, [], info), pending };
  if (xs.length < 2) return { ...fail(['The target has fewer than 2 points.'], [], info), pending };
  Object.assign(info, { xs, target: ys, weight: ws });

  // The specification: what the target is (quantity, slice, =/≥/≤, tolerance), band by band or as one curve.
  const def = { q: d.quantity ?? '', pol: d.pol ?? 'all', angle: d.angle ?? NaN, kind: d.kind ?? 'eq', tol: d.tol ?? 1 };
  const terms: SpecTerm[] =
    d.mode === 'bands'
      ? bandTerms(xs, d.bands, def)
      : (() => {
          const k = xs.map((_, i) => i).filter((i) => Number.isFinite(ys[i]) && ws[i] > 0);
          return [{ label: d.mode === 'components' ? 'model' : d.mode === 'fit' ? 'fit' : 'data', ...def, x: k.map((i) => xs[i]), v: k.map((i) => ys[i]), tol: k.map(() => def.tol), w: k.map((i) => ws[i]) }];
        })();
  info.terms = terms.map((t) => ({ label: t.label, text: termText(t, 'matched quantity'), points: t.x.length }));
  const goal: TargetSpec = { axis: axis.id, terms };
  const dataset: Dataset = {
    key: `target:${node.id}:${hash(JSON.stringify([axis.id, xs, ys, ws, terms.map((t) => [t.q, t.pol, t.angle, t.kind, t.tol[0]])]))}`,
    axes: [{ ...axis, values: xs }],
    meta: [yMeta, { key: 'weight', label: 'weight', short: 'w', unit: '' }],
    fields: { target: Float64Array.from(ys), weight: Float64Array.from(ws) },
    size: xs.length,
  };
  return { ...ok({ type: 'data', dataset, pending, name: d.name || 'target', annotations: [], goal }, info), pending };
}

export type MatchInfo = {
  fields: FieldMeta[];
  unit: string;
  xs: number[];
  target: number[];
  sim: number[]; // simulation at the target points (first curve of the first term)
  cost: number;
  rmse: number; // the merit MF (RMS / mean abs / max / p-norm of the errors over their tolerances)
  used: number; // points of the first curve (every term)
  count: number; // curves (of the term with the most)
  yUnit: string;
  terms: { label: string; q: string; xs: number[]; target: number[]; sim: number[] }[];
  slice?: SliceInfo;
  goal: boolean; // the target carries a specification (quantity, slice, kind, tolerance)
};

// Exponent of the merit of a Curve match: RMS 2, mean |e| 1, max ∞, or the chosen p.
export const matchExponent = (d: MatchData) => (d.metric === 'mae' ? 1 : d.metric === 'max' ? Infinity : d.metric === 'pnorm' ? Math.min(64, Math.max(1, d.p ?? 2)) : 2);

function evalMatch(ctx: Ctx, node: MatchNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const info: MatchInfo = { fields: [], unit: '', xs: [], target: [], sim: [], cost: NaN, rmse: NaN, used: 0, count: 0, yUnit: '', terms: [], goal: false };
  const sim = dataInput(ctx, node.id, errors);
  const tin = input(ctx, node.id, 'target');
  if (!tin.connected) errors.push('Connect a target (Target or Import node).');
  else if (tin.value?.type !== 'data') errors.push('The target input has errors.');
  const tv = tin.connected ? tin.value : undefined;
  if (errors.length || !sim || tv?.type !== 'data') return fail(errors, [], info);
  const tds = tv.dataset;
  const ds0 = sim.dataset;
  const pending = sim.pending || tv.pending;
  if (ds0) {
    info.fields = fieldsWithOD(ds0);
    info.slice = sliceInfo(ds0);
  }
  if (!ds0 || !tds) return { ...fail([], [], info), pending };
  // The target terms: the specification of a Target curve, else the curve itself (its 'target' field, else the same
  // quantity as the simulation, e.g. measured R, else its first field) for the simulated field.
  let terms: SpecTerm[];
  let axisId: string;
  if (tv.goal) {
    info.goal = true;
    terms = tv.goal.terms;
    axisId = tv.goal.axis;
  } else {
    const tAlong = tds.axes.findIndex((a) => a.values.length > 1);
    if (tAlong < 0) return fail(['The target has no x range.'], [], info);
    axisId = tds.axes[tAlong].id;
    const simMeta = quantityMeta(ds0, d.field) ?? ds0.meta[0];
    const tMeta = metaOf(tds, 'target') ?? metaOf(tds, simMeta.key) ?? tds.meta[0];
    const idx0 = tds.axes.map(() => 0);
    const tx = tds.axes[tAlong].values;
    const ty = line(tds, tMeta.key, tAlong, idx0);
    const tw = tds.fields.weight ? line(tds, 'weight', tAlong, idx0) : undefined;
    terms = [{ label: tv.name, q: '', pol: 'all', angle: NaN, kind: 'eq', x: Array.from(tx), v: Array.from(ty), tol: tx.map(() => 1), w: tw ? Array.from(tw) : tx.map(() => 1) }];
  }
  const along = axisId === 'x' ? resolveAlong(ds0, '') : ds0.axes.findIndex((a) => a.id === axisId && a.values.length > 1);
  if (along < 0) return fail([`The simulation has no ${AXIS_OF[axisId]?.label ?? axisId} range to compare with the target.`], [], info);
  const qOf = (t: SpecTerm) => (quantityMeta(ds0, t.q || d.field) ?? (t.q ? undefined : ds0.meta[0]))?.key;
  const usesOD = terms.some((t) => qOf(t) === 'OD');
  const ds = usesOD ? withODField(ds0) : ds0;
  const xs = ds.axes[along].values;
  const def = sliceOf(d);
  const points: MeritPoint[] = [];
  const marks: Annotation[] = [];
  let count = 0;
  terms.forEach((t, ti) => {
    const q = qOf(t);
    if (!q) return void errors.push(`${t.label}: the simulation has no ${t.q}.`);
    const cv = sliceCurves(ds, q, along, effectiveSlice(t, def));
    if (typeof cv === 'string') return void errors.push(`${t.label}: ${cv}`);
    count = Math.max(count, cv.lines.length);
    const keep = t.x.map((x, i) => inWindow(x, d.lo, d.hi) && Number.isFinite(t.v[i]) && t.w[i] > 0);
    cv.lines.forEach((ys, k) => {
      const at = t.x.map((x, i) => (keep[i] ? interp(xs, ys, x) : NaN));
      t.x.forEach((_, i) => keep[i] && points.push({ value: at[i], v: t.v[i], tol: t.tol[i], w: t.w[i], kind: t.kind }));
      if (k === 0) {
        info.terms.push({ label: t.label, q, xs: t.x, target: t.v, sim: at });
        info.used += at.filter(Number.isFinite).length;
      }
    });
    // the target drawn on every curve it applies to
    for (const kk of cv.ks.slice(0, 50))
      for (const k of kk) marks.push({ id: `${node.id}:target`, kind: 'xy', label: ti === 0 ? 'target' : '', color: 'var(--text)', datasetKey: ds.key, along: ds.axes[along].id, field: q, k, x: t.x, y: t.v, dash: true });
  });
  info.yUnit = (quantityMeta(ds, info.terms[0]?.q ?? d.field) ?? ds.meta[0]).unit;
  if (info.terms.length) Object.assign(info, { xs: info.terms[0].xs, target: info.terms[0].target, sim: info.terms[0].sim });
  info.unit = ds.axes[along].unit;
  info.count = count;
  if (errors.length) return { ...fail(errors, [], info), pending };
  const p = matchExponent(d);
  const m = pMerit(points, p);
  if (!m.used) return { ...fail(['No target points inside the simulated range and the interval.'], [], info), pending };
  const w = Number.isFinite(d.weight) ? d.weight : 1;
  // the loss of M. He et al. (2021): mean squared error + λ · the largest squared error (not a least-squares sum)
  const mseMax = d.metric === 'msemax' ? m.sum + (d.lambdaMax ?? 0.01) * pMerit(points, Infinity).mf ** 2 : NaN;
  info.rmse = d.metric === 'msemax' ? mseMax : m.mf;
  info.cost = w * (d.metric === 'msemax' ? mseMax : m.sum);
  const errName = { rms: 'rms', mae: 'mean |e|', max: 'max |e|', pnorm: `p=${p}`, msemax: `MSE + ${d.lambdaMax ?? 0.01}·max e²` }[d.metric];
  const objective: ObjectiveValue = {
    id: node.id,
    name: d.name || `match ${info.terms.map((t) => t.q).join(', ')} (${errName})`,
    cost: info.cost,
    value: info.rmse,
    parts: [{ label: `${errName} error`, value: info.rmse }],
    residuals: Number.isFinite(p) && w >= 0 && d.metric !== 'msemax' ? m.residuals.map((r) => r * Math.sqrt(w)) : undefined,
  };
  if (hasSpan(d.lo, d.hi)) marks.push({ id: `${node.id}:span`, kind: 'span', label: '', color: '#4e79a7', datasetKey: ds.key, along: ds.axes[along].id, lo: d.lo, hi: d.hi });
  return {
    ...ok({ type: 'objective', objective }, info),
    outs: { out: { type: 'objective', objective }, marked: { ...sim, dataset: ds, annotations: [...sim.annotations, ...marks] }, target: tv },
    pending,
  };
}

// ---- Custom objective: an expression of analysis results ----

export type FormulaInfo = {
  sources: { key: string; label: string; fields: FieldMeta[]; axes: { id: string; label: string; unit: string }[]; slice: SliceInfo }[];
  values: Record<string, number>; // value of each term
  value: number;
  cost: number;
};

function evalFormula(ctx: Ctx, node: FormulaNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const info: FormulaInfo = { sources: [], values: {}, value: NaN, cost: NaN };
  const ins = inputs(ctx, node.id, 'in');
  if (!ins.length) errors.push('Connect analysis outputs (e.g. the metrics of FWHM, Sensitivity or Min / Max).');
  let pending = false;
  const data = new Map<string, Dataset>();
  for (const inp of ins) {
    if (!inp.connected) continue;
    const key = `${inp.source}:${inp.handle}`;
    const v = inp.value;
    if (v?.type !== 'data') {
      errors.push(`An input (${inp.source}) has errors.`);
      continue;
    }
    pending ||= v.pending;
    if (!v.dataset) continue;
    data.set(key, v.dataset);
    info.sources.push({
      key,
      label: `${v.name}${inp.handle !== 'out' ? ` · ${inp.handle}` : ''}`,
      fields: fieldsWithOD(v.dataset),
      axes: v.dataset.axes.filter((a) => a.values.length > 1).map((a) => ({ id: a.id, label: a.label, unit: a.unit })),
      slice: sliceInfo(v.dataset),
    });
  }
  for (const t of d.terms) {
    const ds = data.get(t.source);
    if (!ds) {
      if (!pending) errors.push(`${t.name}: its source is not connected.`);
      continue;
    }
    const meta = quantityMeta(ds, t.field);
    if (!meta) {
      errors.push(`${t.name}: the source has no field “${t.field}”.`);
      continue;
    }
    const sl = sliceOf(t);
    let vals: number[] | string;
    if (t.along) {
      const ai = ds.axes.findIndex((a) => a.id === t.along && a.values.length > 1);
      if (ai < 0) {
        errors.push(`${t.name}: the source has no ${AXIS_OF[t.along]?.label ?? t.along} range.`);
        continue;
      }
      const xs = ds.axes[ai].values;
      const lines = sliceLines(ds, meta.key, ai, sl);
      vals =
        typeof lines === 'string'
          ? lines
          : t.stat === 'at'
            ? lines.map((ys) => interp(xs, ys, t.lo ?? NaN))
            : lines.flatMap((ys) => xs.flatMap((x, i) => (inWindow(x, t.lo ?? NaN, t.hi ?? NaN) ? [ys[i]] : [])));
    } else if (t.stat === 'at') vals = 'the value at a point needs an axis (“along”).';
    else vals = sl.pol !== 'all' || Number.isFinite(sl.angle) || meta.key === 'OD' ? sliceValues(ds, meta.key, sl) : Array.from(ds.fields[meta.key]);
    if (typeof vals === 'string') errors.push(`${t.name}: ${vals}`);
    else if (!vals.length) errors.push(`${t.name}: no values in the interval.`);
    else info.values[t.name] = formulaStat(vals, t.stat, t.level ?? 0, t.soft ?? 0);
  }
  const c = compile(d.expr);
  if (typeof c === 'string') errors.push(`Expression: ${c}`);
  else {
    const unknown = c.names.filter((n) => !d.terms.some((t) => t.name === n));
    if (unknown.length) errors.push(`Unknown variable(s) in the expression: ${unknown.join(', ')}.`);
  }
  if (errors.length || typeof c === 'string') return { ...fail(errors, [], info), pending };
  info.value = c.fn(info.values);
  if (!Number.isFinite(info.value)) return { ...fail(['The expression is not a finite number (check the inputs).'], [], info), pending };
  const w = Number.isFinite(d.weight) ? d.weight : 1;
  info.cost = w * (d.goal === 'min' ? info.value : -info.value);
  const short = (t: FormulaData['terms'][number]) => data.get(t.source)?.meta.find((m) => m.key === t.field)?.short ?? t.field;
  const objective: ObjectiveValue = {
    id: node.id,
    name: d.name || `${d.goal === 'min' ? 'minimize' : 'maximize'} ${d.expr}`,
    cost: info.cost,
    value: info.value,
    parts: d.terms.map((t) => ({ label: `${t.name} = ${t.stat} ${short(t)}`, value: info.values[t.name] })),
  };
  return { ...ok({ type: 'objective', objective }, info), pending };
}

// ---- Optimizer outputs: the chosen designs re-evaluated with their stored values ----

// The graph with the design variables set to `values`; its Compute jobs are tagged so they do not replace the
// results of the real nodes.
function withValues(ctx: Ctx, values: Record<string, number>, tag: string): Ctx {
  const nodes = new Map(ctx.nodes);
  for (const [vid, v] of Object.entries(values)) {
    const n = nodes.get(vid);
    if (n?.type === 'variable') nodes.set(vid, { ...n, data: { ...n.data, value: n.data.integer ? Math.round(v) : v } });
  }
  return { ...ctx, nodes, results: new Map(), visiting: new Set(), tag };
}

// The solution shown on the optimizer outputs.
export function solutionOf(d: OptimizerNode['data']): { values: Record<string, number>; label: string } | null {
  if (d.live) return { values: d.live, label: 'live best of the running optimization' };
  const run = d.runs.find((r) => r.id === d.outputRun) ?? d.runs[0];
  if (!run) return null;
  const clock = new Date(run.started).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ids = Object.keys(run.values);
  const pt = d.outputPoint !== undefined && d.outputPoint >= 0 ? run.front?.[d.outputPoint] : undefined;
  if (pt) return { values: Object.fromEntries(ids.map((id, i) => [id, pt.x[i]])), label: `Pareto point ${d.outputPoint! + 1} of the ${run.algorithm} run at ${clock}` };
  return { values: run.values, label: `best of the ${run.algorithm} run at ${clock} (merit ${+run.merit.toPrecision(5)})` };
}

function designOutputs(ctx: Ctx, node: OptimizerNode, computeId: string, values: Record<string, number>) {
  const outs: Record<string, PortValue> = {};
  const warnings: string[] = [];
  const c = withValues(ctx, values, `${node.id}#opt:`);
  const stackEdge = ctx.inputs.get(computeId)?.get('stack')?.[0];
  const stack = stackEdge ? evalNode(c, stackEdge.source).outs[stackEdge.sourceHandle ?? 'out'] : undefined;
  if (stack?.type === 'stack') outs.stack = stack;
  const sim = evalNode(c, computeId).outs.out;
  if (sim?.type !== 'data') return { outs, warnings: ['The Compute node for the outputs has errors.'], pending: false };
  outs.out = { ...sim, name: `${sim.name} · optimized` };
  return { outs, warnings, pending: sim.pending };
}

// ---- Filter designer: a stack generated by thin-film design (needle / gradual evolution / refinement) ----

// ---- Optimization Engine, algorithm 'layerga': SPR sensors by the genetic algorithm of Sebek et al., ACS Omega 8,
// 20792 (2023). The candidates are library materials ticked for each role (not Material nodes: an exception decided on
// 2026-09-27); the outputs are the best structure (stack) and its reflectance at n_s and n_s + Δn (data).

export type LayerGaLibEntry = { id: string; name: string; n: C; twoD: boolean; monolayer?: number; suggested: SprClass; transparent: boolean };
export type LayerGaInfo = {
  problem?: SprProblem;
  library: LayerGaLibEntry[]; // every library material at λ (the lists of the roles)
  ns: number; // the sensing medium at λ
  structure?: SprStructure; // the best structure found, in the problem's indices
  eval?: SprEval;
  thetas: number[]; // its reflectance at n_s and n_s + Δn
  R0: number[];
  R1: number[];
};

function evalLayerGa(ctx: Ctx, node: OptimizerNode): NodeResult {
  const d = layerGaOf(node.data);
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: LayerGaInfo = { library: [], ns: NaN, thetas: [], R0: [], R1: [] };
  if (inputs(ctx, node.id, 'obj').length) warnings.push('This algorithm has its own objective (S = Δθ/Δn of the dip): the connected objectives are not used.');
  if (!(d.lambda > 0)) errors.push('λ must be > 0.');
  if (!(d.dn > 0)) errors.push('Δn must be > 0.');
  if (!(d.thetaMin >= 0 && d.thetaMax < 90 && d.thetaMin < d.thetaMax)) errors.push('Angle range: need 0 ≤ min < max < 90°.');
  if (!(d.step > 0) || (d.thetaMax - d.thetaMin) / d.step > 20000) errors.push('Angle step: > 0, at most 20 000 points.');
  if (!(Number.isInteger(d.population) && d.population >= 4)) errors.push('Population: a whole number ≥ 4.');
  if (!(Number.isInteger(d.generations) && d.generations >= 1)) errors.push('Generations: a whole number ≥ 1.');
  if (!(d.elite >= 0 && d.elite < 1)) errors.push('Elites: a fraction in [0, 1).');
  if (!(d.mutation >= 0 && d.mutation <= 1)) errors.push('Mutations: a fraction in [0, 1].');
  if (!(Number.isInteger(d.maxLayers) && d.maxLayers >= 1)) errors.push('Max layers: a whole number ≥ 1.');
  if (d.single && !(d.minDepth >= 0 && d.minDepth < 1 && d.maxAsym > 0)) errors.push('Single-mode conditions: depth in [0, 1), left / right > 0.');
  for (const r of SPR_CLASSES) {
    const rule = d.roles[r];
    const what = SPR_CLASS_LABEL[r];
    if (!(Number.isInteger(rule.min) && Number.isInteger(rule.max) && rule.min >= 0 && rule.max >= rule.min)) errors.push(`${what}: layers need whole numbers, min ≤ max.`);
    if (!(Number.isInteger(rule.tMin) && Number.isInteger(rule.tMax) && rule.tMin >= 1 && rule.tMax >= rule.tMin)) errors.push(`${what}: thickness needs whole ${r === 'twoD' ? 'monolayers' : 'nm'}, 1 ≤ min ≤ max.`);
    if (rule.min > 0 && !rule.mats.length) errors.push(`${what}: tick at least one material (${rule.min} layer${rule.min > 1 ? 's' : ''} required).`);
  }
  if (!d.prisms.length) errors.push('Tick at least one prism.');

  // every library material at λ (for the lists), then the ticked ones
  info.library = [...ctx.lib.values()].map((m) => {
    const n = refractiveIndex(m.id, ctx.models, d.lambda);
    return { id: m.id, name: m.name, n, twoD: !!m.monolayer, monolayer: m.monolayer, suggested: sprClassOf(n, m.monolayer), transparent: Number.isFinite(n.re) && n.im <= 1e-6 };
  });
  if (errors.length) return fail(errors, warnings, info);
  const lib = new Map(info.library.map((e) => [e.id, e]));
  const absent = [...new Set([...d.prisms, d.medium, ...SPR_CLASSES.flatMap((r) => d.roles[r].mats)].filter((id) => !lib.has(id)))];
  if (absent.length) warnings.push(`Not in the library, left out: ${absent.join(', ')}.`);
  const outside = (id: string) => {
    const [lo, hi] = validRange(id, ctx.lib);
    if (d.lambda < lo || d.lambda > hi) warnings.push(`${lib.get(id)!.name}: λ outside the data range (${+lo.toFixed(0)}–${+hi.toFixed(0)} nm), extrapolated.`);
  };
  const med = lib.get(d.medium);
  if (!med) errors.push('Choose the sensing medium.');
  else {
    outside(med.id);
    if (med.n.im > 1e-6) warnings.push(`${med.name} absorbs at ${d.lambda} nm: the algorithm uses Re n only.`);
    info.ns = med.n.re;
  }
  const prisms = d.prisms.flatMap((id) => (lib.has(id) ? [lib.get(id)!] : []));
  for (const pr of prisms) {
    outside(pr.id);
    if (!pr.transparent) errors.push(`The prism ${pr.name} absorbs at ${d.lambda} nm.`);
    else if (med && !(pr.n.re > med.n.re)) errors.push(`The prism ${pr.name} (n = ${pr.n.re.toFixed(4)}) must have a higher index than the sensing medium.`);
  }
  if (d.prisms.length && !prisms.length) errors.push('None of the ticked prisms is in the library.');
  const mats: SprMaterial[] = [];
  for (const r of SPR_CLASSES) {
    const rule = d.roles[r];
    for (const id of rule.mats) {
      const e = lib.get(id);
      if (!e) continue;
      if ((r === 'twoD') !== e.twoD) {
        errors.push(`${e.name}: ${r === 'twoD' ? 'not a 2D material' : 'a 2D material — tick it among the 2D materials'}.`);
        continue;
      }
      if (!Number.isFinite(e.n.re) || !Number.isFinite(e.n.im)) {
        errors.push(`${e.name}: no optical data at ${d.lambda} nm.`);
        continue;
      }
      outside(id);
      mats.push({ key: `${r}:${id}`, id, name: e.name, n: e.n, cls: r, monolayer: e.monolayer, lo: rule.tMin, hi: rule.tMax });
    }
  }
  if (errors.length || !med) return fail(errors, warnings, info);
  const problem: SprProblem = {
    lambda: d.lambda,
    ns: med.n.re,
    dn: d.dn,
    prisms: prisms.map((e) => ({ key: e.id, id: e.id, name: e.name, n: e.n.re })),
    mats,
    counts: Object.fromEntries(SPR_CLASSES.map((r) => [r, [d.roles[r].min, d.roles[r].max]])) as SprProblem['counts'],
    holdCounts: d.holdCounts,
    maxLayers: d.maxLayers,
    thetaMin: d.thetaMin,
    thetaMax: d.thetaMax,
    step: d.step,
    objective: d.objective,
    maxTheta: d.maxTheta,
    single: { on: d.single, minDepth: d.minDepth, maxAsym: d.maxAsym, smooth: d.smooth },
    trace: d.trace,
  };
  info.problem = problem;

  // the best structure found (layers of materials no longer ticked are left out)
  const best = d.best;
  if (!best) return { errors: [], warnings: [...warnings, 'No structure yet: press Start.'], outs: {}, info };
  const pi = problem.prisms.findIndex((x) => x.id === best.prism);
  const genes = best.layers.flatMap((L) => {
    const m = mats.findIndex((x) => x.cls === L.role && x.id === L.mat);
    return m >= 0 ? [{ m, t: L.t }] : [];
  });
  if (pi < 0 || genes.length < best.layers.length) warnings.push('The best structure uses a prism or materials that are no longer ticked: they are left out.');
  const structure: SprStructure = { p: Math.max(0, pi), genes };
  info.structure = structure;
  info.eval = evaluateSensor(problem, structure);
  if (!info.eval.ok) warnings.push(`The structure: ${info.eval.why}.`);
  const s0 = sprScan(problem, structure, problem.ns);
  const s1 = sprScan(problem, structure, problem.ns + problem.dn);
  Object.assign(info, { thetas: s0.thetas, R0: s0.R, R1: s1.R });

  const mv = (id: string): MaterialValue => ({ key: `${node.id}:${id}`, id, name: lib.get(id)!.name, color: ctx.lib.get(id)!.color });
  // adjacent layers of one material are one layer
  const layers: StackLayer[] = mergedGenes(genes).map((g, i) => ({
    key: `${node.id}:${i}`,
    label: '',
    mat: mv(mats[g.m].id),
    d: geneD(problem, g),
    ...(mats[g.m].cls === 'twoD' ? { layers2D: g.t } : {}),
  }));
  const stack: StackValue = { incident: { kind: 'fixed', mat: mv(problem.prisms[structure.p].id) }, exit: { kind: 'fixed', mat: mv(med.id) }, layers };
  const nTh = s0.thetas.length;
  const R = new Float64Array(2 * nTh);
  R.set(s0.R, 0);
  R.set(s1.R, nTh);
  const dataset: Dataset = {
    key: `${node.id}:layerga:${hash(JSON.stringify([structure, problem.prisms[structure.p].n, problem.lambda, problem.ns, problem.dn, problem.thetaMin, problem.thetaMax, problem.step]))}`,
    axes: [
      { id: 'ns', label: 'n_s', unit: '', values: [problem.ns, problem.ns + problem.dn] },
      { id: 'theta', label: 'θ', unit: '°', values: s0.thetas },
    ],
    meta: [TMM_META[0]],
    fields: { R },
    size: 2 * nTh,
  };
  return { errors: [], warnings, outs: { stack: { type: 'stack', stack }, out: { type: 'data', dataset, pending: false, name: 'best structure', annotations: [], stack } }, info };
}

export type FilterInfo = {
  problem?: DesignProblem;
  names: string[]; // coating materials
  merit: number;
  lambdas: number[];
  R: number[];
  T: number[];
  pol: string;
  angle: number;
  total: { front: number; back: number };
  targetConnected: boolean;
  thick: boolean;
  mf: number; // merit function (without the thickness penalty)
  usesOD: boolean;
};

function evalFilter(ctx: Ctx, node: FilterNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: FilterInfo = { names: [], merit: NaN, mf: NaN, usesOD: false, lambdas: [], R: [], T: [], pol: '', angle: 0, total: { front: 0, back: 0 }, targetConnected: false, thick: d.thick };
  const nm = Math.min(MATERIAL_LETTERS.length, Math.max(2, d.materials));
  const letter = MATERIAL_LETTERS;
  const selOf = (handle: string, what: string, required = true) => {
    const s = materialInput(ctx, node.id, handle, what, errors, required, true);
    if (s && s.kind !== 'fixed') errors.push(`${what}: a Material sweep cannot be used here.`);
    return s?.kind === 'fixed' ? s.mat : undefined;
  };
  const mats = Array.from({ length: nm }, (_, k) => selOf(`m${k}`, `Material ${letter[k]}`));
  const incident = selOf('incident', 'Incident medium');
  const sub = selOf('sub', 'Substrate');
  const out = d.thick ? selOf('backMedium', 'Back medium', false) : undefined;
  info.names = mats.map((m, k) => m?.name ?? letter[k]);

  // wavelengths and targets
  const grid = rangeValues(d.lmin, d.lmax, d.step, 2001);
  if (typeof grid === 'string') errors.push(`Wavelength range: ${grid}`);
  const angles = parseList(d.angles);
  if (typeof angles === 'string') errors.push(`Angles: ${angles}`);
  else if (angles.some((a) => !(a >= 0 && a < 89))) errors.push('Angles must be in [0, 89)°.');
  // Targets: the connected Target curves (with their specification: quantity, polarization, angle, =/≥/≤, tolerance)
  // or measured curves (quantity targetQ), else the node's bands. A term without its own polarization / angle takes
  // the node's (every listed angle).
  const tins = inputs(ctx, node.id, 'target');
  info.targetConnected = tins.length > 0;
  let lambdas = typeof grid === 'string' ? [] : grid;
  let terms: SpecTerm[] = [];
  if (tins.length) {
    for (const tin of tins) {
      const tv = tin.connected ? tin.value : undefined;
      const tds = tv?.type === 'data' ? tv.dataset : null;
      if (tv?.type === 'data' && tv.goal) {
        if (tv.goal.axis !== 'lambda') errors.push(`${tv.name}: the target must be vs λ.`);
        else terms.push(...tv.goal.terms.map((t) => ({ ...t, label: `${tv.name} · ${t.label}` })));
        continue;
      }
      const ax = tds?.axes.findIndex((a) => a.id === 'lambda' && a.values.length > 1) ?? -1;
      if (!tds || ax < 0) {
        errors.push('A target must be a curve vs λ (Target curve or Measured data).');
        continue;
      }
      const tm = metaOf(tds, 'target') ?? metaOf(tds, d.targetQ) ?? tds.meta[0];
      const ty = line(tds, tm.key, ax, tds.axes.map(() => 0));
      const tw = tds.fields.weight ? line(tds, 'weight', ax, tds.axes.map(() => 0)) : undefined;
      const k = tds.axes[ax].values.map((_, i) => i).filter((i) => Number.isFinite(ty[i]) && (tw ? tw[i] > 0 : true));
      const xs = tds.axes[ax].values;
      terms.push({ label: tv!.type === 'data' ? tv!.name : 'target', q: '', pol: 'all', angle: NaN, kind: 'eq', x: k.map((i) => xs[i]), v: k.map((i) => ty[i]), tol: k.map(() => 1), w: k.map((i) => (tw ? tw[i] : 1)) });
    }
    terms = terms.map((t) => {
      const keep = t.x.map((x) => inWindow(x, d.lmin, d.lmax));
      const f = <T,>(a: T[]) => a.filter((_, i) => keep[i]);
      return { ...t, x: f(t.x), v: f(t.v), tol: f(t.tol), w: f(t.w) };
    });
    lambdas = [...new Set(terms.flatMap((t) => t.x))].sort((a, b) => a - b);
  } else {
    d.bands.forEach((b, i) => {
      if (!(b.lo < b.hi)) errors.push(`Band ${i + 1}: the start must be below the end.`);
      if (b.tol !== undefined && !(b.tol > 0)) errors.push(`Band ${i + 1}: the tolerance must be > 0.`);
    });
    terms = d.bands.flatMap((b, i) => {
      const x = b.weight > 0 ? lambdas.filter((l) => l >= b.lo && l <= b.hi) : [];
      return x.length ? [{ label: `band ${i + 1}`, q: b.q, pol: 'all' as const, angle: NaN, kind: b.kind ?? 'eq', x, v: x.map(() => b.value), tol: x.map(() => b.tol ?? 1), w: x.map(() => b.weight) }] : [];
    });
  }
  const QS: Quantity[] = ['R', 'T', 'A', 'OD'];
  for (const t of terms) if (!QS.includes((t.q || d.targetQ) as Quantity)) errors.push(`${t.label}: the designer handles R, T, A or OD (not ${t.q}).`);
  if (!errors.length && !terms.some((t) => t.x.length)) errors.push('No target points: add bands inside the wavelength range (or connect a target).');
  if (!(d.minD >= 0 && d.maxD > d.minD)) errors.push('Thickness limits: need 0 ≤ min < max.');
  if (!(d.lambdaRef > 0)) errors.push('λ ref must be > 0.');
  if (d.thick && !(d.dSub > 0)) errors.push('The substrate thickness must be > 0 mm.');
  if (errors.length || !incident || !sub || mats.some((m) => !m) || typeof angles === 'string') return fail(errors, warnings, info);

  const nAt2 = (m: MaterialValue, l: number) => refractiveIndex(m.id, ctx.models, l, m.porosity);
  if (lambdas.some((l) => nAt2(incident, l).im > 1e-6)) errors.push(`Incident medium must be transparent (k = 0); ${incident.name} absorbs.`);
  if (errors.length) return fail(errors, warnings, info);
  const sidesWanted: Side[] = !d.thick ? ['front'] : d.sides === 'both' ? ['front', 'back'] : [d.sides];
  if (!d.thick && d.sides !== 'front') warnings.push('Coating the back side needs a thick substrate: only the front is designed.');
  const li = new Map(lambdas.map((l, i) => [l, i]));
  const pols: PolMode[] = d.pol === 'unpolarized' ? ['avg'] : d.pol === 'both' ? ['s', 'p'] : [d.pol];
  // angles of the terms that set one are added to the node's list
  const allAngles = [...angles];
  for (const t of terms) if (Number.isFinite(t.angle) && !allAngles.some((a) => Math.abs(a - t.angle) < 1e-9)) allAngles.push(t.angle);
  if (allAngles.some((a) => !(a >= 0 && a < 89))) errors.push('Angles must be in [0, 89)°.');
  if (errors.length) return fail(errors, warnings, info);
  const samples: Sample[] = terms.flatMap((t) => {
    const ais = Number.isFinite(t.angle) ? [allAngles.findIndex((a) => Math.abs(a - t.angle) < 1e-9)] : angles.map((_, ai) => ai);
    const tp: PolMode[] = t.pol === 'all' ? pols : [t.pol];
    const q = (t.q || d.targetQ) as Quantity;
    return t.x.flatMap((l, i) => ais.flatMap((ai) => tp.map((pol) => ({ li: li.get(l)!, ai, pol, q, target: t.v[i], w: t.w[i], kind: t.kind, tol: t.tol[i] }))));
  });
  info.usesOD = samples.some((s) => s.q === 'OD');
  const problem: DesignProblem = {
    lambdas,
    angles: allAngles,
    p: d.p ?? 2,
    nRef: mats.map((m) => nAt2(m!, d.lambdaRef).re),
    mats: mats.map((m) => lambdas.map((l) => nAt2(m!, l))),
    names: info.names,
    n0: lambdas.map((l) => nAt2(incident, l)),
    nS: lambdas.map((l) => nAt2(sub, l)),
    nOut: lambdas.map((l) => nAt2(out ?? incident, l)),
    thick: d.thick ? d.dSub * 1e6 : null,
    sides: sidesWanted,
    samples,
    minD: d.minD,
    maxD: d.maxD,
    maxLayers: d.maxLayers,
    maxTotal: d.maxTotal,
  };
  info.problem = problem;
  if (d.start === 'formula') {
    const f = parseFormula(d.formula ?? '', MATERIAL_LETTERS.slice(0, nm));
    if (typeof f === 'string') warnings.push(`${f} (the start design)`);
  }

  // the current design (layers of materials that are no longer connected are dropped)
  const keep = (L: DesignLayer[]) => L.filter((x) => x.m < nm && x.d >= 0);
  const design: Design = { front: keep(d.design.front), back: d.thick ? keep(d.design.back) : [] };
  const ev = evaluateDesign(problem, design);
  info.merit = ev.merit;
  info.mf = ev.mf;
  const pm: PolMode = pols.length === 1 ? pols[0] : 'avg';
  const sp = spectrum(problem, design, 0, pm);
  Object.assign(info, { lambdas, R: sp.R, T: sp.T, pol: pm === 'avg' ? (d.pol === 'both' ? 'mean of s and p' : 'unpolarized') : pm, angle: angles[0] });
  info.total = { front: design.front.reduce((s, L) => s + L.d, 0), back: design.back.reduce((s, L) => s + L.d, 0) };

  const layer = (L: DesignLayer, i: number, side: string): StackLayer => ({ key: `${node.id}:${side}${i}`, label: '', mat: mats[L.m]!, d: L.d });
  const stack: StackValue = {
    incident: { kind: 'fixed', mat: incident },
    exit: { kind: 'fixed', mat: sub },
    layers: design.front.map((L, i) => layer(L, i, 'f')),
    ...(d.thick ? { substrate: { d: d.dSub * 1e6, back: design.back.map((L, i) => layer(L, i, 'b')), out: out ? { kind: 'fixed' as const, mat: out } : undefined } } : {}),
  };
  if (!design.front.length && !design.back.length) warnings.push('No layers yet: press Start to design the coating.');
  return ok({ type: 'stack', stack }, info, warnings);
}

// ---- Tolerance analysis (Monte Carlo) ----

export type ToleranceLayer = { index: number; name: string; side: 'front' | 'back'; d: number; grating?: boolean };
export type ToleranceInfo = AnalysisInfo & {
  layers: ToleranceLayer[]; // finite layers of the structure (for per-layer σ)
  samples: number;
  pendingMC?: boolean;
  along?: string;
  xs: number[];
  nominal: number[]; // chart curve (first curve of the other axes)
  mean: number[];
  lo: number[];
  hi: number[];
  dev: number[]; // RMS deviation of each sample from the nominal
  yieldPct: number; // NaN without a specification
  pass: number[];
  ranking: { label: string; share: number }[]; // fraction of the variance explained (linear) by each error
  stats: { label: string; value: string }[];
  where?: string; // what the deviation, the range and the ranking are computed over
  specWhere?: string; // what the pass / fail limits test
  criteria?: ToleranceCriterionInfo[];
};
// An analysis node on the `criteria` port: its metrics, and for each condition on it the statistics over the samples.
export type ToleranceCriterionInfo = {
  source: string;
  name: string;
  options: { key: string; label: string; unit: string }[];
  error?: string;
  rows: { index: number; label: string; unit: string; nominal: string; values: number[]; mean: number; std: number; plo: number; phi: number; passPct: number; perSample: number }[];
  pending?: boolean; // Sensitivity: its n + Δn computation of the samples is running
};

// Evaluates an analysis node with its data input replaced by `value` (the Monte Carlo samples): the node's metrics are
// computed on every sample, with its own settings. The graph itself is not touched.
function evalOnData(ctx: Ctx, node: AppNode, value: DataValue, tag: string): NodeResult {
  const SRC = '__samples__';
  const own = new Map(ctx.inputs.get(node.id) ?? []);
  own.set('in', [{ id: `${SRC}-${node.id}`, source: SRC, sourceHandle: 'out', target: node.id, targetHandle: 'in' } as Edge]);
  const inputsMap = new Map(ctx.inputs);
  inputsMap.set(node.id, own);
  // its own requester tag: a Sensitivity node computes its n + Δn on the samples apart from its own result
  const sub: Ctx = { ...ctx, inputs: inputsMap, results: new Map([[SRC, { errors: [], warnings: [], outs: { out: value } }]]), visiting: new Set(), tag };
  return evalNode(sub, node.id);
}

// Seeded errors: normal (truncated at ±clip σ) or uniform with the same σ.
function errorSource(seed: number, dist: 'normal' | 'uniform', clip: number) {
  const rand = rng(seed);
  const k = Math.max(0.1, clip);
  return (sigma: number) => {
    if (!(sigma > 0)) return 0;
    if (dist === 'uniform') {
      const a = Math.min(Math.sqrt(3), k);
      return (2 * rand() - 1) * a * sigma;
    }
    for (;;) {
      const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
      if (Math.abs(z) <= k) return z * sigma;
    }
  };
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
};

function evalTolerance(ctx: Ctx, node: ToleranceNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const value = dataInput(ctx, node.id, errors);
  const info: ToleranceInfo = { axes: [], fields: [], rows: [], layers: [], samples: 0, xs: [], nominal: [], mean: [], lo: [], hi: [], dev: [], yieldPct: NaN, pass: [], ranking: [], stats: [] };
  if (!value) return fail(errors, [], info);
  const ds = value.dataset;
  if (!ds) return { ...fail([], [], info), pending: value.pending };
  const spec = ds.spec;
  if (!spec) return fail(['Tolerance analysis needs the output of a Compute TMM node (directly or through Plot / analysis nodes).'], [], info);
  const N = Math.round(d.samples);
  if (!(N >= 2 && N <= 5000)) errors.push('Samples: 2 – 5000.');
  if (!(d.pLo >= 0 && d.pHi <= 100 && d.pLo < d.pHi)) errors.push('Percentiles: 0 ≤ low < high ≤ 100.');
  const gOn = !!d.grating && !!spec.rcwa;
  // the azimuth φ of an RCWA computation (a plane of incidence turned from the grating vector: conical incidence)
  const phOn = !!d.azimuth && !!spec.rcwa && (d.phiSigma ?? 0) > 0;
  if (!d.thickness && !d.index && !d.angle && !gOn && !phOn) errors.push('Choose at least one kind of error (thickness, index, angle, azimuth or grating).');
  const inner = spec.lambda.length * spec.theta.length;
  const outer = spec.sweeps.reduce((p, n) => p * n, 1);
  if (outer * inner * N > MAX_POINTS) errors.push(`Too many points (${(outer * inner * N).toLocaleString('en')} > ${MAX_POINTS.toLocaleString('en')}): fewer samples or a coarser grid.`);

  // finite layers: front (spec.layers[1 … n−2]) and back coating
  const nameOf = (L: LayerSpec) => ctx.lib.get(spec.instances[L.mat]?.lib)?.name ?? L.mat;
  const refs: { L: LayerSpec; side: 'front' | 'back'; i: number }[] = [
    ...spec.layers.slice(1, -1).map((L, i) => ({ L, side: 'front' as const, i })),
    ...(spec.back?.layers.slice(1, -1).map((L, i) => ({ L, side: 'back' as const, i })) ?? []),
  ];
  info.layers = refs.map((r, k) => ({ index: k, name: r.L.grating ? `grating (${r.L.grating.mats.map((m) => ctx.lib.get(spec.instances[m]?.lib)?.name ?? m).join('/')})` : nameOf(r.L), side: r.side, d: r.L.d, grating: !!r.L.grating }));
  if (!refs.length && !d.angle) errors.push('The structure has no layers to perturb.');
  if (errors.length) return passThrough(value, errors, info);

  // ---- the errors of every sample ----
  const draw = errorSource(d.seed, d.dist, d.clip);
  const mats = [...new Set(refs.map((r) => r.L.mat))];
  const sigmaD = (k: number) => d.dOverride[String(k)] ?? d.dSigma;
  const E = Array.from({ length: N }, () => ({
    d: refs.map((_, k) => (d.thickness ? draw(sigmaD(k)) : 0)),
    n: refs.map(() => (d.index ? draw(d.nSigma) : 0)),
    sd: mats.map(() => (d.thickness ? draw(d.dSys) : 0)),
    sn: mats.map(() => (d.index ? draw(d.nSys) : 0)),
    a: d.angle ? draw(d.aSigma) : 0,
    gf: refs.map((r) => (gOn && r.L.grating ? draw(d.fillSigma ?? 0) : 0)),
    gp: gOn ? draw(d.periodSigma ?? 0) : 0,
    ph: phOn ? draw(d.phiSigma!) : 0,
  }));
  const sIdx = spec.sweeps.length;
  const thick = (base: number, k: number, s: number) => {
    if (!(base > 0)) return base; // empty slots stay empty
    const m = mats.indexOf(refs[k].L.mat);
    const e = E[s].d[k] + E[s].sd[m];
    return Math.max(0, d.dMode === 'rel' ? base * (1 + e / 100) : base + e);
  };
  const perturb = (L: LayerSpec, k: number): LayerSpec => {
    const out: LayerSpec = { ...L, bind: { ...L.bind } };
    if (d.thickness) {
      const b = L.bind.d;
      out.bind.d = b ? { s: [...b.s, sIdx], v: b.v.flatMap((v) => E.map((_, s) => thick(v, k, s))) } : { s: [sIdx], v: E.map((_, s) => thick(L.d, k, s)) };
    }
    if (d.index && d.nSigma > 0) out.bind.dn = { s: [sIdx], v: E.map((e) => e.n[k]) };
    if (gOn && L.grating) {
      // grating geometry: fill factor(s) per layer, period shared by the layers of a sample
      const per = (b: Bound<number> | undefined, base: number, f: (v: number, s: number) => number): Bound<number> =>
        b ? { s: [...b.s, sIdx], v: b.v.flatMap((v) => E.map((_, s) => f(v, s))) } : { s: [sIdx], v: E.map((_, s) => f(base, s)) };
      const clip01 = (v: number) => Math.min(1, Math.max(0, v));
      if ((d.fillSigma ?? 0) > 0) {
        out.bind.fill = per(L.bind.fill, L.grating.fill, (v, s) => clip01(v + E[s].gf[k]));
        if (L.grating.profile === 'trapezoid') out.bind.fillTop = per(L.bind.fillTop, L.grating.fillTop, (v, s) => clip01(v + E[s].gf[k]));
      }
      if ((d.periodSigma ?? 0) > 0) out.bind.period = per(L.bind.period, L.grating.period, (v, s) => Math.max(1, v + E[s].gp));
    }
    return out;
  };
  const front = spec.layers.slice(1, -1).map((L, i) => perturb(L, i));
  const nf = front.length;
  const instances = { ...spec.instances };
  if (d.index && d.nSys > 0) for (const [m, key] of mats.entries()) instances[key] = { ...instances[key], dnS: { s: [sIdx], v: E.map((e) => e.sn[m]) } };
  const mc: TmmSpec = {
    ...spec,
    instances,
    layers: [spec.layers[0], ...front, spec.layers[spec.layers.length - 1]],
    sweeps: [...spec.sweeps, N],
    ...(spec.back ? { back: { ...spec.back, layers: [spec.back.layers[0], ...spec.back.layers.slice(1, -1).map((L, i) => perturb(L, nf + i)), spec.back.layers[spec.back.layers.length - 1]] } } : {}),
    ...(d.angle && d.aSigma > 0 ? { thetaOffset: { s: [sIdx], v: E.map((e) => e.a) } } : {}),
    // azimuth errors: every sample has its own φ (conical incidence even around φ = 0)
    ...(phOn
      ? {
          rcwa: { ...spec.rcwa!, conical: true, phi: spec.rcwa!.phi ?? 0 },
          phiBind: spec.phiBind ? { s: [...spec.phiBind.s, sIdx], v: spec.phiBind.v.flatMap((v) => E.map((e) => v + e.ph)) } : { s: [sIdx], v: E.map((e) => (spec.rcwa!.phi ?? 0) + e.ph) },
        }
      : {}),
  };
  const sampleAxis: Axis = { id: 'sample', label: 'sample', unit: '', values: E.map((_, s) => s + 1) };
  const mcAxes = [...ds.axes.slice(0, sIdx), sampleAxis, ...ds.axes.slice(sIdx)];
  const req = requestDataset(ctx, `${ctx.tag ?? ''}${node.id}:mc`, mc, mcAxes);
  if (req.error) return passThrough(value, [req.error], info);
  const mds = req.dataset && sameGrid(req.dataset, { ...ds, axes: mcAxes, size: ds.size * N }) ? req.dataset : null;
  info.pendingMC = req.pending;
  info.samples = N;
  if (!mds) return { errors: [], warnings: [], outs: {}, pending: true, info };

  // ---- statistics over the samples at every point ----
  const fieldsIn = ['R', 'T', 'A'];
  const statFields: Record<string, Float64Array> = {};
  const statMeta: FieldMeta[] = [];
  const val = (f: string, sp: number, s: number, r: number) => mds.fields[f][sp * N * inner + s * inner + r];
  const [qlo, qhi] = [d.pLo / 100, d.pHi / 100];
  for (const f of fieldsIn) {
    const base = TMM_META.find((m) => m.key === f)!;
    const arrs = Object.fromEntries(['mean', 'median', 'std', 'min', 'max', 'plo', 'phi'].map((k) => [k, new Float64Array(ds.size)]));
    const buf = new Array<number>(N);
    for (let sp = 0; sp < outer; sp++)
      for (let r = 0; r < inner; r++) {
        let sum = 0;
        for (let s = 0; s < N; s++) sum += buf[s] = val(f, sp, s, r);
        const mean = sum / N;
        let ss = 0;
        for (let s = 0; s < N; s++) ss += (buf[s] - mean) ** 2;
        buf.sort((a, b) => a - b);
        const p = sp * inner + r;
        arrs.mean[p] = mean;
        arrs.std[p] = Math.sqrt(ss / (N - 1));
        arrs.median[p] = quantile(buf, 0.5);
        arrs.min[p] = buf[0];
        arrs.max[p] = buf[N - 1];
        arrs.plo[p] = quantile(buf, qlo);
        arrs.phi[p] = quantile(buf, qhi);
      }
    statFields[f] = ds.fields[f];
    statMeta.push({ ...base, label: `${base.short} nominal` });
    const lab: Record<string, string> = { mean: 'mean', median: 'median', std: 'standard deviation', min: 'minimum', max: 'maximum', plo: `p${d.pLo}`, phi: `p${d.pHi}` };
    for (const [k, a] of Object.entries(arrs)) {
      statFields[`${f}_${k}`] = a;
      statMeta.push({ key: `${f}_${k}`, label: `${base.short} ${lab[k]}`, short: `${base.short} ${lab[k]}`, unit: '', domain: k === 'std' ? undefined : base.domain });
    }
  }
  const stats: Dataset = { key: `mc:${node.id}:${mds.key}:${d.pLo}:${d.pHi}`, axes: ds.axes, fields: statFields, meta: statMeta, size: ds.size };

  // ---- deviation, specification, ranking (on the chosen field) ----
  const F = d.field;
  const along = resolveAlong(ds, '');
  const axis = along >= 0 ? ds.axes[along] : null;
  const dev = E.map((_, s) => {
    let ss = 0;
    for (let sp = 0; sp < outer; sp++) for (let r = 0; r < inner; r++) ss += (val(F, sp, s, r) - ds.fields[F][sp * inner + r]) ** 2;
    return Math.sqrt(ss / (outer * inner));
  });
  // pass / fail: every curve of the sample within the limits (bands along the analysed axis, or ± around a target)
  const tin = input(ctx, node.id, 'target');
  let pass: number[] = [];
  const specWarn: string[] = [];
  if (d.spec && axis) {
    const xs = axis.values;
    const tds = tin.connected && tin.value?.type === 'data' ? tin.value.dataset : null;
    const tAx = tds ? tds.axes.findIndex((a) => a.id === axis.id && a.values.length > 1) : -1;
    if (tin.connected && tAx < 0) specWarn.push(`The target must be a curve vs ${axis.label}.`);
    const tMeta = tds ? (metaOf(tds, 'target') ?? metaOf(tds, F) ?? tds.meta[0]) : null;
    const ty = tds && tAx >= 0 ? line(tds, tMeta!.key, tAx, tds.axes.map(() => 0)) : null;
    pass = E.map((_, s) => {
      let ok2 = true;
      const perCurve = (ys: Float64Array) => {
        if (ty && tds) {
          const tx = tds.axes[tAx].values;
          tx.forEach((x, i) => {
            const y = interp(xs, ys, x);
            if (Number.isFinite(y) && Number.isFinite(ty[i]) && Math.abs(y - ty[i]) > d.specTol) ok2 = false;
          });
        } else
          for (const b of d.specBands) {
            const yb = b.q === F ? ys : null;
            if (!yb) continue;
            xs.forEach((x, i) => {
              if (x >= b.lo && x <= b.hi && (yb[i] < b.min || yb[i] > b.max)) ok2 = false;
            });
          }
      };
      // curves of this sample along the analysed axis
      const idxAxes = ds.axes.map((a) => a.values.length);
      const count = ds.size / xs.length;
      for (let c = 0; c < count; c++) {
        // decompose c over the other axes of ds
        const idx = new Array<number>(ds.axes.length).fill(0);
        for (let i = ds.axes.length - 1, rem = c; i >= 0; i--) {
          if (i === along) continue;
          idx[i] = rem % idxAxes[i];
          rem = Math.floor(rem / idxAxes[i]);
        }
        const mIdx = [...idx.slice(0, sIdx), s, ...idx.slice(sIdx)];
        perCurve(line(mds, F, along >= sIdx ? along + 1 : along, mIdx));
      }
      return ok2 ? 1 : 0;
    });
    if (!ty && !d.specBands.some((b) => b.q === F)) specWarn.push(`No limits on ${F}: add bands for ${F} (or show ${d.specBands[0]?.q ?? 'another field'}).`);
  }
  // ---- criteria: the metrics of analysis nodes (Min / max, FWHM, Sensitivity) recomputed on every sample ----
  info.criteria = [];
  let critPending = false;
  const critPass = E.map(() => 1);
  let constrained = false;
  const samplesValue: DataValue = { type: 'data', dataset: mds, pending: false, name: `${value.name} · MC samples`, annotations: [] };
  const conds = d.criteria ?? [];
  for (const ci of inputs(ctx, node.id, 'criteria')) {
    if (!ci.connected) continue;
    const src = ctx.nodes.get(ci.source)!;
    const kindName = src.type === 'fwhm' ? 'FWHM' : src.type === 'extremum' ? 'Min / max' : src.type === 'sensitivity' ? 'Sensitivity' : src.type;
    const entry: ToleranceCriterionInfo = { source: src.id, name: (src.data as { caption?: string }).caption || kindName, options: [], rows: [] };
    info.criteria.push(entry);
    if (src.type !== 'extremum' && src.type !== 'fwhm' && src.type !== 'sensitivity') {
      entry.error = 'Only Min / max, FWHM and Sensitivity nodes can be criteria: their metrics are recomputed on every sample.';
      continue;
    }
    if (ci.handle !== 'metrics') {
      entry.error = 'Connect the metrics output of the analysis node (the lower port).';
      continue;
    }
    const nomDs = ci.value?.type === 'data' ? ci.value.dataset : null;
    // Sensitivity: the same structures with n + Δn, computed for every sample (as many points as the samples themselves)
    const r = evalOnData(ctx, src, samplesValue, `${ctx.tag ?? ''}${node.id}#crit:`);
    const M = r.outs.metrics?.type === 'data' ? r.outs.metrics.dataset : null;
    const sAx = M ? M.axes.findIndex((a) => a.id === 'sample') : -1;
    if (!M && r.pending && !r.errors.length) {
      entry.pending = true;
      critPending = true;
      continue;
    }
    if (!M || sAx < 0) {
      entry.error = r.errors[0] ?? 'The analysis node gives no metrics on the samples (check its settings and that it analyses the same Compute).';
      continue;
    }
    entry.options = M.meta.map((m) => ({ key: m.key, label: m.label, unit: m.unit }));
    // the values of every sample (all the curves of the sample: sweeps, the other axis)
    const st = strides(M.axes);
    const perSample = M.size / N;
    const bySample = E.map(() => [] as number[]);
    conds.forEach((c, index) => {
      if (c.source !== src.id) return;
      const meta = M.meta.find((m) => m.key === c.field) ?? M.meta[0];
      const f = M.fields[meta.key];
      bySample.forEach((b) => (b.length = 0));
      for (let p = 0; p < M.size; p++) bySample[Math.floor(p / st[sAx]) % N].push(f[p]);
      const hasMin = Number.isFinite(c.min);
      const hasMax = Number.isFinite(c.max);
      let ok = 0;
      bySample.forEach((vals, s) => {
        const good = vals.every((v) => Number.isFinite(v) && (!hasMin || v >= c.min) && (!hasMax || v <= c.max));
        if (good) ok++;
        if ((hasMin || hasMax) && !good) critPass[s] = 0;
      });
      if (hasMin || hasMax) constrained = true;
      // one value per sample for the statistics: the value itself, or the mean over the sample's curves
      const values = bySample.map((vals) => (vals.length === 1 ? vals[0] : vals.reduce((a, b) => a + b, 0) / vals.length));
      const fin = values.filter(Number.isFinite).sort((a, b) => a - b);
      const mean = fin.reduce((a, b) => a + b, 0) / Math.max(1, fin.length);
      const std = Math.sqrt(fin.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, fin.length - 1));
      const nomVals = nomDs?.fields[meta.key] ? Array.from(nomDs.fields[meta.key]).filter((v) => Number.isFinite(v)) : [];
      const fmtV = (v: number) => (Number.isFinite(v) ? `${+v.toPrecision(5)}${meta.unit ? ` ${meta.unit}` : ''}` : '—');
      const nominal = !nomVals.length ? '—' : nomVals.length === 1 ? fmtV(nomVals[0]) : `${fmtV(Math.min(...nomVals))} … ${fmtV(Math.max(...nomVals))}`;
      entry.rows.push({
        index,
        label: meta.label,
        unit: meta.unit,
        nominal,
        values,
        mean,
        std,
        plo: fin.length ? quantile(fin, qlo) : NaN,
        phi: fin.length ? quantile(fin, qhi) : NaN,
        passPct: (100 * ok) / N,
        perSample,
      });
    });
  }
  if (constrained) pass = pass.length ? pass.map((p, s) => (p && critPass[s] ? 1 : 0)) : critPass.slice();

  // what is measured where (shown on the node)
  const axText = (a: Axis) => {
    const lo = Math.min(...a.values);
    const hi = Math.max(...a.values);
    const u = a.unit ? (a.unit === '°' ? '°' : ` ${a.unit}`) : '';
    if (a.values.length === 1) return `${a.label} = ${a.labels?.[0] ?? +lo.toPrecision(6)}${a.labels ? '' : u}`;
    return a.labels ? `${a.label}: ${a.values.length} steps` : `${a.label} ${+lo.toPrecision(6)}–${+hi.toPrecision(6)}${u} (${a.values.length} points)`;
  };
  info.where = `Deviation, shaded range and critical errors: ${F} of every sample against the nominal, at every point of the computed grid — ${ds.axes.map(axText).join(' × ')}; the deviation of a sample is the RMS over all ${(outer * inner).toLocaleString('en')} points.`;
  const tests: string[] = [];
  if (d.spec && axis) tests.push(tin.connected ? `${F} within ±${d.specTol} of the target curve at every point of it` : `${F} inside the limits of each band (along ${axis.label}, on every curve)`);
  for (const c of info.criteria) for (const row of c.rows) {
    const cond = conds[row.index];
    if (Number.isFinite(cond.min) || Number.isFinite(cond.max)) tests.push(`${Number.isFinite(cond.min) ? `${cond.min} ≤ ` : ''}${row.label} (${c.name})${Number.isFinite(cond.max) ? ` ≤ ${cond.max}` : ''}${row.perSample > 1 ? ` on all ${row.perSample} curves of the sample` : ''}`);
  }
  info.specWhere = tests.length ? `A sample passes when: ${tests.join('; and ')}.` : '';

  // linear share of the variance explained by each error variable
  const vars: { label: string; e: number[] }[] = [];
  refs.forEach((r, k) => {
    const nm = `${r.side === 'back' ? 'back ' : ''}${k - (r.side === 'back' ? nf : 0) + 1} ${nameOf(r.L)}`;
    if (d.thickness && sigmaD(k) > 0) vars.push({ label: `d ${nm}`, e: E.map((x) => x.d[k]) });
    if (d.index && d.nSigma > 0) vars.push({ label: `n ${nm}`, e: E.map((x) => x.n[k]) });
  });
  mats.forEach((key, m) => {
    const nm = ctx.lib.get(spec.instances[key]?.lib)?.name ?? key;
    if (d.thickness && d.dSys > 0) vars.push({ label: `d ${nm} (systematic)`, e: E.map((x) => x.sd[m]) });
    if (d.index && d.nSys > 0) vars.push({ label: `n ${nm} (systematic)`, e: E.map((x) => x.sn[m]) });
  });
  if (d.angle && d.aSigma > 0) vars.push({ label: 'angle', e: E.map((x) => x.a) });
  if (phOn) vars.push({ label: 'azimuth φ', e: E.map((x) => x.ph) });
  if (gOn) {
    refs.forEach((r, k) => {
      if (r.L.grating && (d.fillSigma ?? 0) > 0) vars.push({ label: `fill ${k + 1} (grating)`, e: E.map((x) => x.gf[k]) });
    });
    if ((d.periodSigma ?? 0) > 0) vars.push({ label: 'period', e: E.map((x) => x.gp) });
  }
  let totVar = 0;
  const cov = vars.map(() => 0);
  const vv = vars.map((v) => {
    const m = v.e.reduce((a, b) => a + b, 0) / N;
    return { m, var: v.e.reduce((a, b) => a + (b - m) ** 2, 0) / N };
  });
  for (let sp = 0; sp < outer; sp++)
    for (let r = 0; r < inner; r++) {
      let mx = 0;
      for (let s = 0; s < N; s++) mx += val(F, sp, s, r);
      mx /= N;
      let vx = 0;
      const c = vars.map(() => 0);
      for (let s = 0; s < N; s++) {
        const x = val(F, sp, s, r) - mx;
        vx += x * x;
        vars.forEach((v, j) => (c[j] += x * (v.e[s] - vv[j].m)));
      }
      totVar += vx / N;
      c.forEach((cj, j) => (cov[j] += vv[j].var > 0 ? (cj / N) ** 2 / vv[j].var : 0));
    }
  info.ranking = vars.map((v, j) => ({ label: v.label, share: totVar > 0 ? cov[j] / totVar : 0 })).sort((a, b) => b.share - a.share);

  // ---- outputs ----
  const errFields: Record<string, Float64Array> = {};
  const errMeta: FieldMeta[] = [];
  const add = (key: string, label: string, unit: string, v: number[]) => {
    errFields[key] = Float64Array.from(v);
    errMeta.push({ key, label, short: label, unit });
  };
  add('dev', `RMS deviation of ${F}`, '', dev);
  if (pass.length) add('pass', 'passes the specification (1 / 0)', '', pass);
  refs.forEach((r, k) => {
    const nm = `${r.side === 'back' ? 'back ' : ''}${k - (r.side === 'back' ? nf : 0) + 1} ${nameOf(r.L)}`;
    if (d.thickness) add(`d${k}`, `d ${nm}`, 'nm', E.map((_, s) => thick(r.L.d, k, s)));
    if (d.index && d.nSigma > 0) add(`n${k}`, `Δn ${nm}`, '', E.map((e) => e.n[k]));
  });
  mats.forEach((key, m) => {
    const nm = ctx.lib.get(spec.instances[key]?.lib)?.name ?? key;
    if (d.thickness && d.dSys > 0) add(`sd${m}`, `d error ${nm} (systematic, ${d.dMode === 'rel' ? '%' : 'nm'})`, d.dMode === 'rel' ? '%' : 'nm', E.map((e) => e.sd[m]));
    if (d.index && d.nSys > 0) add(`sn${m}`, `Δn ${nm} (systematic)`, '', E.map((e) => e.sn[m]));
  });
  if (d.angle && d.aSigma > 0) add('dtheta', 'angle error', '°', E.map((e) => e.a));
  if (phOn) add('dphi', 'azimuth error', '°', E.map((e) => e.ph));
  if (gOn) {
    refs.forEach((r, k) => {
      if (r.L.grating && (d.fillSigma ?? 0) > 0) add(`gf${k}`, `fill factor error, layer ${k + 1}`, '', E.map((e) => e.gf[k]));
    });
    if ((d.periodSigma ?? 0) > 0) add('gp', 'period error', 'nm', E.map((e) => e.gp));
  }
  const errorsDs: Dataset = { key: `mcerr:${node.id}:${mds.key}`, axes: [sampleAxis], fields: errFields, meta: errMeta, size: N };

  // chart and summary: the first curve along the analysed axis
  if (axis) {
    const idx0 = ds.axes.map((a, i) => (i === along ? 0 : Math.floor((a.values.length - 1) / 2)));
    const ln = (key: string) => Array.from(line(stats, key, along, idx0));
    Object.assign(info, { along: axis.id, xs: axis.values, nominal: ln(F), mean: ln(`${F}_mean`), lo: ln(`${F}_plo`), hi: ln(`${F}_phi`) });
    info.unit = axis.unit;
  }
  info.dev = dev;
  info.pass = pass;
  info.yieldPct = pass.length ? (100 * pass.reduce((a, b) => a + b, 0)) / N : NaN;
  const sd = [...dev].sort((a, b) => a - b);
  info.stats = [
    { label: 'samples', value: String(N) },
    { label: `RMS deviation of ${F}: mean`, value: (dev.reduce((a, b) => a + b, 0) / N).toPrecision(3) },
    { label: 'median', value: quantile(sd, 0.5).toPrecision(3) },
    { label: `p${d.pHi}`, value: quantile(sd, qhi).toPrecision(3) },
    { label: 'max', value: sd[N - 1].toPrecision(3) },
  ];
  const color = '#b5306a';
  const base = { color, datasetKey: stats.key, along: axis?.id ?? '' };
  const annotations: Annotation[] = fieldsIn.flatMap((f) =>
    [f, `${f}_mean`, `${f}_median`].map((fk) => ({ ...base, id: `${node.id}:area:${fk}`, label: `p${d.pLo}–p${d.pHi}`, kind: 'area' as const, field: fk, dataset: stats, lo: `${f}_plo`, hi: `${f}_phi` })),
  );
  const pending = value.pending || req.pending || critPending;
  return {
    errors: [],
    warnings: specWarn,
    outs: {
      out: { type: 'data', dataset: stats, pending, name: `${value.name} · tolerance`, annotations },
      samples: { type: 'data', dataset: mds, pending, name: `${value.name} · MC samples`, annotations: [] },
      errors: { type: 'data', dataset: errorsDs, pending, name: `${value.name} · MC errors`, annotations: [] },
    },
    pending,
    info,
  };
}

// ---- Grating layer (1D, RCWA) ----

export type GratingInfo = { names: string[]; period: number; d: number; slices: number; smallest: number; swept: string[] };

function evalGrating(ctx: Ctx, node: GratingNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const pick = (h: string, what: string, required: boolean) => {
    const s = materialInput(ctx, node.id, h, what, errors, required, true);
    if (s && s.kind !== 'fixed') errors.push(`${what}: a Material sweep cannot be used in a grating.`);
    return s?.kind === 'fixed' ? s.mat : undefined;
  };
  const ridge = pick('ridge', 'Ridge material', true);
  const groove = pick('groove', 'Groove material', true);
  const third = d.profile === 'pixel' && d.materials >= 3 ? pick('m2', 'Material C', true) : undefined;
  const sw = {
    d: numberSweep(ctx, node.id, 'd', 'thickness', errors),
    period: numberSweep(ctx, node.id, 'period', 'period', errors),
    fill: numberSweep(ctx, node.id, 'fill', 'fill factor', errors),
    fillTop: numberSweep(ctx, node.id, 'fillTop', 'top fill factor', errors),
  };
  const info: GratingInfo = { names: [ridge?.name ?? 'A', groove?.name ?? 'B', third?.name ?? 'C'], period: d.period, d: d.thickness, slices: 0, smallest: NaN, swept: Object.entries(sw).flatMap(([k, v]) => (v ? [k] : [])) };
  const pos = (v: number[] | undefined, what: string) => v?.some((x) => !(x > 0)) && errors.push(`${what} sweep: values must be > 0.`);
  pos(sw.period?.values, 'Period');
  const frac = (v: number[] | undefined, what: string) => v?.some((x) => !(x >= 0 && x <= 1)) && errors.push(`${what} sweep: values must be in [0, 1].`);
  frac(sw.fill?.values, 'Fill factor');
  frac(sw.fillTop?.values, 'Top fill factor');
  if (sw.d?.values.some((x) => x < 0)) errors.push('Thickness sweep has negative values.');
  if (!sw.period && !(d.period > 0)) errors.push('The period must be > 0.');
  if (!sw.d && !(d.thickness >= 0)) errors.push('Invalid thickness.');
  if (!sw.fill && !(d.fill >= 0 && d.fill <= 1)) errors.push('Fill factor: 0 – 1.');
  if (d.profile === 'trapezoid' && !sw.fillTop && !(d.fillTop >= 0 && d.fillTop <= 1)) errors.push('Top fill factor: 0 – 1.');
  if (d.profile === 'pixel' && d.pixels.length !== Math.round(d.nx) * Math.round(d.slices)) errors.push('The pixel map does not match Nx × Nz: press “reset the pixel map”.');
  if (errors.length || !ridge || !groove) return fail(errors, [], info);

  const first = (s: SweepValue | undefined, v: number) => (s ? s.values[0] : v);
  const grating: GratingParams<MaterialValue> = {
    profile: d.profile,
    period: first(sw.period, d.period),
    fill: first(sw.fill, d.fill),
    fillTop: first(sw.fillTop, d.fillTop),
    shift: d.shift,
    slices: d.slices,
    nx: d.nx,
    pixels: d.pixels,
    mats: [ridge, groove, ...(third ? [third] : [])],
  };
  const slices = gratingSlices(grating);
  Object.assign(info, { period: grating.period, d: first(sw.d, d.thickness), slices: slices.length, smallest: smallestFeature(slices) });
  const layer: StackLayer = { key: node.id, label: d.label, mat: ridge, d: first(sw.d, d.thickness), grating };
  const axes = new Axes();
  const name = d.label || 'grating';
  const idx = {
    d: sw.d ? axes.add({ sweep: sw.d, label: `d[${name}]`, unit: 'nm' }) : -1,
    period: sw.period ? axes.add({ sweep: sw.period, label: `Λ[${name}]`, unit: 'nm' }) : -1,
    fill: sw.fill ? axes.add({ sweep: sw.fill, label: `fill[${name}]`, unit: '' }) : -1,
    fillTop: sw.fillTop ? axes.add({ sweep: sw.fillTop, label: `top fill[${name}]`, unit: '' }) : -1,
  };
  if (axes.list.length) {
    const steps = combinations(axes.list.map((a) => a.sweep.values.length));
    layer.vary = { axes: axes.list };
    const at = (k: keyof typeof idx, fallback: number) => steps.map((ix) => (idx[k] >= 0 ? axes.list[idx[k]].sweep.values[ix[idx[k]]] : fallback));
    layer.vary.d = at('d', layer.d);
    if (idx.period >= 0) layer.vary.period = at('period', grating.period);
    if (idx.fill >= 0) layer.vary.fill = at('fill', grating.fill);
    if (idx.fillTop >= 0) layer.vary.fillTop = at('fillTop', grating.fillTop);
  }
  return ok({ type: 'stack', stack: { layers: [layer] } }, info);
}

// View Grating: the grating layers of the input (geometry as computed), the node that defines the first one, and the
// whole input structure (its layer list).
export type DrawGratingInfo = { layers: { label: string; d: number; grating: GratingParams<MaterialValue> }[]; source?: string; stack?: StackValue };

function evalDrawGrating(ctx: Ctx, node: DrawGratingNode): NodeResult {
  const errors: string[] = [];
  const s = stackInput(ctx, node.id, 'in', 'Input', errors);
  if (errors.length) return fail(errors);
  const layers = [...(s?.layers ?? []), ...(s?.substrate?.back ?? [])].flatMap((L) => (L.grating ? [{ label: L.label, d: L.d, grating: L.grating }] : []));
  const src = input(ctx, node.id, 'in');
  const info: DrawGratingInfo = { layers, source: src.connected && ctx.nodes.get(src.source)?.type === 'grating' ? src.source : undefined, stack: s };
  if (s && !layers.length) return fail([], ['The input has no grating layer.'], info);
  return ok(undefined, info);
}

// ---- RCWA field map: computed on demand (Run) in a worker; the result is kept outside the graph ----

// The resonance a field node starts at: the minimum of R (default), or the maximum of T or A (as −T, −A to minimize).
function resonanceOf(ds: Dataset, q: 'R' | 'T' | 'A' = 'R'): { f: ArrayLike<number>; sign: number } | null {
  const f = ds.fields[q] ?? ds.fields.R;
  return f ? { f, sign: ds.fields[q] && q !== 'R' ? -1 : 1 } : null;
}

// Point of a dataset for a field computation: λ and θ set on the node, else the resonance (resonanceOf); sweep steps chosen.
function pickPoint(ds: Dataset, spec: TmmSpec, at: Record<string, number>, resQ?: 'R' | 'T' | 'A') {
  const nS = spec.sweeps.length;
  const [li, ti] = [nS, nS + 1];
  const [la, ta] = [ds.axes[li], ds.axes[ti]];
  const idx = ds.axes.map((a, i) => (i < nS ? Math.min(a.values.length - 1, Math.max(0, at[a.id] ?? Math.floor((a.values.length - 1) / 2))) : 0));
  const pick = (a: Axis) => {
    const v = at[a.id];
    const [lo, hi] = [Math.min(...a.values), Math.max(...a.values)];
    const user = Number.isFinite(v) && v >= lo && v <= hi;
    return { value: user ? v : a.values[Math.floor((a.values.length - 1) / 2)], min: lo, max: hi, free: a.values.length > 1, auto: !user && a.values.length > 1 };
  };
  const lam = pick(la);
  const th = pick(ta);
  const nearestIndex = (a: Axis, v: number) => a.values.reduce((k, x, i) => (Math.abs(x - v) < Math.abs(a.values[k] - v) ? i : k), 0);
  const res = resonanceOf(ds, resQ);
  if ((lam.auto || th.auto) && res) {
    const st = strides(ds.axes);
    const base = idx.slice(0, nS).reduce((acc, v, i) => acc + v * st[i], 0);
    const lIdx = lam.auto ? la.values.map((_, i) => i) : [nearestIndex(la, lam.value)];
    const tIdx = th.auto ? ta.values.map((_, i) => i) : [nearestIndex(ta, th.value)];
    let best = [lIdx[0], tIdx[0]];
    let rMin = Infinity;
    for (const i of lIdx)
      for (const j of tIdx) {
        const r = res.sign * res.f[base + i * st[li] + j * st[ti]];
        if (r < rMin) [rMin, best] = [r, [i, j]];
      }
    if (lam.auto) lam.value = la.values[best[0]];
    if (th.auto) th.value = ta.values[best[1]];
  }
  const sweepIdx = idx.slice(0, nS);
  return {
    lam,
    th,
    sweepIdx,
    pol: polAt(spec, sweepIdx),
    sweeps: ds.axes.slice(0, nS).map((a, i) => ({ id: a.id, label: a.label, labels: a.values.map((_, j) => axisValueText(a, j)), index: idx[i] })),
  };
}

export type RcwaFieldInfo = {
  sweeps: { id: string; label: string; labels: string[]; index: number }[];
  lambda: ReturnType<typeof pickPoint>['lam'];
  theta: ReturnType<typeof pickPoint>['th'];
  pol: 'p' | 's';
  job?: FieldJob;
  key: string;
  stale: boolean; // a stored result exists but for other inputs
  map?: FieldMap;
  period?: number;
  quantity: { label: string; unit: string };
  point: string;
  conical?: boolean; // φ ≠ 0 at the chosen point: all six components
};

// the components of a planar TE / TM map (the others vanish); conical incidence: all six
export const FIELD_COMPONENTS = (pol: 'p' | 's', conical: boolean) => (conical ? ['Ex', 'Ey', 'Ez', 'Hx', 'Hy', 'Hz'] : pol === 's' ? ['Ey', 'Hx', 'Hz'] : ['Ex', 'Ez', 'Hy']);
const FIELD_COMP = (d: RcwaFieldNode['data'], pol: 'p' | 's', conical = false): { q: FieldQuantity; label: string } => {
  if (d.quantity === 'E2') return { q: 'E2', label: '|E|²/|E₀|²' };
  if (d.quantity === 'H2') return { q: 'H2', label: '|H|²/|H₀|²' };
  const ok2 = FIELD_COMPONENTS(pol, conical);
  const c = ok2.includes(d.component) ? d.component : ok2[0];
  const part = { abs: `|${c}|`, re: `Re ${c}`, im: `Im ${c}`, phase: `arg ${c}` }[d.part];
  return { q: c as FieldQuantity, label: part };
};

function evalRcwaField(ctx: Ctx, node: RcwaFieldNode): NodeResult {
  const d = node.data;
  const errors: string[] = [];
  const value = dataInput(ctx, node.id, errors);
  if (!value) return fail(errors);
  const ds = value.dataset;
  if (!ds) return { ...fail([]), pending: value.pending };
  const spec = ds.spec;
  if (!spec?.rcwa) return fail(['Connect the output of a Compute RCWA node (directly or through Plot / analysis nodes).']);
  if (!(d.periods >= 1 && d.nx >= 8 && d.nz >= 8 && d.zIn >= 0 && d.zOut >= 0)) return fail(['Grid: periods ≥ 1, Nx and Nz ≥ 8, offsets ≥ 0.']);
  if (d.nx * d.nz > 250_000) return fail(['Grid too large (Nx × Nz ≤ 250 000).']);
  const pt = pickPoint(ds, spec, d.at, d.res);
  // the azimuth at the chosen sweep steps (conical incidence when ≠ 0)
  let phi = spec.rcwa.phi ?? 0;
  if (spec.phiBind) {
    let k = 0;
    for (const s of spec.phiBind.s) k = k * spec.sweeps[s] + pt.sweepIdx[s];
    phi = spec.phiBind.v[k];
  }
  const jones = spec.rcwa.jones;
  const comp = FIELD_COMP(d, pt.pol, phi !== 0 || !!jones);
  const job: FieldJob = {
    spec,
    idx: pt.sweepIdx,
    lam: pt.lam.value,
    theta: pt.th.value + (spec.thetaOffset ? 0 : 0),
    ...(phi !== 0 ? { phi } : {}),
    ...(jones ? { jones } : {}),
    pol: pt.pol,
    quantity: comp.q,
    part: d.part,
    periods: Math.round(d.periods),
    nx: Math.round(d.nx),
    nz: Math.round(d.nz),
    zIn: d.zIn,
    zOut: d.zOut,
  };
  const key = hash(JSON.stringify(job));
  const stored = fieldResults.get(node.id);
  const info: RcwaFieldInfo = {
    sweeps: pt.sweeps,
    lambda: pt.lam,
    theta: pt.th,
    pol: pt.pol,
    job,
    key,
    stale: !!stored && stored.key !== key,
    quantity: { label: comp.label, unit: d.part === 'phase' ? '°' : '' },
    conical: phi !== 0 || !!jones,
    point: `λ = ${+pt.lam.value.toFixed(3)} nm, θ = ${+pt.th.value.toFixed(3)}°${phi !== 0 && !spec.phiBind ? `, φ = ${+phi.toFixed(3)}°` : ''}, ${jones ? polText(jones) : pt.pol === 'p' ? 'TM' : 'TE'}${pt.sweepIdx.length ? ` · ${sweepText(ds.axes, [...pt.sweepIdx, 0, 0], pt.sweepIdx.length)}` : ''}`,
  };
  const thick = spec.back ? ['Thick substrate: the map shows the front on a semi-infinite substrate (the plate itself is incoherent).'] : [];
  if (spec.rcwa.asr) thick.push('The field map is computed with the plain RCWA (without ASR), at the same number of orders.');
  if (!stored || stored.key !== key) return { ...ok(undefined, info, [...(stored ? ['The inputs changed: press Run to recompute the map.'] : []), ...thick]), pending: value.pending };
  info.map = stored.map;
  info.period = stored.period;
  // output: the map as a dataset (x across, height = −z up)
  const m = stored.map;
  const nxv = m.xs.length;
  const rows = m.zs.length;
  const vals = new Float64Array(nxv * rows);
  for (let r = 0; r < rows; r++) vals.set(m.values.subarray((rows - 1 - r) * nxv, (rows - r) * nxv), r * nxv);
  const dataset: Dataset = {
    key: `rcwafield:${node.id}:${key}`,
    axes: [
      { id: 'h', label: '−z (height)', unit: 'nm', values: m.zs.map((z) => -z).reverse() },
      { id: 'x', label: 'x', unit: 'nm', values: m.xs },
    ],
    fields: { f: vals },
    meta: [{ key: 'f', label: comp.label, short: comp.label, unit: info.quantity.unit }],
    size: vals.length,
  };
  // layering for profiles cut from the map (names and colours from the Material nodes of the stack)
  const look = new Map<string, MaterialValue>();
  const addMat = (m?: MaterialValue) => m && look.set(m.key, m);
  const st = value.stack;
  if (st) {
    for (const sel of [st.incident, st.exit]) if (sel) (sel.kind === 'fixed' ? [sel.mat] : sel.mats).forEach(addMat);
    for (const L of st.layers) {
      addMat(L.mat);
      L.grating?.mats.forEach(addMat);
      L.vary?.mat?.forEach(addMat);
    }
  }
  const nm = (key: string) => {
    const m = look.get(key);
    return { name: m?.name ?? ctx.lib.get(spec.instances[key]?.lib)?.name ?? key, color: m?.color ?? '#999999' };
  };
  const rg = rcwaRegionsAt(spec, pt.sweepIdx);
  const regions: RcwaMapRegion[] = [{ z0: -Infinity, z1: 0, ...nm(rg.incident), name: `${nm(rg.incident).name} (incident)` }];
  let z = 0;
  for (const L of rg.layers) {
    regions.push(L.segs ? { z0: z, z1: z + L.d, name: 'grating', color: '#999999', segs: L.segs.map((q) => ({ from: q.from, to: q.to, ...nm(q.key) })) } : { z0: z, z1: z + L.d, ...nm(L.key!) });
    z += L.d;
  }
  regions.push({ z0: z, z1: Infinity, ...nm(rg.exit), name: `${nm(rg.exit).name} (exit)` });
  const rcwaMap: RcwaMapInfo = { period: stored.period, regions, point: info.point, label: comp.label, unit: info.quantity.unit };
  return { ...ok({ type: 'data', dataset, pending: false, name: `${value.name} · field map`, annotations: [], rcwaMap }, info, thick), pending: value.pending };
}

// Field profile along z cut from an RCWA field map at the chosen x (slider over the Nx columns of the map).
function fieldFromMap(node: FieldNode, value: DataValue, ds: Dataset, mapInfo: RcwaMapInfo): NodeResult {
  const d = node.data;
  const [hAx, xAx] = ds.axes;
  const xs = xAx.values;
  const nx = xs.length;
  // default: the middle of the first period (the ridge centre of a centred profile)
  const mid = xs.reduce((k, v, i) => (Math.abs(v - mapInfo.period / 2) < Math.abs(xs[k] - mapInfo.period / 2) ? i : k), 0);
  const index = Math.min(nx - 1, Math.max(0, Math.round(d.at.x ?? mid)));
  const x = xs[index];
  const rows = hAx.values.length;
  // rows are ordered by height h = −z (ascending): the profile along z runs through them backwards
  const z = Float64Array.from({ length: rows }, (_, r) => -hAx.values[rows - 1 - r]);
  const y = Float64Array.from({ length: rows }, (_, r) => ds.fields.f[(rows - 1 - r) * nx + index]);
  const frac = (((x / mapInfo.period) % 1) + 1) % 1;
  const z0 = z[0];
  const z1 = z[rows - 1];
  const bands: FieldBand[] = mapInfo.regions.map((g) => {
    const seg = g.segs?.find((q) => frac >= q.from && frac < q.to) ?? g.segs?.[g.segs.length - 1];
    return { lo: Math.max(g.z0, z0), hi: Math.min(g.z1, z1), color: seg?.color ?? g.color, label: seg?.name ?? g.name };
  });
  const boundaries = mapInfo.regions.slice(1).map((g) => g.z0);
  const fixed = { value: NaN, min: NaN, max: NaN, free: false, auto: false };
  const info: FieldInfo = {
    sweeps: [],
    lambda: fixed,
    theta: fixed,
    pol: 'p',
    quantity: { label: mapInfo.label, unit: mapInfo.unit },
    z,
    y,
    bands,
    boundaries,
    rows: [],
    R: NaN,
    T: NaN,
    decay: NaN,
    point: `${mapInfo.point} · x = ${+x.toFixed(2)} nm (${+(frac).toFixed(3)} Λ)`,
    rcwa: { xs, index, x, period: mapInfo.period },
  };
  const out: Dataset = {
    key: `${ds.key}|cut:${index}`,
    axes: [{ id: 'z', label: 'z', unit: 'nm', values: Array.from(z) }],
    fields: { f: y },
    meta: [{ key: 'f', label: mapInfo.label, short: mapInfo.label, unit: mapInfo.unit }],
    size: rows,
  };
  return { ...ok({ type: 'data', dataset: out, pending: value.pending, name: `${value.name} · profile at x = ${+x.toFixed(1)} nm`, annotations: [] }, info) };
}
