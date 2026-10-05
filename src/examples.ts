// Built-in example projects.
import type { Edge } from '@xyflow/react';
import { newComponent } from './engine/fitmodels.ts';
import { FILTER_DEFAULTS } from './engine/filters.ts';
import { OIC_A_EXAMPLE, OIC_A_TARGET_CSV, OIC_B_EXAMPLE } from './data/oic2025.ts';
import { MATERIAL_LETTERS, parseFormula } from './engine/design.ts';
import { makeLibrary } from './physics/library.ts';
import { refractiveIndex } from './physics/materials.ts';
import { tmmPoint } from './physics/tmm.ts';
import type { MaterialDef } from './physics/materials.ts';
import type { Project } from './project.ts';
import type { AppNode, ComputeData, FilterData, ParamData, TargetData } from './types.ts';
import { ROUGH_DEFAULTS, LAYER_GA_DEFAULTS, PLOT_DEFAULTS, COMPARE_DEFAULTS, DRAW_DEFAULTS, FIELD_DEFAULTS, ZONES_DEFAULTS, IMPORT_DEFAULTS, TARGET_DEFAULTS, MATCH_DEFAULTS, TOLERANCE_DEFAULTS, GRATING_DEFAULTS, RCWA_DEFAULTS, DRAWGRATING_DEFAULTS, RCWAFIELD_DEFAULTS, INFO_DEFAULTS, OPTIMIZER_DEFAULTS, fitDefaults, ANALYSIS_DEFAULTS, ANISO_DEFAULTS, materialData, KINETICS_DEFAULTS, SENSORGRAM_DEFAULTS } from './defaults.ts';
export * from './defaults.ts';

const lib = makeLibrary([]);

const param = (quantity: ParamData['quantity'], mode: ParamData['mode'], value: number, min: number, max: number, step: number): ParamData => ({
  quantity,
  mode,
  value,
  min,
  max,
  step,
});
const compute = (name: string, polarization: ComputeData['polarization'] = 'p'): ComputeData => ({ name, polarization });
const material = (id: string, materialId: string, x: number, y: number): AppNode => ({
  id,
  type: 'material',
  position: { x, y },
  data: materialData(materialId),
});
const edge = (source: string, target: string, targetHandle: string, sourceHandle = 'out'): Edge => ({
  id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});
// The positions were laid out for narrower nodes: spread them so the nodes (with their title bars) do not overlap.
const SPREAD = { x: 1.3, y: 1.18 };
const project = (nodes: AppNode[], edges: Edge[], materials: MaterialDef[] = []): Project => ({
  app: 'spr-flow',
  version: 3,
  nodes: nodes.map((n) => ({ ...n, position: { x: Math.round(n.position.x * SPREAD.x), y: Math.round(n.position.y * SPREAD.y) } })),
  edges,
  materials,
});

// Kretschmann configuration: BK7 prism / 50 nm Ag / water, 633 nm.
export const sprExample = (): Project =>
  project(
    [
      material('bk7', 'BK7', 0, 0),
      material('agm', 'Ag', -270, 200),
      { id: 'ag', type: 'layer', position: { x: 0, y: 200 }, data: { label: 'Ag film', thickness: 50, layers2D: 1 } },
      material('water', 'Water', 0, 400),
      { id: 'stack', type: 'combine', position: { x: 300, y: 150 }, data: { name: 'Kretschmann', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 300, y: -140 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'ang', type: 'param', position: { x: 300, y: 440 }, data: param('theta', 'range', 60, 40, 85, 0.05) },
      { id: 'tmm', type: 'compute', position: { x: 640, y: 60 }, data: compute('SPR') },
      { id: 'fwhm', type: 'fwhm', position: { x: 1040, y: -160 }, data: ANALYSIS_DEFAULTS.fwhm },
      { id: 'sens', type: 'sensitivity', position: { x: 1040, y: 180 }, data: ANALYSIS_DEFAULTS.sensitivity },
      { id: 'plot', type: 'plot', position: { x: 1440, y: -40 }, data: PLOT_DEFAULTS },
      {
        id: 'fit',
        type: 'fit',
        position: { x: 1440, y: 420 },
        data: { ...fitDefaults(), components: [newComponent('baseline'), newComponent('fano')], lo: 60, hi: 80 },
      },
      { id: 'draw', type: 'draw', position: { x: 640, y: 500 }, data: DRAW_DEFAULTS },
      { id: 'field', type: 'field', position: { x: 2000, y: -40 }, data: FIELD_DEFAULTS },
    ],
    [
      edge('agm', 'ag', 'mat'),
      edge('bk7', 'stack', 'incident'),
      edge('ag', 'stack', 'item-0'),
      edge('water', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('ang', 'tmm', 'theta'),
      edge('tmm', 'fwhm', 'in'),
      edge('fwhm', 'sens', 'in'),
      edge('sens', 'plot', 'in'),
      edge('tmm', 'fit', 'in'),
      edge('sens', 'field', 'in'),
      edge('stack', 'draw', 'in'),
    ],
  );

// Fabry–Pérot microcavity between two TiO₂/SiO₂ Bragg mirrors, at normal and oblique incidence.
export const dbrExample = (): Project =>
  project(
    [
      material('air', 'Air', -280, 0),
      material('tio2', 'TiO2', -280, 170),
      material('sio2', 'SiO2', -280, 340),
      material('bk7', 'BK7', -280, 510),
      {
        id: 'dbr',
        type: 'dbr',
        position: { x: 0, y: 0 },
        data: {
          name: 'Microcavity',
          period: [
            { mode: 'qw', d: 60, label: '', layers2D: 1 },
            { mode: 'qw', d: 100, label: '', layers2D: 1 },
          ],
          periods: 12,
          closing: false,
          mirrorAfterCavity: true,
          lambda0: 650,
          cavities: [{ after: 6, mode: 'half', d: 220, m: 2, layers2D: 1 }],
        },
      },
      { id: 'wl', type: 'param', position: { x: 0, y: 660 }, data: param('lambda', 'range', 650, 450, 900, 0.5) },
      { id: 'th0', type: 'param', position: { x: 480, y: 620 }, data: param('theta', 'constant', 0, 40, 85, 0.05) },
      { id: 'th30', type: 'param', position: { x: 480, y: 780 }, data: param('theta', 'constant', 30, 40, 85, 0.05) },
      { id: 'tmm0', type: 'compute', position: { x: 480, y: 0 }, data: compute('0°') },
      { id: 'tmm30', type: 'compute', position: { x: 480, y: 300 }, data: compute('30° TM') },
      { id: 'cmp', type: 'compare', position: { x: 920, y: 0 }, data: COMPARE_DEFAULTS },
      { id: 'draw', type: 'draw', position: { x: 920, y: 620 }, data: { ...DRAW_DEFAULTS, light: 'center' } },
    ],
    [
      edge('air', 'dbr', 'incident'),
      edge('tio2', 'dbr', 'p0'),
      edge('sio2', 'dbr', 'p1'),
      edge('sio2', 'dbr', 'c0'),
      edge('bk7', 'dbr', 'exit'),
      edge('dbr', 'tmm0', 'stack'),
      edge('dbr', 'tmm30', 'stack'),
      edge('wl', 'tmm0', 'lambda'),
      edge('wl', 'tmm30', 'lambda'),
      edge('th0', 'tmm0', 'theta'),
      edge('th30', 'tmm30', 'theta'),
      edge('tmm0', 'cmp', 'in'),
      edge('tmm30', 'cmp', 'in'),
      edge('dbr', 'draw', 'in'),
    ],
  );

// Strong coupling: an excitonic layer (one Lorentz oscillator at 1.9 eV ≈ 652.5 nm) as the cavity of a
// TiO₂/SiO₂ microcavity; sweeping the cavity thickness gives the polariton anticrossing, whose two
// branches are found by a FWHM node and fitted with the coupled-oscillator dispersion.
export const strongCouplingExample = (): Project =>
  project(
    [
      material('air', 'Air', -280, 0),
      material('tio2', 'TiO2', -280, 170),
      material('sio2', 'SiO2', -280, 340),
      { id: 'exc', type: 'material', position: { x: -280, y: 510 }, data: { ...materialData('user-exciton'), color: '#c24fbd' } },
      material('bk7', 'BK7', -280, 680),
      {
        id: 'dc',
        type: 'sweep',
        position: { x: -280, y: 860 },
        data: { name: 'cavity d', kind: 'number', mode: 'range', min: 150, max: 260, step: 5, list: '' },
      },
      {
        id: 'dbr',
        type: 'dbr',
        position: { x: 0, y: 0 },
        data: {
          name: 'Microcavity',
          period: [
            { mode: 'qw', d: 60, label: '', layers2D: 1 },
            { mode: 'qw', d: 100, label: '', layers2D: 1 },
          ],
          periods: 12,
          closing: false,
          mirrorAfterCavity: true,
          lambda0: 652.5,
          cavities: [{ after: 6, mode: 'nm', d: 200, m: 1, layers2D: 1 }],
        },
      },
      { id: 'wl', type: 'param', position: { x: 0, y: 700 }, data: param('lambda', 'range', 650, 560, 760, 0.5) },
      { id: 'th', type: 'param', position: { x: 0, y: 900 }, data: param('theta', 'constant', 0, 40, 85, 0.05) },
      { id: 'tmm', type: 'compute', position: { x: 480, y: 0 }, data: compute('Cavity') },
      {
        id: 'fwhm',
        type: 'fwhm',
        position: { x: 480, y: 330 },
        data: { ...ANALYSIS_DEFAULTS.fwhm, along: 'lambda', intervals: [{ lo: 590, hi: 652.5 }, { lo: 652.5, hi: 720 }] },
      },
      { id: 'plot', type: 'plot', position: { x: 900, y: -60 }, data: { ...PLOT_DEFAULTS, mode: 'map', x: 'lambda', y: 'sweep:dc' } },
      {
        id: 'fit',
        type: 'fit',
        position: { x: 900, y: 420 },
        data: { ...fitDefaults(), mode: 'dispersion', along: 'sweep:dc', branch1: 'c0', branch2: 'c1', color: '#59a14f' },
      },
    ],
    [
      edge('air', 'dbr', 'incident'),
      edge('tio2', 'dbr', 'p0'),
      edge('sio2', 'dbr', 'p1'),
      edge('exc', 'dbr', 'c0'),
      edge('bk7', 'dbr', 'exit'),
      edge('dc', 'dbr', 'cavd'),
      edge('dbr', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'fwhm', 'in'),
      edge('fwhm', 'plot', 'in'),
      edge('fwhm', 'fit', 'in', 'metrics'),
    ],
    [
      {
        id: 'user-exciton',
        name: 'Exciton layer (Lorentz)',
        color: '#c24fbd',
        model: { type: 'drude-lorentz', epsInf: 2.56, wp: 0, gamma: 0, osc: [{ f: 0.06, w0: 1.9, g: 0.05 }] },
        source: 'Example material: ε∞ = 2.56 with one Lorentz oscillator, E₀ = 1.9 eV (652.5 nm), γ = 50 meV',
      },
    ],
  );

// The same microcavity at a fixed thickness, red-detuned at normal incidence: the angle tunes the cavity mode
// (E_c(θ) = E₀/√(1 − sin²θ/n_eff²)) through the exciton; the Fit node's angle model gives E₀, n_eff and Ω.
export const strongCouplingAngleExample = (): Project => {
  const p = strongCouplingExample();
  const nodes: AppNode[] = p.nodes
    .filter((n) => n.id !== 'dc')
    .map((n) => {
      if (n.type === 'dbr') return { ...n, data: { ...n.data, cavities: n.data.cavities.map((c) => ({ ...c, d: 215 })) } };
      if (n.id === 'th') return { ...n, data: param('theta', 'range', 0, 0, 40, 0.5) } as AppNode;
      if (n.type === 'plot') return { ...n, data: { ...n.data, y: 'theta' } };
      // the upper-λ branch (684 nm at 0°, 663.5 nm at 40°) in a zone that follows θ: a fixed 652.5–720 nm interval takes
      // the edge of the mirror stop band instead (R ≈ 0 at 750 → 724 nm from 30° on)
      if (n.type === 'fwhm')
        return { ...n, data: { ...n.data, intervals: [n.data.intervals[0], { lo: 652.5, hi: 720, path: { at: 'theta', pts: [{ y: 0, lo: 652.5, hi: 705 }, { y: 40, lo: 645, hi: 690 }] } }] } };
      // beyond ~32° the lower branch (exciton-like) is too weak for FWHM: fit 0–30°
      if (n.type === 'fit') return { ...n, data: { ...n.data, along: 'theta', mode2: 'angle', lo: 0, hi: 30 } };
      return n;
    });
  nodes.unshift({
    id: 'note',
    type: 'info',
    position: { x: -760, y: 0 },
    data: {
      ...INFO_DEFAULTS,
      title: 'Polaritons vs angle',
      text: 'DBR microcavity with an excitonic layer (652.5 nm), cavity 215 nm: at θ = 0 the cavity mode is red of the exciton; tilting blue-shifts it through the exciton.\n\nFWHM finds the two branches along λ for every θ; Fit (coupled-oscillator dispersion, mode 2 = cavity vs angle) returns λ₀ of the cavity, n_eff, the splitting Ω and the angle of zero detuning.',
      width: 300,
      height: 250,
    },
  });
  return { ...p, nodes, edges: p.edges.filter((e) => e.source !== 'dc') };
};

// Dual-band absorber: Ag mirror under two thin Cr absorbers separated by SiO₂ spacers. The optimizer
// adjusts the five thicknesses so that absorption is high in two bands and low elsewhere.
export const absorberExample = (): Project => {
  const variable = (id: string, name: string, value: number, min: number, max: number, x: number, y: number): AppNode => ({
    id,
    type: 'variable',
    position: { x, y },
    data: { name, value, min, max, integer: false },
  });
  const layer = (id: string, label: string, thickness: number, x: number, y: number): AppNode => ({
    id,
    type: 'layer',
    position: { x, y },
    data: { label, thickness, layers2D: 1 },
  });
  return project(
    [
      material('air', 'Air', -600, -200),
      material('sio2', 'SiO2', -600, 120),
      material('cr', 'Cr', -600, 330),
      material('ag', 'Ag', -600, 540),
      material('bk7', 'BK7', -600, 750),
      variable('v3', 'd top SiO₂', 80, 20, 300, -900, -60),
      variable('vt2', 't upper Cr', 6, 2, 20, -900, 150),
      variable('v2', 'd middle SiO₂', 150, 20, 400, -900, 360),
      variable('vt1', 't lower Cr', 6, 2, 20, -900, 570),
      variable('v1', 'd bottom SiO₂', 100, 20, 400, -900, 780),
      layer('l3', 'top SiO₂', 80, -300, -120),
      layer('l5', 'upper Cr', 6, -300, 40),
      layer('l2', 'middle SiO₂', 150, -300, 200),
      layer('l4', 'lower Cr', 6, -300, 360),
      layer('l1', 'bottom SiO₂', 100, -300, 520),
      layer('lm', 'Ag mirror', 100, -300, 680),
      { id: 'stack', type: 'combine', position: { x: 20, y: 150 }, data: { name: 'Absorber', count: 6 } },
      { id: 'wl', type: 'param', position: { x: 20, y: -170 }, data: param('lambda', 'range', 650, 400, 900, 2) },
      { id: 'th', type: 'param', position: { x: 20, y: 560 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 360, y: 60 }, data: compute('Absorber') },
      { id: 'plot', type: 'plot', position: { x: 760, y: -140 }, data: { ...PLOT_DEFAULTS, field: 'A' } },
      {
        id: 'zones',
        type: 'zones',
        position: { x: 760, y: 330 },
        data: {
          ...ZONES_DEFAULTS,
          name: 'two absorption bands',
          along: 'lambda',
          zones: [
            { lo: 480, hi: 530, field: 'A', goal: 'max', target: 1, weight: 1 },
            { lo: 680, hi: 730, field: 'A', goal: 'max', target: 1, weight: 1 },
          ],
          outside: 'min',
          outsideField: 'A',
          outsideWeight: 0.5,
        },
      },
      { id: 'opt', type: 'optimizer', position: { x: 1300, y: 330 }, data: { ...OPTIMIZER_DEFAULTS, iterations: 150, params: { adam: { stall: 80, decay: 1, stage1Iter: 0 } } } }, // plain Adam (constant lr, early stop)
      { id: 'draw', type: 'draw', position: { x: -300, y: 860 }, data: { ...DRAW_DEFAULTS, light: 'center' } },
    ],
    [
      edge('sio2', 'l3', 'mat'),
      edge('cr', 'l5', 'mat'),
      edge('sio2', 'l2', 'mat'),
      edge('cr', 'l4', 'mat'),
      edge('sio2', 'l1', 'mat'),
      edge('ag', 'lm', 'mat'),
      edge('v3', 'l3', 'd'),
      edge('vt2', 'l5', 'd'),
      edge('v2', 'l2', 'd'),
      edge('vt1', 'l4', 'd'),
      edge('v1', 'l1', 'd'),
      edge('air', 'stack', 'incident'),
      edge('l3', 'stack', 'item-0'),
      edge('l5', 'stack', 'item-1'),
      edge('l2', 'stack', 'item-2'),
      edge('l4', 'stack', 'item-3'),
      edge('l1', 'stack', 'item-4'),
      edge('lm', 'stack', 'item-5'),
      edge('bk7', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      // the plot shows the absorption with the zones and the step target (Zones → data + target)
      edge('zones', 'plot', 'in', 'marked'),
      edge('tmm', 'zones', 'in'),
      edge('zones', 'opt', 'obj'),
      edge('stack', 'draw', 'in'),
    ],
  );
};

// Thin-film metrology: a "measured" reflectance of TiO₂ / SiO₂ on Si (synthetic, with noise) is imported
// and the two thicknesses are recovered by least squares (Levenberg-Marquardt on the Curve match residuals).
export const METROLOGY_TRUTH = { tio2: 58, sio2: 305 };
export function syntheticReflectance(dTiO2: number, dSiO2: number, noise = 0.004): string {
  const models = Object.fromEntries([...lib].map(([id, d]) => [id, d.model]));
  const rows = ['wavelength_nm, R'];
  for (let l = 400; l <= 1000; l += 5) {
    const layers = ['Air', 'TiO2', 'SiO2', 'Si'].map((id, i) => ({ n: refractiveIndex(id, models, l), d: [0, dTiO2, dSiO2, 0][i] }));
    const R = tmmPoint(layers, l, 0, 's').R;
    const jitter = noise * Math.sin(l * 12.9898 + 78.233) * Math.cos(l * 3.17); // deterministic pseudo-noise
    rows.push(`${l}, ${(R + jitter).toFixed(5)}`);
  }
  return rows.join('\n');
}

export const metrologyExample = (): Project => {
  const variable = (id: string, name: string, value: number, min: number, max: number, x: number, y: number): AppNode => ({
    id,
    type: 'variable',
    position: { x, y },
    data: { name, value, min, max, integer: false },
  });
  return project(
    [
      material('air', 'Air', -600, -120),
      material('tio2', 'TiO2', -600, 90),
      material('sio2', 'SiO2', -600, 300),
      material('si', 'Si', -600, 510),
      variable('v1', 'd TiO₂', 40, 10, 150, -900, 60),
      variable('v2', 'd SiO₂', 280, 150, 450, -900, 270),
      { id: 'l1', type: 'layer', position: { x: -300, y: 60 }, data: { label: 'TiO₂', thickness: 40, layers2D: 1 } },
      { id: 'l2', type: 'layer', position: { x: -300, y: 240 }, data: { label: 'SiO₂', thickness: 280, layers2D: 1 } },
      { id: 'stack', type: 'combine', position: { x: 20, y: 120 }, data: { name: 'Film on Si', count: 2 } },
      { id: 'wl', type: 'param', position: { x: 20, y: -170 }, data: param('lambda', 'range', 650, 400, 1000, 2) },
      { id: 'th', type: 'param', position: { x: 20, y: 420 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 360, y: 60 }, data: compute('Film', 's') },
      {
        id: 'meas',
        type: 'import',
        position: { x: 360, y: 420 },
        data: { ...IMPORT_DEFAULTS, name: 'measured R', fileName: 'film_R.csv (synthetic)', text: syntheticReflectance(METROLOGY_TRUTH.tio2, METROLOGY_TRUTH.sio2) },
      },
      { id: 'match', type: 'match', position: { x: 820, y: 260 }, data: { ...MATCH_DEFAULTS, name: 'R vs measurement' } },
      { id: 'cmp', type: 'compare', position: { x: 820, y: -260 }, data: COMPARE_DEFAULTS },
      { id: 'opt', type: 'optimizer', position: { x: 1320, y: 260 }, data: { ...OPTIMIZER_DEFAULTS, algorithm: 'lm', iterations: 60 } },
    ],
    [
      edge('tio2', 'l1', 'mat'),
      edge('sio2', 'l2', 'mat'),
      edge('v1', 'l1', 'd'),
      edge('v2', 'l2', 'd'),
      edge('air', 'stack', 'incident'),
      edge('l1', 'stack', 'item-0'),
      edge('l2', 'stack', 'item-1'),
      edge('si', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'match', 'in'),
      edge('meas', 'match', 'target'),
      edge('tmm', 'cmp', 'in'),
      edge('meas', 'cmp', 'in'),
      edge('match', 'opt', 'obj'),
    ],
  );
};

// SPR sensor design: the Ag thickness is optimized for a deep, narrow and sensitive resonance with a custom
// objective 0.5·R(dip) + 0.25·FWHM/5° − 0.25·S/100 °/RIU. The optimizer outputs compare start and optimized designs.
export const sprDesignExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -320, y: -330 },
        data: {
          ...INFO_DEFAULTS,
          title: 'SPR sensor design',
          text: 'Kretschmann BK7 / Ag / water at 633 nm. The Ag thickness (Design variable) is optimized for a deep (low R at the dip), narrow (FWHM) and sensitive (S) resonance.\n\nCustom objective: 0.5·a + 0.25·b/5 − 0.25·c/100, minimized (a = R at the dip, b = FWHM in °, c = S in °/RIU; the divisions put the terms on similar scales).\n\nAfter Start: Plot shows start vs optimized, View Stack shows the optimized stack.',
          width: 330,
          height: 250,
        },
      },
      material('bk7', 'BK7', 0, 0),
      material('agm', 'Ag', -270, 200),
      { id: 'vd', type: 'variable', position: { x: -320, y: 380 }, data: { name: 'd Ag', value: 35, min: 25, max: 75, integer: false } },
      { id: 'ag', type: 'layer', position: { x: 0, y: 200 }, data: { label: 'Ag film', thickness: 35, layers2D: 1 } },
      material('water', 'Water', 0, 400),
      { id: 'stack', type: 'combine', position: { x: 300, y: 150 }, data: { name: 'Kretschmann', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 300, y: -140 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'ang', type: 'param', position: { x: 300, y: 440 }, data: param('theta', 'range', 65, 60, 80, 0.02) },
      { id: 'tmm', type: 'compute', position: { x: 640, y: 60 }, data: compute('SPR') },
      { id: 'fwhm', type: 'fwhm', position: { x: 1040, y: -160 }, data: ANALYSIS_DEFAULTS.fwhm },
      { id: 'sens', type: 'sensitivity', position: { x: 1040, y: 180 }, data: ANALYSIS_DEFAULTS.sensitivity },
      {
        id: 'obj',
        type: 'formula',
        position: { x: 1440, y: 180 },
        data: {
          name: 'deep, narrow, sensitive',
          terms: [
            { name: 'a', source: 'fwhm:metrics', field: 'e0', stat: 'mean' },
            { name: 'b', source: 'fwhm:metrics', field: 'w0', stat: 'mean' },
            { name: 'c', source: 'sens:metrics', field: 'S', stat: 'mean' },
          ],
          expr: '0.5*a + 0.25*b/5 - 0.25*c/100',
          goal: 'min',
          weight: 1,
        },
      },
      { id: 'opt', type: 'optimizer', position: { x: 1980, y: 180 }, data: { ...OPTIMIZER_DEFAULTS, algorithm: 'nm', iterations: 60 } },
      { id: 'plot', type: 'plot', position: { x: 2520, y: -160 }, data: PLOT_DEFAULTS },
      { id: 'draw', type: 'draw', position: { x: 2520, y: 380 }, data: DRAW_DEFAULTS },
    ],
    [
      edge('agm', 'ag', 'mat'),
      edge('vd', 'ag', 'd'),
      edge('bk7', 'stack', 'incident'),
      edge('ag', 'stack', 'item-0'),
      edge('water', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('ang', 'tmm', 'theta'),
      edge('tmm', 'fwhm', 'in'),
      edge('fwhm', 'sens', 'in'),
      edge('fwhm', 'obj', 'in', 'metrics'),
      edge('sens', 'obj', 'in', 'metrics'),
      edge('obj', 'opt', 'obj'),
      edge('opt', 'plot', 'in'),
      edge('opt', 'draw', 'in', 'stack'),
    ],
  );

// Thin-film filter design: a long-pass edge filter of TiO₂ / SiO₂ on BK7 designed by needle + gradual evolution.
export const filterExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -320 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Filter designer',
          text: 'Long-pass edge filter: T = 0 for 400–520 nm, T = 1 for 580–800 nm, TiO₂ (H) / SiO₂ (L) on BK7.\n\nPress Start in the Filter designer: it starts from a quarter-wave stack, inserts layers where the needle function says they help, adds layers by gradual evolution when the needles are exhausted, and refines all thicknesses (analytic gradients).\n\nOther types (AR, band-pass, notch, mirror) in the “type” menu; tick “thick substrate” to include the back face of the plate (or to design the back coating).',
          width: 360,
          height: 280,
        },
      },
      material('air', 'Air', -620, 0),
      material('tio2', 'TiO2', -620, 180),
      material('sio2', 'SiO2', -620, 360),
      material('bk7', 'BK7', -620, 540),
      { id: 'filter', type: 'filter', position: { x: -280, y: -40 }, data: { ...FILTER_DEFAULTS } },
      { id: 'wl', type: 'param', position: { x: 320, y: -200 }, data: param('lambda', 'range', 600, 400, 850, 1) },
      { id: 'th', type: 'param', position: { x: 320, y: 360 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 320, y: 60 }, data: { ...compute('Filter'), polarization: 's' } },
      { id: 'plot', type: 'plot', position: { x: 720, y: -200 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      { id: 'draw', type: 'draw', position: { x: 720, y: 360 }, data: { ...DRAW_DEFAULTS, scale: 'proportional', compress: false, light: 'center' } },
    ],
    [
      edge('tio2', 'filter', 'm0'),
      edge('sio2', 'filter', 'm1'),
      edge('air', 'filter', 'incident'),
      edge('bk7', 'filter', 'sub'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
      edge('filter', 'draw', 'in'),
    ],
  );

// Tolerance analysis: a 7-layer AR coating (designed with the Filter designer) under random thickness errors.
export const toleranceExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -340 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Tolerance analysis',
          text: '7-layer TiO₂ / SiO₂ AR coating on BK7 (a Filter designer result), 1 % random thickness errors (normal, limited to ±3σ), 300 samples.\n\nThe Tolerance node shows the nominal R, the mean and the p5–p95 range, the yield for R ≤ 0.5 % on 450–700 nm and which layers matter most.\n\nOutputs: statistics (left Plot: choose R mean / median / σ …), all samples, and the errors of each sample (right Plot: histogram of the RMS deviation).',
          width: 360,
          height: 280,
        },
      },
      material('air', 'Air', -620, 0),
      material('tio2', 'TiO2', -620, 180),
      material('sio2', 'SiO2', -620, 360),
      material('bk7', 'BK7', -620, 540),
      {
        id: 'filter',
        type: 'filter',
        position: { x: -280, y: -40 },
        data: {
          ...FILTER_DEFAULTS,
          preset: 'ar',
          bands: [{ lo: 450, hi: 700, q: 'R', value: 0, weight: 1 }],
          lmin: 400,
          lmax: 750,
          lambdaRef: 550,
          start: 'current',
          design: {
            front: [
              { m: 1, d: 94.0 },
              { m: 0, d: 74.9 },
              { m: 1, d: 13.2 },
              { m: 0, d: 36.1 },
              { m: 1, d: 59.5 },
              { m: 0, d: 6.1 },
              { m: 1, d: 109.3 },
            ],
            back: [],
          },
        },
      },
      { id: 'wl', type: 'param', position: { x: 320, y: -200 }, data: param('lambda', 'range', 550, 400, 750, 2) },
      { id: 'th', type: 'param', position: { x: 320, y: 390 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 320, y: 60 }, data: { ...compute('AR'), polarization: 's' } },
      {
        id: 'tol',
        type: 'tolerance',
        position: { x: 760, y: -40 },
        data: { ...TOLERANCE_DEFAULTS, samples: 300, spec: true, specBands: [{ lo: 450, hi: 700, q: 'R', min: 0, max: 0.005 }] },
      },
      { id: 'plot', type: 'plot', position: { x: 1340, y: -260 }, data: { ...PLOT_DEFAULTS, field: 'R', autoY: true } },
      { id: 'hist', type: 'plot', position: { x: 1340, y: 420 }, data: { ...PLOT_DEFAULTS, field: 'dev' } },
    ],
    [
      edge('tio2', 'filter', 'm0'),
      edge('sio2', 'filter', 'm1'),
      edge('air', 'filter', 'incident'),
      edge('bk7', 'filter', 'sub'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'tol', 'in'),
      edge('tol', 'plot', 'in'),
      edge('tol', 'hist', 'in', 'errors'),
    ],
  );

// SPR by grating coupling (RCWA): a gold grating on gold, light from air. The −1 order couples to the surface plasmon
// when n₀ sin θ − λ/Λ = −Re √(ε_m ε_d / (ε_m + ε_d)) (shallow-grating limit).
export const gratingSprExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -360 },
        data: {
          ...INFO_DEFAULTS,
          title: 'SPR by grating coupling (RCWA)',
          text: 'Gold grating (Λ = 500 nm, 40 nm deep, fill 0.5) on gold, 633 nm, light from air. The −1 order excites the surface plasmon (TM): for a shallow grating sin θ = λ/Λ − n_sp, n_sp = Re √(ε_Au/(ε_Au + 1)) → θ ≈ 12.8°; the 40 nm deep grating shifts the dip to ≈ 10.5° (try a smaller depth).\n\nCompute RCWA: 15 orders. Plot: R total and the orders. The RCWA field map (press Run) shows the plasmon at the dip; the Field profile node cuts it along z at a chosen x; View Grating shows the profile.',
          width: 360,
          height: 260,
        },
      },
      material('air', 'Air', -620, -40),
      material('au', 'Au', -620, 170),
      { id: 'gr', type: 'grating', position: { x: -300, y: -40 }, data: { ...GRATING_DEFAULTS, label: 'Au grating', period: 500, thickness: 40, fill: 0.5 } },
      { id: 'stack', type: 'combine', position: { x: 60, y: 60 }, data: { name: 'Grating on gold', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 60, y: -200 }, data: param('lambda', 'constant', 633, 500, 900, 1) },
      { id: 'th', type: 'param', position: { x: 60, y: 330 }, data: param('theta', 'range', 12, 0, 30, 0.1) },
      { id: 'rc', type: 'rcwa', position: { x: 440, y: 40 }, data: { ...RCWA_DEFAULTS, name: 'SPR grating', orders: 15, show: 1 } },
      { id: 'fwhm', type: 'fwhm', position: { x: 900, y: -260 }, data: ANALYSIS_DEFAULTS.fwhm },
      { id: 'plot', type: 'plot', position: { x: 1360, y: -300 }, data: PLOT_DEFAULTS },
      { id: 'fm', type: 'rcwafield', position: { x: 900, y: 240 }, data: { ...RCWAFIELD_DEFAULTS, periods: 2, zIn: 400, zOut: 150 } },
      { id: 'dg', type: 'drawgrating', position: { x: -300, y: 540 }, data: DRAWGRATING_DEFAULTS },
      { id: 'cut', type: 'field', position: { x: 1500, y: 240 }, data: FIELD_DEFAULTS },
    ],
    [
      edge('air', 'gr', 'groove'),
      edge('au', 'gr', 'ridge'),
      edge('air', 'stack', 'incident'),
      edge('gr', 'stack', 'item-0'),
      edge('au', 'stack', 'exit'),
      edge('stack', 'rc', 'stack'),
      edge('wl', 'rc', 'lambda'),
      edge('th', 'rc', 'theta'),
      edge('rc', 'fwhm', 'in'),
      edge('fwhm', 'plot', 'in'),
      edge('rc', 'fm', 'in'),
      edge('fm', 'cut', 'in'),
      edge('gr', 'dg', 'in'),
    ],
  );

// Grating-coupled SPR under conical incidence: the plane of incidence turned by φ from the grating vector. The order −1
// matches the plasmon when |k∥ − K x̂| = n_sp: sin θ = (λ/Λ) cos φ − √(n_sp² − (λ/Λ)² sin² φ) — the dip moves to larger θ
// with φ, and part of the TM light is reflected as TE (polarization conversion, zero at φ = 0).
export const conicalSprExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'SPR by grating coupling, conical incidence',
          text:
            'Gold grating (Λ = 500 nm, 10 nm deep, fill 0.5) on gold, 633 nm, TM light from air, the plane of incidence turned by the azimuth φ from the grating vector (Compute RCWA: φ port, here a Sweep 0 / 15 / 30 / 45°).\n\n' +
            'The order −1 excites the plasmon when |k∥ − K x̂| = n_sp, n_sp = Re √(ε_Au/(ε_Au + 1)): sin θ = (λ/Λ) cos φ − √(n_sp² − (λ/Λ)² sin² φ) → 12.8° / 13.3° / 15.4° / 20.9° for φ = 0 / 15 / 30 / 45° (a shallow grating; this 10 nm one shifts the dips by ≈ −0.2° to −0.4°). ' +
            'Min / max finds the dip of each φ. At φ ≠ 0 TE and TM are coupled: the second plot shows the TM light reflected as TE (R into TE), zero at φ = 0. The RCWA field map (press Run) shows the plasmon at the dip of φ = 30°, with all six field components (conical incidence).\n\n' +
            'Validation: conical RCWA = RETICOLO (res1 with delta0) on 19 cases, efficiencies and their TE / TM parts to 1e-11.',
          width: 380,
          height: 300,
        },
      },
      material('air', 'Air', -620, -40),
      material('au', 'Au', -620, 170),
      { id: 'gr', type: 'grating', position: { x: -300, y: -40 }, data: { ...GRATING_DEFAULTS, label: 'Au grating', period: 500, thickness: 10, fill: 0.5 } },
      { id: 'stack', type: 'combine', position: { x: 60, y: 60 }, data: { name: 'Grating on gold', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 60, y: -200 }, data: param('lambda', 'constant', 633, 500, 900, 1) },
      { id: 'th', type: 'param', position: { x: 60, y: 330 }, data: param('theta', 'range', 20, 8, 26, 0.05) },
      { id: 'phi', type: 'sweep', position: { x: 60, y: 560 }, data: { name: 'φ', kind: 'number', mode: 'list', min: 0, max: 45, step: 15, list: '0, 15, 30, 45' } },
      { id: 'rc', type: 'rcwa', position: { x: 440, y: 40 }, data: { ...RCWA_DEFAULTS, name: 'SPR grating, conical', orders: 15, show: 1 } },
      { id: 'dip', type: 'extremum', position: { x: 900, y: -300 }, data: { ...ANALYSIS_DEFAULTS.extremum, mode: 'min', field: 'R' } },
      { id: 'plot', type: 'plot', position: { x: 1360, y: -320 }, data: PLOT_DEFAULTS },
      { id: 'conv', type: 'plot', position: { x: 1360, y: 260 }, data: { ...PLOT_DEFAULTS, field: 'R_TE' } },
      { id: 'fm', type: 'rcwafield', position: { x: 900, y: 420 }, data: { ...RCWAFIELD_DEFAULTS, periods: 2, zIn: 400, zOut: 150, at: { 'sweep:phi': 2 } } },
    ],
    [
      edge('air', 'gr', 'groove'),
      edge('au', 'gr', 'ridge'),
      edge('air', 'stack', 'incident'),
      edge('gr', 'stack', 'item-0'),
      edge('au', 'stack', 'exit'),
      edge('stack', 'rc', 'stack'),
      edge('wl', 'rc', 'lambda'),
      edge('th', 'rc', 'theta'),
      edge('phi', 'rc', 'phi'),
      edge('rc', 'dip', 'in'),
      edge('dip', 'plot', 'in'),
      edge('rc', 'conv', 'in'),
      edge('rc', 'fm', 'in'),
    ],
  );

// Convergence of RCWA with the number of orders N (the gold grating of the grating-coupled SPR example): a Sweep on the
// orders port computes every step at its own N. The dip (FWHM node) gives θ_res and the width for each N; Extract data
// takes R at a chosen angle (interpolated) for each N; Custom data compares θ_res with the
// shallow-grating condition sin θ = λ/Λ − n_sp, n_sp = Re √(ε/(ε + 1)) from the gold Material itself.
export const CONV_N = [10, 15, 20, 30, 40];
export const rcwaConvergenceExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -380 },
        data: {
          ...INFO_DEFAULTS,
          title: 'RCWA convergence vs the orders N',
          text: 'The gold grating of “SPR by grating coupling” (Λ = 500 nm, 40 nm deep, fill 0.5, 633 nm, TM). A Sweep (N = 10, 15, 20, 30, 40) on the orders port of Compute RCWA: every step is computed at its own N and the data get an axis “orders N”. FWHM: the dip angle and width for each N (plot vs N). Extract data: R at θ = 10.5° (interpolated between the computed angles) for each N. Custom data: the gold Material gives ε and n_sp = Re √(ε/(ε + 1)); the shallow-grating angle asin(λ/Λ − n_sp) = 12.8° against the computed dip (the 40 nm grating pulls it down by ≈ 2.2°). Metal gratings in TM converge slowly and not monotonically: here the dip angle settles within ±0.05° while R at the dip still moves between 0.04 and 0.08 up to N = 40 — take N from such a study, for the quantity you report.',
          width: 380,
          height: 300,
        },
      },
      material('air', 'Air', -620, -40),
      material('au', 'Au', -620, 170),
      { id: 'gr', type: 'grating', position: { x: -300, y: -40 }, data: { ...GRATING_DEFAULTS, label: 'Au grating', period: 500, thickness: 40, fill: 0.5 } },
      { id: 'stack', type: 'combine', position: { x: 60, y: 60 }, data: { name: 'Grating on gold', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 60, y: -200 }, data: param('lambda', 'constant', 633, 500, 900, 1) },
      { id: 'th', type: 'param', position: { x: 60, y: 330 }, data: param('theta', 'range', 10, 8, 13, 0.02) },
      { id: 'ns', type: 'sweep', position: { x: 60, y: 600 }, data: { name: 'orders N', kind: 'number', mode: 'list', min: 5, max: 40, step: 5, list: CONV_N.join(', ') } },
      { id: 'rc', type: 'rcwa', position: { x: 440, y: 40 }, data: { ...RCWA_DEFAULTS, name: 'Au grating', orders: 20, show: 1 } },
      { id: 'plotR', type: 'plot', position: { x: 900, y: -420 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
      { id: 'fwhm', type: 'fwhm', position: { x: 900, y: 160 }, data: { ...ANALYSIS_DEFAULTS.fwhm, along: 'theta' } },
      { id: 'plotRes', type: 'plot', position: { x: 1360, y: 160 }, data: { ...PLOT_DEFAULTS, field: 'c0' } },
      { id: 'xR', type: 'extract', position: { x: 900, y: 640 }, data: { name: 'R at 10.5° vs N', fields: ['R'], fixed: {}, at: { theta: 10.5 } } },
      { id: 'plotD', type: 'plot', position: { x: 1360, y: 640 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
      {
        id: 'cu',
        type: 'custom',
        position: { x: 1820, y: 160 },
        data: {
          name: 'dip vs the shallow-grating angle',
          rows: [
            { name: 'n_sp', expr: 'real(sqrt(b_eps / (b_eps + 1)))' },
            { name: 'theta_shallow', expr: 'deg(asin(633 / 500 - real(sqrt(b_eps / (b_eps + 1)))))' },
            { name: 'shift', expr: 'a_theta - deg(asin(633 / 500 - real(sqrt(b_eps / (b_eps + 1)))))' },
          ],
          aliases: { 'fwhm:metrics': 'a', 'au:out': 'b' },
        },
      },
    ],
    [
      edge('air', 'gr', 'groove'),
      edge('au', 'gr', 'ridge'),
      edge('air', 'stack', 'incident'),
      edge('gr', 'stack', 'item-0'),
      edge('au', 'stack', 'exit'),
      edge('stack', 'rc', 'stack'),
      edge('wl', 'rc', 'lambda'),
      edge('th', 'rc', 'theta'),
      edge('ns', 'rc', 'orders'),
      edge('rc', 'plotR', 'in'),
      edge('rc', 'fwhm', 'in'),
      edge('fwhm', 'plotRes', 'in', 'metrics'),
      edge('rc', 'xR', 'in'),
      edge('xR', 'plotD', 'in'),
      edge('fwhm', 'cu', 'in', 'metrics'),
      edge('au', 'cu', 'in'),
    ],
  );

// Guided-mode resonance filter (RCWA + optimization): a TiO₂ grating on glass reflects a narrow band where the +/−1
// orders excite a leaky mode. Period, fill factor and depth are Design variables; the Zones objective asks for R = 1
// at 600 nm and R = 0 elsewhere.
export const gmrExample = (): Project => {
  const variable = (id: string, name: string, value: number, min: number, max: number, x: number, y: number): AppNode => ({
    id,
    type: 'variable',
    position: { x, y },
    data: { name, value, min, max, integer: false },
  });
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -660, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Guided-mode resonance filter',
          text: 'TiO₂ / air grating on BK7 at normal incidence (TE). A leaky waveguide mode gives a narrow reflection peak near λ ≈ Λ·n_eff.\n\nThe optimizer (Nelder-Mead) adjusts the period, the fill factor and the depth so that R is high at 598–602 nm and low elsewhere (Zones). Compute RCWA uses 8 orders to stay fast during the optimization; check the result with more orders afterwards. After Start, the Plot and the View Grating on the right show the optimized filter (Optimization Engine outputs).',
          width: 360,
          height: 260,
        },
      },
      material('air', 'Air', -660, -120),
      material('tio2', 'TiO2', -660, 80),
      material('bk7', 'BK7', -660, 280),
      variable('vp', 'period', 360, 300, 420, -980, -60),
      variable('vf', 'fill', 0.5, 0.2, 0.8, -980, 150),
      variable('vd', 'depth', 120, 60, 200, -980, 360),
      { id: 'gr', type: 'grating', position: { x: -340, y: -60 }, data: { ...GRATING_DEFAULTS, label: 'TiO₂ grating', period: 360, thickness: 120, fill: 0.5 } },
      { id: 'stack', type: 'combine', position: { x: 60, y: 60 }, data: { name: 'GMR filter', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 60, y: -220 }, data: param('lambda', 'range', 600, 540, 660, 1) },
      { id: 'th', type: 'param', position: { x: 60, y: 330 }, data: param('theta', 'constant', 0, 0, 30, 0.1) },
      { id: 'rc', type: 'rcwa', position: { x: 440, y: 40 }, data: { ...RCWA_DEFAULTS, name: 'GMR', polarization: 's', orders: 8, show: 1 } },
      { id: 'plot', type: 'plot', position: { x: 920, y: -320 }, data: PLOT_DEFAULTS },
      {
        id: 'zones',
        type: 'zones',
        position: { x: 920, y: 280 },
        data: {
          ...ZONES_DEFAULTS,
          name: 'narrow R peak at 600 nm',
          along: 'lambda',
          zones: [{ lo: 598, hi: 602, field: 'R', goal: 'max', target: 1, weight: 1 }],
          outside: 'min',
          outsideField: 'R',
          outsideWeight: 0.5,
        },
      },
      { id: 'opt', type: 'optimizer', position: { x: 1480, y: 280 }, data: { ...OPTIMIZER_DEFAULTS, algorithm: 'nm', iterations: 80 } },
      { id: 'dg', type: 'drawgrating', position: { x: -340, y: 480 }, data: DRAWGRATING_DEFAULTS },
      { id: 'plotOpt', type: 'plot', position: { x: 2080, y: -120 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
      { id: 'dgOpt', type: 'drawgrating', position: { x: 2080, y: 440 }, data: { ...DRAWGRATING_DEFAULTS, periods: 2 } },
    ],
    [
      edge('tio2', 'gr', 'ridge'),
      edge('air', 'gr', 'groove'),
      edge('vp', 'gr', 'period'),
      edge('vf', 'gr', 'fill'),
      edge('vd', 'gr', 'd'),
      edge('air', 'stack', 'incident'),
      edge('gr', 'stack', 'item-0'),
      edge('bk7', 'stack', 'exit'),
      edge('stack', 'rc', 'stack'),
      edge('wl', 'rc', 'lambda'),
      edge('th', 'rc', 'theta'),
      edge('zones', 'plot', 'in', 'marked'),
      edge('rc', 'zones', 'in'),
      edge('zones', 'opt', 'obj'),
      edge('gr', 'dg', 'in'),
      edge('opt', 'plotOpt', 'in'),
      edge('opt', 'dgOpt', 'in', 'stack'),
    ],
  );
};

// Benchmark against the literature: H. Lu et al., "Induced reflection in Tamm plasmon systems", Opt. Express 27, 5383
// (2019). Ag film (Drude of the paper) on a SiO₂ / Si₃N₄ Bragg mirror with an Al₂O₃ defect: the Tamm plasmon (TPP)
// couples to the defect mode and an EIT-like narrow reflection peak opens in the TPP dip. The coupled-oscillator
// fit (dark mode 2) gives κ, γ₁, γ₂ to compare with the paper.
export const TAMM_LU2019 = {
  tppEv: 0.796, // TMM dip without the defect (paper)
  tppAnalyticEv: 0.79, // ωT = ω0 / [1 + 2ω0(nB − nA)/(π ωp)] (paper)
  peakNm: 1556, // induced reflection peak, ds = 258 nm (paper)
  kappa8: 7.97, // 10¹² rad/s, 8 periods between the metal and the defect (paper text)
  kappaT8: 1.06, // 10¹² rad/s (paper text)
  kappaFig8b: [3.6, 2.4, 1.6, 1.1, 0.75] as number[], // 10¹² rad/s for 10 … 14 periods (read from Fig. 8b)
};
export const tammExample = (): Project => {
  const P = (value: number, fixed = false) => ({ value, fixed });
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -700, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Tamm plasmon induced reflection (literature benchmark)',
          text:
            'H. Lu et al., Opt. Express 27, 5383 (2019). Air / Ag 30 nm (Drude: ε∞ 3.7, ωp 9.1 eV, γ 0.018 eV) / (Si₃N₄ 160 nm, n 2.2 · SiO₂ 275 nm, n 1.45)×24 with an Al₂O₃ defect (258 nm, n 1.76) after M periods (sweep 8 … 16) / air; TM, 0°.\n\n' +
            'Paper: TPP dip 0.796 eV (TMM; analytic 0.790 eV) without the defect; induced peak at 1556 nm; coupled oscillators: κ = 7.97·10¹² rad/s and κT = 1.06·10¹² rad/s for M = 8; κ(M) in Fig. 8b (3.6, 2.4, 1.6, 1.1, 0.75 for M = 10 … 14).\n\n' +
            'Here: pick M in the Fit node (curve at pos), press Fit: the metrics output gives κ, γ₁, γ₂, κT (10¹² rad/s). "Fit all" fits every M: plot κ vs M (Plot κ).',
          width: 360,
          height: 330,
        },
      },
      { id: 'air', type: 'material', position: { x: -700, y: -40 }, data: { ...materialData('Air') } },
      { id: 'ag', type: 'material', position: { x: -700, y: 130 }, data: { ...materialData('user-ag-lu2019'), color: '#b8bcc6' } },
      { id: 'agl', type: 'layer', position: { x: -380, y: 100 }, data: { label: 'Ag film', thickness: 30, layers2D: 1 } },
      { id: 'sin', type: 'material', position: { x: -700, y: 300 }, data: { ...materialData('user-si3n4-22'), color: '#8fb3d9' } },
      { id: 'sio', type: 'material', position: { x: -700, y: 470 }, data: { ...materialData('user-sio2-145'), color: '#3a6fb0' } },
      { id: 'alo', type: 'material', position: { x: -700, y: 640 }, data: { ...materialData('user-al2o3-176'), color: '#f2c9a0' } },
      { id: 'pos', type: 'sweep', position: { x: -700, y: 810 }, data: { name: 'M (periods before the defect)', kind: 'number', mode: 'range', min: 8, max: 16, step: 1, list: '' } },
      {
        id: 'dbr',
        type: 'dbr',
        position: { x: -380, y: 330 },
        data: {
          name: 'Bragg mirror + defect',
          period: [
            { mode: 'nm', d: 160, label: 'Si₃N₄', layers2D: 1 },
            { mode: 'nm', d: 275, label: 'SiO₂', layers2D: 1 },
          ],
          periods: 24,
          closing: false,
          mirrorAfterCavity: false,
          lambda0: 1556,
          cavities: [{ after: 12, mode: 'nm', d: 258, m: 1, layers2D: 1 }],
        },
      },
      { id: 'stack', type: 'combine', position: { x: 60, y: 60 }, data: { name: 'Tamm + defect', count: 2 } },
      { id: 'wl', type: 'param', position: { x: 60, y: 420 }, data: param('lambda', 'range', 1556, 1535, 1578, 0.05) },
      { id: 'th', type: 'param', position: { x: 60, y: 640 }, data: param('theta', 'constant', 0, 0, 30, 0.1) },
      { id: 'tmm', type: 'compute', position: { x: 520, y: 60 }, data: compute('Tamm EIT') },
      { id: 'plot', type: 'plot', position: { x: 1000, y: -380 }, data: { ...PLOT_DEFAULTS, field: 'R', x: 'lambda', y: 'sweep:pos' } },
      {
        id: 'fit',
        type: 'fit',
        position: { x: 1000, y: 280 },
        data: {
          ...fitDefaults(),
          field: 'A',
          along: 'lambda',
          fixed: { 'sweep:pos': 4 },
          lo: 1538,
          hi: 1575,
          autoGuess: false,
          color: '#e15759',
          components: [
            { id: 'bg', type: 'baseline', params: { c: P(0), s: P(0) } },
            { id: 'co', type: 'coupled', params: { A: P(1), x1: P(1555.9), w1: P(5.4), x2: P(1555.7), w2: P(0.05), W: P(4), r: P(0, true) } },
          ],
        },
      },
      { id: 'plotK', type: 'plot', position: { x: 1640, y: 280 }, data: { ...PLOT_DEFAULTS, field: 'co.kappa', autoY: true } },
    ],
    [
      edge('air', 'stack', 'incident'),
      edge('air', 'stack', 'exit'),
      edge('ag', 'agl', 'mat'),
      edge('agl', 'stack', 'item-0'),
      edge('dbr', 'stack', 'item-1'),
      edge('sin', 'dbr', 'p0'),
      edge('sio', 'dbr', 'p1'),
      edge('alo', 'dbr', 'c0'),
      edge('pos', 'dbr', 'pos0'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
      edge('tmm', 'fit', 'in'),
      edge('fit', 'plotK', 'in', 'metrics'),
    ],
    [
      {
        id: 'user-ag-lu2019',
        name: 'Ag (Drude, Lu 2019)',
        color: '#b8bcc6',
        model: { type: 'drude-lorentz', epsInf: 3.7, wp: 9.1, gamma: 0.018, osc: [] },
        source: 'Drude fit of Johnson & Christy used by H. Lu et al., Opt. Express 27, 5383 (2019): ε∞ = 3.7, ωp = 9.1 eV, γ = 0.018 eV',
      },
      { id: 'user-si3n4-22', name: 'Si₃N₄ (n = 2.2)', color: '#8fb3d9', model: { type: 'constant', n: 2.2, k: 0 }, source: 'H. Lu et al. (2019)' },
      { id: 'user-sio2-145', name: 'SiO₂ (n = 1.45)', color: '#3a6fb0', model: { type: 'constant', n: 1.45, k: 0 }, source: 'H. Lu et al. (2019)' },
      { id: 'user-al2o3-176', name: 'Al₂O₃ (n = 1.76)', color: '#f2c9a0', model: { type: 'constant', n: 1.76, k: 0 }, source: 'H. Lu et al. (2019)' },
    ],
  );
};

// Benchmark against the literature: S. Jena, R. B. Tokas, S. Thakur, D. V. Udupa, "Rabi-like splitting and
// refractive index sensing with hybrid Tamm plasmon-cavity modes", arXiv:2105.01888. Air / Ag 35 nm / spacer S /
// (HL)⁵ C (HL)⁵ / glass: the Tamm plasmon (tuned by the spacer) anticrosses the cavity mode.
export const RABI_JENA = {
  cavityEv: 2.483, // bare cavity mode (no Ag)
  tppEv: 2.477, // bare Tamm plasmon (no cavity)
  lowerEv: 2.416, // hybrid modes at ds = 141 nm
  upperEv: 2.541,
  rabiMeV: 125,
  anticrossNm: [141, 311, 481, 651] as number[], // eq. (29)
  tmTe70LowerMeV: 114, // TE–TM splitting of the lower mode at 70°
};
export const rabiJenaExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -700, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Rabi-like splitting, Tamm plasmon + cavity (literature benchmark)',
          text:
            'S. Jena et al., arXiv:2105.01888. Air / Ag 35 nm (Drude: ε∞ 5, ωp 1.36·10¹⁶ rad/s, γ 6.6·10¹³ rad/s) / spacer S (n 1.47, ds swept) / (H 1.96 · 64 nm, L 1.47 · 85 nm)⁵ / C (1.47, 85 nm) / (HL)⁵ / glass (1.52).\n\n' +
            'Paper: bare cavity 2.483 eV, bare Tamm plasmon 2.477 eV; at ds = 141 nm hybrid modes 2.416 / 2.541 eV → Ω = 125 meV; anticrossing at ds = 141, 311, 481, 651 nm (eq. 29); TE–TM splitting of the lower mode 114 meV at 70°.\n\n' +
            'Here: the map R(λ, ds) shows the anticrossing; FWHM finds the two dips (branches) for every ds; Fit (coupled-oscillator dispersion) gives Ω in meV.',
          width: 360,
          height: 330,
        },
      },
      { id: 'air', type: 'material', position: { x: -700, y: -40 }, data: { ...materialData('Air') } },
      { id: 'ag', type: 'material', position: { x: -700, y: 130 }, data: { ...materialData('user-ag-jena'), color: '#b8bcc6' } },
      { id: 'agl', type: 'layer', position: { x: -380, y: 60 }, data: { label: 'Ag', thickness: 35, layers2D: 1 } },
      { id: 'nL', type: 'material', position: { x: -700, y: 300 }, data: { ...materialData('user-n147'), color: '#9ec5e8' } },
      { id: 'nH', type: 'material', position: { x: -700, y: 470 }, data: { ...materialData('user-n196'), color: '#3f6fb5' } },
      { id: 'glass', type: 'material', position: { x: -700, y: 640 }, data: { ...materialData('user-glass152'), color: '#dfe7ee' } },
      { id: 'sp', type: 'layer', position: { x: -380, y: 250 }, data: { label: 'spacer S', thickness: 141, layers2D: 1 } },
      { id: 'dsw', type: 'sweep', position: { x: -700, y: 810 }, data: { name: 'ds', kind: 'number', mode: 'range', min: 115, max: 170, step: 1, list: '' } },
      {
        id: 'dbr',
        type: 'dbr',
        position: { x: -380, y: 440 },
        data: {
          name: '(HL)5 C (HL)5',
          period: [
            { mode: 'nm', d: 64, label: 'H', layers2D: 1 },
            { mode: 'nm', d: 85, label: 'L', layers2D: 1 },
          ],
          periods: 10,
          closing: false,
          mirrorAfterCavity: false,
          lambda0: 500,
          cavities: [{ after: 5, mode: 'nm', d: 85, m: 1, layers2D: 1 }],
        },
      },
      { id: 'stack', type: 'combine', position: { x: 60, y: 60 }, data: { name: 'Tamm–cavity', count: 3 } },
      { id: 'wl', type: 'param', position: { x: 60, y: 460 }, data: param('lambda', 'range', 500, 450, 560, 0.1) },
      { id: 'th', type: 'param', position: { x: 60, y: 680 }, data: param('theta', 'constant', 0, 0, 70, 1) },
      { id: 'tmm', type: 'compute', position: { x: 520, y: 60 }, data: compute('Hybrid') },
      { id: 'plot', type: 'plot', position: { x: 1000, y: -380 }, data: { ...PLOT_DEFAULTS, mode: 'map', field: 'R', x: 'lambda', y: 'sweep:dsw' } },
      {
        id: 'fwhm',
        type: 'fwhm',
        position: { x: 520, y: 420 },
        data: { ...ANALYSIS_DEFAULTS.fwhm, along: 'lambda', intervals: [{ lo: 455, hi: 499 }, { lo: 499, hi: 555 }] },
      },
      {
        id: 'fit',
        type: 'fit',
        position: { x: 1000, y: 280 },
        data: { ...fitDefaults(), mode: 'dispersion', along: 'sweep:dsw', branch1: 'c0', branch2: 'c1', lo: 125, hi: 160, color: '#59a14f' },
      },
    ],
    [
      edge('air', 'stack', 'incident'),
      edge('glass', 'stack', 'exit'),
      edge('ag', 'agl', 'mat'),
      edge('nL', 'sp', 'mat'),
      edge('dsw', 'sp', 'd'),
      edge('agl', 'stack', 'item-0'),
      edge('sp', 'stack', 'item-1'),
      edge('dbr', 'stack', 'item-2'),
      edge('nH', 'dbr', 'p0'),
      edge('nL', 'dbr', 'p1'),
      edge('nL', 'dbr', 'c0'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
      edge('tmm', 'fwhm', 'in'),
      edge('fwhm', 'fit', 'in', 'metrics'),
    ],
    [
      {
        id: 'user-ag-jena',
        name: 'Ag (Drude, Jena 2021)',
        color: '#b8bcc6',
        model: { type: 'drude-lorentz', epsInf: 5, wp: 1.36e16 * 6.582119569e-16, gamma: 6.6e13 * 6.582119569e-16, osc: [] },
        source: 'Drude model of S. Jena et al., arXiv:2105.01888: ε∞ = 5, ωp = 1.36·10¹⁶ rad/s, γ = 6.6·10¹³ rad/s',
      },
      { id: 'user-n147', name: 'L / spacer / cavity (n = 1.47)', color: '#9ec5e8', model: { type: 'constant', n: 1.47, k: 0 }, source: 'S. Jena et al. (2021)' },
      { id: 'user-n196', name: 'H (n = 1.96)', color: '#3f6fb5', model: { type: 'constant', n: 1.96, k: 0 }, source: 'S. Jena et al. (2021)' },
      { id: 'user-glass152', name: 'glass (n = 1.52)', color: '#dfe7ee', model: { type: 'constant', n: 1.52, k: 0 }, source: 'assumed (glass substrate)' },
    ],
  );

// ---- Filter design benchmarks: narrow notch, narrow band-pass (cavities), AR on both faces with four materials ----

// A formula start design in physical thicknesses (library materials, quarter waves at lambdaRef).
function formulaStart(formula: string, mats: string[], lambdaRef: number): { m: number; d: number }[] {
  const lib = makeLibrary([]);
  const models = Object.fromEntries([...lib].map(([id, d]) => [id, d.model]));
  const f = parseFormula(formula, MATERIAL_LETTERS.slice(0, mats.length));
  if (typeof f === 'string') throw new Error(f);
  return f.map((x) => ({ m: x.m, d: (x.q * lambdaRef) / 4 / refractiveIndex(mats[x.m], models, lambdaRef).re }));
}

// Narrow notch: second-order stop band of a stack with a small thickness mismatch (J. Zhang et al., Appl. Opt. 52, 5788
// (2013)): period = one wave at 532 nm, H / L = 0.96 / 1.04 of a half wave; width ≈ (4/π)·((nH − nL)/(nH + nL))·|sin 2πD|/2·λ
// with D = 0.48. The first-order band falls at 1064 nm, the third at 355 nm: a clean visible pass band.
export const NOTCH_SPEC = { center: 532, maxWidth: 10, od: 4, odBand: [530, 534] as [number, number], pass: 0.9, passBands: [[420, 515], [550, 750]] as [number, number][] };
export const NOTCH_BANDS: FilterData['bands'] = [
  { lo: 420, hi: 515, q: 'T', kind: 'ge', value: 0.9, tol: 0.01, weight: 1 },
  { lo: 515.5, hi: 527, q: 'T', kind: 'ge', value: 0.5, tol: 0.01, weight: 1 },
  { lo: 530, hi: 534, q: 'OD', kind: 'ge', value: 4, tol: 0.1, weight: 5 },
  { lo: 537, hi: 549.5, q: 'T', kind: 'ge', value: 0.5, tol: 0.01, weight: 1 },
  { lo: 550, hi: 750, q: 'T', kind: 'ge', value: 0.9, tol: 0.01, weight: 1 },
];
export const notchExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Narrow notch filter (≤ 10 nm at 532 nm, OD ≥ 4)',
          text:
            'Specification: OD ≥ 4 on 530–534 nm, T ≥ 50 % at ±5 nm (width ≤ 10 nm), T ≥ 90 % on 420–515 and 550–750 nm; TiO₂ / SiO₂ on BK7, ≤ 250 layers.\n\n' +
            'A quarter-wave stack of TiO₂ / SiO₂ reflects ~160 nm: too wide. The trick: the second-order band of a stack whose period is one wave at 532 nm, with a small mismatch of the two layers (0.96 / 1.04 of a half wave): its width ∝ the mismatch (J. Zhang et al., Appl. Opt. 52, 5788 (2013)); the first order falls at 1064 nm, the third at 355 nm.\n\n' +
            'The start design is that formula, (1.92H 2.08L)^100 at 532 nm (200 layers, ~31 µm): it has the notch but not the pass band (T min ≈ 0.74). Press Start (deep search): the needle insertions at all minima of the needle function and the refinement of 200 thicknesses meet the specification (MF = 0) in about a minute.',
          width: 380,
          height: 360,
        },
      },
      material('air', 'Air', -620, 20),
      material('tio2', 'TiO2', -620, 200),
      material('sio2', 'SiO2', -620, 380),
      material('bk7', 'BK7', -620, 560),
      {
        id: 'filter',
        type: 'filter',
        position: { x: -280, y: -60 },
        data: {
          ...FILTER_DEFAULTS,
          name: 'Notch 532 nm',
          preset: 'custom',
          bands: NOTCH_BANDS,
          lmin: 420,
          lmax: 750,
          step: 0.5,
          minD: 5,
          maxD: 2000,
          maxLayers: 250,
          maxTotal: 35000,
          algorithm: 'deep',
          candidates: 12,
          iterations: 20,
          needleStep: 20,
          lambdaRef: 532,
          start: 'formula',
          formula: '(1.92H 2.08L)^100',
          pol: 's',
          design: { front: formulaStart('(1.92H 2.08L)^100', ['TiO2', 'SiO2'], 532), back: [] },
        },
      },
      { id: 'wl', type: 'param', position: { x: 320, y: -200 }, data: param('lambda', 'range', 532, 420, 750, 0.1) },
      { id: 'th', type: 'param', position: { x: 320, y: 360 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 320, y: 60 }, data: { ...compute('Notch'), polarization: 's' } },
      { id: 'plot', type: 'plot', position: { x: 720, y: -200 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
    ],
    [
      edge('tio2', 'filter', 'm0'),
      edge('sio2', 'filter', 'm1'),
      edge('air', 'filter', 'incident'),
      edge('bk7', 'filter', 'sub'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
    ],
  );

// Narrow band-pass: three Fabry-Pérot cavities (half-wave high-index spacers between quarter-wave mirrors) coupled by
// low-index quarter waves (H. A. Macleod, Thin-Film Optical Filters, ch. on band-pass filters).
export const BANDPASS_BANDS: FilterData['bands'] = [
  { lo: 500, hi: 528, q: 'OD', kind: 'ge', value: 3, tol: 0.1, weight: 1 },
  { lo: 531.5, hi: 532.5, q: 'T', kind: 'ge', value: 0.9, tol: 0.01, weight: 2 },
  { lo: 536, hi: 565, q: 'OD', kind: 'ge', value: 3, tol: 0.1, weight: 1 },
];
export const BANDPASS_FORMULA = '(HL)^5 HH (LH)^5 L (HL)^5 HH (LH)^5 L (HL)^5 HH (LH)^5';
export const bandpassExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Narrow band-pass filter (three cavities, 532 nm)',
          text:
            'Specification: T ≥ 90 % on 531.5–532.5 nm (a flat top 1 nm wide), OD ≥ 3 on 500–528 and 536–565 nm; TiO₂ / SiO₂ on BK7.\n\n' +
            'The cavity trick: a half-wave spacer (HH) between two quarter-wave mirrors opens a narrow transmission line (Fabry-Pérot); a single cavity is peaked (FWHM 1.6 nm with (HL)^5), cavities coupled by a quarter-wave L give a flat top and steep edges (Macleod).\n\n' +
            'Start: (HL)^5 HH (LH)^5 L (HL)^5 HH (LH)^5 L (HL)^5 HH (LH)^5 at 532 nm (68 layers): the line is at 531.3 nm with ripple on the top. Press Start (deep search) to centre and flatten it.',
          width: 380,
          height: 330,
        },
      },
      material('air', 'Air', -620, 20),
      material('tio2', 'TiO2', -620, 200),
      material('sio2', 'SiO2', -620, 380),
      material('bk7', 'BK7', -620, 560),
      {
        id: 'filter',
        type: 'filter',
        position: { x: -280, y: -60 },
        data: {
          ...FILTER_DEFAULTS,
          name: 'Band-pass 532 nm',
          preset: 'custom',
          bands: BANDPASS_BANDS,
          lmin: 500,
          lmax: 565,
          step: 0.1,
          minD: 5,
          maxD: 2000,
          maxLayers: 100,
          maxTotal: 20000,
          algorithm: 'deep',
          candidates: 12,
          iterations: 10,
          needleStep: 10,
          lambdaRef: 532,
          start: 'formula',
          formula: BANDPASS_FORMULA,
          pol: 's',
          design: { front: formulaStart(BANDPASS_FORMULA, ['TiO2', 'SiO2'], 532), back: [] },
        },
      },
      { id: 'wl', type: 'param', position: { x: 320, y: -200 }, data: param('lambda', 'range', 532, 500, 565, 0.02) },
      { id: 'th', type: 'param', position: { x: 320, y: 360 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 320, y: 60 }, data: { ...compute('Band-pass'), polarization: 's' } },
      { id: 'plot', type: 'plot', position: { x: 720, y: -200 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
    ],
    [
      edge('tio2', 'filter', 'm0'),
      edge('sio2', 'filter', 'm1'),
      edge('air', 'filter', 'incident'),
      edge('bk7', 'filter', 'sub'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
    ],
  );

// AR coatings on both faces of a 1 mm BK7 plate, four coating materials (the algorithms choose among them).
export const AR_BOTH_BANDS: FilterData['bands'] = [{ lo: 420, hi: 680, q: 'R', kind: 'le', value: 0.002, tol: 0.001, weight: 1 }];
export const arBothSidesExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'AR coating on both faces of a plate (four materials)',
          text:
            'Specification: total reflectance of a 1 mm BK7 plate (both faces, incoherent) R ≤ 0.2 % on 420–680 nm, at normal incidence (bare plate: 8.1 %).\n\n' +
            'Four coating materials: TiO₂, Al₂O₃, SiO₂ and MgF₂ (n = 1.38, constant): the needle function is computed for every material, the deep search tries all its local minima and keeps the best refined design — the choice of the materials is part of the optimization.\n\n' +
            'Press Start: both faces are designed (each one first, then together).',
          width: 360,
          height: 300,
        },
      },
      material('air', 'Air', -620, 20),
      material('tio2', 'TiO2', -620, 200),
      material('al2o3', 'Al2O3', -620, 380),
      material('sio2', 'SiO2', -620, 560),
      { id: 'mgf2', type: 'material', position: { x: -620, y: 740 }, data: { ...materialData('user-mgf2-138'), color: '#cfe8d8' } },
      material('bk7', 'BK7', -620, 920),
      {
        id: 'filter',
        type: 'filter',
        position: { x: -280, y: -60 },
        data: {
          ...FILTER_DEFAULTS,
          name: 'AR both faces',
          preset: 'custom',
          bands: AR_BOTH_BANDS,
          lmin: 400,
          lmax: 700,
          step: 5,
          materials: 4,
          thick: true,
          dSub: 1,
          sides: 'both',
          minD: 5,
          maxD: 600,
          maxLayers: 12,
          maxTotal: 1500,
          algorithm: 'deep',
          candidates: 10,
          iterations: 16,
          needleStep: 5,
          lambdaRef: 550,
          start: 'layer',
          startMat: 3,
          startD: 100,
          pol: 's',
          design: { front: [], back: [] },
        },
      },
      { id: 'wl', type: 'param', position: { x: 320, y: -200 }, data: param('lambda', 'range', 550, 380, 750, 1) },
      { id: 'th', type: 'param', position: { x: 320, y: 360 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 320, y: 60 }, data: { ...compute('AR plate'), polarization: 's' } },
      { id: 'plot', type: 'plot', position: { x: 720, y: -200 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
      { id: 'draw', type: 'draw', position: { x: 720, y: 360 }, data: { ...DRAW_DEFAULTS, scale: 'proportional', compress: false, light: 'center' } },
    ],
    [
      edge('tio2', 'filter', 'm0'),
      edge('al2o3', 'filter', 'm1'),
      edge('sio2', 'filter', 'm2'),
      edge('mgf2', 'filter', 'm3'),
      edge('air', 'filter', 'incident'),
      edge('bk7', 'filter', 'sub'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
      edge('filter', 'draw', 'in'),
    ],
    [{ id: 'user-mgf2-138', name: 'MgF₂ (n = 1.38)', color: '#cfe8d8', model: { type: 'constant', n: 1.38, k: 0 }, source: 'typical thin-film MgF₂ in the visible (constant approximation)' }],
  );

// Literature benchmark: H. Pan, C. Ou, S. Yang, J. Wang, Y. Luo, "Inverse design of narrowband thermal emitter with
// tandem films structures using simulated annealing algorithm", Opt. Express 32, 47154 (2024). Air / Ge / SiO₂ / Ge /
// SiO₂ / Au 100 nm: a quasi-Tamm narrowband emitter (Kirchhoff: emissivity = absorptance). Their optimum:
// Ge 351.1, SiO₂ 998.9, Ge 392.6, SiO₂ 1931.8 nm → A = 0.8261 at 5.34 µm, Q = 175.
export const PAN2024 = { thicknesses: [351.1, 998.9, 392.6, 1931.8], auNm: 100, peakUm: 5.34, peakA: 0.8261, Q: 175 };
export const thermalEmitterSaExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -700, y: -460 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Narrowband thermal emitter by simulated annealing (literature benchmark)',
          text:
            'H. Pan et al., Opt. Express 32, 47154 (2024). Air / Ge / SiO₂ / Ge / SiO₂ / Au 100 nm on Si: a quasi-Tamm emitter; emissivity = absorptance A (Kirchhoff).\n\n' +
            'Objective (their eq. 6): F = a·FWHM/H + b·|1 − A_peak| + c/Q, here with a = 0.01 /nm, b = 1, c = 10 and a term d·|λ_peak − 5340 nm| (d = 0.005 /nm) that keeps the peak at 5.34 µm. Optimization Engine: simulated annealing (their settings: T₀ = 100, cooling 0.95, 1000 moves per temperature; here T₀ automatic, 50 moves per temperature, 4 chains).\n\n' +
            'Their optimum (351.1 / 998.9 / 392.6 / 1931.8 nm): A = 0.8261 at 5.34 µm, Q = 175. With Ge n = 4.0, SiO₂ Malitson n with k = 8.2·10⁻⁴ (mid-IR absorption; the paper takes its constants from the Handbook of Optics, not listed) and Au Drude (Ordal 1983) our TMM gives A ≈ 0.83 at 5.32 µm, Q ≈ 178. Set the Design variables to those values to check.\n\nStart: 400 / 1100 / 400 / 1800 nm (a weak peak at 5.15 µm). Press Start: the annealing moves the peak to 5.34 µm and narrows it (A ≈ 0.85, Q ≈ 225 in about 12 000 evaluations).',
          width: 400,
          height: 380,
        },
      },
      material('air', 'Air', -700, -40),
      { id: 'ge', type: 'material', position: { x: -700, y: 130 }, data: { ...materialData('user-ge-ir'), color: '#7b7f86' } },
      { id: 'sio2', type: 'material', position: { x: -700, y: 300 }, data: { ...materialData('user-sio2-ir'), color: '#9ec5e8' } },
      { id: 'au', type: 'material', position: { x: -700, y: 470 }, data: { ...materialData('user-au-drude'), color: '#d4af37' } },
      { id: 'si', type: 'material', position: { x: -700, y: 640 }, data: { ...materialData('user-si-ir'), color: '#5a6270' } },
      { id: 'v1', type: 'variable', position: { x: -1040, y: 60 }, data: { name: 'd Ge (top)', value: 400, min: 50, max: 1000, integer: false } },
      { id: 'v2', type: 'variable', position: { x: -1040, y: 260 }, data: { name: 'd SiO₂ (1)', value: 1100, min: 200, max: 2500, integer: false } },
      { id: 'v3', type: 'variable', position: { x: -1040, y: 460 }, data: { name: 'd Ge (2)', value: 400, min: 50, max: 1000, integer: false } },
      { id: 'v4', type: 'variable', position: { x: -1040, y: 660 }, data: { name: 'd SiO₂ (2)', value: 1800, min: 200, max: 3000, integer: false } },
      { id: 'l1', type: 'layer', position: { x: -380, y: -20 }, data: { label: 'Ge', thickness: 400, layers2D: 1 } },
      { id: 'l2', type: 'layer', position: { x: -380, y: 140 }, data: { label: 'SiO₂', thickness: 1100, layers2D: 1 } },
      { id: 'l3', type: 'layer', position: { x: -380, y: 300 }, data: { label: 'Ge', thickness: 400, layers2D: 1 } },
      { id: 'l4', type: 'layer', position: { x: -380, y: 460 }, data: { label: 'SiO₂', thickness: 1800, layers2D: 1 } },
      { id: 'l5', type: 'layer', position: { x: -380, y: 620 }, data: { label: 'Au', thickness: 100, layers2D: 1 } },
      { id: 'stack', type: 'combine', position: { x: 40, y: 60 }, data: { name: 'Quasi-Tamm emitter', count: 5 } },
      { id: 'wl', type: 'param', position: { x: 40, y: 460 }, data: param('lambda', 'range', 5340, 4800, 6000, 0.5) },
      { id: 'th', type: 'param', position: { x: 40, y: 680 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 460, y: 60 }, data: { ...compute('Emitter'), polarization: 's' } },
      { id: 'fwhm', type: 'fwhm', position: { x: 880, y: -60 }, data: { ...ANALYSIS_DEFAULTS.fwhm, kind: 'peak', field: 'A', along: 'lambda', intervals: [{ lo: 5000, hi: 5700 }] } },
      {
        id: 'obj',
        type: 'formula',
        position: { x: 1300, y: -60 },
        data: {
          name: 'F (Pan et al., eq. 6)',
          goal: 'min',
          weight: 1,
          terms: [
            { name: 'w', source: 'fwhm:metrics', field: 'w0', stat: 'mean' },
            { name: 'H', source: 'fwhm:metrics', field: 'e0', stat: 'mean' },
            { name: 'Q', source: 'fwhm:metrics', field: 'q0', stat: 'mean' },
            { name: 'lp', source: 'fwhm:metrics', field: 'c0', stat: 'mean' },
          ],
          expr: '0.01*abs(w/H) + abs(1 - H) + 10/Q + 0.005*abs(lp - 5340)',
        },
      },
      { id: 'opt', type: 'optimizer', position: { x: 1720, y: -60 }, data: { ...OPTIMIZER_DEFAULTS, algorithm: 'sa', iterations: 3000, seed: 1 } },
      { id: 'plot', type: 'plot', position: { x: 880, y: 420 }, data: { ...PLOT_DEFAULTS, field: 'A' } },
      { id: 'plotOpt', type: 'plot', position: { x: 1720, y: 560 }, data: { ...PLOT_DEFAULTS, field: 'A' } },
    ],
    [
      edge('air', 'stack', 'incident'),
      edge('si', 'stack', 'exit'),
      edge('ge', 'l1', 'mat'),
      edge('sio2', 'l2', 'mat'),
      edge('ge', 'l3', 'mat'),
      edge('sio2', 'l4', 'mat'),
      edge('au', 'l5', 'mat'),
      edge('v1', 'l1', 'd'),
      edge('v2', 'l2', 'd'),
      edge('v3', 'l3', 'd'),
      edge('v4', 'l4', 'd'),
      edge('l1', 'stack', 'item-0'),
      edge('l2', 'stack', 'item-1'),
      edge('l3', 'stack', 'item-2'),
      edge('l4', 'stack', 'item-3'),
      edge('l5', 'stack', 'item-4'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'fwhm', 'in'),
      edge('fwhm', 'obj', 'in', 'metrics'),
      edge('obj', 'opt', 'obj'),
      edge('tmm', 'plot', 'in'),
      edge('opt', 'plotOpt', 'in'),
    ],
    [
      { id: 'user-ge-ir', name: 'Ge (IR, n = 4.0)', color: '#7b7f86', model: { type: 'constant', n: 4.0, k: 0 }, source: 'germanium in the mid-infrared, n ≈ 4.0 (Handbook of Optics); constant approximation' },
      {
        id: 'user-sio2-ir',
        name: 'SiO₂ (mid-IR, k = 8.2e-4)',
        color: '#9ec5e8',
        model: { type: 'formula', formula: 1, coefficients: [0, 0.6961663, 0.0684043, 0.4079426, 0.1162414, 0.8974794, 9.896161], k: 8.2e-4 },
        source: 'n: Malitson (1965) dispersion formula; k = 8.2·10⁻⁴: weak mid-IR absorption chosen so that the published optimum of Pan et al. (2024) gives their peak absorptance (calibration)',
      },
      {
        id: 'user-au-drude',
        name: 'Au (Drude, Ordal 1983)',
        color: '#d4af37',
        model: { type: 'drude-lorentz', epsInf: 1, wp: 9.026, gamma: 0.02666, osc: [] },
        source: 'M. A. Ordal et al., Appl. Opt. 22, 1099 (1983): ωp = 7.28·10⁴ cm⁻¹, ωτ = 215 cm⁻¹ (infrared Drude fit)',
      },
      { id: 'user-si-ir', name: 'Si (IR, n = 3.42)', color: '#5a6270', model: { type: 'constant', n: 3.42, k: 0 }, source: 'silicon substrate in the mid-infrared' },
    ],
  );

// Literature benchmark: M. He, J. R. Nolen, J. Nordlander et al., "Deterministic inverse design of Tamm plasmon thermal
// emitters with multi-resonant control", Nat. Mater. 20, 1663 (2021), after their published code (Tamm-main,
// inver_design_tamplasma_example_code_version1.py): air / (Ge / SiO)⁴ Ge / CdO (doped, carrier density N) / SiO substrate,
// normal incidence (TE); reflectance target with two dips (a Lorentzian at 4237.29 nm = 2360 cm⁻¹, the CO₂ band, and a
// Gaussian at 3500 nm) on 1500–3499 cm⁻¹; loss = MSE + 0.01·max squared error; Adam on sigmoid-bounded thicknesses
// (50–850 nm) and N (0.4–4·10²⁰ cm⁻³), lr 0.05 × 0.7 every 100 steps; first 200 steps at lr 0.01 on the resonance points
// only (target < 95 %), then 450 on the full spectrum.
export const HE2021 = { dips: [4237.28814, 3500] as number[], cauchyScale: 30, gaussSigma: 20, thickness: [50, 850] as [number, number], N: [0.4, 4] as [number, number] };
// The target of the reference code (set_target): R = 1 − L − G on the wavenumber grid 1500 … 3499 cm⁻¹, each dip
// normalized to 1 at its largest grid value. Returns CSV text (λ in nm ascending, target, weight).
export function he2021TargetCsv(resonanceOnly: boolean): string {
  const lam = Array.from({ length: 2000 }, (_, i) => 1e7 / (1500 + i));
  const L = lam.map((l) => 1 / (1 + ((l - HE2021.dips[0]) / HE2021.cauchyScale) ** 2));
  const G = lam.map((l) => Math.exp(-(((l - HE2021.dips[1]) / HE2021.gaussSigma) ** 2) / 2));
  const lMax = Math.max(...L);
  const gMax = Math.max(...G);
  const R = lam.map((_, i) => 1 - L[i] / lMax - G[i] / gMax);
  const rows = lam.map((l, i) => `${l.toFixed(6)},${R[i].toFixed(9)},${resonanceOnly ? (R[i] < 0.95 ? 1 : 0) : 1}`).reverse();
  return `wavelength,target,weight\n${rows.join('\n')}`;
}
// The same target as a Target node (model): baseline 1, a Lorentzian dip (HWHM = the Cauchy scale) and a Gaussian dip,
// each of depth 1 / (its largest grid value), on the wavenumber grid 1500 … 3499 cm⁻¹ of the code.
function he2021Target(name: string, color: string): TargetData {
  const lam = Array.from({ length: 2000 }, (_, i) => 1e7 / (1500 + i));
  const lMax = Math.max(...lam.map((l) => 1 / (1 + ((l - HE2021.dips[0]) / HE2021.cauchyScale) ** 2)));
  const gMax = Math.max(...lam.map((l) => Math.exp(-(((l - HE2021.dips[1]) / HE2021.gaussSigma) ** 2) / 2)));
  const P = (value: number) => ({ value, fixed: false });
  return {
    ...TARGET_DEFAULTS,
    name,
    color,
    mode: 'components',
    axis: 'lambda',
    gridUnit: 'cm-1',
    min: 1500,
    max: 3499,
    step: 1,
    components: [
      { id: 'base', type: 'baseline', params: { c: P(1), s: P(0) } },
      { id: 'co2', type: 'lorentz', params: { A: P(-1 / lMax), x0: P(HE2021.dips[0]), w: P(2 * HE2021.cauchyScale) } },
      { id: 'g', type: 'gauss', params: { A: P(-1 / gMax), x0: P(HE2021.dips[1]), w: P(2 * Math.sqrt(2 * Math.LN2) * HE2021.gaussSigma) } },
    ],
  };
}
export const heTammExample = (): Project => {
  const layers = ['Ge', 'SiO', 'Ge', 'SiO', 'Ge', 'SiO', 'Ge', 'SiO', 'Ge', 'CdO'];
  const matOf = (name: string) => (name === 'Ge' ? 'ge' : name === 'SiO' ? 'sio' : 'cdo');
  const nodes: AppNode[] = [
    {
      id: 'note',
      type: 'info',
      position: { x: -1100, y: -520 },
      data: {
        ...INFO_DEFAULTS,
        title: 'Inverse design of a Tamm emitter by gradient descent (He et al. 2021, benchmark)',
        text:
          'M. He et al., Nat. Mater. 20, 1663 (2021), after their published code: air / (Ge / SiO)⁴ Ge / CdO / SiO; Ge n = 4.0, SiO n = 2.25 (as in the code), CdO: doped-semiconductor Drude (Nolen 2020) with the carrier density N as a Design variable.\n\n' +
          'Target (their set_target), a Target node (model): reflectance = baseline 1 − Lorentzian dip at 4237.3 nm (CO₂, FWHM 60 nm) − Gaussian dip at 3500 nm (σ = 20 nm), on their grid 1500–3499 cm⁻¹ (step 1 cm⁻¹). Two Curve match nodes compare with it: the full spectrum, and only the resonances (“only where the target is < 0.95”). Loss: MSE + 0.01·max squared error (metric “MSE + λ·max error²”).\n\n' +
          'Optimization Engine: Adam with their schedule (the default settings of Adam): stage 1 = 200 steps at lr 0.01 on the resonance points only (Curve match “resonances”), stage 2 = 450 steps at lr 0.05 on the full spectrum, lr × 0.7 every 100 steps, 4 starts. Thicknesses 50–850 nm, N 0.4–4·10²⁰ cm⁻³ (sigmoid bounds, as in the code).\n\n' +
          'Differences from the code: the gradient is by finite differences (not automatic differentiation) and the whole spectrum is used at each step (no random mini-batches of wavelengths); the vacuum first layer of the code has no effect and is left out; their CdO effective mass uses (3πn)^⅔, reproduced here by C = 1.47·(3.14/π²)^⅔ in the standard (3π²n)^⅔ form.',
        width: 440,
        height: 460,
      },
    },
    material('air', 'Air', -700, -300),
    { id: 'ge', type: 'material', position: { x: -700, y: -120 }, data: { ...materialData('user-ge-4'), color: '#7b7f86' } },
    { id: 'sio', type: 'material', position: { x: -700, y: 60 }, data: { ...materialData('user-sio-225'), color: '#9ec5e8' } },
    { id: 'cdo', type: 'material', position: { x: -700, y: 240 }, data: { ...materialData('user-cdo-nolen'), color: '#c98b3a' } },
    { id: 'vN', type: 'variable', position: { x: -1100, y: 240 }, data: { name: 'N CdO (10²⁰ cm⁻³)', value: 2.2, min: HE2021.N[0], max: HE2021.N[1], integer: false } },
    { id: 'target', type: 'target', position: { x: 500, y: -1150 }, data: he2021Target('target', '#e15759') },
    { id: 'stack', type: 'combine', position: { x: 0, y: 200 }, data: { name: 'Tamm emitter', count: layers.length } },
    { id: 'wl', type: 'param', position: { x: 0, y: 700 }, data: param('lambda', 'range', 4237, 2850, 6670, 2) },
    { id: 'th', type: 'param', position: { x: 0, y: 900 }, data: param('theta', 'constant', 0, 0, 80, 1) },
    { id: 'tmm', type: 'compute', position: { x: 500, y: 200 }, data: { ...compute('Tamm emitter'), polarization: 's' } },
    { id: 'mAll', type: 'match', position: { x: 980, y: -380 }, data: { ...MATCH_DEFAULTS, name: 'full spectrum', field: 'R', metric: 'msemax', lambdaMax: 0.01 } },
    { id: 'mRes', type: 'match', position: { x: 980, y: 120 }, data: { ...MATCH_DEFAULTS, name: 'resonances', field: 'R', metric: 'msemax', lambdaMax: 0.01, only: { op: 'lt', level: 0.95 } } },
    {
      id: 'opt',
      type: 'optimizer',
      position: { x: 1460, y: -380 },
      data: {
        ...OPTIMIZER_DEFAULTS,
        algorithm: 'adam',
        iterations: 650,
        seed: 1,
        params: { adam: { lr: 0.05, decay: 0.7, decaySteps: 100, stage1Iter: 200, stage1Lr: 0.01, starts: 4, stall: 0, stage1Obj: ['mRes'], stage2Obj: ['mAll'] } },
      },
    },
    { id: 'plot', type: 'plot', position: { x: 1460, y: 520 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
    { id: 'draw', type: 'draw', position: { x: 1940, y: 520 }, data: { ...DRAW_DEFAULTS, scale: 'proportional', compress: false, light: 'center' } },
  ];
  const edges: Edge[] = [
    edge('air', 'stack', 'incident'),
    edge('sio', 'stack', 'exit'),
    edge('vN', 'cdo', 'p'),
    edge('stack', 'tmm', 'stack'),
    edge('wl', 'tmm', 'lambda'),
    edge('th', 'tmm', 'theta'),
    edge('tmm', 'mAll', 'in'),
    edge('target', 'mAll', 'target'),
    edge('tmm', 'mRes', 'in'),
    edge('target', 'mRes', 'target'),
    edge('mAll', 'opt', 'obj'),
    edge('mRes', 'opt', 'obj'),
    edge('opt', 'plot', 'in'),
    edge('opt', 'draw', 'in', 'stack'),
  ];
  layers.forEach((name, i) => {
    nodes.push({ id: `l${i + 1}`, type: 'layer', position: { x: -380, y: -420 + i * 150 }, data: { label: name, thickness: 450, layers2D: 1 } });
    nodes.push({ id: `v${i + 1}`, type: 'variable', position: { x: -1100, y: 460 + i * 230 }, data: { name: `d${i + 1} ${name}`, value: 450, min: HE2021.thickness[0], max: HE2021.thickness[1], integer: false } });
    edges.push(edge(matOf(name), `l${i + 1}`, 'mat'), edge(`v${i + 1}`, `l${i + 1}`, 'd'), edge(`l${i + 1}`, 'stack', `item-${i}`));
  });
  return project(nodes, edges, [
    { id: 'user-ge-4', name: 'Ge (n = 4.0)', color: '#7b7f86', model: { type: 'constant', n: 4.0, k: 0 }, source: 'M. He et al. (2021), published code: Ge = 4.0' },
    { id: 'user-sio-225', name: 'SiO (n = 2.25)', color: '#9ec5e8', model: { type: 'constant', n: 2.25, k: 0 }, source: 'M. He et al. (2021), published code: SiO = 2.25 (layers and substrate)' },
    {
      id: 'user-cdo-nolen',
      name: 'CdO (doped, Drude)',
      color: '#c98b3a',
      model: { type: 'drude-carrier', epsInf: 5.1, N: 2.2, mStar0: 0.1, C: 1.47 * (3.14 / (Math.PI * Math.PI)) ** (2 / 3), mobility: 200 },
      source:
        'J. R. Nolen et al., Phys. Rev. Mater. 4, 025202 (2020), as in the code of M. He et al. (2021): ε∞ = 5.1, m0* = 0.1, μ = 200 cm²/(V·s), non-parabolicity 1.47 with (3πn)^⅔ (here C = 1.47·(3.14/π²)^⅔ in the (3π²n)^⅔ form)',
    },
  ]);
};

// A castle-contour filter, in the spirit of OIC 2025 Problem A (J. D. T. Kruschwitz, M. Trubetskov, J. Keck, Appl. Opt. 65,
// A12 (2026): a transmittance following the contour of the Neuschwanstein castle): here a stylized silhouette of the Peleș
// castle (Sinaia) — the main tower with its tall spire, the second tower, gables and turrets — as T(λ) on 400–1000 nm.
// Materials of the contest (H 2.25, M 1.38 — the pair of highest contrast chosen by the winner), substrate 1.52, MF = 100·RMS.
export const PELES_CONTOUR: [number, number][] = [
  [400, 0.05], [420, 0.05], [425, 0.35], [470, 0.35], [490, 0.52], [510, 0.35], [530, 0.35], [535, 0.55], [540, 0.55], [547, 0.66], [554, 0.55], [560, 0.4],
  [600, 0.4], [605, 0.62], [640, 0.62], [660, 0.95], [680, 0.62], [690, 0.62], [695, 0.45], [720, 0.58], [745, 0.45], [760, 0.6], [785, 0.6], [800, 0.8],
  [815, 0.6], [825, 0.6], [830, 0.42], [840, 0.42], [860, 0.52], [880, 0.42], [895, 0.42], [900, 0.55], [910, 0.63], [920, 0.55], [925, 0.35], [960, 0.35],
  [970, 0.05], [1000, 0.05],
];
export function pelesCsv(step = 4): string {
  const tAt = (l: number) => {
    for (let i = 1; i < PELES_CONTOUR.length; i++) {
      const [x0, y0] = PELES_CONTOUR[i - 1];
      const [x1, y1] = PELES_CONTOUR[i];
      if (l <= x1) return y0 + ((l - x0) / (x1 - x0)) * (y1 - y0);
    }
    return PELES_CONTOUR[PELES_CONTOUR.length - 1][1];
  };
  const rows: string[] = [];
  for (let l = 400; l <= 1000 + 1e-9; l += step) rows.push(`${l},${tAt(l).toFixed(4)}`);
  return `wavelength,T\n${rows.join('\n')}`;
}
export const pelesExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -760, y: -480 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Castle filter: the contour of the Peleș castle as T(λ)',
          text:
            'In the spirit of OIC 2025 Problem A (Kruschwitz, Trubetskov, Keck, Appl. Opt. 65, A12 (2026)), whose target followed the contour of the Neuschwanstein castle: here a stylized silhouette of the Peleș castle — the main tower with its tall spire (T = 0.95 at 660 nm), the second tower (0.80 at 800 nm), gables and turrets — on 400–1000 nm, normal incidence.\n\n' +
            'Contest materials: H (n = 2.25) and M (n = 1.38), the pair of highest contrast used by the winner; substrate 1.52 (no back side), layers ≥ 5 nm, ≤ 80 layers. MF = 100·RMS(T − T̂) as in the contest (Target curve with tolerance 0.01).\n\n' +
            'Press Start in the Filter designer (deep search from (HL)^10 at 700 nm): about MF 2–3 % in a minute (44 layers, 3.7 µm); the longer it runs, the sharper the spires. For scale: the winner of the Neuschwanstein problem reached MF 0.72 % with 100 layers and 11 µm. The Plot below checks the designed stack with an independent TMM (Compute + Curve match).',
          width: 400,
          height: 400,
        },
      },
      { id: 'air', type: 'material', position: { x: -760, y: 0 }, data: materialData('Air') },
      { id: 'mh', type: 'material', position: { x: -760, y: 170 }, data: { ...materialData('user-h-225'), color: '#3f6fb5' } },
      { id: 'mm', type: 'material', position: { x: -760, y: 340 }, data: { ...materialData('user-m-138'), color: '#cfe8d8' } },
      { id: 'sub', type: 'material', position: { x: -760, y: 510 }, data: { ...materialData('user-sub-152'), color: '#dfe7ee' } },
      { id: 'contour', type: 'import', position: { x: -760, y: -900 }, data: { ...IMPORT_DEFAULTS, name: 'Peleș contour', fileName: 'peles-contour.csv', text: pelesCsv(4), names: 'T', color: '#222222' } },
      { id: 'target', type: 'target', position: { x: -320, y: -900 }, data: { ...TARGET_DEFAULTS, name: 'Peleș target', mode: 'data', field: 'T', min: NaN, max: NaN, quantity: 'T', tol: 0.01, kind: 'eq' } },
      {
        id: 'filter',
        type: 'filter',
        position: { x: -320, y: -60 },
        data: {
          ...FILTER_DEFAULTS,
          name: 'Peleș filter',
          preset: 'custom',
          bands: [],
          lmin: 400,
          lmax: 1000,
          step: 4,
          targetQ: 'T',
          pol: 's',
          minD: 5,
          maxD: 2000,
          maxLayers: 80,
          maxTotal: 12000,
          algorithm: 'deep',
          candidates: 8,
          iterations: 400,
          needleStep: 10,
          lambdaRef: 700,
          start: 'formula',
          formula: '(HL)^10',
          design: { front: [], back: [] },
        },
      },
      { id: 'wl', type: 'param', position: { x: 320, y: -200 }, data: param('lambda', 'range', 700, 400, 1000, 1) },
      { id: 'th', type: 'param', position: { x: 320, y: 360 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 320, y: 60 }, data: { ...compute('Castle filter'), polarization: 's' } },
      { id: 'check', type: 'match', position: { x: 760, y: -200 }, data: { ...MATCH_DEFAULTS, name: 'MF (independent TMM)', field: 'T', metric: 'rms' } },
      { id: 'plot', type: 'plot', position: { x: 1220, y: -200 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      { id: 'draw', type: 'draw', position: { x: 760, y: 420 }, data: { ...DRAW_DEFAULTS, scale: 'proportional', compress: false, light: 'center' } },
    ],
    [
      edge('mh', 'filter', 'm0'),
      edge('mm', 'filter', 'm1'),
      edge('air', 'filter', 'incident'),
      edge('sub', 'filter', 'sub'),
      edge('contour', 'target', 'in'),
      edge('target', 'filter', 'target'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'check', 'in'),
      edge('target', 'check', 'target'),
      edge('check', 'plot', 'in', 'marked'),
      edge('filter', 'draw', 'in'),
    ],
    [
      { id: 'user-h-225', name: 'H (n = 2.25)', color: '#3f6fb5', model: { type: 'constant', n: 2.25, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
      { id: 'user-m-138', name: 'M (n = 1.38)', color: '#cfe8d8', model: { type: 'constant', n: 1.38, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
      { id: 'user-sub-152', name: 'substrate (n = 1.52)', color: '#dfe7ee', model: { type: 'constant', n: 1.52, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
    ],
  );

// ---- Grating-coupled SPR sensor with the −1st order, Al–Au bimetallic: C. Hu, Optik 122, 1881 (2011) — RCWA at 900 nm,
// TM, light from the analyte onto a lamellar metal grating (Λ = 350 nm, metal fraction 0.9) on the same metal; Drude
// metals ε = 1 − λ²λc / (λp²(λc + iλ)) (Au: λp 168.26 nm, λc 8934.2 nm; Al: 106.57, 24511 nm). Their Fig. 4(a) value
// 53.37° must read 54.37°: only then do their own ratios (χ of Al “almost 273 %” of Au, the bimetallic 2.36×) follow.
export const HU2011 = {
  base350: { theta: [60.55, 51.87], S: 173.6 }, // Fig. 2(d): Au, depth 40 nm, n 1.32 → 1.37
  au30: { theta: [63.02, 54.37], fwhm: 2.02 }, // Fig. 4(a) (54.37 printed 53.37)
  al30: { theta: [68.21, 58.7], fwhm: 0.82 }, // Fig. 4(b)
  alAu: { shift: 9.39, fwhm: 0.93, S: 187, chi: 201 }, // Fig. 4(c), Fig. 5: Al 27 nm + Au 3 nm
};
const eVof = (lamNm: number) => 1239.84193 / lamNm;
const HU_MAT: Record<string, MaterialDef> = {
  au: { id: 'user-au-hu2011', name: 'Au (Drude, Hu 2011)', color: '#d4af37', model: { type: 'drude-lorentz', epsInf: 1, wp: eVof(168.26), gamma: eVof(8934.2), osc: [] }, source: 'C. Hu, Optik 122, 1881 (2011), Eq. (7): λp = 168.26 nm, λc = 8934.2 nm' },
  al: { id: 'user-al-hu2011', name: 'Al (Drude, Hu 2011)', color: '#b8bcc4', model: { type: 'drude-lorentz', epsInf: 1, wp: eVof(106.57), gamma: eVof(24511), osc: [] }, source: 'C. Hu, Optik 122, 1881 (2011): λp = 106.57 nm, λc = 24511 nm' },
  an: { id: 'user-analyte-132', name: 'analyte (n = 1.32)', color: '#a8d4ef', model: { type: 'constant', n: 1.32, k: 0 }, source: 'C. Hu, Optik 122, 1881 (2011): analyte 1.32 … 1.37' },
};
// Al grating (27 nm) under a conformal 3 nm Au film, as a pixel map of 10 rows × 350 columns (3 nm × 1 nm cells): outer
// ridge 0.9 Λ = 315 nm, Al core 309 nm; 0 = Al, 1 = analyte, 2 = Au
export const huCoatedPixels = () => {
  const nx = 350, px: number[] = [];
  const c0 = (nx - 315) / 2;
  for (let r = 0; r < 10; r++)
    for (let i = 0; i < nx; i++) {
      const outer = i >= c0 && i < c0 + 315, core = i >= c0 + 3 && i < c0 + 312;
      px.push(r === 0 ? (outer ? 2 : 1) : r < 9 ? (core ? 0 : outer ? 2 : 1) : core ? 0 : 2);
    }
  return px;
};
export const HU_N = [1.32, 1.3325, 1.345, 1.3575, 1.37];
export const huGratingExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -900, y: -640 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Grating SPR sensor, −1st order, Al–Au (Hu, Optik 2011)',
          text:
            'C. Hu, Optik 122, 1881 (2011). Light (TM, 900 nm) comes from the analyte onto an aluminium grating (Λ = 350 nm, 27 nm deep, metal fraction 0.9) coated by 3 nm of gold (drawn as a pixel map: the film also covers the side walls); Drude metals of the paper. The −1st order excites the plasmon: the dip moves to smaller angles when n grows. The analyte is one Material with an index sweep (1.32 … 1.37), so it fills the grooves too.\n\n' +
            'Press Run on Compute RCWA (1505 points: about a minute on a multi-core computer). N = 20: the 3 nm side walls ask for more (the warning), but N = 20 and 30 give the same dip angles to 0.02° here. FWHM gives the dip angle and width for each n; Custom data (with the analyte Material connected: its n) computes S = Δθ/Δn against n = 1.32 and χ = S/FWHM.\n\n' +
            'Paper: shift 9.39° for 1.32 → 1.37, FWHM 0.93°, S = 187 °/RIU (regression over five indices), χ = 201 RIU⁻¹. Here: shift ≈ 9.25°, FWHM ≈ 0.81°, S ≈ 185 °/RIU. Also checked (see the tests): the plain Au grating, 40 nm deep, 60.55° → 51.87° in the paper, 60.5–60.6° → 51.6–51.8° here as N goes from 10 to 50 — metal gratings in TM converge in oscillations, and the paper does not give its N; the gold grating 30 nm deep, 63.02° → 54.37° (printed 53.37°) — 63.1° → 54.4° here.',
          width: 460,
          height: 520,
        },
      },
      userMaterial('an', HU_MAT.an, -900, 0),
      userMaterial('al', HU_MAT.al, -900, 180),
      userMaterial('au', HU_MAT.au, -900, 360),
      { id: 'ns', type: 'sweep', position: { x: -900, y: 560 }, data: { name: 'analyte n', kind: 'number', mode: 'list', min: 1.32, max: 1.37, step: 0.0125, list: HU_N.join(', ') } },
      {
        id: 'gr',
        type: 'grating',
        position: { x: -420, y: 40 },
        data: { ...GRATING_DEFAULTS, label: 'Al + 3 nm Au', profile: 'pixel', period: 350, thickness: 30, fill: 0.9, fillTop: 0.9, shift: 0, slices: 10, nx: 350, pixels: huCoatedPixels(), materials: 3 },
      },
      { id: 'stack', type: 'combine', position: { x: 0, y: 160 }, data: { name: 'Al–Au grating', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 380, y: -200 }, data: param('lambda', 'constant', 900, 500, 1000, 1) },
      { id: 'th', type: 'param', position: { x: 380, y: 520 }, data: param('theta', 'range', 62, 55, 70, 0.05) },
      { id: 'rc', type: 'rcwa', position: { x: 380, y: 60 }, data: { ...RCWA_DEFAULTS, name: 'Al–Au grating', orders: 20, show: 1 } },
      { id: 'fwhm', type: 'fwhm', position: { x: 840, y: -300 }, data: { ...ANALYSIS_DEFAULTS.fwhm, along: 'theta' } },
      { id: 'plot', type: 'plot', position: { x: 1300, y: -640 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
      { id: 'ref', type: 'extract', position: { x: 1300, y: 60 }, data: { name: 'n = 1.32 (reference)', fields: [], fixed: { 'sweep:ns': 0 } } },
      {
        id: 'sens',
        type: 'custom',
        position: { x: 1760, y: -200 },
        data: {
          name: 'S and χ',
          rows: [
            { name: 'shift', expr: 'b_theta - a_theta' },
            { name: 'S', expr: '(b_theta - a_theta) / (c_n - 1.32)' },
            { name: 'chi', expr: '(b_theta - a_theta) / (c_n - 1.32) / b_FWHM' },
          ],
          aliases: { 'fwhm:metrics': 'a', 'ref:out': 'b', 'an:out': 'c' },
        },
      },
    ],
    [
      edge('ns', 'an', 'n'),
      edge('al', 'gr', 'ridge'),
      edge('an', 'gr', 'groove'),
      edge('au', 'gr', 'm2'),
      edge('an', 'stack', 'incident'),
      edge('gr', 'stack', 'item-0'),
      edge('al', 'stack', 'exit'),
      edge('stack', 'rc', 'stack'),
      edge('wl', 'rc', 'lambda'),
      edge('th', 'rc', 'theta'),
      edge('rc', 'fwhm', 'in'),
      edge('fwhm', 'plot', 'in'),
      edge('fwhm', 'ref', 'in', 'metrics'),
      edge('fwhm', 'sens', 'in', 'metrics'),
      edge('ref', 'sens', 'in'),
      edge('an', 'sens', 'in'),
    ],
    Object.values(HU_MAT),
  );

// ---- Graphene SPR biosensor for malaria: T. Tene, F. Arias Arias, K. I. Paredes-Páliz et al., Front. Bioeng.
// Biotechnol. 13, 1580344 (2025) — Kretschmann at 633 nm, the optimized Sys3 (Ag 45 nm | Si₃N₄ 5 nm | 2 graphene
// layers) and Sys4 (Ag 40 | Si₃N₄ 6 | 2 graphene | ssDNA 5 nm); normal erythrocytes and the ring, trophozoite and schizont
// stages. Their Table 2 gives graphene 3.0 + 1.462i, §3.6 3.0 + 1.1491i: the latter reproduces all their angles and dips.
export const TENE2025 = {
  n: { normal: 1.402, ring: 1.395, trophozoite: 1.381, schizont: 1.371 },
  // Table 3: Δθ (°), S (°/RIU), DA, QF (RIU⁻¹); Table 4: FoM (RIU⁻¹), LoD (10⁻⁵ RIU), CSF — ring, trophozoite, schizont
  sys3: { theta: [85.18, 82.71, 79.07, 77.02], dTheta: [2.472, 6.114, 8.161], S: [353.143, 291.143, 263.258], DA: [0.507, 1.447, 2.091], QF: [72.493, 68.906, 67.465], FoM: [70.163, 68.797, 67.464], LoD: [1.415, 1.717, 1.899], CSF: [63.846, 62.883, 61.764], FWHM: [5.41, 4.87, 4.23, 3.9], Rmin: [12.82, 3.21, 0.16, 0.002] },
  sys4: { theta: [86.92, 84.71, 80.73, 78.59], dTheta: [2.21, 6.191, 8.328], S: [315.714, 294.81, 268.645], DA: [0.375, 1.153, 1.63], QF: [53.603, 54.907, 52.594], FoM: [53.199, 53.883, 50.565], LoD: [1.583, 1.696, 1.861], CSF: [46.936, 47.602, 44.675], FWHM: [6.43, 5.89, 5.37, 5.11], Rmin: [20.45, 0.75, 1.86, 3.86] },
};
const TENE_MAT: Record<string, MaterialDef> = {
  bk7: { id: 'user-bk7-15151', name: 'BK7 (n = 1.5151)', color: '#9fc9e6', model: { type: 'constant', n: 1.5151, k: 0 }, source: 'Tene et al. (2025), Table 2 (BK-7 prism at 633 nm)' },
  ag: { id: 'user-ag-tene', name: 'Ag (0.056253 + 4.2760i)', color: '#c0c0c8', model: { type: 'constant', n: 0.056253, k: 4.276 }, source: 'Tene et al. (2025), Table 2 (silver at 633 nm)' },
  sin: { id: 'user-sin-20394', name: 'Si₃N₄ (n = 2.0394)', color: '#b9a37e', model: { type: 'constant', n: 2.0394, k: 0 }, source: 'Tene et al. (2025), Table 2' },
  g: { id: 'user-graphene-1149', name: 'Graphene (3.0 + 1.1491i)', color: '#3d3d3d', model: { type: 'constant', n: 3.0, k: 1.1491 }, monolayer: 0.34, source: 'Tene et al. (2025), §3.6 (Table 2 prints 1.462i); 0.34 nm per layer' },
  dna: { id: 'user-ssdna-1462', name: 'ssDNA (n = 1.462)', color: '#e8c3a0', model: { type: 'constant', n: 1.462, k: 0 }, source: 'Tene et al. (2025), §3.6 (thiol-tethered ssDNA)' },
  normal: { id: 'user-rbc-normal', name: 'Erythrocytes, normal (n = 1.402)', color: '#e6a0a0', model: { type: 'constant', n: 1.402, k: 0 }, source: 'Tene et al. (2025), Table 2 (normal (I) stage)' },
  ring: { id: 'user-rbc-ring', name: 'Ring stage (n = 1.395)', color: '#e08a8a', model: { type: 'constant', n: 1.395, k: 0 }, source: 'Tene et al. (2025), §3.6 (ring (II) stage)' },
  troph: { id: 'user-rbc-troph', name: 'Trophozoite stage (n = 1.381)', color: '#d06f6f', model: { type: 'constant', n: 1.381, k: 0 }, source: 'Tene et al. (2025), §3.6 (trophozoite (III) stage)' },
  schiz: { id: 'user-rbc-schiz', name: 'Schizont stage (n = 1.371)', color: '#b85454', model: { type: 'constant', n: 1.371, k: 0 }, source: 'Tene et al. (2025), §3.6 (schizont (IV) stage)' },
};
export const teneMalariaExample = (sys: 3 | 4): Project => {
  const s4 = sys === 4;
  const P = TENE2025[s4 ? 'sys4' : 'sys3'];
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -900, y: -620 },
        data: {
          ...INFO_DEFAULTS,
          title: `Graphene SPR biosensor for malaria, Sys${sys} (Tene et al. 2025)`,
          text:
            `T. Tene et al., Front. Bioeng. Biotechnol. 13, 1580344 (2025): BK7 1.5151 | Ag ${s4 ? 40 : 45} nm | Si₃N₄ ${s4 ? 6 : 5} nm | 2 graphene layers (3.0 + 1.1491i, 0.34 nm)${s4 ? ' | ssDNA 5 nm (1.462)' : ''} | erythrocytes; TM, 633 nm. The medium is a Material sweep: normal (1.402), ring (1.395), trophozoite (1.381), schizont (1.371).\n\n` +
            'FWHM gives the dip angle, its width and R at the dip for every medium. Extract data takes the normal medium as the reference; Custom data (with the medium and the normal Material connected: their n) computes Δθ, Δn and S = Δθ/Δn, then DA = Δθ/FWHM, QF = S/FWHM, FoM = S(1 − Rmin)/FWHM, LoD = Δn/Δθ · 0.005°, CSF = S(Rmax − Rmin)/FWHM (Rmax before the dip: Min / max).\n\n' +
            `Paper (Tables 3, 4): Δθ ${P.dTheta.join(' / ')}°, S ${P.S.join(' / ')} °/RIU — reproduced to the last digit, as the dip angles and depths. Their widths (${P.FWHM.join(' / ')}°) follow an undeclared definition: ours are the half-depth widths, so DA, QF, FoM and CSF differ by up to ~10 %; LoD depends only on Δθ and agrees.`,
          width: 440,
          height: 470,
        },
      },
      userMaterial('bk7', TENE_MAT.bk7, -900, -60),
      userMaterial('agm', TENE_MAT.ag, -900, 110),
      userMaterial('sinm', TENE_MAT.sin, -900, 280),
      userMaterial('gm', TENE_MAT.g, -900, 450),
      ...(s4 ? [userMaterial('dnam', TENE_MAT.dna, -900, 620)] : []),
      userMaterial('normal', TENE_MAT.normal, -900, 800),
      userMaterial('ring', TENE_MAT.ring, -900, 970),
      userMaterial('troph', TENE_MAT.troph, -900, 1140),
      userMaterial('schiz', TENE_MAT.schiz, -900, 1310),
      { id: 'media', type: 'matsweep', position: { x: -500, y: 960 }, data: { name: 'erythrocytes' } },
      { id: 'ag', type: 'layer', position: { x: -500, y: 60 }, data: { label: 'Ag', thickness: s4 ? 40 : 45, layers2D: 1 } },
      { id: 'sin', type: 'layer', position: { x: -500, y: 260 }, data: { label: 'Si₃N₄', thickness: s4 ? 6 : 5, layers2D: 1 } },
      { id: 'g', type: 'layer', position: { x: -500, y: 460 }, data: { label: 'graphene', thickness: 0.68, layers2D: 2 } },
      ...(s4 ? [{ id: 'dna', type: 'layer', position: { x: -500, y: 660 }, data: { label: 'ssDNA', thickness: 5, layers2D: 1 } } as AppNode] : []),
      { id: 'stack', type: 'combine', position: { x: -120, y: 260 }, data: { name: `Sys${sys}`, count: s4 ? 4 : 3 } },
      { id: 'wl', type: 'param', position: { x: 260, y: -160 }, data: param('lambda', 'constant', 633, 500, 900, 1) },
      { id: 'th', type: 'param', position: { x: 260, y: 560 }, data: param('theta', 'range', 75, 60, 89.9, 0.005) },
      { id: 'tmm', type: 'compute', position: { x: 260, y: 160 }, data: compute(`Sys${sys}`) },
      { id: 'fwhm', type: 'fwhm', position: { x: 700, y: -300 }, data: { ...ANALYSIS_DEFAULTS.fwhm, along: 'theta' } },
      { id: 'rmax', type: 'extremum', position: { x: 700, y: 500 }, data: { ...ANALYSIS_DEFAULTS.extremum, mode: 'max', field: 'R', along: 'theta', lo: 60, hi: 72 } },
      { id: 'plot', type: 'plot', position: { x: 1160, y: -620 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
      { id: 'ref', type: 'extract', position: { x: 1160, y: 40 }, data: { name: 'normal (reference)', fields: [], fixed: { 'sweep:media': 0 } } },
      {
        id: 'sens',
        type: 'custom',
        position: { x: 1620, y: -200 },
        data: {
          name: 'shift and sensitivity',
          rows: [
            { name: 'dtheta', expr: 'b_theta - a_theta' },
            { name: 'dn', expr: 'd_n - c_n' },
            { name: 'S', expr: '(b_theta - a_theta) / (d_n - c_n)' },
          ],
          aliases: { 'fwhm:metrics': 'a', 'ref:out': 'b', 'media:out': 'c', 'normal:out': 'd' },
        },
      },
      {
        id: 'perf',
        type: 'custom',
        position: { x: 2080, y: -200 },
        data: {
          name: 'performance (Eqs. 9–13)',
          rows: [
            { name: 'DA', expr: 'a_dtheta / b_FWHM' },
            { name: 'QF', expr: 'a_S / b_FWHM' },
            { name: 'FoM', expr: 'a_S * (1 - b_R_dip) / b_FWHM' },
            { name: 'LoD_1e-5', expr: 'a_dn / a_dtheta * 0.005 * 1e5' },
            { name: 'CSF', expr: 'a_S * (c_max_R - b_R_dip) / b_FWHM' },
          ],
          aliases: { 'sens:out': 'a', 'fwhm:metrics': 'b', 'rmax:metrics': 'c' },
        },
      },
    ],
    [
      edge('agm', 'ag', 'mat'),
      edge('sinm', 'sin', 'mat'),
      edge('gm', 'g', 'mat'),
      ...(s4 ? [edge('dnam', 'dna', 'mat')] : []),
      edge('normal', 'media', 'in'),
      edge('ring', 'media', 'in'),
      edge('troph', 'media', 'in'),
      edge('schiz', 'media', 'in'),
      edge('bk7', 'stack', 'incident'),
      edge('ag', 'stack', 'item-0'),
      edge('sin', 'stack', 'item-1'),
      edge('g', 'stack', 'item-2'),
      ...(s4 ? [edge('dna', 'stack', 'item-3')] : []),
      edge('media', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'fwhm', 'in'),
      edge('tmm', 'rmax', 'in'),
      edge('fwhm', 'plot', 'in'),
      edge('fwhm', 'ref', 'in', 'metrics'),
      edge('fwhm', 'sens', 'in', 'metrics'),
      edge('ref', 'sens', 'in'),
      edge('media', 'sens', 'in'),
      edge('normal', 'sens', 'in'),
      edge('sens', 'perf', 'in'),
      edge('fwhm', 'perf', 'in', 'metrics'),
      edge('rmax', 'perf', 'in', 'metrics'),
    ],
    Object.values(TENE_MAT).filter((m) => s4 || m !== TENE_MAT.dna),
  );
};

// ---- OIC 2025 design challenge, the committee's example designs (Kruschwitz, Trubetskov, Keck, Appl. Opt. 65, A12
// (2026); data files on figshare, CC BY 4.0) — the official merit functions computed with Extract data and Custom data ----
const OIC_MAT: Record<string, MaterialDef> = {
  H: { id: 'user-h-225', name: 'H (n = 2.25)', color: '#3f6fb5', model: { type: 'constant', n: 2.25, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  M: { id: 'user-m-138', name: 'M (n = 1.38)', color: '#cfe8d8', model: { type: 'constant', n: 1.38, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  A: { id: 'user-a-165', name: 'A (n = 1.65)', color: '#9cc3a0', model: { type: 'constant', n: 1.65, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  F: { id: 'user-f-200', name: 'F (n = 2.00)', color: '#6d8fc4', model: { type: 'constant', n: 2.0, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  L: { id: 'user-l-145', name: 'L (n = 1.45)', color: '#e3efe6', model: { type: 'constant', n: 1.45, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  T: { id: 'user-t-215', name: 'T (n = 2.15)', color: '#4c7cc0', model: { type: 'constant', n: 2.15, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  AG: { id: 'user-ag-oic', name: 'Ag (OIC 2025: 0.12 + 3.45i)', color: '#c0c0c8', model: { type: 'constant', n: 0.12, k: 3.45 }, source: 'OIC 2025 design contest, Table 3 (nominal, no dispersion)' },
  AU: { id: 'user-au-oic', name: 'Au (OIC 2025: 0.306 + 2.88i)', color: '#d4af37', model: { type: 'constant', n: 0.306, k: 2.88 }, source: 'OIC 2025 design contest, Table 3 (nominal, no dispersion)' },
  NI: { id: 'user-ni-oic', name: 'Ni (OIC 2025: 1.8 + 3.33i)', color: '#8a8f96', model: { type: 'constant', n: 1.8, k: 3.33 }, source: 'OIC 2025 design contest, Table 3 (nominal, no dispersion)' },
  SUB: { id: 'user-sub-152', name: 'substrate (n = 1.52)', color: '#dfe7ee', model: { type: 'constant', n: 1.52, k: 0 }, source: 'OIC 2025 design contest, Table 2' },
  CUBE: { id: 'user-sub-180', name: 'cube glass (n = 1.80)', color: '#d6e2ea', model: { type: 'constant', n: 1.8, k: 0 }, source: 'OIC 2025 design contest, Table 8 (Problem B)' },
};
// A design file (layers from the substrate outwards) → the Filter designer's layers (top = the incident side first),
// the letters in the order of the designer's material ports.
const oicDesign = (file: [string, number][], ports: string[]) => [...file].reverse().map(([m, d]) => ({ m: ports.indexOf(m), d }));

// Problem A: the Neuschwanstein target (Data File 1) and the committee's 17-layer design with metal-like layers (Data File 2)
export const oicCastleExample = (): Project => {
  const ports = ['H', 'M', 'A', 'AG', 'AU', 'NI'];
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -900, y: -560 },
        data: {
          ...INFO_DEFAULTS,
          title: 'OIC 2025 Problem A: the Neuschwanstein castle',
          text:
            'Kruschwitz, Trubetskov, Keck, Appl. Opt. 65, A12 (2026). The target (Data File 1: T in % from 300 to 1100 nm every 0.1 nm) follows the contour of the Neuschwanstein castle; normal incidence, air | coating | substrate 1.52 (no back side); materials without dispersion (Tables 2, 3). The Filter designer holds the committee’s 17-layer example design (Data File 2, with Ag, Au and Ni layers).\n\n' +
            'MF = 100·√(mean (T − T̂)²) over the 8001 points, built from the nodes: Extract data takes T(λ) of the computation, Custom data the squared deviation from the target at every point, Extract data its mean over λ, Custom data 100·√(mean). Official value of this design: MF = 7.006763 — the nodes give the same to all 7 digits.\n\n' +
            'For scale: the winning designs (H and M only, 100 layers, ≈ 11 µm) reach MF ≈ 0.72 before production. Press Start in the Filter designer (it replaces the example design) to try.',
          width: 420,
          height: 430,
        },
      },
      { id: 'air', type: 'material', position: { x: -900, y: -60 }, data: materialData('Air') },
      userMaterial('mh', OIC_MAT.H, -900, 110),
      userMaterial('mm', OIC_MAT.M, -900, 280),
      userMaterial('ma', OIC_MAT.A, -900, 450),
      userMaterial('mag', OIC_MAT.AG, -900, 620),
      userMaterial('mau', OIC_MAT.AU, -900, 790),
      userMaterial('mni', OIC_MAT.NI, -900, 960),
      userMaterial('sub', OIC_MAT.SUB, -900, 1130),
      { id: 'castle', type: 'import', position: { x: -900, y: -1000 }, data: { ...IMPORT_DEFAULTS, name: 'Neuschwanstein target', fileName: 'Neuschwanstein_target.csv', text: OIC_A_TARGET_CSV, names: 'T', scale: 0.01, color: '#d44f9e' } },
      { id: 'target', type: 'target', position: { x: -420, y: -1000 }, data: { ...TARGET_DEFAULTS, name: 'castle target', mode: 'data', field: 'T', min: NaN, max: NaN, quantity: 'T', tol: 0.01, kind: 'eq' } },
      {
        id: 'filter',
        type: 'filter',
        position: { x: -420, y: -60 },
        data: {
          ...FILTER_DEFAULTS,
          name: 'OIC 2025 A — committee design',
          preset: 'custom',
          bands: [],
          lmin: 300,
          lmax: 1100,
          step: 2,
          targetQ: 'T',
          pol: 's',
          materials: ports.length,
          minD: 2,
          maxD: 2000,
          maxLayers: 100,
          maxTotal: 20000,
          algorithm: 'deep',
          candidates: 8,
          iterations: 400,
          needleStep: 10,
          lambdaRef: 700,
          start: 'current',
          design: { front: oicDesign(OIC_A_EXAMPLE, ports), back: [] },
        },
      },
      { id: 'wl', type: 'param', position: { x: 260, y: -300 }, data: param('lambda', 'range', 700, 300, 1100, 0.1) },
      { id: 'th', type: 'param', position: { x: 260, y: 420 }, data: param('theta', 'constant', 0, 0, 80, 1) },
      { id: 'tmm', type: 'compute', position: { x: 260, y: 40 }, data: { ...compute('Committee design'), polarization: 's' } },
      { id: 'plot', type: 'plot', position: { x: 760, y: -560 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      { id: 'xT', type: 'extract', position: { x: 760, y: 60 }, data: { name: 'T(λ)', fields: ['T'], fixed: { theta: 0 } } },
      { id: 'dev', type: 'custom', position: { x: 1220, y: 60 }, data: { name: 'squared deviation', rows: [{ name: 'd2', expr: '(a_T - b_T)^2' }], aliases: { 'xT:out': 'a', 'castle:out': 'b' } } },
      { id: 'avg', type: 'extract', position: { x: 1680, y: 60 }, data: { name: 'mean over λ', fields: ['c0'], fixed: {}, mean: ['lambda'] } },
      { id: 'mf', type: 'custom', position: { x: 2140, y: 60 }, data: { name: 'MF (OIC 2025, Eq. 1)', rows: [{ name: 'MF', expr: '100 * sqrt(a_d2)' }], aliases: { 'avg:out': 'a' } } },
    ],
    [
      edge('mh', 'filter', 'm0'),
      edge('mm', 'filter', 'm1'),
      edge('ma', 'filter', 'm2'),
      edge('mag', 'filter', 'm3'),
      edge('mau', 'filter', 'm4'),
      edge('mni', 'filter', 'm5'),
      edge('air', 'filter', 'incident'),
      edge('sub', 'filter', 'sub'),
      edge('castle', 'target', 'in'),
      edge('target', 'filter', 'target'),
      edge('filter', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'plot', 'in'),
      edge('tmm', 'xT', 'in'),
      edge('xT', 'dev', 'in'),
      edge('castle', 'dev', 'in'),
      edge('dev', 'avg', 'in'),
      edge('avg', 'mf', 'in'),
    ],
    ports.map((k) => OIC_MAT[k]).concat(OIC_MAT.SUB),
  );
};

// Problem B: the immersed three-line polarizing notch filter, the committee's 68-layer example (Data File 3)
export const oicNotchExample = (): Project => {
  const ports = ['F', 'A', 'M', 'L', 'T'];
  const at = (id: string, lam: number, y: number): AppNode => ({ id, type: 'extract', position: { x: 1220, y }, data: { name: `at ${lam} nm`, fields: ['c0'], fixed: { theta: 0 }, at: { lambda: lam } } }) as AppNode;
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -900, y: -600 },
        data: {
          ...INFO_DEFAULTS,
          title: 'OIC 2025 Problem B: immersed three-line polarizing notch',
          text:
            'Kruschwitz, Trubetskov, Keck, Appl. Opt. 65, A12 (2026). The coating sits on the diagonal of a cube (n = 1.80): light at 45° inside the glass; the three lines 450, 550 and 650 nm are reflected in s polarization, everything else goes through. Materials of Table 8 (no dispersion); at most 100 layers and 20 µm. The Filter designer holds the committee’s 68-layer example (Data File 3).\n\n' +
            'MF = (500/3)·Σ Ts/Tp at 450, 550, 650 nm + #(Rs ≥ 99 %) / #(Ts ≥ 99 %) over 400–700 nm every 0.1 nm (Eq. 2), built from the nodes: two computations (s, p); Custom data per wavelength (Ts/Tp and the Heaviside steps step(Rs − 0.99), step(Ts − 0.99)); Extract data at 450, 550, 650 nm and the mean of the steps over λ (the fraction of the points); Custom data sums them. Official value: MF = 1.8540762059 — the nodes give it to 13 digits.\n\n' +
            'Results of the challenge (Table 10): 0.265 (Lemarchand, 99 layers), 0.366, 0.576, 0.849, 8.14, 10.33.',
          width: 440,
          height: 470,
        },
      },
      userMaterial('cube', OIC_MAT.CUBE, -900, -40),
      userMaterial('mf', OIC_MAT.F, -900, 130),
      userMaterial('ma', OIC_MAT.A, -900, 300),
      userMaterial('mm', OIC_MAT.M, -900, 470),
      userMaterial('ml', OIC_MAT.L, -900, 640),
      userMaterial('mt', OIC_MAT.T, -900, 810),
      // the specification of B.1 for the designer (its own merit; the official MF is computed after it), at 45° in the
      // cube: s reflected in the three lines and transmitted elsewhere; p transmitted everywhere (two Target nodes: in one
      // node, overlapping bands keep the last one)
      {
        id: 'specS',
        type: 'target',
        position: { x: -420, y: -1700 },
        data: {
          ...TARGET_DEFAULTS,
          name: 'B.1 — s polarization',
          mode: 'bands',
          min: 400,
          max: 700,
          step: 0.5,
          quantity: 'T',
          pol: 's',
          angle: 45,
          tol: 0.01,
          bands: [
            ...[[400, 446], [454, 546], [554, 646], [654, 700]].map(([lo, hi]) => ({ lo, hi, value: 0.99, weight: 1, q: 'T', kind: 'ge' as const })),
            ...[450, 550, 650].map((c) => ({ lo: c - 0.5, hi: c + 0.5, value: 1, weight: 5, q: 'R', kind: 'eq' as const })),
          ],
        },
      },
      {
        id: 'specP',
        type: 'target',
        position: { x: -420, y: -1080 },
        data: { ...TARGET_DEFAULTS, name: 'B.1 — p polarization', mode: 'bands', min: 400, max: 700, step: 0.5, quantity: 'T', pol: 'p', angle: 45, tol: 0.01, bands: [{ lo: 400, hi: 700, value: 0.99, weight: 1, kind: 'ge' as const }] },
      },
      {
        id: 'filter',
        type: 'filter',
        position: { x: -420, y: -60 },
        data: {
          ...FILTER_DEFAULTS,
          name: 'OIC 2025 B — committee design',
          preset: 'custom',
          bands: [],
          lmin: 400,
          lmax: 700,
          step: 1,
          targetQ: 'T',
          angles: '45',
          pol: 'both',
          materials: ports.length,
          minD: 5,
          maxD: 2000,
          maxLayers: 100,
          maxTotal: 20000,
          algorithm: 'deep',
          start: 'current',
          design: { front: oicDesign(OIC_B_EXAMPLE, ports), back: [] },
        },
      },
      { id: 'wl', type: 'param', position: { x: 260, y: -360 }, data: param('lambda', 'range', 550, 400, 700, 0.1) },
      { id: 'th', type: 'param', position: { x: 260, y: 700 }, data: param('theta', 'constant', 45, 0, 80, 1) },
      { id: 'tmmS', type: 'compute', position: { x: 260, y: -60 }, data: { ...compute('s polarization'), polarization: 's' } },
      { id: 'tmmP', type: 'compute', position: { x: 260, y: 330 }, data: { ...compute('p polarization'), polarization: 'p' } },
      { id: 'plotS', type: 'plot', position: { x: 760, y: -620 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      { id: 'plotP', type: 'plot', position: { x: 760, y: 820 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      {
        id: 'perL',
        type: 'custom',
        position: { x: 760, y: 60 },
        data: {
          name: 'per wavelength',
          rows: [
            { name: 'ratio', expr: 'a_T / b_T' },
            { name: 'hR', expr: 'step(a_R - 0.99)' },
            { name: 'hT', expr: 'step(a_T - 0.99)' },
          ],
          aliases: { 'tmmS:out': 'a', 'tmmP:out': 'b' },
        },
      },
      at('x450', 450, -340),
      at('x550', 550, -40),
      at('x650', 650, 260),
      { id: 'frac', type: 'extract', position: { x: 1220, y: 560 }, data: { name: 'fractions over λ', fields: ['c1', 'c2'], fixed: { theta: 0 }, mean: ['lambda'] } },
      {
        id: 'mfB',
        type: 'custom',
        position: { x: 1680, y: 60 },
        data: {
          name: 'MF (OIC 2025, Eq. 2)',
          rows: [{ name: 'MF', expr: '500/3 * (c_ratio + d_ratio + e_ratio) + f_hR / f_hT' }],
          aliases: { 'x450:out': 'c', 'x550:out': 'd', 'x650:out': 'e', 'frac:out': 'f' },
        },
      },
    ],
    [
      edge('mf', 'filter', 'm0'),
      edge('ma', 'filter', 'm1'),
      edge('mm', 'filter', 'm2'),
      edge('ml', 'filter', 'm3'),
      edge('mt', 'filter', 'm4'),
      edge('cube', 'filter', 'incident'),
      edge('cube', 'filter', 'sub'),
      edge('specS', 'filter', 'target'),
      edge('specP', 'filter', 'target'),
      edge('filter', 'tmmS', 'stack'),
      edge('filter', 'tmmP', 'stack'),
      edge('wl', 'tmmS', 'lambda'),
      edge('wl', 'tmmP', 'lambda'),
      edge('th', 'tmmS', 'theta'),
      edge('th', 'tmmP', 'theta'),
      edge('tmmS', 'plotS', 'in'),
      edge('tmmP', 'plotP', 'in'),
      edge('tmmS', 'perL', 'in'),
      edge('tmmP', 'perL', 'in'),
      edge('perL', 'x450', 'in'),
      edge('perL', 'x550', 'in'),
      edge('perL', 'x650', 'in'),
      edge('perL', 'frac', 'in'),
      edge('x450', 'mfB', 'in'),
      edge('x550', 'mfB', 'in'),
      edge('x650', 'mfB', 'in'),
      edge('frac', 'mfB', 'in'),
    ],
    ports.map((k) => OIC_MAT[k]).concat(OIC_MAT.CUBE),
  );
};

// ---- SPR sensors by a genetic algorithm: M. Sebek, N. T. K. Thanh, X. Su, J. Teng, ACS Omega 8, 20792 (2023) ----
// The published sensors (resonance angles read from their Fig. 2B / 4B / 5B), the sensitivities they report and the
// structures (the 785 nm one as in their Fig. 5A: 13 hBN layers around the top MoS₂, the text says 7).
export const SEBEK2023 = {
  ns: 1.332,
  dn: 0.005,
  s633: { S: 578, theta: [85.0, 87.9] as [number, number] }, // CaF₂ | 17 L hBN | 12 nm Al | 28 nm Ag | 17 L hBN
  s785: { S: 676.4, theta: [84.9, 88.3] as [number, number] }, // FSL3 | 15 L hBN | 14 L MoS₂ | 14 L hBN | 47 nm Ag | 13 L hBN | 9 L MoS₂ | 13 L hBN
  dual: { S: 1364, dTheta: 6.78, theta: [81.7, 88.5] as [number, number], g: 0.088 }, // K-FIR97UV | 3 L WS₂ | 282 nm GeO₂ | 47 nm Ag
};
// A Material node of a project material (its colour: not in the built-in library).
const userMaterial = (id: string, def: MaterialDef, x: number, y: number): AppNode => ({ id, type: 'material', position: { x, y }, data: { ...materialData(def.id), color: def.color } });
const WATER_1332: MaterialDef = { id: 'user-water-1332', name: 'Water (n = 1.332)', color: '#6fb3e0', model: { type: 'constant', n: 1.332, k: 0 }, source: 'sensing medium of M. Sebek et al. (2023): n_s = 1.332 → 1.337' };

// The genetic algorithm at 633 nm in the Optimization Engine: the article's roles (prism, plasmonic metals, another
// metal, dielectrics, 2D materials) and settings, its single-mode conditions; the structure shown at first is the
// article's sensor.
export const sprGaExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -700, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'SPR sensor by a genetic algorithm (Sebek et al. 2023)',
          text: 'M. Sebek, N. T. K. Thanh, X. Su, J. Teng, ACS Omega 8, 20792 (2023). Optimization Engine, algorithm “Genetic — layer sequences”: tick the materials of each role (prisms, plasmonic metals, other metals, dielectrics, 2D materials counted in monolayers) and their limits; the algorithm builds sensors between the prism and the sensing medium and maximizes the angular sensitivity S = Δθ/Δn of the TM dip for n_s = 1.332 → 1.337. As in the article: population 50, 10 % elites, a wheel weighted by S, children made by one mutation (33 %: thickness ± 1 step, material, swap, add, delete) or one crossover (67 %: crossover point, materials exchanged), invalid children replaced from the pool of valid structures; single-mode conditions: dip deeper than 0.4, left / right half width ≤ 1.25, smooth.\n\nThe structure shown at first is the article\'s 633 nm sensor, CaF₂ | 17 L hBN | 12 nm Al | 28 nm Ag | 17 L hBN: 578 deg/RIU in the article (85.0° → 87.9°), about 450 with the library data here (84.0° → 86.2°) — near grazing incidence S changes a lot with the optical data (their Table S1 is not available). Start runs the algorithm from random structures (seed 1: ~530 deg/RIU after 30 generations). Compute TMM + Sensitivity check the structure on the output independently.',
          width: 520,
          height: 340,
        },
      },
      {
        id: 'opt',
        type: 'optimizer',
        position: { x: -380, y: 0 },
        data: {
          ...OPTIMIZER_DEFAULTS,
          algorithm: 'layerga',
          layerGa: {
            ...LAYER_GA_DEFAULTS,
            medium: WATER_1332.id,
            single: true,
            trace: true,
            generations: 30,
            best: {
              prism: 'CaF2',
              layers: [
                { role: 'twoD', mat: 'hBN', t: 17 },
                { role: 'plasmonic', mat: 'Al', t: 12 },
                { role: 'plasmonic', mat: 'Ag', t: 28 },
                { role: 'twoD', mat: 'hBN', t: 17 },
              ],
            },
          },
        },
      },
      { id: 'wl', type: 'param', position: { x: 260, y: -160 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'ang', type: 'param', position: { x: 260, y: 380 }, data: param('theta', 'range', 80, 70, 89.9, 0.01) },
      { id: 'tmm', type: 'compute', position: { x: 260, y: 60 }, data: compute('Best structure') },
      { id: 'sens', type: 'sensitivity', position: { x: 620, y: 260 }, data: { ...ANALYSIS_DEFAULTS.sensitivity, dn: 0.005 } },
      { id: 'plot', type: 'plot', position: { x: 620, y: -160 }, data: PLOT_DEFAULTS },
      { id: 'draw', type: 'draw', position: { x: 260, y: 620 }, data: DRAW_DEFAULTS },
    ],
    [
      edge('opt', 'tmm', 'stack', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('ang', 'tmm', 'theta'),
      edge('tmm', 'sens', 'in'),
      edge('sens', 'plot', 'in'),
      edge('opt', 'draw', 'in', 'stack'),
    ],
    [WATER_1332],
  );

// The dual-mode sensor of the article: a waveguide mode in 282 nm of GeO₂ coupled to the surface plasmon of 47 nm of Ag;
// as n_s grows the deeper dip passes from one branch to the other (a jump of the resonance angle). The map shows the two
// branches against n_s.
export const sprDualModeExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -460 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Dual-mode SPR sensor (Sebek et al. 2023)',
          text: 'Prism K-FIR97UV (n = 1.425 at 633 nm) | 3 L WS₂ | 282 nm GeO₂ | 47 nm Ag | water, TM, 633 nm: the structure the genetic algorithm found without extra conditions (ACS Omega 8, 20792 (2023), Fig. 2). A waveguide mode of the GeO₂ film couples to the surface plasmon of the Ag film (anticrossing, g ≈ 88 meV in the article). For n_s = 1.332 the deeper dip is the lower-angle one; at 1.337 the other one: the “resonance angle” jumps by 6.78° (article), S = 1364 deg/RIU. Here, with the library data: ~7.1°, ~1420 deg/RIU (Sensitivity node).\n\nThe map (R against θ and n_s) shows the two branches and the change of the deeper one. The response is not linear: a threshold sensor rather than a linear one, as the article notes.',
          width: 440,
          height: 290,
        },
      },
      material('prism', 'K-FIR97UV', 0, -120),
      material('ws2m', 'WS2', -300, 60),
      { id: 'ws2', type: 'layer', position: { x: 0, y: 60 }, data: { label: 'WS₂', thickness: 1, layers2D: 3 } },
      material('geo2m', 'GeO2', -300, 230),
      { id: 'geo2', type: 'layer', position: { x: 0, y: 230 }, data: { label: 'GeO₂ waveguide', thickness: 282, layers2D: 1 } },
      material('agm', 'Ag', -300, 400),
      { id: 'ag', type: 'layer', position: { x: 0, y: 400 }, data: { label: 'Ag', thickness: 47, layers2D: 1 } },
      userMaterial('water', WATER_1332, 0, 570),
      { id: 'stack', type: 'combine', position: { x: 320, y: 150 }, data: { name: 'Dual-mode sensor', count: 3 } },
      { id: 'wl', type: 'param', position: { x: 320, y: -160 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'ang', type: 'param', position: { x: 320, y: 470 }, data: param('theta', 'range', 80, 70, 89.9, 0.01) },
      { id: 'tmm', type: 'compute', position: { x: 660, y: 60 }, data: compute('Dual-mode') },
      { id: 'sens', type: 'sensitivity', position: { x: 1020, y: 260 }, data: { ...ANALYSIS_DEFAULTS.sensitivity, dn: 0.005 } },
      { id: 'plot', type: 'plot', position: { x: 1020, y: -160 }, data: PLOT_DEFAULTS },
      // the map: the same layers with the sensing index swept
      { id: 'nsw', type: 'sweep', position: { x: -300, y: 760 }, data: { name: 'n_s', kind: 'number', mode: 'range', min: 1.31, max: 1.36, step: 0.0005, list: '' } },
      userMaterial('waterS', WATER_1332, 0, 760),
      { id: 'stack2', type: 'combine', position: { x: 320, y: 700 }, data: { name: 'n_s swept', count: 3 } },
      { id: 'ang2', type: 'param', position: { x: 320, y: 980 }, data: param('theta', 'range', 80, 76, 89.9, 0.05) },
      { id: 'tmm2', type: 'compute', position: { x: 660, y: 700 }, data: compute('R(θ, n_s)') },
      { id: 'map', type: 'plot', position: { x: 1020, y: 620 }, data: { ...PLOT_DEFAULTS, mode: 'map', field: 'R', x: 'theta', y: 'sweep:nsw' } },
    ],
    [
      edge('ws2m', 'ws2', 'mat'),
      edge('geo2m', 'geo2', 'mat'),
      edge('agm', 'ag', 'mat'),
      edge('prism', 'stack', 'incident'),
      edge('ws2', 'stack', 'item-0'),
      edge('geo2', 'stack', 'item-1'),
      edge('ag', 'stack', 'item-2'),
      edge('water', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('ang', 'tmm', 'theta'),
      edge('tmm', 'sens', 'in'),
      edge('sens', 'plot', 'in'),
      edge('nsw', 'waterS', 'n'),
      edge('prism', 'stack2', 'incident'),
      edge('ws2', 'stack2', 'item-0'),
      edge('geo2', 'stack2', 'item-1'),
      edge('ag', 'stack2', 'item-2'),
      edge('waterS', 'stack2', 'exit'),
      edge('stack2', 'tmm2', 'stack'),
      edge('wl', 'tmm2', 'lambda'),
      edge('ang2', 'tmm2', 'theta'),
      edge('tmm2', 'map', 'in'),
    ],
    [WATER_1332],
  );

// Liquid-crystal microcavity (Berreman 4×4): a 2 µm nematic layer (n_o = 1.52, n_e = 1.74, close to E7 in the visible,
// dispersion neglected) between two TiO₂/SiO₂ Bragg mirrors, H(LH)⁶ at 650 nm. The director lies in the x-z plane at a
// tilt θ_c from the layer (an applied voltage turns it towards the normal): at normal incidence x-polarized light sees
// n(θ_c) = n_o n_e / √(n_o² cos²θ_c + n_e² sin²θ_c), y-polarized light n_o. The map of T(λ, θ_c) for a diagonal incident
// polarization (ψ = 45°: x and y together) shows the x modes tuned down onto the fixed y modes, crossing the next order:
// the degeneracy of modes of opposite polarization used by K. Rechcińska et al., Science 366, 727 (2019).
const LC_NO: MaterialDef = { id: 'user-lc-no', name: 'Nematic LC, n_o = 1.52', color: '#d9b3e6', model: { type: 'constant', n: 1.52, k: 0 }, source: 'Example value close to the ordinary index of the nematic mixture E7 in the visible (dispersion neglected)' };
const LC_NE: MaterialDef = { id: 'user-lc-ne', name: 'Nematic LC, n_e = 1.74', color: '#a45cc0', model: { type: 'constant', n: 1.74, k: 0 }, source: 'Example value close to the extraordinary index of the nematic mixture E7 in the visible (dispersion neglected)' };
export const lcCavityExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Liquid-crystal microcavity (Berreman 4×4)',
          text: 'A 2 µm nematic liquid crystal (uniaxial: n_o = 1.52, n_e = 1.74) between two TiO₂/SiO₂ Bragg mirrors. The optic axis (the director) lies in the x-z plane, tilted by θ_c from the layer — an applied voltage turns it towards the normal.\n\nAt normal incidence, x-polarized light sees n(θ_c), from n_e (θ_c = 0) to n_o (90°); y-polarized light always sees n_o. The map T(λ, θ_c), for light polarized at 45° (both at once), shows the x modes tuned down while the y modes stay: an x mode crosses the next y mode — the degeneracy of modes of opposite polarization behind the Rashba–Dresselhaus spin–orbit coupling of K. Rechcińska et al., Science 366, 727 (2019).\n\nCompute TMM switches to the Berreman 4×4 method by itself (an anisotropic layer); its outputs add the TE / TM parts of R and T.',
          width: 440,
          height: 300,
        },
      },
      material('air', 'Air', -300, -120),
      material('tio2', 'TiO2', -300, 40),
      material('sio2', 'SiO2', -300, 200),
      material('bk7', 'BK7', -300, 360),
      { id: 'no', type: 'material', position: { x: -620, y: 520 }, data: materialData(LC_NO.id) },
      { id: 'ne', type: 'material', position: { x: -620, y: 700 }, data: materialData(LC_NE.id) },
      { id: 'tilt', type: 'sweep', position: { x: -620, y: 880 }, data: { name: 'θ_c', kind: 'number', mode: 'range', min: 0, max: 90, step: 2, list: '' } },
      { id: 'lc', type: 'aniso', position: { x: -300, y: 560 }, data: { ...ANISO_DEFAULTS, name: 'Nematic LC', color: '#a45cc0' } },
      {
        id: 'mir',
        type: 'dbr',
        position: { x: 0, y: -120 },
        data: {
          name: 'Bragg mirror',
          period: [
            { mode: 'qw', d: 60, label: '', layers2D: 1 },
            { mode: 'qw', d: 100, label: '', layers2D: 1 },
          ],
          periods: 6,
          closing: true,
          mirrorAfterCavity: false,
          lambda0: 650,
          cavities: [],
        },
      },
      { id: 'cav', type: 'layer', position: { x: 0, y: 520 }, data: { label: 'LC cavity', thickness: 2000, layers2D: 1 } },
      { id: 'stack', type: 'combine', position: { x: 360, y: 120 }, data: { name: 'LC microcavity', count: 3 } },
      { id: 'wl', type: 'param', position: { x: 360, y: -160 }, data: param('lambda', 'range', 650, 560, 740, 0.25) },
      { id: 'th', type: 'param', position: { x: 360, y: 480 }, data: param('theta', 'constant', 0, 0, 30, 0.1) },
      { id: 'tmm', type: 'compute', position: { x: 720, y: 60 }, data: { ...compute('x + y (ψ = 45°)'), polMix: { psi: 45, delta: 0 } } },
      { id: 'map', type: 'plot', position: { x: 1080, y: -160 }, data: { ...PLOT_DEFAULTS, mode: 'map', field: 'T', x: 'lambda', y: 'sweep:tilt' } },
      { id: 'draw', type: 'draw', position: { x: 1080, y: 420 }, data: { ...DRAW_DEFAULTS, light: 'center' } },
    ],
    [
      edge('tio2', 'mir', 'p0'),
      edge('sio2', 'mir', 'p1'),
      edge('no', 'lc', 'o'),
      edge('ne', 'lc', 'e'),
      edge('tilt', 'lc', 'a0'),
      edge('lc', 'cav', 'mat'),
      edge('mir', 'stack', 'item-0'),
      edge('cav', 'stack', 'item-1'),
      edge('mir', 'stack', 'item-2'),
      edge('air', 'stack', 'incident'),
      edge('bk7', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'map', 'in'),
      edge('stack', 'draw', 'in'),
    ],
    [LC_NO, LC_NE],
  );

// A bound state in the continuum of a 1D photonic crystal with an anisotropic defect (P. S. Pankin, D. N. Maksimov,
// K.-P. Chen, I. V. Timofeev, J. Opt. Soc. Am. B 39, 968 (2022), their model values): each arm is 20 periods of an
// anisotropic layer (n_o = 1, n_e = 2, optic axis along x, 125 nm) and an isotropic one (n = 1, 250 nm), in air. x waves
// see a Bragg mirror (a gap around 1 µm), y waves a uniform medium: a continuum. The defect is the same anisotropic
// material, L thick, its axis turned by φ = 45°: its x-like mode leaks into the y continuum — a Fano line in R for y-polarized
// light — except when the defect is a full-wave plate, (n_e − n_o) L = λ: the BIC at L = 1 µm, λ = 1 µm, for any φ.
const PANKIN_1: MaterialDef = { id: 'user-pankin-1', name: 'Isotropic, n = 1', color: '#cfe3f2', model: { type: 'constant', n: 1, k: 0 }, source: 'Model value, P. S. Pankin et al., J. Opt. Soc. Am. B 39, 968 (2022)' };
const PANKIN_2: MaterialDef = { id: 'user-pankin-2', name: 'Anisotropic component, n = 2', color: '#7d4fb3', model: { type: 'constant', n: 2, k: 0 }, source: 'Model value, P. S. Pankin et al., J. Opt. Soc. Am. B 39, 968 (2022)' };
export const PANKIN2022 = { armPeriods: 20, dA: 125, dB: 250, lBic: 1000, phi: 45 };
export const anisoBicExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -620, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Bound state in the continuum, anisotropic defect (Pankin et al. 2022)',
          text: 'A 1D photonic crystal in air: 20 periods on each side of an anisotropic layer (n_o = 1, n_e = 2, optic axis along x, 125 nm) and an isotropic one (n = 1, 250 nm) — the model of P. S. Pankin et al., J. Opt. Soc. Am. B 39, 968 (2022). x-polarized light sees a Bragg mirror (a gap around 1 µm); y-polarized light a uniform medium: a continuum of waves passing through.\n\nThe defect is the same anisotropic material, L thick, with its optic axis turned by φ = 45°: its localized x-like mode couples to the y continuum and appears as a Fano line in the reflection of y-polarized light (TE here). When the defect is a full-wave plate, (n_e − n_o) L = λ, the leakage cancels: a bound state in the continuum at L = 1 µm, λ = 1 µm, for any φ. The map R(λ, L) shows the line narrowing and vanishing there; its width grows as (L − 1 µm)².',
          width: 440,
          height: 310,
        },
      },
      material('air', 'Air', -300, -120),
      { id: 'm1', type: 'material', position: { x: -620, y: 120 }, data: materialData(PANKIN_1.id) },
      { id: 'm2', type: 'material', position: { x: -620, y: 300 }, data: materialData(PANKIN_2.id) },
      { id: 'arm', type: 'aniso', position: { x: -300, y: 60 }, data: { ...ANISO_DEFAULTS, name: 'Arm layer (axis x)', color: '#7d4fb3', angles: [0, 0, 0] } },
      { id: 'def', type: 'aniso', position: { x: -300, y: 420 }, data: { ...ANISO_DEFAULTS, name: 'Defect (axis at φ)', color: '#c24fbd', angles: [0, PANKIN2022.phi, 0] } },
      { id: 'lsw', type: 'sweep', position: { x: -300, y: 800 }, data: { name: 'L', kind: 'number', mode: 'range', min: 900, max: 1100, step: 5, list: '' } },
      {
        id: 'pc',
        type: 'dbr',
        position: { x: 60, y: -40 },
        data: {
          name: 'PhC + defect',
          period: [
            { mode: 'nm', d: PANKIN2022.dA, label: '', layers2D: 1 },
            { mode: 'nm', d: PANKIN2022.dB, label: '', layers2D: 1 },
          ],
          periods: 2 * PANKIN2022.armPeriods,
          closing: false,
          mirrorAfterCavity: true,
          lambda0: 1000,
          cavities: [{ after: PANKIN2022.armPeriods, mode: 'nm', d: PANKIN2022.lBic, m: 1, layers2D: 1 }],
        },
      },
      { id: 'wl', type: 'param', position: { x: 420, y: -160 }, data: param('lambda', 'range', 1000, 940, 1060, 0.2) },
      { id: 'th', type: 'param', position: { x: 420, y: 420 }, data: param('theta', 'constant', 0, 0, 30, 0.1) },
      { id: 'tmm', type: 'compute', position: { x: 780, y: 60 }, data: compute('y in (TE)', 's') },
      { id: 'map', type: 'plot', position: { x: 1140, y: -160 }, data: { ...PLOT_DEFAULTS, mode: 'map', field: 'R', x: 'lambda', y: 'sweep:lsw' } },
    ],
    [
      edge('m1', 'arm', 'o'),
      edge('m2', 'arm', 'e'),
      edge('m1', 'def', 'o'),
      edge('m2', 'def', 'e'),
      edge('arm', 'pc', 'p0'),
      edge('m1', 'pc', 'p1'),
      edge('def', 'pc', 'c0'),
      edge('lsw', 'pc', 'cavd'),
      edge('air', 'pc', 'incident'),
      edge('air', 'pc', 'exit'),
      edge('pc', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('tmm', 'map', 'in'),
    ],
    [PANKIN_1, PANKIN_2],
  );

// Z. Liu et al., Opt. Express 31, 8384 (2023): prism (1.52) / 10 × (TiO₂ 94 nm, SiO₂ 145 nm) / uniaxial layer 2.75 µm
// (n_o = 1.52 + 0.001i, n_e = 1.72 + 0.001i, optic axis in the layer plane at ϕ) / air, TM light at Brewster's angle of the
// PhC (θ_B = 53.08°): the PhC passes TM, reflects TE; air under the layer: total reflection. TE modes of the layer couple to
// the TM continuum through the anisotropy — Fano lines in R — except at ϕ = 0°, 90° (symmetry-protected BICs) and at
// isolated points in between (Friedrich–Wintgen BICs). The article does not give the order of the PhC layers nor, consistently,
// the origin of ϕ (its Eq. (1) and text: from y; its Eq. (2) and figures: from x); its Fig. 3(a) is reproduced with TiO₂
// facing the prism and ϕ from x (= the azimuth of the Anisotropic material node). RETICOLO agrees on this structure to 1e-13.
export const LIU2023 = { thB: 53.084, pairs: 10, dTiO2: 94, dSiO2: 145, L: 2750, fwE: { phi: 37.17, lam: 543.7 }, paperE: { phi: 38.34, lam: 545.8 } };
const LIU_MATS: MaterialDef[] = [
  { id: 'user-liu-prism', name: 'Prism, n = 1.52', color: '#b8d4e8', model: { type: 'constant', n: 1.52, k: 0 }, source: 'Z. Liu et al., Opt. Express 31, 8384 (2023)' },
  { id: 'user-liu-sio2', name: 'SiO₂ (n = 1.47)', color: '#3a6fb0', model: { type: 'constant', n: 1.47, k: 0 }, source: 'Z. Liu et al., Opt. Express 31, 8384 (2023)' },
  { id: 'user-liu-tio2', name: 'TiO₂ (n = 2.16)', color: '#e0e0e0', model: { type: 'constant', n: 2.16, k: 0 }, source: 'Z. Liu et al., Opt. Express 31, 8384 (2023)' },
  { id: 'user-liu-no', name: 'ABM n_o = 1.52 + 0.001i', color: '#d9b3e6', model: { type: 'constant', n: 1.52, k: 0.001 }, source: 'Z. Liu et al., Opt. Express 31, 8384 (2023)' },
  { id: 'user-liu-ne', name: 'ABM n_e = 1.72 + 0.001i', color: '#a45cc0', model: { type: 'constant', n: 1.72, k: 0.001 }, source: 'Z. Liu et al., Opt. Express 31, 8384 (2023)' },
];
export const liuBicExample = (): Project => {
  const mat = (id: string, m: string, x: number, y: number): AppNode => ({ id, type: 'material', position: { x, y }, data: materialData(m) });
  const pc: AppNode = {
    id: 'pc',
    type: 'dbr',
    position: { x: 0, y: -60 },
    data: {
      name: 'PhC (TM filter)',
      period: [
        { mode: 'nm', d: LIU2023.dTiO2, label: '', layers2D: 1 },
        { mode: 'nm', d: LIU2023.dSiO2, label: '', layers2D: 1 },
      ],
      periods: LIU2023.pairs,
      closing: false,
      mirrorAfterCavity: false,
      lambda0: 550,
      cavities: [],
    },
  };
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -660, y: -470 },
        data: {
          ...INFO_DEFAULTS,
          title: 'BICs in an asymmetric PhC + anisotropic layer (Liu et al. 2023)',
          text: 'Prism (1.52) / 10 × (TiO₂ 94 nm, SiO₂ 145 nm) / anisotropic layer 2.75 µm (n_o = 1.52 + 0.001i, n_e = 1.72 + 0.001i, optic axis in the layer plane at ϕ from x) / air — Z. Liu et al., Opt. Express 31, 8384 (2023). TM light at the Brewster angle of the PhC (53.08°) passes it; TE is reflected; under the layer, air reflects totally. So the TE modes of the layer are localized, and couple to the TM continuum only through the anisotropy: Fano lines in R, made visible by the small loss. They vanish at ϕ = 0° and 90° (symmetry-protected BICs) and at isolated points in between (Friedrich–Wintgen BICs).\n\nThe map reproduces their Fig. 3(a) with TiO₂ facing the prism and ϕ measured from x (the article gives neither the layer order nor, consistently, the origin of ϕ: its Eq. (1) says from y, its Eq. (2) and figures imply from x). The FW-BIC they call e (38.34°, 545.8 nm, finite elements) is at 37.2°, 543.7 nm here; the other three are 0.9–1.6° and 0.1–0.4 % lower too. RETICOLO gives the same R as this computation to 1e-13 on this structure.\n\nBelow: R(λ) around e for ϕ = 30 … 44°: the Fano dip shrinks to nothing at 37.2°.',
          width: 460,
          height: 340,
        },
      },
      mat('prism', 'user-liu-prism', -320, -160),
      mat('tio2', 'user-liu-tio2', -320, 10),
      mat('sio2', 'user-liu-sio2', -320, 180),
      mat('air', 'Air', -320, 350),
      mat('no', 'user-liu-no', -660, 520),
      mat('ne', 'user-liu-ne', -660, 700),
      { id: 'phs', type: 'sweep', position: { x: -660, y: 880 }, data: { name: 'ϕ', kind: 'number', mode: 'range', min: 0, max: 90, step: 1, list: '' } },
      { id: 'abm', type: 'aniso', position: { x: -320, y: 540 }, data: { ...ANISO_DEFAULTS, name: 'ABM (axis at ϕ from x)', color: '#a45cc0', angles: [0, 0, 0] } },
      pc,
      { id: 'lay', type: 'layer', position: { x: 0, y: 520 }, data: { label: 'ABM', thickness: LIU2023.L, layers2D: 1 } },
      { id: 'stack', type: 'combine', position: { x: 360, y: 120 }, data: { name: 'Liu 2023', count: 2 } },
      { id: 'wl', type: 'param', position: { x: 360, y: -180 }, data: param('lambda', 'range', 550, 480, 700, 0.25) },
      { id: 'th', type: 'param', position: { x: 360, y: 440 }, data: param('theta', 'constant', LIU2023.thB, 0, 89, 0.01) },
      { id: 'tm', type: 'compute', position: { x: 720, y: 40 }, data: compute('R(λ, ϕ), TM at θ_B', 'p') },
      { id: 'map', type: 'plot', position: { x: 1080, y: -180 }, data: { ...PLOT_DEFAULTS, mode: 'map', field: 'R', x: 'lambda', y: 'sweep:phs' } },
      // the collapse of the Fano dip at the FW-BIC e
      { id: 'phs2', type: 'sweep', position: { x: -660, y: 1060 }, data: { name: 'ϕ near e', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: '30, 34, 37.2, 40, 44' } },
      { id: 'abm2', type: 'aniso', position: { x: -320, y: 900 }, data: { ...ANISO_DEFAULTS, name: 'ABM (ϕ near e)', color: '#a45cc0', angles: [0, 0, 0] } },
      { id: 'lay2', type: 'layer', position: { x: 0, y: 900 }, data: { label: 'ABM', thickness: LIU2023.L, layers2D: 1 } },
      { id: 'stack2', type: 'combine', position: { x: 360, y: 760 }, data: { name: 'Liu 2023, ϕ near e', count: 2 } },
      { id: 'wl2', type: 'param', position: { x: 360, y: 1080 }, data: param('lambda', 'range', 543, 532, 556, 0.01) },
      { id: 'tm2', type: 'compute', position: { x: 720, y: 760 }, data: compute('R(λ) near e', 'p') },
      { id: 'curves', type: 'plot', position: { x: 1080, y: 620 }, data: { ...PLOT_DEFAULTS, field: 'R' } },
    ],
    [
      edge('tio2', 'pc', 'p0'),
      edge('sio2', 'pc', 'p1'),
      edge('no', 'abm', 'o'),
      edge('ne', 'abm', 'e'),
      edge('phs', 'abm', 'a1'),
      edge('abm', 'lay', 'mat'),
      edge('pc', 'stack', 'item-0'),
      edge('lay', 'stack', 'item-1'),
      edge('prism', 'stack', 'incident'),
      edge('air', 'stack', 'exit'),
      edge('stack', 'tm', 'stack'),
      edge('wl', 'tm', 'lambda'),
      edge('th', 'tm', 'theta'),
      edge('tm', 'map', 'in'),
      edge('no', 'abm2', 'o'),
      edge('ne', 'abm2', 'e'),
      edge('phs2', 'abm2', 'a1'),
      edge('abm2', 'lay2', 'mat'),
      edge('pc', 'stack2', 'item-0'),
      edge('lay2', 'stack2', 'item-1'),
      edge('prism', 'stack2', 'incident'),
      edge('air', 'stack2', 'exit'),
      edge('stack2', 'tm2', 'stack'),
      edge('wl2', 'tm2', 'lambda'),
      edge('th', 'tm2', 'theta'),
      edge('tm2', 'curves', 'in'),
    ],
    LIU_MATS,
  );
};

// Chiral optical Tamm states (COTS) of a cholesteric liquid crystal (CLC) and polarization-preserving anisotropic mirrors
// (PPAM: uniaxial layers with their axes turned by 90° in turn). (1) M. V. Pyatnov et al., Photonics 5, 30 (2018): a
// right-handed CLC (n_o 1.54, n_e 1.71, p = 400 nm, d = 1 … 4 µm) between two PPAMs (10 periods of 2 × 100 nm), in n = 1.625:
// the co-handed circular light (σ−, the one the helix reflects) excites a COTS at each boundary — one peak at 650 nm for a
// thick CLC, two (coupled) for a thin one — the cross-handed (σ+) sees a Fabry–Pérot cavity. (2) The COTS as a quasi-BIC
// (I. V. Timofeev et al., Crystals 7, 113 (2017)): lit through the CLC onto a thick PPAM, the state couples to σ− through
// the CLC (∝ exp(−4π|n_f|L/λ)) and to the σ+ continuum only through the mismatch of E and H at the mirror (µ = 1): the line
// narrows with L to a floor (the σ+ leak) and σ− → σ+ conversion is complete where both leaks are equal (Kopp–Genack).
export const COTS2018 = { no: 1.54, ne: 1.71, pitch: 400, nm: 1.625, a: 100, periods: 10, thick: [1000, 2000, 3000, 4000] };
const COTS_MATS: MaterialDef[] = [
  { id: 'user-cots-no', name: 'CLC / PPAM n_o = 1.54', color: '#d9c3e6', model: { type: 'constant', n: 1.54, k: 0 }, source: 'M. V. Pyatnov et al., Photonics 5, 30 (2018): nematic + chiral dopant S-811' },
  { id: 'user-cots-ne', name: 'CLC / PPAM n_e = 1.71', color: '#8e5bb5', model: { type: 'constant', n: 1.71, k: 0 }, source: 'M. V. Pyatnov et al., Photonics 5, 30 (2018): nematic + chiral dopant S-811' },
  { id: 'user-cots-nm', name: 'Surrounding medium, n = 1.625', color: '#cfe3f2', model: { type: 'constant', n: 1.625, k: 0 }, source: 'the mean CLC index (n_o + n_e)/2, as in Pyatnov et al. 2018' },
];
export const cotsExample = (): Project => {
  const mat = (id: string, m: string, x: number, y: number): AppNode => ({ id, type: 'material', position: { x, y }, data: materialData(m) });
  const aniso = (id: string, name: string, az: number, x: number, y: number): AppNode => ({ id, type: 'aniso', position: { x, y }, data: { ...ANISO_DEFAULTS, name, color: '#8e5bb5', angles: [0, az, 0] } });
  const ppam = (id: string, periods: number, x: number, y: number): AppNode => ({
    id,
    type: 'dbr',
    position: { x, y },
    data: {
      name: `PPAM (${periods} periods)`,
      period: [
        { mode: 'nm', d: COTS2018.a, label: 'axis 0°', layers2D: 1 },
        { mode: 'nm', d: COTS2018.a, label: 'axis 90°', layers2D: 1 },
      ],
      periods,
      closing: false,
      mirrorAfterCavity: false,
      lambda0: 650,
      cavities: [],
    },
  });
  const circ = (name: string, delta: number): ComputeData => ({ ...compute(name), polMix: { psi: 45, delta } });
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -700, y: -520 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Chiral optical Tamm states and a quasi-BIC (cholesteric + anisotropic mirrors)',
          text: 'Top — Pyatnov et al., Photonics 5, 30 (2018): a right-handed cholesteric (n_o 1.54, n_e 1.71, pitch 400 nm) between two polarization-preserving anisotropic mirrors (10 periods of 100 + 100 nm uniaxial layers with axes at 0° and 90°), in n = 1.625. The helix reflects σ− circular light (helicity −1); σ− excites a chiral optical Tamm state at each boundary: one peak at 650 nm for d = 4 µm, two coupled ones for d = 1 µm (636 / 665 nm here and in the article). σ+ passes the helix: Fabry–Pérot peaks (625 nm at d = 1 µm, 639 nm at 4 µm, as in the article). The field profile shows the state localized at the boundaries.\n\nBottom — the state as a bound state in the continuum (Timofeev et al., Crystals 7, 113 (2017)): its frequency is in the stop band of σ− but in the continuum of σ+, which crosses the helix freely. Lit through the cholesteric onto a thick mirror (60 periods), it leaks into σ− through the helix, exp(−4π|n_f|L/λ), and into σ+ only through the mismatch of E and H at the mirror — non-zero because µ = 1 (a magnetic anisotropy equal to the electric one would make it a true BIC). The map of σ− → σ+ conversion shows the line narrowing to a floor (~0.24 nm, Q ≈ 2700) and complete conversion at L ≈ 3.4 µm, where the two leaks are equal (the Kopp–Genack crossover).',
          width: 480,
          height: 380,
        },
      },
      mat('nm', 'user-cots-nm', -380, -200),
      mat('no', 'user-cots-no', -700, 60),
      mat('ne', 'user-cots-ne', -700, 240),
      aniso('mA', 'PPAM layer, axis 0°', 0, -380, -20),
      aniso('mB', 'PPAM layer, axis 90°', 90, -380, 200),
      aniso('clc', 'Cholesteric (director 45° at the top)', 45, -380, 420),
      ppam('ppam', COTS2018.periods, 0, -160),
      { id: 'dsw', type: 'sweep', position: { x: -700, y: 560 }, data: { name: 'd', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: COTS2018.thick.join(', ') } },
      { id: 'clcL', type: 'layer', position: { x: 0, y: 420 }, data: { label: 'CLC', thickness: 4000, layers2D: 1, pitch: COTS2018.pitch } },
      { id: 'st', type: 'combine', position: { x: 380, y: 60 }, data: { name: 'PPAM | CLC | PPAM', count: 3 } },
      { id: 'wl', type: 'param', position: { x: 380, y: -220 }, data: param('lambda', 'range', 650, 560, 740, 0.1) },
      { id: 'th', type: 'param', position: { x: 380, y: 420 }, data: param('theta', 'constant', 0, 0, 30, 0.1) },
      { id: 'tco', type: 'compute', position: { x: 760, y: -220 }, data: circ('σ− (co-handed)', -90) },
      { id: 'tx', type: 'compute', position: { x: 760, y: 180 }, data: circ('σ+ (cross-handed)', 90) },
      { id: 'pco', type: 'plot', position: { x: 1140, y: -260 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      { id: 'px', type: 'plot', position: { x: 1140, y: 180 }, data: { ...PLOT_DEFAULTS, field: 'T' } },
      { id: 'fp', type: 'field', position: { x: 1600, y: -260 }, data: { ...FIELD_DEFAULTS, at: { 'sweep:dsw': 3, lambda: 650.05 }, zIn: 200, zOut: 200 } },
      // the quasi-BIC: through the CLC onto a thick PPAM
      ppam('ppam2', 60, 0, 900),
      { id: 'Lsw', type: 'sweep', position: { x: -700, y: 1000 }, data: { name: 'L', kind: 'number', mode: 'range', min: 1000, max: 8000, step: 200, list: '' } },
      { id: 'clc2', type: 'layer', position: { x: 0, y: 700 }, data: { label: 'CLC', thickness: 3400, layers2D: 1, pitch: COTS2018.pitch } },
      { id: 'st2', type: 'combine', position: { x: 380, y: 760 }, data: { name: 'CLC | thick PPAM', count: 2 } },
      { id: 'wl2', type: 'param', position: { x: 380, y: 1060 }, data: param('lambda', 'range', 650, 647, 653, 0.02) },
      { id: 'tkg', type: 'compute', position: { x: 760, y: 760 }, data: circ('σ− through the CLC', -90) },
      { id: 'map', type: 'plot', position: { x: 1140, y: 700 }, data: { ...PLOT_DEFAULTS, mode: 'map', field: 'R_cp', x: 'lambda', y: 'sweep:Lsw' } },
    ],
    [
      edge('no', 'mA', 'o'),
      edge('ne', 'mA', 'e'),
      edge('no', 'mB', 'o'),
      edge('ne', 'mB', 'e'),
      edge('no', 'clc', 'o'),
      edge('ne', 'clc', 'e'),
      edge('mA', 'ppam', 'p0'),
      edge('mB', 'ppam', 'p1'),
      edge('clc', 'clcL', 'mat'),
      edge('dsw', 'clcL', 'd'),
      edge('ppam', 'st', 'item-0'),
      edge('clcL', 'st', 'item-1'),
      edge('ppam', 'st', 'item-2'),
      edge('nm', 'st', 'incident'),
      edge('nm', 'st', 'exit'),
      edge('st', 'tco', 'stack'),
      edge('st', 'tx', 'stack'),
      edge('wl', 'tco', 'lambda'),
      edge('wl', 'tx', 'lambda'),
      edge('th', 'tco', 'theta'),
      edge('th', 'tx', 'theta'),
      edge('tco', 'pco', 'in'),
      edge('tx', 'px', 'in'),
      edge('tco', 'fp', 'in'),
      edge('mA', 'ppam2', 'p0'),
      edge('mB', 'ppam2', 'p1'),
      edge('clc', 'clc2', 'mat'),
      edge('Lsw', 'clc2', 'd'),
      edge('clc2', 'st2', 'item-0'),
      edge('ppam2', 'st2', 'item-1'),
      edge('nm', 'st2', 'incident'),
      edge('nm', 'st2', 'exit'),
      edge('st2', 'tkg', 'stack'),
      edge('wl2', 'tkg', 'lambda'),
      edge('th', 'tkg', 'theta'),
      edge('tkg', 'map', 'in'),
    ],
    COTS_MATS,
  );
};

// The groups of the Examples menu, in order.
// Rough gold SPR after T. Treebupachatsakul et al., Sensors 21, 6164 (2021): glass (n = 1.52) / 50 nm Au (0.18344 + 3.4332i)
// / water (1.33) at 633 nm, TM; the Au / water interface rough (RMS 3 nm, cl 20 nm, 10 slices), 3 realizations (seeds)
// averaged. Compute TMM takes an effective medium of each slice (Bruggeman), Compute RCWA the pixels. The article: a 1 µm
// cell, 151 orders, 100 realizations; here a 500 nm cell (500 points) and N = 50 (converged to ~0.01 in R) so that Run
// takes about a minute.
const TREEBU = 'T. Treebupachatsakul et al., Sensors 21, 6164 (2021)';
export const roughSprExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -660, y: -300 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Rough gold SPR',
          text: 'After Treebupachatsakul et al. (2021): the Au / water interface of a 50 nm gold film is rough (Roughness node: RMS 3 nm, correlation length 20 nm, 500 nm cell). The seed sweep gives 3 realizations; Extract data averages them (mean ± std). Compute TMM uses an effective medium per slice (only the height distribution counts), Compute RCWA the rough profile itself (press Run, about a minute). View Grating shows the pixels of the rough zone. The two models differ: a 1D profile is not a 3D Bruggeman mixture.',
          width: 380,
          height: 270,
        },
      },
      material('glass', 'user-glass152', -300, -40),
      { id: 'aum', type: 'material', position: { x: -660, y: 200 }, data: { ...materialData('user-au-treebu'), color: '#d4af37' } },
      material('water', 'user-n133', -300, 460),
      { id: 'au', type: 'layer', position: { x: -300, y: 200 }, data: { label: 'Au film', thickness: 50, layers2D: 1 } },
      { id: 'seeds', type: 'sweep', position: { x: -300, y: 640 }, data: { name: 'seed', kind: 'number', mode: 'list', min: 1, max: 3, step: 1, list: '1, 2, 3' } },
      { id: 'rough', type: 'rough', position: { x: 60, y: 200 }, data: { ...ROUGH_DEFAULTS, label: '', side: 'bottom', size: 3, cl: 20, cell: 500, px: 500, tmm: 'profile', ema: 'bruggeman' } },
      { id: 'stack', type: 'combine', position: { x: 420, y: 120 }, data: { name: 'Rough Kretschmann', count: 1 } },
      { id: 'flat', type: 'combine', position: { x: 60, y: -260 }, data: { name: 'Flat film', count: 1 } },
      { id: 'tmmF', type: 'compute', position: { x: 780, y: -420 }, data: compute('Flat film (reference)') },
      { id: 'wl', type: 'param', position: { x: 420, y: -160 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'th', type: 'param', position: { x: 420, y: 420 }, data: param('theta', 'range', 70, 60, 80, 0.05) },
      { id: 'thR', type: 'param', position: { x: 420, y: 600 }, data: param('theta', 'range', 70, 70, 76, 0.5) },
      { id: 'tmm', type: 'compute', position: { x: 780, y: -40 }, data: compute('TMM, effective medium') },
      { id: 'rc', type: 'rcwa', position: { x: 780, y: 360 }, data: { ...RCWA_DEFAULTS, name: 'RCWA, rough profile', orders: 50, show: 0 } },
      { id: 'mT', type: 'extract', position: { x: 1160, y: -40 }, data: { name: 'TMM, mean of 3 seeds', fields: ['R'], fixed: {}, mean: ['sweep:seeds'] } },
      { id: 'mR', type: 'extract', position: { x: 1160, y: 360 }, data: { name: 'RCWA, mean of 3 seeds', fields: ['R'], fixed: {}, mean: ['sweep:seeds'] } },
      { id: 'cmp', type: 'compare', position: { x: 1520, y: 120 }, data: COMPARE_DEFAULTS },
      { id: 'draw', type: 'draw', position: { x: 60, y: 760 }, data: { ...DRAW_DEFAULTS, light: 'left' } },
      { id: 'dg', type: 'drawgrating', position: { x: 780, y: 760 }, data: { ...DRAWGRATING_DEFAULTS, periods: 1 } },
    ],
    [
      edge('aum', 'au', 'mat'),
      edge('au', 'rough', 'in'),
      edge('seeds', 'rough', 'seed'),
      edge('glass', 'stack', 'incident'),
      edge('rough', 'stack', 'item-0'),
      edge('water', 'stack', 'exit'),
      edge('glass', 'flat', 'incident'),
      edge('au', 'flat', 'item-0'),
      edge('water', 'flat', 'exit'),
      edge('flat', 'tmmF', 'stack'),
      edge('wl', 'tmmF', 'lambda'),
      edge('th', 'tmmF', 'theta'),
      edge('tmmF', 'cmp', 'in'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('stack', 'rc', 'stack'),
      edge('wl', 'rc', 'lambda'),
      edge('thR', 'rc', 'theta'),
      edge('tmm', 'mT', 'in'),
      edge('rc', 'mR', 'in'),
      edge('mT', 'cmp', 'in'),
      edge('mR', 'cmp', 'in'),
      edge('stack', 'draw', 'in'),
      edge('stack', 'dg', 'in'),
    ],
    [
      { id: 'user-glass152', name: 'glass (n = 1.52)', color: '#dfe7ee', model: { type: 'constant', n: 1.52, k: 0 }, source: 'assumed (glass substrate)' },
      { id: 'user-au-treebu', name: 'Au (0.18344 + 3.4332i)', color: '#d4af37', model: { type: 'constant', n: 0.18344, k: 3.4332 }, source: `${TREEBU}, gold at 633 nm` },
      { id: 'user-n133', name: 'water (n = 1.33)', color: '#6fb3e0', model: { type: 'constant', n: 1.33, k: 0 }, source: `${TREEBU}, sensing medium` },
    ],
  );

// The fields of a rough gold film (after Treebupachatsakul, Shinnakerdchoke & Pechprasarn, Sensors 23, 3377 (2023),
// Fig. 15c: BK7 / Au 50 nm with a rough top of peak-to-peak h = 9 nm, cl = 8 nm / water, 633 nm, TM): the same profile as
// staircase slices (as the article and RETICOLO) and as its smooth profile (FFF). The staircase puts a sharp gold corner
// at every step; their fields are the hot spots of its map.
export const ROUGH_FFF_THETA = { min: 70, max: 76, step: 0.1 };
// A dielectric film rough on both faces (the second face partly replicating the first): TMM with the statistics of the
// heights (ensemble, Bruggeman) against RCWA of the smooth profiles (mean of seeds); see scripts/bench-rough.ts.
export const roughFilmExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -660, y: -320 },
        data: {
          ...INFO_DEFAULTS,
          title: 'A film rough on both faces',
          text: 'A 120 nm TiO₂ film on glass, in air, at normal incidence. Both faces are rough: two Roughness nodes in a row on the same Layer — the top (RMS 4 nm) and the bottom (RMS 3 nm), which follows the top with a correlation of 0.7 (a film that partly replicates its substrate). Correlation length 20 nm.\n\nCompute TMM takes the statistics of the heights (“ensemble”: no seed) and, per slice, a Bruggeman medium shaped by the features (σ high, cl wide: between the two Wiener bounds), and runs at once. Compute RCWA takes the smooth profiles themselves (FFF) for three seeds (press Run, a few minutes); Extract data averages them. Compare: the flat film, TMM and RCWA. The roughness lowers the reflectance in the blue; TMM follows RCWA within 0.0015 in R (at 450 nm: flat 0.144, RCWA 0.1342, TMM 0.1344). Switch the TMM medium to plain Bruggeman to see it overstate the change by half.\n\nOn metals, gentle roughness is another story: the effective-medium slices overstate it many times (Help → Roughness).',
          width: 460,
          height: 300,
        },
      },
      material('air', 'Air', -330, -40),
      material('tim', 'TiO2', -660, 200),
      material('bk7', 'BK7', -330, 460),
      { id: 'film', type: 'layer', position: { x: -330, y: 200 }, data: { label: 'TiO₂ film', thickness: 120, layers2D: 1 } },
      { id: 'rT', type: 'rough', position: { x: 30, y: 60 }, data: { ...ROUGH_DEFAULTS, label: 'top face', side: 'top', size: 4, cl: 20, cell: 300, px: 600, slices: 20, tmm: 'ensemble', ema: 'shape', surf: '1d' } },
      { id: 'rB', type: 'rough', position: { x: 30, y: 560 }, data: { ...ROUGH_DEFAULTS, label: 'bottom face', side: 'bottom', size: 3, cl: 20, cell: 300, px: 600, slices: 20, seed: 11, tmm: 'ensemble', ema: 'shape', surf: '1d', corr: 0.7 } },
      { id: 'seeds', type: 'sweep', position: { x: -330, y: 700 }, data: { name: 'seed', kind: 'number', mode: 'list', min: 1, max: 3, step: 1, list: '1, 2, 3' } },
      { id: 'stack', type: 'combine', position: { x: 420, y: 160 }, data: { name: 'Rough film', count: 1 } },
      { id: 'flat', type: 'combine', position: { x: 420, y: -260 }, data: { name: 'Flat film', count: 1 } },
      { id: 'wl', type: 'param', position: { x: 420, y: -60 }, data: param('lambda', 'range', 550, 400, 900, 5) },
      { id: 'wlR', type: 'param', position: { x: 420, y: 560 }, data: param('lambda', 'range', 550, 400, 900, 25) },
      { id: 'th', type: 'param', position: { x: 420, y: 360 }, data: param('theta', 'constant', 0, 0, 89, 1) },
      { id: 'tmmF', type: 'compute', position: { x: 780, y: -320 }, data: compute('Flat film') },
      { id: 'tmm', type: 'compute', position: { x: 780, y: 20 }, data: compute('TMM, ensemble') },
      { id: 'rc', type: 'rcwa', position: { x: 780, y: 380 }, data: { ...RCWA_DEFAULTS, name: 'RCWA, smooth profiles', orders: 30, show: 0, profiles: 'fff' } },
      { id: 'mR', type: 'extract', position: { x: 1160, y: 380 }, data: { name: 'RCWA, mean of 3 seeds', fields: ['R'], fixed: {}, mean: ['sweep:seeds'] } },
      { id: 'cmp', type: 'compare', position: { x: 1520, y: 0 }, data: COMPARE_DEFAULTS },
    ] as AppNode[],
    [
      edge('tim', 'film', 'mat'),
      edge('film', 'rT', 'in'),
      edge('rT', 'rB', 'in'),
      edge('seeds', 'rT', 'seed'),
      edge('air', 'stack', 'incident'),
      edge('rB', 'stack', 'item-0'),
      edge('bk7', 'stack', 'exit'),
      edge('air', 'flat', 'incident'),
      edge('film', 'flat', 'item-0'),
      edge('bk7', 'flat', 'exit'),
      edge('flat', 'tmmF', 'stack'),
      edge('wl', 'tmmF', 'lambda'),
      edge('th', 'tmmF', 'theta'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('th', 'tmm', 'theta'),
      edge('stack', 'rc', 'stack'),
      edge('wlR', 'rc', 'lambda'),
      edge('th', 'rc', 'theta'),
      edge('rc', 'mR', 'in'),
      edge('tmmF', 'cmp', 'in'),
      edge('tmm', 'cmp', 'in'),
      edge('mR', 'cmp', 'in'),
    ],
  );

export const roughFieldsExample = (): Project =>
  project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -660, y: -420 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Rough gold SPR fields: staircase vs smooth profile (FFF)',
          text:
            'After Treebupachatsakul, Shinnakerdchoke & Pechprasarn, Sensors 23, 3377 (2023), Fig. 15c: BK7 / gold 50 nm whose top is rough (peak-to-peak h = 9 nm, correlation length 8 nm, 500 nm cell) / water, 633 nm, TM. The article computes the profile as a staircase of 1 nm rows (RCWA, 151 orders) and finds hot spots of |E|² at the sharp edges of the rough surface.\n\n' +
            'The same realization here twice: Compute RCWA with “profiles: staircase slices” (9 slices) and with “profiles: smooth (FFF)” — the differential method with the normal-vector factorization (Popov & Nevière), which integrates the true profile without steps. Press Run on both, then on the two field maps (at the dip of each). The staircase puts a gold corner at every step; compare the maps, and the dips (Compare) with the flat film.\n\n' +
            'Check the orders N on both: the smooth profile converges at a few tens of orders, the staircase slowly (its corners).',
          width: 400,
          height: 330,
        },
      },
      material('glass', 'user-glass152', -300, -40),
      { id: 'aum', type: 'material', position: { x: -660, y: 200 }, data: { ...materialData('user-au-treebu'), color: '#d4af37' } },
      material('water', 'user-n133', -300, 460),
      { id: 'au', type: 'layer', position: { x: -300, y: 200 }, data: { label: 'Au film', thickness: 45.5, layers2D: 1 } },
      { id: 'rough', type: 'rough', position: { x: 60, y: 200 }, data: { ...ROUGH_DEFAULTS, label: '', side: 'bottom', kind: 'pp', size: 9, cl: 8, cell: 500, px: 500, seed: 1, slices: 9, tmm: 'profile', ema: 'bruggeman' } },
      { id: 'stack', type: 'combine', position: { x: 420, y: 120 }, data: { name: 'Rough Kretschmann', count: 1 } },
      { id: 'flat', type: 'combine', position: { x: 60, y: -260 }, data: { name: 'Flat film', count: 1 } },
      { id: 'tmmF', type: 'compute', position: { x: 780, y: -420 }, data: compute('Flat film (reference)') },
      { id: 'wl', type: 'param', position: { x: 420, y: -160 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'th', type: 'param', position: { x: 420, y: 420 }, data: param('theta', 'range', 70, ROUGH_FFF_THETA.min, ROUGH_FFF_THETA.max, ROUGH_FFF_THETA.step) },
      { id: 'rcS', type: 'rcwa', position: { x: 780, y: -40 }, data: { ...RCWA_DEFAULTS, name: 'RCWA, staircase', orders: 40, show: 0, profiles: 'staircase' } },
      { id: 'rcF', type: 'rcwa', position: { x: 780, y: 420 }, data: { ...RCWA_DEFAULTS, name: 'RCWA, smooth profile (FFF)', orders: 40, show: 0, profiles: 'fff' } },
      { id: 'cmp', type: 'compare', position: { x: 1200, y: -420 }, data: COMPARE_DEFAULTS },
      { id: 'fmS', type: 'rcwafield', position: { x: 1200, y: 40 }, data: { ...RCWAFIELD_DEFAULTS, periods: 1, nx: 200, nz: 120, x0: 0, x1: 500, z0: 30, z1: 70, mapView: { zLog: true } } },
      { id: 'fmF', type: 'rcwafield', position: { x: 1200, y: 760 }, data: { ...RCWAFIELD_DEFAULTS, periods: 1, nx: 200, nz: 120, x0: 0, x1: 500, z0: 30, z1: 70, mapView: { zLog: true } } },
      { id: 'dg', type: 'drawgrating', position: { x: 60, y: 760 }, data: { ...DRAWGRATING_DEFAULTS, periods: 1 } },
    ],
    [
      edge('aum', 'au', 'mat'),
      edge('au', 'rough', 'in'),
      edge('glass', 'stack', 'incident'),
      edge('rough', 'stack', 'item-0'),
      edge('water', 'stack', 'exit'),
      edge('glass', 'flat', 'incident'),
      edge('au', 'flat', 'item-0'),
      edge('water', 'flat', 'exit'),
      edge('flat', 'tmmF', 'stack'),
      edge('wl', 'tmmF', 'lambda'),
      edge('th', 'tmmF', 'theta'),
      edge('stack', 'rcS', 'stack'),
      edge('wl', 'rcS', 'lambda'),
      edge('th', 'rcS', 'theta'),
      edge('stack', 'rcF', 'stack'),
      edge('wl', 'rcF', 'lambda'),
      edge('th', 'rcF', 'theta'),
      edge('tmmF', 'cmp', 'in'),
      edge('rcS', 'cmp', 'in'),
      edge('rcF', 'cmp', 'in'),
      edge('rcS', 'fmS', 'in'),
      edge('rcF', 'fmF', 'in'),
      edge('stack', 'dg', 'in'),
    ],
    [
      { id: 'user-glass152', name: 'glass (n = 1.52)', color: '#dfe7ee', model: { type: 'constant', n: 1.52, k: 0 }, source: 'assumed (glass substrate)' },
      { id: 'user-au-treebu', name: 'Au (0.18344 + 3.4332i)', color: '#d4af37', model: { type: 'constant', n: 0.18344, k: 3.4332 }, source: `${TREEBU}, gold at 633 nm` },
      { id: 'user-n133', name: 'water (n = 1.33)', color: '#6fb3e0', model: { type: 'constant', n: 1.33, k: 0 }, source: `${TREEBU}, sensing medium` },
    ],
  );

// ---- Sensorgrams: binding kinetics turned into the SPR signal ----

// The common part: BK7 / Au 50 nm / buffer (water), 633 nm, an angular scan around the dip; Binding kinetics →
// Sensorgram → Plot of the sensorgram.
const sensorgramBase = (kin: Partial<AppNode['data']>, sg: Partial<AppNode['data']>, note: { title: string; text: string }, extra: { nodes?: AppNode[]; edges?: Edge[]; layers?: AppNode[]; theta?: [number, number, number] } = {}) => {
  const [t0, t1, dt] = extra.theta ?? [66, 74, 0.05];
  const layers = extra.layers ?? [];
  return project(
    [
      { id: 'note', type: 'info', position: { x: -330, y: -330 }, data: { ...INFO_DEFAULTS, title: note.title, text: note.text, width: 520, height: 230 } },
      material('bk7', 'BK7', -330, 0),
      material('aum', 'Au', -330, 180),
      { id: 'au', type: 'layer', position: { x: 0, y: 180 }, data: { label: 'Au', thickness: 50, layers2D: 1 } },
      material('water', 'Water', -330, 360),
      ...layers,
      { id: 'stack', type: 'combine', position: { x: 300, y: 120 }, data: { name: 'SPR chip', count: 1 + (layers.length ? 1 : 0) } },
      { id: 'wl', type: 'param', position: { x: 300, y: -160 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'ang', type: 'param', position: { x: 300, y: 420 }, data: param('theta', 'range', 70, t0, t1, dt) },
      { id: 'tmm', type: 'compute', position: { x: 640, y: 60 }, data: compute('SPR chip') },
      { id: 'kin', type: 'kinetics', position: { x: 640, y: 420 }, data: { ...KINETICS_DEFAULTS, ...kin } as AppNode['data'] },
      { id: 'sg', type: 'sensorgram', position: { x: 1100, y: 60 }, data: { ...SENSORGRAM_DEFAULTS, ...sg } as AppNode['data'] },
      { id: 'plot', type: 'plot', position: { x: 1600, y: 60 }, data: { ...PLOT_DEFAULTS, field: 'shift', x: 'time' } },
      ...(extra.nodes ?? []),
    ] as AppNode[],
    [
      edge('aum', 'au', 'mat'),
      edge('bk7', 'stack', 'incident'),
      edge('au', 'stack', 'item-0'),
      ...(layers.length ? [edge(layers[0].id, 'stack', 'item-1')] : []),
      edge('water', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('ang', 'tmm', 'theta'),
      edge('tmm', 'sg', 'in'),
      edge('kin', 'sg', 'kinetics'),
      edge('sg', 'plot', 'in', 'sensorgram'),
      ...(extra.edges ?? []),
    ],
    layers.length ? HYDROGEL : [],
  );
};
const HYDROGEL: MaterialDef[] = [{ id: 'user-hydrogel', name: 'hydrogel, collapsed (n = 1.50)', color: '#7fb3a8', model: { type: 'constant', n: 1.5, k: 0 }, source: 'typical polymer (pNIPAAm-like) value' }];

// An antibody captured by its antigen on gold: a series of injections (12.5 … 200 nM), 1:1 Langmuir.
export const sensorgramAntibodyExample = (): Project =>
  sensorgramBase(
    { name: 'IgG binding', model: 'langmuir', ka: 2e5, kd: 5e-4, rmax: 2500, analyte: 'igg', orient: 'end', steps: [{ label: 'baseline', t: 60, c: 0 }, { label: 'association', t: 400, c: 100 }, { label: 'dissociation', t: 900, c: 0 }], dt: 5, sweepOf: 'c' },
    { name: 'IgG sensorgram', thick: 'auto', mixing: 'linear', bulk: true, readout: 'dip', track: true },
    {
      title: 'Sensorgram: antibody binding (1:1)',
      text: 'An IgG antibody binds to its antigen on a gold chip (BK7 / Au 50 nm / buffer, 633 nm): Binding kinetics (1:1, ka = 2·10⁵ M⁻¹s⁻¹, kd = 5·10⁻⁴ s⁻¹, Rmax = 2500 RU) along baseline → association → dissociation, for five concentrations (the Sweep).\n\nCaught by its antigen, the antibody stands on the surface (end-on: 14.2 nm high, a 5.7 nm footprint). Binding kinetics gives the capacity of a random end-on monolayer, 5.4 ng/mm²: Rmax is 47 % of it. Sensorgram puts the bound mass (1000 RU = 1 ng/mm²) into a monolayer as high as the molecule (de Feijter) plus the bulk index of the flowing solution, recomputes the reflectance at every time and follows the dip exactly.\n\nPlots: Δθ of the dip vs time, and the fraction of the gold covered by the antibodies (coverage). The R(t, θ) output shows the reflectance curves at any time.',
    },
    {
      nodes: [
        { id: 'cs', type: 'sweep', position: { x: 300, y: 620 }, data: { name: 'c [nM]', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: '12.5, 25, 50, 100, 200' } } as AppNode,
        { id: 'plotC', type: 'plot', position: { x: 1600, y: 640 }, data: { ...PLOT_DEFAULTS, field: 'cover', x: 'time' } } as AppNode,
      ],
      edges: [edge('cs', 'kin', 'sweep'), edge('sg', 'plotC', 'in', 'sensorgram')],
    },
  );

// A hydrogel layer on gold that swells (e.g. a pH or temperature step) and collapses again: the target is the layer.
export const sensorgramSwellingExample = (): Project =>
  sensorgramBase(
    { name: 'hydrogel swelling', model: 'swelling', tau: 40, steps: [{ label: 'buffer', t: 60, c: 0, swell: 0 }, { label: 'swelling (pH 7)', t: 400, c: 0, swell: 1.5 }, { label: 'collapse (pH 4)', t: 400, c: 0, swell: 0 }], dt: 2 },
    { name: 'swelling sensorgram', target: 'layer:2', mixing: 'bruggeman', bulk: false, readout: 'dip', track: true },
    {
      title: 'Sensorgram: a swelling hydrogel',
      text: 'A 40 nm hydrogel (collapsed n = 1.50) on BK7 / Au 50 nm in water swells to 2.5× its thickness and collapses again (Binding kinetics, polymer swelling, τ = 40 s). Sensorgram takes the hydrogel layer as the target: its thickness grows as d₀(1 + s) and water fills the added volume (Bruggeman).\n\nThe layer gets thicker but its index drops toward that of water: here the dilution wins and the dip moves to smaller angles, by several degrees — far from the linear RU picture of a binding experiment.',
    },
    { layers: [{ id: 'gel', type: 'layer', position: { x: 0, y: 540 }, data: { label: 'hydrogel', thickness: 40, layers2D: 1 } } as AppNode], nodes: [{ id: 'gelm', type: 'material', position: { x: -330, y: 540 }, data: { ...materialData('user-hydrogel'), color: '#7fb3a8' } } as AppNode], edges: [edge('gelm', 'gel', 'mat')], theta: [66, 89, 0.05] },
  );

// A small molecule with fast kinetics (as in the carbonic anhydrase II – sulfonamide benchmark studies of Myszka et al.):
// a few RU of signal, the detector noise and the dip located by its centroid.
export const sensorgramSmallMoleculeExample = (): Project =>
  sensorgramBase(
    { name: 'small molecule', model: 'langmuir', ka: 5e4, kd: 0.05, rmax: 40, analyte: 'small', steps: [{ label: 'baseline', t: 30, c: 0 }, { label: 'injection', t: 90, c: 5000 }, { label: 'dissociation', t: 120, c: 0 }], dt: 1 },
    { name: 'small-molecule sensorgram', thick: 'auto', mixing: 'linear', bulk: true, readout: 'dip', track: false, locate: 'centroid', locLevel: 0.5, noise: true, noiseAdd: 0.0005, noiseShot: 1e5, noiseAvg: 4, maxTimes: 300 },
    {
      title: 'Sensorgram: a small molecule, measured',
      text: 'A 200 Da molecule binds with fast kinetics (ka = 5·10⁴ M⁻¹s⁻¹, kd = 0.05 s⁻¹, KD = 1 µM) at 5 µM: only ~35 RU, while the bulk index of the injected solution gives a jump of its own.\n\nThe instrument adds detector noise (thermal / read-out and shot noise, 4 scans averaged); the dip is located on every noisy scan by its centroid, not the 3-point parabola. A Sweep of the seed gives five runs of the same experiment with their own noise. The second Plot zooms on the dip of the measured reflectance at one time: five noisy scans (R; its Y menu also has R exact, the curve without the instrument).\n\nTurn the noise off to see the exact sensorgram, or try the parabola to see why the centroid is used.',
    },
    {
      nodes: [
        { id: 'seeds', type: 'sweep', position: { x: 760, y: 900 }, data: { name: 'noise seeds', kind: 'number', mode: 'list', min: 0, max: 0, step: 1, list: '1, 2, 3, 4, 5' } } as AppNode,
        { id: 'plotR', type: 'plot', position: { x: 1600, y: 640 }, data: { ...PLOT_DEFAULTS, field: 'R', x: 'theta', series: 'seed', fixed: { time: 100 }, xLim: [71.3, 73], yLim: [0, 0.03] } } as AppNode,
      ],
      edges: [edge('seeds', 'sg', 'seed'), edge('sg', 'plotR', 'in')],
    },
  );

// Protein adsorption on a free surface: random sequential adsorption, the double layer and the maximum coverage,
// against Wasilewska et al., Int. J. Environ. Res. Public Health 18, 4944 (2021) (myoglobin on silica, pH 3.5).
export const myoglobinRsaExample = (): Project => {
  const kin = (name: string, ionic: number, zeta: number): AppNode['data'] =>
    ({
      ...KINETICS_DEFAULTS,
      name,
      model: 'transport',
      ka: 1e7,
      kd: 0,
      kt: 1.5e7,
      analyte: 'myoglobin',
      orient: 'side',
      surface: 'rsa',
      ionic,
      zeta,
      steps: [
        { label: 'buffer', t: 60, c: 0 },
        { label: 'myoglobin 5 mg/L', t: 1800, c: 281 },
        { label: 'rinse', t: 1200, c: 0 },
      ],
      dt: 10,
      sweepOf: 'c',
    }) as AppNode['data'];
  const sg = (name: string): AppNode['data'] => ({ ...SENSORGRAM_DEFAULTS, name, thick: 'auto', mixing: 'linear', bulk: true, readout: 'dip', track: true, maxTimes: 160 }) as AppNode['data'];
  const curve = (id: string, src: string, field: string, color: string, label: string) => ({ id, src, field, fixed: {}, color, dash: 'solid' as const, label, visible: true });
  return project(
    [
      {
        id: 'note',
        type: 'info',
        position: { x: -330, y: -380 },
        data: {
          ...INFO_DEFAULTS,
          title: 'Protein adsorption: random packing and the double layer (Wasilewska et al. 2021, benchmark)',
          text: 'Myoglobin (17.8 kDa, 4.5 × 3.5 × 2.5 nm, lying) adsorbs from a 5 mg/L solution (281 nM) on silica at pH 3.5 (M. Wasilewska et al., Int. J. Environ. Res. Public Health 18, 4944 (2021), QCM and OWLS). Binding kinetics: a free surface — the molecules land at random places and cannot overlap (random sequential adsorption), transport-limited (kt), irreversible (kd = 0).\n\nTwo buffers, with the ζ potential the paper measured: 10 mM NaCl (ζ = 38 mV, Debye length 3.0 nm) and 150 mM (ζ = 15 mV, 0.8 nm). At low salt the molecules repel each other across the double layer and pack as larger discs (effective hard particle, 1 kT).\n\nPredicted maximum coverage: 0.595 and 1.31 mg/m² (= ng/mm²). Measured (QCM, the irreversibly bound fraction): 0.60 ± 0.1 and 1.3 ± 0.1; OWLS 0.7 and 1.5. Nothing is fitted: the dimensions are those of the crystal structure, ζ from the paper. kt only sets the time scale (a linear, transport-limited start, a few minutes to the plateau as in their runs).\n\nThe silica here is a 10 nm SiO₂ film on an SPR chip (BK7 / Au 50 nm, 633 nm): the Sensorgrams show what an SPR instrument would see.',
          width: 560,
          height: 300,
        },
      },
      material('bk7', 'BK7', -330, 0),
      material('aum', 'Au', -330, 180),
      material('sio2', 'SiO2', -330, 360),
      material('water', 'Water', -330, 540),
      { id: 'au', type: 'layer', position: { x: 0, y: 180 }, data: { label: 'Au', thickness: 50, layers2D: 1 } },
      { id: 'si', type: 'layer', position: { x: 0, y: 360 }, data: { label: 'silica', thickness: 10, layers2D: 1 } },
      { id: 'stack', type: 'combine', position: { x: 300, y: 120 }, data: { name: 'SPR chip with silica', count: 2 } },
      { id: 'wl', type: 'param', position: { x: 300, y: -160 }, data: param('lambda', 'constant', 633, 500, 1000, 1) },
      { id: 'ang', type: 'param', position: { x: 300, y: 420 }, data: param('theta', 'range', 72, 66, 80, 0.05) },
      { id: 'tmm', type: 'compute', position: { x: 640, y: 60 }, data: compute('SPR chip with silica') },
      { id: 'k10', type: 'kinetics', position: { x: 640, y: 420 }, data: kin('myoglobin, 10 mM NaCl', 10, 38) },
      { id: 'k150', type: 'kinetics', position: { x: 640, y: 1220 }, data: kin('myoglobin, 150 mM NaCl', 150, 15) },
      { id: 'sg10', type: 'sensorgram', position: { x: 1100, y: 60 }, data: sg('10 mM NaCl') },
      { id: 'sg150', type: 'sensorgram', position: { x: 1100, y: 900 }, data: sg('150 mM NaCl') },
      { id: 'cmpG', type: 'compare', position: { x: 1600, y: 60 }, data: { ...COMPARE_DEFAULTS, x: 'time', curves: [curve('g10', 'k10', 'Gamma', '#e15759', '10 mM NaCl'), curve('g150', 'k150', 'Gamma', '#2e86c1', '150 mM NaCl')], seen: ['k10', 'k150'] } },
      { id: 'cmpS', type: 'compare', position: { x: 1600, y: 620 }, data: { ...COMPARE_DEFAULTS, x: 'time', curves: [curve('s10', 'sg10', 'shift', '#e15759', '10 mM NaCl'), curve('s150', 'sg150', 'shift', '#2e86c1', '150 mM NaCl')], seen: ['sg10', 'sg150'] } },
    ] as AppNode[],
    [
      edge('aum', 'au', 'mat'),
      edge('sio2', 'si', 'mat'),
      edge('bk7', 'stack', 'incident'),
      edge('au', 'stack', 'item-0'),
      edge('si', 'stack', 'item-1'),
      edge('water', 'stack', 'exit'),
      edge('stack', 'tmm', 'stack'),
      edge('wl', 'tmm', 'lambda'),
      edge('ang', 'tmm', 'theta'),
      edge('tmm', 'sg10', 'in'),
      edge('tmm', 'sg150', 'in'),
      edge('k10', 'sg10', 'kinetics'),
      edge('k150', 'sg150', 'kinetics'),
      edge('k10', 'cmpG', 'in'),
      edge('k150', 'cmpG', 'in'),
      edge('sg10', 'cmpS', 'in', 'sensorgram'),
      edge('sg150', 'cmpS', 'in', 'sensorgram'),
    ],
  );
};

// For newcomers: the smallest complete binding experiment, a numbered note next to every step, no theory needed.
export const startHereExample = (): Project => {
  const note = (id: string, x: number, y: number, title: string, text: string, height = 210): AppNode => ({ id, type: 'info', position: { x, y }, data: { ...INFO_DEFAULTS, title, text, width: 400, height } }) as AppNode;
  return sensorgramBase(
    { name: 'antibody binding', model: 'langmuir', ka: 2e5, kd: 1e-3, rmax: 1000, analyte: 'igg', orient: 'side', surface: 'ligand', steps: [{ label: 'baseline', t: 60, c: 0 }, { label: 'association', t: 300, c: 50 }, { label: 'dissociation', t: 600, c: 0 }], dt: 5 },
    { name: 'my first sensorgram', thick: 'auto', mixing: 'linear', bulk: true, readout: 'dip', track: true, maxTimes: 200 },
    {
      title: 'Start here: your first SPR binding experiment',
      text: 'A complete, minimal SPR biosensor experiment. Read the numbered notes next to the nodes, 1 to 5; whatever you change is recomputed at once.\n\nLight (633 nm) goes through a glass prism onto a 50 nm gold film. At one angle it excites a surface plasmon — a wave of the electrons of the gold, bound to its surface on the water side — and the reflected light drops: the dip. Molecules that bind to the gold change what the plasmon feels, so the dip moves to a larger angle. Following the dip in time is the sensorgram.\n\nA word you do not know: Help → Glossary.',
    },
    {
      nodes: [
        note('n1', -760, 0, '1 · The chip', 'Material nodes give the optical constants: BK7 glass (the prism), gold, water (the buffer). A Layer gives the gold its thickness, 50 nm. Combine stack puts them in order: the incident medium (prism), the layers, the exit medium (the buffer, where the molecules are).\n\nTry: gold 40 or 60 nm instead of 50 — the dip gets shallower.'),
        note('n2', 300, -560, '2 · The light and the calculation', 'Wavelength: 633 nm (a red He-Ne laser). Angle of incidence: a scan from 66 to 74°. Compute TMM calculates the reflectance R at every angle (transfer matrices), for TM (p-polarized) light: only TM excites the plasmon.\n\nTry: switch the polarization to TE — the dip disappears.'),
        note('n3', 640, 1200, '3 · The binding', 'Binding kinetics describes the experiment: an antibody (IgG) binds one-to-one to sites on the chip, with an association rate ka and a dissociation rate kd. The protocol: buffer (baseline), the antibody at 50 nM (association), buffer again (dissociation). Its chart is the bound amount in RU (1000 RU = 1 ng/mm²).\n\nTry: a higher concentration, a smaller kd (it stays bound), a longer association.', 240),
        note('n4', 1100, 820, '4 · The SPR signal', 'Sensorgram puts the bound antibodies as a thin layer on the gold, recomputes the reflectance at every time and follows the dip. Its text gives the result: the largest shift, how much of the gold is covered, the calibration (degrees per ng/mm²). Bulk effect: the injected solution itself has a slightly higher index (a small step when the injection starts and ends).\n\nTry: tick “detector noise” under Instrument — a measured-looking curve, and the detection limit.', 260),
        note('n5', 2100, 60, '5 · The plots', 'A Plot draws any output: here the shift of the dip vs time (the sensorgram) and the fraction of the gold covered by antibodies. Change Y in a Plot to see other quantities (the layer, the bound mass, molecules per µm²). Connect the R(t, θ) output of Sensorgram to a new Plot to see the dip itself move.\n\nNext: the other Sensorgram examples (a concentration series, a small molecule with noise, protein adsorption).', 250),
        { id: 'plotC', type: 'plot', position: { x: 1600, y: 640 }, data: { ...PLOT_DEFAULTS, field: 'cover', x: 'time' } } as AppNode,
      ],
      edges: [edge('sg', 'plotC', 'in', 'sensorgram')],
    },
  );
};

export const EXAMPLE_GROUPS = ['Surface plasmons (SPR)', 'Gratings (RCWA)', 'Microcavities, Tamm states and strong coupling', 'Thin-film filters and coatings', 'Anisotropic media, liquid crystals and BICs', 'Absorbers, emitters and metrology'] as const;
export type ExampleEntry = { group: (typeof EXAMPLE_GROUPS)[number]; name: string; make: () => Project; desc: string };
// (the first one opens at the first start)
export const EXAMPLES: ExampleEntry[] = [
  { group: EXAMPLE_GROUPS[0], name: 'Start here: your first SPR binding experiment', make: startHereExample, desc: 'A minimal SPR biosensor experiment with a note at every step: the chip, the light, an antibody binding, the moving dip — no theory needed.' },
  { group: EXAMPLE_GROUPS[0], name: 'SPR (Kretschmann)', make: sprExample, desc: 'Surface plasmon resonance of a silver film on a prism: the reflectance dip vs angle and its analysis.' },
  { group: EXAMPLE_GROUPS[0], name: 'SPR sensor design (custom objective)', make: sprDesignExample, desc: 'Thicknesses of an SPR sensor optimized for a custom objective (sensitivity and dip quality).' },
  { group: EXAMPLE_GROUPS[0], name: 'SPR sensor by a genetic algorithm, 2D materials (Sebek et al. 2023, benchmark)', make: sprGaExample, desc: 'A genetic algorithm picks the layer sequence and materials of an SPR sensor, 2D materials included.' },
  { group: EXAMPLE_GROUPS[0], name: 'Dual-mode SPR sensor: plasmon–waveguide mode switch (Sebek et al. 2023, benchmark)', make: sprDualModeExample, desc: 'A sensor switching between a plasmon and a waveguide mode, after Sebek et al.' },
  { group: EXAMPLE_GROUPS[0], name: 'Rough gold SPR: effective medium vs RCWA (Treebupachatsakul et al. 2021)', make: roughSprExample, desc: 'A rough Au / water interface (RMS, correlation length, seeds averaged): TMM with an effective medium per slice against RCWA of the profile.' },
  { group: EXAMPLE_GROUPS[3], name: 'A film rough on both faces: TMM statistics vs RCWA', make: roughFilmExample, desc: 'A TiO₂ film with a rough top and a partly replicated rough bottom: TMM with the statistics of the heights against RCWA of the smooth profiles.' },
  { group: EXAMPLE_GROUPS[0], name: 'Rough gold SPR fields: staircase vs smooth profile (FFF) (after Treebupachatsakul et al. 2023)', make: roughFieldsExample, desc: 'The same rough gold surface computed as staircase slices and as its smooth profile (differential method, FFF): dips and field maps.' },
  { group: EXAMPLE_GROUPS[0], name: 'Graphene SPR biosensor for malaria, Sys3 (Tene et al. 2025, benchmark)', make: () => teneMalariaExample(3), desc: 'Ag / Si₃N₄ / graphene on BK7: the resonance shift and sensitivity for three malaria stages, and the performance metrics from Custom data.' },
  { group: EXAMPLE_GROUPS[0], name: 'Graphene SPR biosensor for malaria, Sys4 with ssDNA (Tene et al. 2025, benchmark)', make: () => teneMalariaExample(4), desc: 'The same sensor with a thiol-tethered ssDNA layer.' },
  { group: EXAMPLE_GROUPS[0], name: 'Sensorgram: antibody binding, concentration series (1:1)', make: sensorgramAntibodyExample, desc: 'Binding kinetics of an IgG for five concentrations turned into the SPR signal: the binding layer and the bulk index recomputed at every time, the dip followed exactly.' },
  { group: EXAMPLE_GROUPS[0], name: 'Sensorgram: a swelling hydrogel', make: sensorgramSwellingExample, desc: 'A hydrogel layer on gold swells and collapses: thickness and index change together, and the signal is not proportional to the swelling.' },
  { group: EXAMPLE_GROUPS[0], name: 'Sensorgram: a small molecule with detector noise (centroid)', make: sensorgramSmallMoleculeExample, desc: 'A few RU of a fast small-molecule binding, the bulk jump and the detector noise; the dip located by its centroid on every scan, five noise seeds.' },
  { group: EXAMPLE_GROUPS[0], name: 'Protein adsorption: random packing and ionic strength (Wasilewska et al. 2021, benchmark)', make: myoglobinRsaExample, desc: 'Myoglobin on silica: random sequential adsorption with the double-layer repulsion predicts the maximum coverage at 10 and 150 mM NaCl (0.60 and 1.3 mg/m² measured).' },
  { group: EXAMPLE_GROUPS[1], name: 'SPR by grating coupling (RCWA)', make: gratingSprExample, desc: 'Plasmons excited by a metal grating (RCWA): diffraction efficiencies and the field map.' },
  { group: EXAMPLE_GROUPS[1], name: 'SPR by grating coupling under conical incidence (azimuth φ, RCWA)', make: conicalSprExample, desc: 'The same grating lit out of its plane (azimuth φ): conical RCWA, TE / TM parts.' },
  { group: EXAMPLE_GROUPS[1], name: 'Grating SPR sensor with the −1st order, Al–Au (Hu, Optik 2011, benchmark)', make: huGratingExample, desc: 'An aluminium grating coated with 3 nm of gold, 900 nm: the dip shift, S and χ = S/FWHM for five analyte indices (RCWA).' },
  { group: EXAMPLE_GROUPS[1], name: 'RCWA convergence vs the orders N (grating SPR)', make: rcwaConvergenceExample, desc: 'A Sweep on the orders N of Compute RCWA: the dip and R at an angle for each N; n_sp of gold in Custom data.' },
  { group: EXAMPLE_GROUPS[1], name: 'Guided-mode resonance filter (RCWA, optimization)', make: gmrExample, desc: 'A guided-mode resonance filter optimized with RCWA.' },
  { group: EXAMPLE_GROUPS[2], name: 'DBR microcavity', make: dbrExample, desc: 'Bragg mirrors around a cavity: the stop band and the cavity mode at two angles.' },
  { group: EXAMPLE_GROUPS[2], name: 'Strong coupling (polaritons)', make: strongCouplingExample, desc: 'An excitonic layer in a microcavity: the polariton anticrossing vs the cavity thickness and its fit.' },
  { group: EXAMPLE_GROUPS[2], name: 'Strong coupling vs angle (polariton dispersion)', make: strongCouplingAngleExample, desc: 'The same cavity tuned by the angle: branches found in zones that follow θ, fitted with n_eff and Ω.' },
  { group: EXAMPLE_GROUPS[2], name: 'Tamm plasmon induced reflection (Lu et al. 2019, benchmark)', make: tammExample, desc: 'Tamm-plasmon induced reflection, reproduced after Lu et al. 2019.' },
  { group: EXAMPLE_GROUPS[2], name: 'Rabi-like splitting, Tamm plasmon + cavity (Jena et al., benchmark)', make: rabiJenaExample, desc: 'Rabi-like splitting of a Tamm plasmon coupled to a cavity mode, after Jena et al.' },
  { group: EXAMPLE_GROUPS[2], name: 'Inverse design of a Tamm emitter by gradient descent (He et al. 2021, benchmark)', make: heTammExample, desc: 'Gradient-descent (Adam) inverse design of a Tamm emitter with a doped CdO layer, after He et al. 2021.' },
  { group: EXAMPLE_GROUPS[3], name: 'Thin-film filter design (long-pass edge)', make: filterExample, desc: 'A long-pass edge filter designed with the Filter designer.' },
  { group: EXAMPLE_GROUPS[3], name: 'Tolerance analysis (Monte Carlo) of an AR coating', make: toleranceExample, desc: 'Monte Carlo analysis of an anti-reflection coating: yield and the most critical layers.' },
  { group: EXAMPLE_GROUPS[3], name: 'Narrow notch filter, ≤ 10 nm at 532 nm (filter design benchmark)', make: notchExample, desc: 'A ≤ 10 nm notch filter at 532 nm from a formula start and deep search.' },
  { group: EXAMPLE_GROUPS[3], name: 'Narrow band-pass filter, three cavities (filter design benchmark)', make: bandpassExample, desc: 'A narrow three-cavity band-pass filter designed from its specification.' },
  { group: EXAMPLE_GROUPS[3], name: 'AR coating on both faces, four materials (filter design benchmark)', make: arBothSidesExample, desc: 'Anti-reflection on both faces of a plate with four coating materials.' },
  { group: EXAMPLE_GROUPS[3], name: 'Castle filter: the contour of Peleș as T(λ) (in the spirit of OIC 2025)', make: pelesExample, desc: 'A transmission spectrum shaped like the contour of Peleș castle, in the spirit of the OIC 2025 contest.' },
  { group: EXAMPLE_GROUPS[3], name: 'OIC 2025 Problem A: the Neuschwanstein target, committee design (MF from nodes)', make: oicCastleExample, desc: 'The real target of the design challenge and the committee’s example design; the official merit function built with Extract data and Custom data (7.006763).' },
  { group: EXAMPLE_GROUPS[3], name: 'OIC 2025 Problem B: immersed polarizing notch, committee design (MF from nodes)', make: oicNotchExample, desc: 'Three-line polarizing notch in a cube at 45°: the committee’s design and the official merit function from the nodes (1.8540762059).' },
  { group: EXAMPLE_GROUPS[4], name: 'Liquid-crystal microcavity tuned by the director tilt (Berreman 4×4)', make: lcCavityExample, desc: 'A liquid-crystal layer in a microcavity: the modes move with the director tilt (Berreman 4×4).' },
  { group: EXAMPLE_GROUPS[4], name: 'Bound state in the continuum, anisotropic defect in a photonic crystal (Pankin et al. 2022, Berreman 4×4)', make: anisoBicExample, desc: 'A bound state in the continuum on an anisotropic defect in a photonic crystal, after Pankin et al. 2022.' },
  { group: EXAMPLE_GROUPS[4], name: 'BICs in an asymmetric photonic crystal + anisotropic layer (Liu et al. 2023, Berreman 4×4)', make: liuBicExample, desc: 'Symmetry-protected and Friedrich–Wintgen BICs of a photonic crystal with an anisotropic layer, after Liu et al. 2023.' },
  { group: EXAMPLE_GROUPS[4], name: 'Chiral optical Tamm states and a quasi-BIC: cholesteric + anisotropic mirrors, circular light (Pyatnov et al. 2018, Timofeev et al. 2017)', make: cotsExample, desc: 'Chiral optical Tamm states of a cholesteric with circularly polarized light, after Pyatnov et al. 2018.' },
  { group: EXAMPLE_GROUPS[5], name: 'Dual-band absorber (optimization)', make: absorberExample, desc: 'A dual-band absorber whose layers are optimized for two absorption peaks.' },
  { group: EXAMPLE_GROUPS[5], name: 'Thin-film metrology (fit to a measurement)', make: metrologyExample, desc: 'Film thicknesses and indices recovered by fitting a measured spectrum.' },
  { group: EXAMPLE_GROUPS[5], name: 'Narrowband thermal emitter by simulated annealing (Pan et al. 2024, benchmark)', make: thermalEmitterSaExample, desc: 'A narrowband thermal emitter optimized by simulated annealing, after Pan et al. 2024.' },
];
