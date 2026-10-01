// Typed ports: a connection is valid only when the target accepts the source's port type.
import type { AppNode } from '../types.ts';

export type PortType =
  | 'material'
  | 'layer'
  | 'stack'
  | 'param-theta'
  | 'param-lambda'
  | 'sweep-number'
  | 'sweep-polarization'
  | 'data'
  | 'objective'
  | 'note';

export const PORT_COLORS: Record<PortType, string> = {
  material: '#a47551',
  layer: '#d9a13b',
  stack: '#e07b39',
  'param-theta': '#3a8fd9',
  'param-lambda': '#d9534f',
  'sweep-number': '#c24fbd',
  'sweep-polarization': '#c24fbd',
  data: '#2e9e6a',
  objective: '#f2b701',
  note: '#8a93a6',
};

export function sourcePort(node: AppNode, handle?: string | null): PortType | null {
  switch (node.type) {
    case 'material':
    case 'matsweep':
    case 'aniso':
      return 'material';
    case 'layer':
    case 'grating':
    case 'rough':
      return 'layer';
    case 'combine':
    case 'dbr':
    case 'draw':
    case 'reverse':
    case 'filter':
      return 'stack';
    case 'param':
      return `param-${node.data.quantity}`;
    case 'sweep':
      return `sweep-${node.data.kind}`;
    case 'variable':
      return 'sweep-number';
    case 'import':
    case 'target':
      return 'data';
    // Zones / Curve match: the objective, the data with the target drawn on it and the target curve itself
    case 'match':
    case 'zones':
      return handle === 'marked' || handle === 'target' ? 'data' : 'objective';
    case 'objective':
    case 'formula':
      return 'objective';
    case 'optimizer':
      return handle === 'stack' || handle === 'start' ? 'stack' : 'data';
    case 'info':
    case 'notes':
      return 'note';
    case 'drawgrating':
    case 'frame':
      return null;
    case 'compute':
    case 'rcwa':
    case 'rcwafield':
    case 'tolerance':
    case 'plot':
    case 'extremum':
    case 'fwhm':
    case 'sensitivity':
    case 'fit':
    case 'field':
    case 'extract':
    case 'merge':
    case 'custom':
      return 'data';
    case 'compare':
      return null;
  }
}

// DBR sweep ports: design wavelength, cavity thickness, number of periods, cavity positions.
const DBR_SWEEPS = /^(lambda0|cavd|periods|pos\d+|d\d+)$/;

export function targetAccepts(node: AppNode, handle: string | null | undefined): PortType[] {
  if (!handle) return [];
  switch (node.type) {
    case 'material':
      return handle === 'n' || handle === 'p' ? ['sweep-number'] : [];
    case 'matsweep':
      return handle === 'in' ? ['material'] : [];
    case 'aniso':
      return ['o', 'e', 'z'].includes(handle) ? ['material'] : /^a[012]$/.test(handle) ? ['sweep-number'] : [];
    case 'layer':
      return handle === 'mat' ? ['material'] : handle === 'd' ? ['sweep-number'] : [];
    case 'combine':
      if (handle === 'incident' || handle === 'exit' || handle === 'backMedium') return ['material'];
      if (handle === 'back') return ['layer', 'stack'];
      return handle.startsWith('item-') ? ['layer', 'stack'] : [];
    case 'dbr':
      return DBR_SWEEPS.test(handle) ? ['sweep-number'] : ['material'];
    case 'grating':
      return /^(ridge|groove|m2)$/.test(handle) ? ['material'] : /^(d|period|fill|fillTop)$/.test(handle) ? ['sweep-number'] : [];
    case 'drawgrating':
      return handle === 'in' ? ['layer', 'stack'] : [];
    case 'rough':
      return handle === 'in' ? ['layer'] : /^(size|cl|seed)$/.test(handle) ? ['sweep-number'] : [];
    case 'rcwafield':
      return handle === 'in' ? ['data'] : [];
    case 'rcwa':
    case 'compute':
      if (handle === 'stack') return ['stack'];
      if (handle === 'phi' || (handle === 'orders' && node.type === 'rcwa')) return ['sweep-number'];
      if (handle === 'lambda') return ['param-lambda'];
      if (handle === 'theta') return ['param-theta'];
      return handle === 'pol' ? ['sweep-polarization'] : [];
    case 'plot':
    case 'compare':
    case 'extremum':
    case 'fwhm':
    case 'sensitivity':
    case 'fit':
    case 'field':
    case 'extract':
    case 'merge':
      return handle === 'in' ? ['data'] : [];
    case 'custom':
      return handle === 'in' ? ['data', 'material', 'param-lambda'] : [];
    case 'draw':
    case 'reverse':
      return handle === 'in' ? ['layer', 'stack'] : [];
    case 'filter':
      return handle === 'target' ? ['data'] : /^(m\d|incident|sub|backMedium)$/.test(handle) ? ['material'] : [];
    case 'objective':
    case 'zones':
      return handle === 'in' ? ['data'] : [];
    case 'optimizer':
      return handle === 'obj' ? ['objective'] : [];
    case 'target':
      return handle === 'in' ? ['data'] : [];
    case 'match':
      return handle === 'in' || handle === 'target' ? ['data'] : [];
    case 'formula':
      return handle === 'in' ? ['data'] : [];
    case 'tolerance':
      return handle === 'in' || handle === 'target' || handle === 'criteria' ? ['data'] : [];
    case 'notes':
      return handle.startsWith('item-') ? ['note'] : [];
    default:
      return [];
  }
}

// Target handles that accept any number of incoming edges.
export const isMultiInput = (node: AppNode | undefined, handle: string | null | undefined) =>
  ((node?.type === 'compare' || node?.type === 'matsweep' || node?.type === 'formula' || node?.type === 'merge' || node?.type === 'custom') && handle === 'in') || (node?.type === 'optimizer' && handle === 'obj') || (node?.type === 'filter' && handle === 'target') || (node?.type === 'tolerance' && handle === 'criteria');

export function canConnect(source?: AppNode, target?: AppNode, targetHandle?: string | null, sourceHandle?: string | null) {
  if (!source || !target || source.id === target.id) return false;
  const p = sourcePort(source, sourceHandle);
  return !!p && targetAccepts(target, targetHandle).includes(p);
}
