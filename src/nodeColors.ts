// Colour code and titles of the node types: one colour per toolbar section (title bar, toolbar buttons, minimap);
// the title bar names the type. Exceptions: a Parameter node takes the colour of its quantity (θ blue, λ red, like
// its port) and an Info note its own colour.
import type { AppNode } from './types.ts';

export type NodeKind = AppNode['type'];

export const GROUP_COLORS = {
  Structure: '#c07a3c',
  Simulation: '#5b6fd6',
  Analysis: '#d6568f',
  Optimize: '#e0a100',
  View: '#2e9e6a',
  Notes: '#8a93a6',
} as const;
export type Section = keyof typeof GROUP_COLORS;

// The palette offered for group frames (neutral first).
export const FRAME_COLORS = ['#8a93a6', GROUP_COLORS.Structure, GROUP_COLORS.Simulation, GROUP_COLORS.Analysis, GROUP_COLORS.Optimize, GROUP_COLORS.View, '#9b6bd6'];

export const NODE_SECTION: Record<NodeKind, Section> = {
  material: 'Structure',
  matsweep: 'Structure',
  aniso: 'Structure',
  layer: 'Structure',
  combine: 'Structure',
  dbr: 'Structure',
  reverse: 'Structure',
  filter: 'Structure',
  grating: 'Structure',
  param: 'Simulation',
  sweep: 'Simulation',
  compute: 'Simulation',
  rcwa: 'Simulation',
  extremum: 'Analysis',
  fwhm: 'Analysis',
  sensitivity: 'Analysis',
  fit: 'Analysis',
  field: 'Analysis',
  tolerance: 'Analysis',
  rcwafield: 'Analysis',
  variable: 'Optimize',
  objective: 'Optimize',
  zones: 'Optimize',
  formula: 'Optimize',
  import: 'Optimize',
  target: 'Optimize',
  match: 'Optimize',
  optimizer: 'Optimize',
  plot: 'View',
  compare: 'View',
  draw: 'View',
  drawgrating: 'View',
  info: 'Notes',
  notes: 'Notes',
  frame: 'Notes',
};

export const NODE_COLORS = Object.fromEntries(Object.entries(NODE_SECTION).map(([t, s]) => [t, GROUP_COLORS[s]])) as Record<NodeKind, string>;

export const THETA_COLOR = '#3a8fd9';
export const LAMBDA_COLOR = '#d9534f';

export const nodeColor = (n: AppNode): string => {
  if (n.type === 'param') return n.data.quantity === 'lambda' ? LAMBDA_COLOR : THETA_COLOR;
  if (n.type === 'info' && n.data.color) return n.data.color;
  if (n.type === 'frame') return n.data.color || GROUP_COLORS.Notes;
  return NODE_COLORS[n.type];
};

// Readable text on a coloured bar: dark on light colours (amber), white otherwise.
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const v = parseInt(m[1], 16);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  return L > 0.36 ? '#1d1d1f' : '#ffffff';
}

export const NODE_TITLES: Record<NodeKind, string> = {
  material: 'Material',
  matsweep: 'Material sweep',
  aniso: 'Anisotropic material',
  layer: 'Layer',
  combine: 'Combine stack',
  dbr: 'DBR builder',
  reverse: 'Reverse stack',
  filter: 'Filter designer',
  grating: 'Grating layer',
  param: 'Parameter',
  sweep: 'Parameter sweep',
  compute: 'Compute TMM',
  rcwa: 'Compute RCWA',
  extremum: 'Min / max',
  fwhm: 'FWHM',
  sensitivity: 'Sensitivity',
  fit: 'Fit',
  field: 'Field profile',
  tolerance: 'Tolerance (Monte Carlo)',
  rcwafield: 'RCWA field map',
  variable: 'Design variable',
  objective: 'Objective',
  zones: 'Zones (step target)',
  formula: 'Custom objective',
  import: 'Measured data (CSV)',
  target: 'Target curve',
  match: 'Curve match',
  optimizer: 'Optimization Engine',
  plot: 'Plot',
  compare: 'Compare plot',
  draw: 'View Stack',
  drawgrating: 'View Grating',
  info: 'Info',
  notes: 'Combine notes',
  frame: 'Group',
};

export const nodeTitle = (n: AppNode): string => (n.type === 'param' ? (n.data.quantity === 'lambda' ? 'Wavelength' : 'Angle of incidence') : NODE_TITLES[n.type]);

// A short name of a node for tooltips: its type and its own name / label / caption when it has one.
export function nodeDisplayName(n: AppNode): string {
  const d = n.data as { name?: unknown; label?: unknown; caption?: unknown };
  const own = [d.name, d.label, d.caption].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return own ? `${nodeTitle(n)} “${own}”` : nodeTitle(n);
}
