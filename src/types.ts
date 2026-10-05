import type { Node as FlowNode } from '@xyflow/react';

// Common to every node: a free label shown above it and the collapsed state (only the title bar shown).
export type NodeMeta = { caption?: string; collapsed?: boolean };

// Display settings of a colour map (the data are not changed): colour range (NaN bound = automatic), log10 colour
// scale, bilinear smoothing between the samples, Gaussian blur (σ in cells, 0 = none), cap: values above it drawn in
// the colour of the cap (saturated) or not drawn (capHide); the automatic colour range then ends at the cap.
export type MapView = { zLim?: [number, number]; zLog?: boolean; smooth?: boolean; blur?: number; cap?: number; capHide?: boolean; cmap?: ColorMapName };
type Node<D extends Record<string, unknown>, T extends string> = FlowNode<D & NodeMeta, T>;
import type { Polarization } from './physics/tmm.ts';
import type { ColorMapName } from './plot/colors.ts';
import type { FitComponent, FitParam, Mode2Model } from './engine/fitmodels.ts';
import type { Component } from './physics/field.ts';
import type { FitStats } from './engine/fitrun.ts';
import type { LevelMethod, LocateMethod } from './engine/metrics.ts';
import type { KineticModel } from './engine/kinetics.ts';
import type { FormulaStat, MetricGoal, MetricStat, Outside, Zone, ZoneReduce } from './engine/objectives.ts';
import type { SpecKind, SpecPol } from './engine/spec.ts';
import type { Quantity, SweepKind } from './engine/types.ts';
import type { AlgoParamsPatch } from './engine/optimize.ts';
import type { GratingProfile } from './engine/grating.ts';
import type { SprClass } from './engine/sprDesign.ts';

export type MaterialData = {
  materialId: string;
  color: string; // drawing colour, propagated to everything built from this material
  indexMode: 'absolute' | 'offset'; // how a sweep on the index port is applied
  porosity: number; // pore fraction for porous materials; NaN = library value
  // porous materials: what fills the pores — the library filler (default), or the layer before / after it in the stack
  // (its index as computed at every step: sweeps and the Δn of a sensitivity analysis follow)
  poresFill?: 'library' | 'prev' | 'next';
};
export type MaterialSweepData = { name: string };
export type LayerData = {
  label: string;
  thickness: number; // nm
  layers2D: number; // number of monolayers, for 2D materials
  // anisotropic material (liquid crystal): the director turned by `twist` (degrees) through the layer, the tilt going to
  // `tiltEnd` at the bottom (absent: constant), in `slices` sublayers
  twist?: number;
  // cholesteric pitch (nm; > 0 right-handed, < 0 left-handed): the twist follows the thickness, 360° · d / pitch
  pitch?: number;
  tiltEnd?: number;
  slices?: number;
};
// Anisotropic material: principal indices from Material nodes (ports o, e / 1, 2, 3), orientation angles (ports a0 … a2)
export type AnisoData = { name: string; kind: 'uniaxial' | 'biaxial'; color: string; angles: number[] };
// Incident/exit media come from the ports; unconnected = taken from the first/last item.
// thick: the exit medium is a plate of dSub mm (incoherent), with a back coating (port 'back') and a back medium ('backMedium').
export type CombineData = { name: string; count: number; thick?: boolean; dSub?: number };
// layers2D replaces the thickness when the connected material is 2D.
export type DbrPeriodLayer = { mode: 'nm' | 'qw'; d: number; label: string; layers2D: number };
export type DbrCavity = { after: number; mode: 'nm' | 'half'; d: number; m: number; layers2D: number };
export type DbrData = {
  name: string;
  period: DbrPeriodLayer[];
  periods: number;
  closing: boolean; // repeat the first period layer at the end: (AB)ᴺA
  mirrorAfterCavity: boolean; // reverse the period order after each cavity: (AB)ᴺ C (BA)ᴺ
  lambda0: number; // design wavelength, nm
  cavities: DbrCavity[];
};
export type ParamData = {
  quantity: Quantity;
  mode: 'constant' | 'range';
  by?: 'step' | 'count'; // range: by its step (default) or by its number of values (count, ends included)
  count?: number;
  value: number;
  min: number;
  max: number;
  step: number;
};
export type SweepData = {
  name: string;
  kind: SweepKind;
  mode: 'range' | 'list';
  by?: 'step' | 'count'; // range: by its step (default) or by its number of values (count, ends included)
  count?: number;
  min: number;
  max: number;
  step: number;
  list: string;
};
// phi, polMix: as in Compute RCWA (used by the Berreman 4×4 computation: anisotropic layers, or a Jones state)
// cone / coneHalf: a converging beam, each θ averaged over the rays of a cone of this half-angle (°; isotropic stacks)
export type ComputeData = { name: string; polarization: Polarization; phi?: number; polMix?: { psi: number; delta: number }; cone?: boolean; coneHalf?: number };
export type PlotMode = 'auto' | 'curves' | 'map' | 'histogram';
export type PlotData = {
  field: string;
  mode: PlotMode;
  bins?: number; // histogram: number of bins (0 / absent = automatic)
  x: string; // axis id, '' = automatic
  y: string; // axis id for the 2D map, '' = automatic
  series: string; // axis id drawn as a family of curves, '' = automatic, 'none'
  seriesSel: { axis: string; idx: number[] } | null; // null = all curves
  fixed: Record<string, number>; // axis id → index held fixed
  autoY: boolean;
  xLim?: [number, number]; // manual axis limits (NaN = automatic)
  yLim?: [number, number];
  mapView?: MapView; // 2D map: colour range, log, smoothing, blur
  showMarks?: boolean; // analysis marks (minima, FWHM, fits, ranges …); default on
  hiddenMarks?: string[]; // marks hidden from the legend (markKey)
  // a quantity as X instead of an axis (e.g. FWHM vs the resonance angle), and as Y of a map (three quantities make a map)
  xField?: string;
  yField?: string;
  noLines?: boolean; // points only (a quantity as X)
};
export type Dash = 'solid' | 'dash' | 'dot';
export type CompareCurve = {
  id: string;
  src: string; // source node id
  field: string;
  fixed: Record<string, number>; // axis id → index
  color: string;
  dash: Dash;
  label: string; // '' = automatic
  visible: boolean;
};
export type CompareData = {
  x: string; // axis id, '' = automatic
  curves: CompareCurve[];
  autoY: boolean;
  showMarks?: boolean;
  hiddenMarks?: string[];
  seen: string[]; // sources that already received a default curve
};
export type DrawData = {
  orientation: 'vertical' | 'horizontal';
  scale: 'proportional' | 'equal' | 'log';
  labels: 'name' | 'name+d' | 'd' | 'none';
  labelPos: 'inside' | 'left' | 'right';
  compress: boolean; // draw one period of a periodic block with a ×N bracket
  light: 'none' | 'left' | 'center' | 'right'; // incident ray (left/right become above/below when horizontal)
  overrides: Record<string, { label?: string }>;
};

// Analysis nodes. Intervals are in units of the analysed axis; NaN = open end.
// A zone that follows another axis of the data (e.g. a resonance moving with θ): at each value y of axis `at` the interval
// runs from lo(y) to hi(y), straight lines between the points (sorted by y), constant beyond the first and last.
export type ZonePoint = { y: number; lo: number; hi: number };
export type ZonePath = { at: string; pts: ZonePoint[] };
// With a path the interval is the zone; lo / hi are kept for when the path is removed.
export type Interval = { lo: number; hi: number; path?: ZonePath };
// locate / locLevel / locDeg: how the position of the dip (peak) is found (engine/metrics.ts `Locate`; absent = parabola)
export type LocateFields = { locate?: LocateMethod; locLevel?: number; locDeg?: number };
export type ExtremumData = { mode: 'min' | 'max'; field: string; along: string; lo: number; hi: number; path?: ZonePath; color: string } & LocateFields;
export type FwhmData = {
  kind: 'dip' | 'peak';
  field: string;
  along: string;
  method: LevelMethod;
  level: number; // for method 'absolute'
  intervals: Interval[];
  color: string;
} & LocateFields;
export type SensitivityData = {
  target: string; // 'mat:<instance key>' or 'layer:<index>'
  dn: number;
  kind: 'dip' | 'peak';
  field: string;
  along: string;
  lo: number;
  hi: number;
  path?: ZonePath;
  color: string;
} & LocateFields;

export type FitData = {
  mode: 'spectrum' | 'dispersion';
  field: string; // spectrum: fitted quantity
  along: string;
  fixed: Record<string, number>; // axis id → index of the fitted curve (other axes)
  lo: number;
  hi: number;
  components: FitComponent[];
  branch1: string; // dispersion: the two branch positions (fields of a metrics dataset)
  branch2: string;
  disp: Record<string, FitParam>;
  mode2?: Mode2Model; // dispersion: mode 2 linear in x (default) or a cavity vs the angle
  stats: (FitStats & { hash: string }) | null; // last fit, valid while the data hash matches
  batch: { hash: string; ids: string[]; values: number[][]; r2: number[] } | null; // fit of every curve
  color: string;
  showParts: boolean;
  autoGuess: boolean; // estimate the parameters from the data once it arrives
};

export type FieldQuantity = 'E2' | 'H2' | 'abs' | 'comp';
export type FieldData = {
  res?: 'R' | 'T' | 'A'; // λ / θ start at the resonance: the minimum of R (default) or the maximum of T or A
  view: 'profile' | 'map';
  mapView?: MapView;
  quantity: FieldQuantity;
  component: Component;
  part: 'abs' | 're' | 'im' | 'phase';
  at: Record<string, number>; // 'lambda'/'theta': value (absent = at the R dip); sweep axes: step index
  mapAxis: 'lambda' | 'theta';
  zIn: number; // nm of the incident medium shown
  zOut: number; // nm of the exit medium shown
  layers: boolean;
  labels: boolean;
  color: string;
  // penetration depth: where |E| falls to 1/e of its value at the edge of a region ('incident', 'exit' or 'layer:<j>',
  // j = the layer of the stack), measured from its top / bottom edge (auto: the edge where |E| is larger); overlay on the plot
  depth?: { on: boolean; region: string; edge: 'auto' | 'top' | 'bottom'; overlay: boolean };
  cut?: 'z' | 'x'; // a cut of an RCWA field map: along z at a chosen x (default) or along x at a chosen z (at.x / at.z: indices)
};

// ---- Optimization ----
// A design variable: a single value fed to any sweep port; the optimizer varies it within [min, max].
export type VariableData = { name: string; value: number; min: number; max: number; integer: boolean };
export type ObjectiveData = {
  name: string;
  field: string;
  along: string; // '' = every value of the field
  lo: number;
  hi: number;
  stat: MetricStat;
  goal: MetricGoal;
  target: number; // target value, or the bound of a ≤ / ≥ constraint
  scale: number; // typical size of the value (normalizes the cost)
  weight: number;
  pol?: SpecPol; // slice of the data: polarization ('all' = every curve) and angle (NaN = every angle)
  angle?: number;
};
export type ZonesData = {
  name: string;
  along: string;
  zones: Zone[];
  reduce: ZoneReduce;
  outside: Outside;
  outsideField: string;
  outsideWeight: number;
  weight: number;
  tau: number; // softness of the worst-case reduction
  pol?: SpecPol; // default slice of the zones (and of the region outside them)
  angle?: number;
};
export type OptimizerAlgorithm = 'adam' | 'de' | 'nm' | 'ga' | 'pso' | 'lm' | 'nsga2' | 'sa' | 'layerga';

// Genetic algorithm over layer sequences (M. Sebek et al., ACS Omega 8, 20792 (2023)): SPR sensors built from the
// library materials ticked for each role — an exception to “materials only through Material nodes” (decided
// 2026-09-27) —, with the limits of each role; its own objective (S = Δθ/Δn of the TM dip, or S / FWHM).
export type LayerRole = SprClass;
export type LayerRoleRule = { mats: string[]; min: number; max: number; tMin: number; tMax: number }; // layers; thickness (nm, or monolayers for 2D)
export type LayerGaData = {
  prisms: string[]; // library ids: the algorithm picks one
  roles: Record<LayerRole, LayerRoleRule>;
  holdCounts: boolean; // the maximum numbers of layers hold in every generation (the article: only the first population)
  maxLayers: number;
  medium: string; // library id of the sensing medium
  lambda: number; // nm
  dn: number; // change of the sensing medium's index
  thetaMin: number; // coarse angular scan, degrees
  thetaMax: number;
  step: number;
  objective: 'S' | 'FOM';
  maxTheta: number; // dips beyond this angle do not count (90 = no limit)
  single: boolean; // single-mode conditions (dip depth, left / right half width, smoothness)
  minDepth: number;
  maxAsym: number;
  smooth: boolean;
  trace: boolean; // the dip followed between n_s and n_s + Δn by its shape
  population: number;
  generations: number;
  elite: number; // fraction kept unchanged
  mutation: number; // fraction of the children made by a mutation (the rest by a crossover)
  seed: number;
  best?: { prism: string; layers: { role: LayerRole; mat: string; t: number }[] }; // the result (t: nm or monolayers)
  history: number[]; // best fitness per generation
  mean: number[];
  lineage?: string[]; // the operators that shaped the best structure (the last ones)
};
export type OptimizerRun = {
  id: string;
  algorithm: OptimizerAlgorithm;
  started: number; // epoch ms
  seconds: number;
  evaluations: number;
  merit: number;
  values: Record<string, number>; // variable node id → value
  start?: Record<string, number>; // the values the run started from
  names: Record<string, string>;
  history: number[]; // best merit per iteration
  stopped: boolean; // ended by the user
  objectives?: string[];
  front?: { x: number[]; f: number[] }[]; // NSGA-II: Pareto front (x in the order of `values`)
};
export type OptimizerData = {
  algorithm: OptimizerAlgorithm;
  iterations: number;
  population: number; // DE
  lr: number; // Adam, in the normalized (sigmoid) space
  starts: number; // Adam multistart
  seed: number;
  polish: boolean; // finish with Nelder-Mead
  preview: boolean; // write the best point into the graph during the run
  disabled: string[]; // variables kept fixed
  runs: OptimizerRun[];
  params?: AlgoParamsPatch; // algorithm settings (missing values = defaults)
  // Outputs: the optimized structure (stack) and its simulation (data) for one solution.
  outputRun?: string; // run id ('' = the latest run)
  outputPoint?: number; // NSGA-II: index in that run's Pareto front (-1 = the best merit)
  outputCompute?: string; // Compute TMM node to re-run ('' = the first one feeding the objectives)
  startFromOutput?: boolean; // the next run starts from the output solution instead of the variables' values
  live?: Record<string, number>; // live preview: the best point of the running optimization
  layerGa?: LayerGaData; // algorithm 'layerga' (missing = defaults)
};

// Objective from an expression of analysis results, e.g. 0.5·a + 0.25·b/10 − 0.25·c/100.
// A term: statistic of a field of one input (source = 'nodeId:handle'), optionally along an axis inside [lo, hi] ('at':
// the value at x = lo), in a slice (polarization, angle); fge / fle = fraction of the values ≥ / ≤ level (smoothed by a
// logistic of width `soft` when soft > 0).
export type FormulaTerm = {
  name: string;
  source: string;
  field: string;
  stat: FormulaStat;
  along?: string;
  lo?: number;
  hi?: number;
  pol?: SpecPol;
  angle?: number;
  level?: number;
  soft?: number;
};
export type FormulaData = { name: string; terms: FormulaTerm[]; expr: string; goal: 'min' | 'max'; weight: number };

// Free-text note on the canvas.
export type InfoData = { title: string; text: string; color: string; width: number; height: number };

// ---- Measured spectra and targets ----
export type ImportData = {
  name: string;
  fileName: string;
  text: string; // the file contents (kept in the project)
  axis: 'lambda' | 'theta' | 'x';
  unit: 'nm' | 'um' | 'eV' | 'deg' | 'none';
  names: string; // comma-separated names of the value columns ('' = from the header)
  scale: number; // multiplies the values (e.g. 0.01 for %)
  color: string;
};
// A band of a target: optional quantity, slice, kind (=, ≥, ≤) and tolerance (the node's defaults otherwise).
export type TargetBand = { lo: number; hi: number; value: number; weight: number; q?: string; pol?: SpecPol; angle?: number; kind?: SpecKind; tol?: number };
export type TargetData = {
  name: string;
  mode: 'components' | 'bands' | 'data' | 'fit';
  axis: 'lambda' | 'theta';
  min: number;
  max: number;
  step: number;
  components: FitComponent[];
  bands: TargetBand[];
  field: string; // data mode: field of the input
  fitId: string; // fit mode: fitted curve (annotation) of the input
  color: string;
  // λ axis, model and bands: min / max / step in wavenumber (cm⁻¹), i.e. points evenly spaced in 1/λ (the x values stay λ in nm)
  gridUnit?: 'nm' | 'cm-1';
  // what the target is (defaults of the bands): quantity ('' = chosen by the node using it; R, T, A, OD), slice, kind,
  // tolerance (the error is divided by it: 0.01 gives MF = 100·RMS)
  quantity?: string;
  pol?: SpecPol;
  angle?: number;
  kind?: SpecKind;
  tol?: number;
};
export type MatchData = {
  name: string;
  field: string; // simulated quantity compared with the target
  metric: 'rms' | 'mae' | 'max' | 'pnorm' | 'msemax'; // p = 2 / 1 / ∞ / p; msemax = mean e² + λ·max e² (He et al. 2021)
  lambdaMax?: number; // λ of msemax (default 0.01)
  weight: number;
  lo: number;
  hi: number;
  // only the target points below (lt) or above (gt) a level, e.g. the resonances of a target with dips: target < 0.95
  only?: { op: 'lt' | 'gt'; level: number };
  p?: number;
  pol?: SpecPol; // slice for the target terms that do not set their own
  angle?: number;
};

export type MaterialNode = Node<MaterialData, 'material'>;
export type ImportNode = Node<ImportData, 'import'>;
export type TargetNode = Node<TargetData, 'target'>;
export type MatchNode = Node<MatchData, 'match'>;
export type FormulaNode = Node<FormulaData, 'formula'>;
export type InfoNode = Node<InfoData, 'info'>;
// Combine notes: the notes of its slots (top → bottom) as one document (sections), exported as .md / .txt
export type NotesData = { name: string; count: number; width?: number; height?: number };
export type NotesNode = Node<NotesData, 'notes'>;

// Reverses the order of the layers of a stack (optionally also swaps the incident and exit media).
export type ReverseData = { name: string; swapMedia: boolean };
export type ReverseNode = Node<ReverseData, 'reverse'>;

// Roughness: the top or bottom interface of the connected layer made rough (random profile of a given RMS or
// peak-to-peak height and correlation length over a periodic cell), cut into slices (RCWA: pixels, TMM: an effective
// medium). size / cl / seed may be swept (ports).
export type RoughData = {
  label: string;
  side: 'top' | 'bottom';
  kind: 'rms' | 'pp';
  size: number; // nm
  cl: number; // nm
  cell: number; // nm
  px: number;
  seed: number;
  slices: number;
  ema: 'bruggeman' | 'maxwell-garnett' | 'looyenga' | 'linear' | 'aniso' | 'wiener' | 'shape';
  tmm?: 'profile' | 'ensemble' | 'ramp'; // Compute TMM: the profile of the seed (absent), a Gaussian or a uniform height distribution
  corr?: number; // correlation with the rough interface before (0 … 1); absent / NaN: automatic (thin films conformal)
  surf?: '1d' | '2d'; // medium 'shape': ridges of a 1D profile (absent) or bumps of a 2D surface
};
export type RoughNode = Node<RoughData, 'rough'>;

// Filter designer: target bands (λ), materials H / L (/ M), constraints, algorithm; the designed layers are kept here.
// avg: the band's mean (trapezoid in λ) or its photopic mean (V(λ)·D65, e.g. Rv) is the target, not every point
export type FilterBand = { lo: number; hi: number; q: 'R' | 'T' | 'A' | 'OD'; value: number; weight: number; kind?: SpecKind; tol?: number; avg?: 'mean' | 'photopic' };
export type FilterData = {
  name: string;
  preset: 'custom' | 'ar' | 'longpass' | 'shortpass' | 'bandpass' | 'notch' | 'mirror';
  bands: FilterBand[];
  lmin: number;
  lmax: number;
  step: number;
  targetQ: 'R' | 'T' | 'A' | 'OD'; // quantity of a connected target curve that does not set one
  p?: number; // exponent of the merit (2 = least squares)
  angles: string; // list of incidence angles (°): the merit is averaged over them
  pol: 's' | 'p' | 'unpolarized' | 'both';
  materials: number; // number of coating materials (2 … 8), ports m0 … m7, letters H L M A B C D E
  thick: boolean; // thick (incoherent) substrate
  dSub: number; // mm
  sides: 'front' | 'back' | 'both'; // designed coatings (back and both need a thick substrate)
  minD: number;
  maxD: number;
  maxLayers: number;
  maxTotal: number;
  algorithm: 'needle' | 'deep' | 'gradual' | 'random' | 'refine' | 'clean';
  candidates?: number; // deep search: candidates refined per step
  cleanTo?: number; // design cleaner: layers per coating
  iterations: number;
  needleStep: number;
  lambdaRef: number; // quarter-wave reference
  start: 'current' | 'qw' | 'layer' | 'bare' | 'formula';
  formula?: string; // start design in quarter waves at λ ref, e.g. (1.92H 2.08L)^100
  startPeriods: number;
  startMat: number;
  startD: number;
  design: { front: { m: number; d: number; fix?: boolean; tie?: string }[]; back: { m: number; d: number; fix?: boolean; tie?: string }[] };
  merit: number;
  history: number[];
  historyD?: number[]; // total physical thickness after each step (merit vs thickness)
  matMin?: number[]; // per coating material: its own min / max layer thickness (NaN / absent: min d / max d)
  matMax?: number[];
  // a converging beam around each angle: half-angle (°) in the incident medium, or from an f-number
  cone?: boolean;
  coneHalf?: number;
  coneF?: number;
  coneBy?: 'angle' | 'f';
  sensStep?: number; // layer sensitivity: the thickness error (nm, or % with sensRel)
  sensRel?: boolean;
};
export type FilterNode = Node<FilterData, 'filter'>;

// Tolerance analysis (Monte Carlo): random fabrication errors applied to the structure of a Compute TMM result.
export type ToleranceSpecBand = { lo: number; hi: number; q: 'R' | 'T' | 'A'; min: number; max: number };
// A pass / fail condition on a metric of an analysis node (Min / max, FWHM) connected to `criteria`, recomputed on every
// sample: min ≤ metric ≤ max (NaN = open end). `source` = the analysis node, `field` = its metric.
export type ToleranceCriterion = { source: string; field: string; min: number; max: number };
export type ToleranceData = {
  name: string;
  samples: number;
  seed: number;
  dist: 'normal' | 'uniform'; // σ is the standard deviation in both cases (uniform: ±√3 σ)
  clip: number; // errors limited to ±clip·σ
  thickness: boolean;
  dMode: 'rel' | 'abs'; // σ in % of the thickness, or in nm
  dSigma: number; // random, independent for every layer
  dSys: number; // systematic: the same for all layers of a material
  dOverride: Record<string, number>; // σ of individual layers (key = layer index in the structure)
  index: boolean;
  nSigma: number; // Δn, random per layer
  nSys: number; // Δn, systematic per material
  angle: boolean;
  aSigma: number; // degrees
  azimuth?: boolean; // RCWA: error of the azimuth φ (alignment of the grating lines in the holder)
  phiSigma?: number; // degrees
  grating?: boolean; // RCWA structures: errors of the grating geometry
  fillSigma?: number; // fill factor, absolute, random per grating layer
  periodSigma?: number; // nm, the same for every grating layer of a sample (lithography scale)
  field: 'R' | 'T' | 'A'; // shown and used for the deviation and the ranking
  pLo: number; // percentiles of the range
  pHi: number;
  spec: boolean; // pass / fail specification → yield
  specBands: ToleranceSpecBand[];
  specTol: number; // ± tolerance around a connected target curve
  // the axis the limits (bands, target curve) and the chart follow: an axis id, '' / absent = automatic (the target
  // curve's axis, else λ when it is a range, else θ)
  along?: string;
  criteria?: ToleranceCriterion[];
  // layers left out of the random errors (indices as dOverride), σ of Δn of individual layers
  dSkip?: number[];
  nSkip?: number[];
  nOverride?: Record<string, number>;
  // systematic errors per material (key = material instance): left out, or their own σ
  sysSkipD?: string[];
  sysSkipN?: string[];
  dSysOverride?: Record<string, number>;
  nSysOverride?: Record<string, number>;
  preview?: number; // the sample shown on the preview of the measured signal (1 …)
} & InstrumentFields;
export type ToleranceNode = Node<ToleranceData, 'tolerance'>;
// The instrument (engine/instrument.ts): angular spread of the beam, source bandwidth, detector noise (Tolerance,
// Sensorgram).
export type InstrumentFields = {
  spreadOn?: boolean;
  spread?: number; // ° (σ or ± half-angle) or NA, by spreadShape
  spreadShape?: 'gauss' | 'uniform' | 'na';
  bandOn?: boolean;
  band?: number; // nm FWHM
  noise?: boolean;
  noiseAdd?: number; // σ, units of R
  noiseShot?: number; // photoelectrons at R = 1 (0 = off)
  noiseSource?: number; // % per scan
  noiseAvg?: number; // scans averaged
  noiseBits?: number; // ADC bits (0 = off)
};

// ---- Sensorgrams ----
// Binding kinetics (engine/kinetics.ts): the model, its constants, the analyte, the protocol (steps; c in nM).
export type KineticsStepData = { label: string; t: number; c: number; regen?: boolean; swell?: number };
export type KineticsData = {
  name: string;
  model: KineticModel;
  ka: number;
  kd: number;
  rmax: number;
  kt: number;
  ka2: number;
  kd2: number;
  rmax2: number;
  tau: number;
  analyte: string; // a key of ANALYTES, or 'custom' (the values below)
  mw: number;
  dndc: number;
  rho: number;
  dims: [number, number, number]; // nm, a ≥ b ≥ c (custom analyte)
  orient: 'side' | 'end'; // lying (side-on) or standing (end-on) on the surface
  surface: 'ligand' | 'rsa'; // 1:1 models: ligand sites (Rmax typed) or a free surface (random sequential adsorption)
  ionic: number; // ionic strength, mM (the double layer: repulsion between bound molecules)
  zeta: number; // ζ potential of the analyte, mV
  steps: KineticsStepData[];
  dt: number; // s between samples
  sweepOf: 'c' | 'ka' | 'kd' | 'rmax' | 'kt' | 'ka2' | 'kd2' | 'tau' | 'ionic' | 'zeta'; // the constant a connected Sweep varies
};
export type KineticsNode = Node<KineticsData, 'kinetics'>;
// Sensorgram: the Compute TMM structure with a binding layer on the sensing medium (or a target layer that takes up
// the analyte / swells), recomputed at every time of the kinetics; the dip (or R at a point) vs time.
export type SensorgramData = {
  name: string;
  target: string; // '' = the exit medium (a binding layer is added on it); 'layer:<i>' = layer i of the structure
  // binding layer: 'auto' = a monolayer as high as the molecule while it fits (up to the jamming capacity), then
  // growing with the extra mass (multilayer); 'compact' = all the mass as a dense layer, d = Γ/ρ
  thick: 'auto' | 'compact';
  drift: number; // baseline drift of the buffer index, µRIU/min
  mixing: 'linear' | 'bruggeman' | 'maxwell-garnett'; // linear in n = de Feijter
  bulk: boolean; // the bulk index of the flowing analyte solution (dn/dc · c)
  along: string; // interrogation axis ('' = θ, else λ)
  readout: 'dip' | 'value';
  at: number; // readout 'value': R at this angle / wavelength
  track: boolean; // the dip refined between the grid points (exact; without noise)
  maxTimes: number; // time points computed (at most)
  seed: number; // detector noise realization (the `seed` port sweeps it: one series per seed)
} & LocateFields &
  InstrumentFields;
export type SensorgramNode = Node<SensorgramData, 'sensorgram'>;

// ---- RCWA (1D gratings) ----
export type GratingData = {
  label: string;
  profile: GratingProfile;
  period: number; // nm
  thickness: number; // nm (grating depth)
  fill: number;
  fillTop: number;
  shift: number;
  slices: number; // Nz
  nx: number; // Nx
  pixels: number[];
  materials: number; // 2 or 3 (pixel map)
};
// asr: adaptive spatial resolution (faster convergence at the edges, metals in TM), eta its strength (0 … 0.99)
// phi: azimuth of the plane of incidence from the grating vector, degrees (≠ 0: conical incidence; the `phi` port sweeps it)
// polMix: an incident Jones state E = cos ψ p̂ + sin ψ e^{iδ} ŝ (degrees) instead of TE / TM
// profiles: how trapezoid / sinus / blazed gratings are computed — staircase slices, or their smooth profile by the
// differential method with fast Fourier factorization (absent in projects saved before it: the staircase)
export type RcwaData = { name: string; polarization: Polarization; orders: number; show: number; asr?: boolean; eta?: number; phi?: number; polMix?: { psi: number; delta: number }; profiles?: 'staircase' | 'fff' };
export type DrawGratingData = { periods: number; grid: boolean; brush: number; layer: number };
export type RcwaFieldData = {
  res?: 'R' | 'T' | 'A'; // λ / θ start at the resonance: the minimum of R (default) or the maximum of T or A
  quantity: 'E2' | 'H2' | 'comp';
  component: 'Ex' | 'Ey' | 'Ez' | 'Hx' | 'Hy' | 'Hz';
  part: 'abs' | 're' | 'im' | 'phase';
  at: Record<string, number>; // 'lambda' / 'theta' values (absent = at the R dip), sweep step indices
  periods: number;
  nx: number;
  nz: number;
  zIn: number;
  zOut: number;
  // a window of the map (nm; NaN / absent = the periods across, the offsets above / below): all Nx × Nz points go into it
  x0?: number;
  x1?: number;
  z0?: number; // depth: 0 = top of the first layer, growing into the structure
  z1?: number;
  outlines: boolean;
  orders?: number; // N of the map (NaN / absent: the Compute RCWA's): a map needs more orders than a spectrum
  sigma?: 'none' | 'lanczos' | 'fejer'; // Gibbs smoothing of the Fourier sums in x
  runKey: string; // key of the stored result (set by Run)
  mapView?: MapView;
};
export type GratingNode = Node<GratingData, 'grating'>;
export type RcwaNode = Node<RcwaData, 'rcwa'>;
export type DrawGratingNode = Node<DrawGratingData, 'drawgrating'>;
export type RcwaFieldNode = Node<RcwaFieldData, 'rcwafield'>;
export type VariableNode = Node<VariableData, 'variable'>;
export type ObjectiveNode = Node<ObjectiveData, 'objective'>;
export type ZonesNode = Node<ZonesData, 'zones'>;
export type OptimizerNode = Node<OptimizerData, 'optimizer'>;
export type FieldNode = Node<FieldData, 'field'>;
export type FitNode = Node<FitData, 'fit'>;
export type ExtremumNode = Node<ExtremumData, 'extremum'>;
export type FwhmNode = Node<FwhmData, 'fwhm'>;
export type SensitivityNode = Node<SensitivityData, 'sensitivity'>;
export type MaterialSweepNode = Node<MaterialSweepData, 'matsweep'>;
export type AnisoNode = Node<AnisoData, 'aniso'>;
export type LayerNode = Node<LayerData, 'layer'>;
export type CombineNode = Node<CombineData, 'combine'>;
export type DbrNode = Node<DbrData, 'dbr'>;
export type ParamNode = Node<ParamData, 'param'>;
export type SweepNode = Node<SweepData, 'sweep'>;
export type ComputeNode = Node<ComputeData, 'compute'>;
export type PlotNode = Node<PlotData, 'plot'>;
export type CompareNode = Node<CompareData, 'compare'>;
export type DrawNode = Node<DrawData, 'draw'>;

// ---- Data nodes: take values out of a result, gather results, compute new quantities from them ----
// Extract data: some quantities of a data input, over all its curves (the axes kept), or at fixed steps of some axes
// (fixed: axis id → step index; every axis fixed gives single values).
// mean: axes averaged out; at: axes held at a value (interpolated)
export type ExtractData = { name: string; fields: string[]; fixed: Record<string, number>; mean?: string[]; at?: Record<string, number> };
// Merge data: several data inputs side by side, each with its own points (no interpolation); labels by source node id.
export type MergeData = { name: string; labels: Record<string, string> };
// Custom data: new quantities from formulas of the quantities (and axes) of its inputs (one port, several connections),
// point by point; each input has a short name (aliases: `<source>:<handle>` → name, a, b, c… by default).
export type CustomData = { name: string; rows: { name: string; expr: string }[]; aliases?: Record<string, string> };
export type ExtractNode = Node<ExtractData, 'extract'>;
export type MergeNode = Node<MergeData, 'merge'>;
export type CustomNode = Node<CustomData, 'custom'>;

export type AppNode =
  | ExtractNode
  | MergeNode
  | CustomNode
  | MaterialNode
  | MaterialSweepNode
  | AnisoNode
  | LayerNode
  | CombineNode
  | DbrNode
  | ParamNode
  | SweepNode
  | ComputeNode
  | PlotNode
  | CompareNode
  | DrawNode
  | ExtremumNode
  | FwhmNode
  | SensitivityNode
  | FitNode
  | FieldNode
  | VariableNode
  | ObjectiveNode
  | ZonesNode
  | OptimizerNode
  | ImportNode
  | TargetNode
  | MatchNode
  | FormulaNode
  | InfoNode
  | NotesNode
  | ReverseNode
  | RoughNode
  | FilterNode
  | ToleranceNode
  | GratingNode
  | RcwaNode
  | DrawGratingNode
  | RcwaFieldNode
  | KineticsNode
  | SensorgramNode
  | FrameNode;

// Group frame: a named, coloured box; the grouped nodes are its children (they move with it).
export type FrameData = { name: string; color: string };
export type FrameNode = Node<FrameData, 'frame'>;
