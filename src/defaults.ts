// Default data of the nodes (used by the toolbar, the examples and the checks).
import { newComponent } from './engine/fitmodels.ts';
import { makeLibrary } from './physics/library.ts';
import type {
  CompareData,
  DrawData,
  ExtremumData,
  FieldData,
  FitData,
  FwhmData,
  MaterialData,
  ObjectiveData,
  OptimizerData,
  PlotData,
  SensitivityData,
  VariableData,
  ZonesData,
  ImportData,
  TargetData,
  MatchData,
  FormulaData,
  InfoData,
  ReverseData,
  RoughData,
  ToleranceData,
  GratingData,
  RcwaData,
  DrawGratingData,
  RcwaFieldData,
  LayerGaData,
  AnisoData, NotesData, KineticsData, SensorgramData } from './types.ts';

export const PLOT_DEFAULTS: PlotData = {
  field: 'R',
  mode: 'auto',
  x: '',
  y: '',
  series: '',
  seriesSel: null,
  fixed: {},
  autoY: false,
};
export const COMPARE_DEFAULTS: CompareData = { x: '', curves: [], autoY: false, seen: [] };
export const DRAW_DEFAULTS: DrawData = {
  orientation: 'vertical',
  scale: 'proportional',
  labels: 'name+d',
  labelPos: 'right',
  compress: true,
  light: 'left',
  overrides: {},
};

export const FIELD_DEFAULTS: FieldData = {
  view: 'profile',
  quantity: 'E2',
  component: 'Ex',
  part: 'abs',
  at: {},
  mapAxis: 'lambda',
  zIn: 300,
  zOut: 400,
  layers: true,
  labels: true,
  color: '#e0a000',
};

export const VARIABLE_DEFAULTS: VariableData = { name: '', value: 100, min: 10, max: 300, integer: false };
export const OBJECTIVE_DEFAULTS: ObjectiveData = {
  name: '',
  field: 'R',
  along: '',
  lo: NaN,
  hi: NaN,
  stat: 'min',
  goal: 'min',
  target: 0,
  scale: 1,
  weight: 1,
};
export const ZONES_DEFAULTS: ZonesData = {
  name: '',
  along: '',
  zones: [],
  reduce: 'mean',
  outside: 'ignore',
  outsideField: '',
  outsideWeight: 1,
  weight: 1,
  tau: 0.02,
};
export const IMPORT_DEFAULTS: ImportData = { name: '', fileName: '', text: '', axis: 'lambda', unit: 'nm', names: '', scale: 1, color: '#e15759' };
export const TARGET_DEFAULTS: TargetData = {
  name: '',
  mode: 'bands',
  axis: 'lambda',
  min: 400,
  max: 800,
  step: 2,
  components: [],
  bands: [
    { lo: 400, hi: 520, value: 0, weight: 1 },
    { lo: 540, hi: 620, value: 1, weight: 1 },
    { lo: 640, hi: 800, value: 0, weight: 1 },
  ],
  field: 'R',
  fitId: '',
  color: '#e15759',
};
export const MATCH_DEFAULTS: MatchData = { name: '', field: 'R', metric: 'rms', weight: 1, lo: NaN, hi: NaN };
export const FORMULA_DEFAULTS: FormulaData = { name: '', terms: [], expr: 'a', goal: 'min', weight: 1 };
export const KINETICS_DEFAULTS: KineticsData = {
  name: '',
  model: 'langmuir',
  ka: 1e5,
  kd: 1e-3,
  rmax: 1000,
  kt: 1e9,
  ka2: 1e-3,
  kd2: 1e-3,
  rmax2: 500,
  tau: 60,
  analyte: 'igg',
  mw: 150000,
  dndc: 0.188,
  rho: 1.35,
  dims: [10, 10, 10],
  orient: 'side',
  surface: 'ligand',
  ionic: 150,
  zeta: -10,
  steps: [
    { label: 'baseline', t: 60, c: 0 },
    { label: 'association', t: 300, c: 50 },
    { label: 'dissociation', t: 600, c: 0 },
  ],
  dt: 2,
  sweepOf: 'c',
};
export const SENSORGRAM_DEFAULTS: SensorgramData = {
  name: '',
  target: '',
  thick: 'auto',
  drift: 0,
  mixing: 'linear',
  bulk: true,
  along: '',
  readout: 'dip',
  at: NaN,
  track: true,
  maxTimes: 400,
  seed: 1,
};
export const TOLERANCE_DEFAULTS: ToleranceData = {
  name: '',
  samples: 200,
  seed: 1,
  dist: 'normal',
  clip: 3,
  thickness: true,
  dMode: 'rel',
  dSigma: 1,
  dSys: 0,
  dOverride: {},
  index: false,
  nSigma: 0.005,
  nSys: 0,
  angle: false,
  aSigma: 0.5,
  field: 'R',
  pLo: 5,
  pHi: 95,
  spec: false,
  specBands: [],
  specTol: 0.05,
};
export const GRATING_DEFAULTS: GratingData = {
  label: '',
  profile: 'lamellar',
  period: 500,
  thickness: 50,
  fill: 0.5,
  fillTop: 0.3,
  shift: 0.5,
  slices: 10,
  nx: 32,
  pixels: [],
  materials: 2,
};
export const RCWA_DEFAULTS: RcwaData = { name: '', polarization: 'p', orders: 15, show: 2 };
export const ANISO_DEFAULTS: AnisoData = { name: '', kind: 'uniaxial', color: '#c98bd9', angles: [0, 0, 0] };
export const DRAWGRATING_DEFAULTS: DrawGratingData = { periods: 3, grid: true, brush: 0, layer: 0 };
export const RCWAFIELD_DEFAULTS: RcwaFieldData = {
  quantity: 'E2',
  component: 'Ey',
  part: 'abs',
  at: {},
  periods: 2,
  nx: 120,
  nz: 160,
  zIn: 300,
  zOut: 300,
  outlines: true,
  runKey: '',
};
export const REVERSE_DEFAULTS: ReverseData = { name: '', swapMedia: false };
export const ROUGH_DEFAULTS: RoughData = { label: '', side: 'top', kind: 'rms', size: 2, cl: 20, cell: 1000, px: 1000, seed: 1, slices: 10, ema: 'bruggeman' };
export const INFO_DEFAULTS: InfoData = { title: 'Note', text: '', color: '#8a93a6', width: 280, height: 150 };
export const NOTES_DEFAULTS: NotesData = { name: '', count: 3 };
// The default iteration count of an Optimization Engine algorithm (switching algorithm keeps a count the user changed).
export const iterationsFor = (a: OptimizerData['algorithm']) => (a === 'adam' ? 650 : 200);
export const OPTIMIZER_DEFAULTS: OptimizerData = {
  algorithm: 'adam',
  iterations: 650, // Adam as in He et al. 2021 (200 + 450 steps); other algorithms: 200 (iterationsFor)
  population: 30,
  lr: 0.05,
  starts: 4,
  seed: 1,
  polish: true,
  preview: false,
  disabled: [],
  runs: [],
  outputRun: '',
  outputPoint: -1,
  outputCompute: '',
  startFromOutput: false,
};

// Genetic algorithm over layer sequences: the settings of Sebek et al. 2023 — population 50, 10 % elites, mutations :
// crossovers = 33 : 67, first population with 1–3 plasmonic metals, ≤ 3 dielectrics, ≤ 4 2D materials, ≤ 1 other metal,
// layers of 5–100 nm or 1–50 monolayers, n_s → n_s + 0.005 at 633 nm.
export const LAYER_GA_DEFAULTS: LayerGaData = {
  prisms: ['CaF2'],
  roles: {
    plasmonic: { mats: ['Ag', 'Au', 'Al'], min: 1, max: 3, tMin: 5, tMax: 100 },
    metal: { mats: ['Cr'], min: 0, max: 1, tMin: 5, tMax: 100 },
    dielectric: { mats: ['SiO2', 'TiO2', 'GeO2', 'MgF2'], min: 0, max: 3, tMin: 5, tMax: 100 },
    twoD: { mats: ['Graphene', 'hBN', 'MoS2', 'WS2'], min: 0, max: 4, tMin: 1, tMax: 50 },
  },
  holdCounts: false,
  maxLayers: 12,
  medium: 'Water',
  lambda: 633,
  dn: 0.005,
  thetaMin: 40,
  thetaMax: 89.9,
  step: 0.1,
  objective: 'S',
  maxTheta: 90,
  single: false,
  minDepth: 0.4,
  maxAsym: 1.25,
  smooth: true,
  trace: false,
  population: 50,
  generations: 50,
  elite: 0.1,
  mutation: 0.33,
  seed: 1,
  history: [],
  mean: [],
};
export const layerGaOf = (d: OptimizerData): LayerGaData => d.layerGa ?? LAYER_GA_DEFAULTS;

export const fitDefaults = (): FitData => ({
  mode: 'spectrum',
  field: 'R',
  along: '',
  fixed: {},
  lo: NaN,
  hi: NaN,
  components: [newComponent('baseline'), newComponent('lorentz')],
  branch1: '',
  branch2: '',
  disp: {},
  stats: null,
  batch: null,
  color: '#e15759',
  showParts: true,
  autoGuess: true,
});

export const ANALYSIS_DEFAULTS: { extremum: ExtremumData; fwhm: FwhmData; sensitivity: SensitivityData } = {
  extremum: { mode: 'min', field: 'R', along: '', lo: NaN, hi: NaN, color: '#e15759' },
  fwhm: { kind: 'dip', field: 'R', along: '', method: 'local', level: 0.5, intervals: [{ lo: NaN, hi: NaN }], color: '#f28e2b' },
  sensitivity: { target: '', dn: 0.005, kind: 'dip', field: 'R', along: '', lo: NaN, hi: NaN, color: '#b07aa1' },
};

const lib = makeLibrary([]);
export const materialData = (materialId: string): MaterialData => ({
  materialId,
  color: lib.get(materialId)?.color ?? '#999999',
  indexMode: 'absolute',
  porosity: NaN,
});

