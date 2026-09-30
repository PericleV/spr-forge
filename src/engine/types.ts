import type { NoteDoc } from '../notes/markup.ts';
import type { GratingParams } from './grating.ts';
import type { RoughParams, RoughSpec } from './rough.ts';
// Values flowing along edges, and the TMM job description shared with the worker.
import type { Models } from '../physics/materials.ts';
import type { Polarization } from '../physics/tmm.ts';
import type { TargetSpec } from './spec.ts';

export type Quantity = 'theta' | 'lambda';
export type SweepKind = 'number' | 'polarization';

export type Field = 'R' | 'T' | 'A' | 'phiR' | 'phiT';

// ---- TMM job (plain data, sent to the worker) ----

// A property driven by sweeps `s` (indices into TmmSpec.sweeps): v is row-major over their steps.
export type Bound<T> = { s: number[]; v: T[] };

// A Material node instance: a library material with optional swept index or pore fraction, and a
// constant index offset (used by the sensitivity analysis).
export type InstanceSpec = {
  lib: string;
  n?: Bound<number>;
  dn?: Bound<number>;
  p0?: number; // pore fraction of an effective-medium material
  p?: Bound<number>; // swept pore fraction
  fill?: 'prev' | 'next'; // effective medium: the pores hold the layer before / after (its index at the step), not the library filler
  // anisotropic (Berreman 4×4): the instances of the principal indices, the orientation angles (degrees), swept or not
  aniso?: { kind: 'uniaxial' | 'biaxial'; comps: string[]; angles: number[]; angleB: (Bound<number> | null)[] };
  dn0?: number;
  dnS?: Bound<number>; // extra Δn per step (tolerance analysis: systematic error of the material)
};

export type LayerSpec = {
  mat: string; // instance key in TmmSpec.instances
  d: number; // nm, 0 for the semi-infinite media
  dn: number; // constant offset added to Re(ñ)
  bind: { mat?: Bound<string>; d?: Bound<number>; dn?: Bound<number>; period?: Bound<number>; fill?: Bound<number>; fillTop?: Bound<number> }; // dn: per-step Δn (tolerance analysis)
  grating?: GratingParams<string>; // materials as instance keys
  lc?: LcProfile; // anisotropic layer: director profile
  flipZ?: boolean; // turned by π about y (Reverse stack)
  rough?: RoughSpec[]; // rough top / bottom interface (Roughness node)
};

// Output is row-major over [...sweeps, lambda, theta] (theta varies fastest).
export type TmmSpec = {
  models: Models; // library models by id (incl. effective-medium constituents)
  instances: Record<string, InstanceSpec>;
  layers: LayerSpec[]; // incident medium, finite layers, exit medium
  lambda: number[];
  theta: number[];
  pol: Polarization;
  polSweep?: number; // sweep index whose steps 0/1 mean p/s
  sweeps: number[]; // number of steps of each sweep
  // Thick incoherent substrate (the last entry of `layers`): back coating and exit medium, substrate thickness in nm.
  back?: { d: number; layers: LayerSpec[] }; // layers: substrate, back coating…, out medium
  thetaOffset?: Bound<number>; // added to every θ (tolerance analysis: angle error)
  // computed by RCWA (N orders each side, orders shown); asr = strength η of the adaptive spatial resolution (absent = off)
  // conical: φ ≠ 0 somewhere (the TE / TM parts of the efficiencies are output); phi: the azimuth in degrees (constant)
  // jones: an incident Jones state (ψ, δ in degrees) instead of `pol` (computed by the conical solver, TE / TM parts output)
  rcwa?: { orders: number; show: number; fact?: 'li' | 'laurent'; asr?: number; conical?: boolean; phi?: number; jones?: { psi: number; delta: number } };
  phiBind?: Bound<number>; // swept azimuth φ (RCWA, Berreman)
  // Berreman 4×4 (Compute TMM with anisotropic layers or a Jones polarization): the azimuth φ (degrees) and the state
  b4?: { phi: number; jones?: { psi: number; delta: number } };
};

export type Fields = Record<Field, Float64Array>;

export type Axis = { id: string; label: string; unit: string; values: number[]; labels?: string[] };

// `of`: id of the axis a position or width was measured along (e.g. 'lambda' for a resonance wavelength).
export type FieldMeta = { key: string; label: string; short: string; unit: string; domain?: [number, number]; of?: string };

// Row-major values over `axes`, one array per field. TMM results carry their spec (for re-runs).
export type Dataset = {
  key: string;
  axes: Axis[];
  fields: Record<string, Float64Array>;
  meta: FieldMeta[];
  size: number;
  spec?: TmmSpec;
};

// Marks added to a curve by the analysis nodes. Per-curve arrays are indexed by the combination of
// the dataset axes other than `along` (row-major), see dataset.ts `otherIndex`.
export type Annotation = { id: string; label: string; color: string; datasetKey: string; along: string } & (
  | { kind: 'points'; field: string; x: Float64Array; y: Float64Array; text?: string[] }
  | { kind: 'width'; field: string; x1: Float64Array; x2: Float64Array; level: Float64Array; text?: string[] }
  | { kind: 'curve'; dataset: Dataset }
  | { kind: 'xy'; field: string; k: number; x: ArrayLike<number>; y: ArrayLike<number>; dash?: boolean } // a curve for one plotted curve k
  | { kind: 'span'; lo: number; hi: number }
  // a zone following axis `at` (lo / hi along `along` at each y); `edit`: the analysis node and interval it belongs to
  | { kind: 'zone'; at: string; pts: { y: number; lo: number; hi: number }[]; edit: { node: string; index: number } }
  | { kind: 'area'; field: string; dataset: Dataset; lo: string; hi: string } // shaded range between two fields of `dataset` (same axes)
);

export type TmmJob = { requester: string; key: string; spec: TmmSpec; axes: Axis[] };

// ---- Port values ----

export type SweepValue = { id: string; name: string; kind: SweepKind | 'material'; values: number[]; labels?: string[] };

// Value of an objective node for the current graph; the optimizer minimizes the sum of the costs.
export type ObjectiveValue = {
  id: string;
  name: string;
  cost: number; // weighted, lower is better
  value: number; // the reduced quantity (for display)
  parts: { label: string; value: number }[];
  residuals?: number[]; // cost = Σ residuals² (curve matching), for least-squares optimizers
};

// Output of a Material node.
export type MaterialValue = {
  key: string; // Material node id: one instance per node
  id: string; // library material
  name: string;
  color: string;
  index?: { prop: 'n' | 'dn'; sweep: SweepValue };
  aniso?: AnisoValue; // an anisotropic material (Anisotropic material node): principal indices and orientation
  porosity?: number; // pore fraction override (porous materials)
  poresFill?: 'prev' | 'next'; // porous: the pores filled with the neighbouring layer (else the library filler)
  porositySweep?: SweepValue; // also the carrier density of a doped-semiconductor model (paramLabel 'N')
  paramLabel?: 'N';
};

// An anisotropic material: principal indices from Material nodes (uniaxial: n_o, n_e; biaxial: n₁, n₂, n₃) and the
// orientation in degrees (uniaxial: tilt of the optic axis from the layer plane, its azimuth from x; biaxial: Euler z-x-z
// α, β, γ), each possibly swept (a Sweep or a Design variable).
export type AnisoValue = { kind: 'uniaxial' | 'biaxial'; comps: MaterialValue[]; angles: number[]; angleSweeps: (SweepValue | null)[] };

// What a material port receives: one material, or a Material Sweep over several.
export type MatSel = { kind: 'fixed'; mat: MaterialValue } | { kind: 'swept'; sweep: SweepValue; mats: MaterialValue[] };

// A sweep a layer depends on, with the axis title to use when it is not named.
export type VaryAxis = { sweep: SweepValue; label: string; unit: string; labels?: string[] };

// Per-step values of a layer that depends on sweeps (row-major over `axes`).
export type Vary = { axes: VaryAxis[]; d?: number[]; mat?: MaterialValue[]; period?: number[]; fill?: number[]; fillTop?: number[] };

export type StackLayer = {
  key: string; // stable id (for drawing)
  label: string;
  mat: MaterialValue; // nominal material (first sweep step)
  d: number; // nm, nominal
  vary?: Vary;
  layers2D?: number; // number of monolayers for 2D materials
  group?: { id: string; name: string; periods: number; size: number }; // periodic block (for drawing)
  pad?: boolean; // empty in the nominal structure (a slot used only by some sweep steps)
  grating?: GratingParams<MaterialValue>; // 1D grating layer (RCWA): profile, period, materials
  lc?: LcProfile; // anisotropic layer: the director turns / tilts through the thickness
  flipZ?: boolean; // seen from the other side (Reverse stack): turned by π about y (anisotropic layers change)
  rough?: RoughLayer[]; // rough interfaces (Roughness nodes after the layer): at most one per side
};
// A rough interface of a layer; RMS / peak-to-peak height, correlation length and seed possibly swept.
export type RoughLayer = RoughParams & { side: 'top' | 'bottom'; node: string; sweeps: { size?: VaryAxis; cl?: VaryAxis; seed?: VaryAxis } };
// A liquid-crystal profile: the orientation of the top face turned by `twist` (degrees, about z) down to the bottom face,
// the tilt going linearly to `tiltEnd` (degrees; absent = the same), in `slices` sublayers.
// pitch (nm): the twist is 360° · d / pitch at every step (a swept thickness keeps the helix); autoSlices: one per 4.5°
export type LcProfile = { twist: number; pitch?: number; tiltEnd?: number; slices: number; autoSlices?: boolean };

// `substrate`: the exit medium is a thick plate (incoherent: no interference inside it), optionally coated on its
// back side (`back`, top → bottom from the substrate) and followed by the `out` medium (default: the incident one).
export type Substrate = { d: number; back: StackLayer[]; out?: MatSel }; // d in nm
// Layering of an RCWA field map (for profiles cut from it): regions along z, the grating slices with their segments.
export type RcwaMapRegion = { z0: number; z1: number; name: string; color: string; segs?: { from: number; to: number; name: string; color: string }[] };
export type RcwaMapInfo = { period: number; regions: RcwaMapRegion[]; point: string; label: string; unit: string };

export type StackValue = { incident?: MatSel; exit?: MatSel; layers: StackLayer[]; substrate?: Substrate };

export type PortValue =
  | { type: 'material'; sel: MatSel }
  | { type: 'param'; quantity: Quantity; values: number[] }
  | { type: 'sweep'; sweep: SweepValue }
  | { type: 'stack'; stack: StackValue }
  | { type: 'data'; dataset: Dataset | null; pending: boolean; name: string; annotations: Annotation[]; stack?: StackValue; rcwaMap?: RcwaMapInfo; goal?: TargetSpec }
  | { type: 'objective'; objective: ObjectiveValue }
  | { type: 'note'; doc: NoteDoc };

export type NodeResult = {
  errors: string[];
  warnings: string[];
  outs: Record<string, PortValue>; // keyed by source handle id
  pending?: boolean;
  info?: Record<string, unknown>;
};
