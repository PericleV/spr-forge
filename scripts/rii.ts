// Parser for refractiveindex.info database pages (YAML), used offline by gen-builtins.ts only.
import { parse } from 'yaml';
import type { MaterialModel, Table } from '../src/physics/materials.ts';

export type Imported = { model: MaterialModel; range: [number, number]; source?: string };

const nums = (s: string) => s.trim().split(/\s+/).filter(Boolean).map(Number);

const rows = (data: string) =>
  data
    .split('\n')
    .map(nums)
    .filter((r) => r.length >= 2 && r.every(Number.isFinite));

function interpClamp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 1;
  while (xs[i] < x) i++;
  return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
}

const sortedUnique = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);

// Merge separate n and k tables onto the union of their wavelengths.
function mergeNK(n: number[][], k: number[][]): Table {
  const lambda = sortedUnique([...n.map((r) => r[0]), ...k.map((r) => r[0])]);
  const at = (t: number[][], x: number) => (t.length ? interpClamp(t.map((r) => r[0]), t.map((r) => r[1]), x) : 0);
  return { lambda, n: lambda.map((x) => at(n, x)), k: lambda.map((x) => at(k, x)) };
}

export function parseRii(text: string): Imported | string {
  let doc: { DATA?: { type?: string; data?: string; coefficients?: string; wavelength_range?: string }[]; REFERENCES?: string };
  try {
    doc = parse(text);
  } catch (e) {
    return `Not a valid YAML file: ${(e as Error).message}`;
  }
  if (!Array.isArray(doc?.DATA)) return 'No DATA section (not a refractiveindex.info page).';
  let nTab: number[][] = [];
  let kTab: number[][] = [];
  let formula: { formula: number; coefficients: number[]; range: [number, number] } | null = null;
  for (const d of doc.DATA) {
    const [kind, what] = (d.type ?? '').split(/\s+/);
    if (kind === 'tabulated' && d.data) {
      const r = rows(d.data);
      if (what === 'nk') {
        nTab = r.map((x) => [x[0], x[1]]);
        kTab = r.map((x) => [x[0], x[2] ?? 0]);
      } else if (what === 'n') nTab = r;
      else if (what === 'k') kTab = r;
      else return `Unsupported data type "${d.type}".`;
    } else if (kind === 'formula') {
      const f = Number(what);
      const range = nums(d.wavelength_range ?? '');
      if (!(f >= 1 && f <= 9) || range.length !== 2) return `Unsupported formula "${d.type}".`;
      formula = { formula: f, coefficients: nums(d.coefficients ?? ''), range: [range[0], range[1]] };
    }
  }
  const source = doc.REFERENCES?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const sortRows = (t: number[][]) => t.sort((a, b) => a[0] - b[0]);
  sortRows(nTab);
  sortRows(kTab);

  if (formula) {
    const model: MaterialModel = { type: 'formula', formula: formula.formula, coefficients: formula.coefficients, k: 0 };
    if (kTab.length) model.kTable = { lambda: kTab.map((r) => r[0]), k: kTab.map((r) => r[1]) };
    return { model, range: [formula.range[0] * 1000, formula.range[1] * 1000], source };
  }
  if (!nTab.length) return 'The page has no refractive index (n) data.';
  const table = mergeNK(nTab, kTab);
  const range: [number, number] = [nTab[0][0] * 1000, nTab[nTab.length - 1][0] * 1000];
  return { model: { type: 'tabulated', table, extrap: 'clamp' }, range, source };
}

