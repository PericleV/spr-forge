// Regenerates src/physics/builtins.json from a local refractiveindex.info database.
// Usage: node scripts/gen-builtins.ts [path-to-database]
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseRii } from './rii.ts';
import type { MaterialDef } from '../src/physics/materials.ts';

const db = process.argv[2] ?? process.env.RII_DB ?? join(homedir(), '.refractiveindex.info-database');
// Tabulated data of the added materials: trimmed to 150 nm – 25 µm and thinned (points kept only where linear
// interpolation between the kept neighbours would miss n or k by more than 3·10⁻⁴ relative); the older entries unchanged.
type Slim = { slim?: boolean };
const pages: [id: string, name: string, color: string, page: string, extra?: Partial<MaterialDef> & Slim][] = [
  ['BK7', 'BK7', '#9fc9e6', 'specs/schott/optical/N-BK7.yml'],
  ['SiO2', 'SiO₂', '#cfe3ef', 'main/SiO2/nk/Malitson.yml'],
  ['Water', 'Water', '#6fb3e0', 'main/H2O/nk/Daimon-20.0C.yml'],
  ['Ag', 'Ag', '#b8bcc4', 'main/Ag/nk/Johnson.yml'],
  ['Au', 'Au', '#e0b43c', 'main/Au/nk/Johnson.yml'],
  ['Cr', 'Cr', '#7d8591', 'main/Cr/nk/Johnson.yml'],
  ['Si', 'Si', '#6c6f8a', 'main/Si/nk/Green-2008.yml'],
  ['TiO2', 'TiO₂', '#f2f0e6', 'main/TiO2/nk/Sarkar.yml'],
  ['Al2O3', 'Al₂O₃', '#d9d4c7', 'main/Al2O3/nk/Malitson.yml'],
  ['Graphene', 'Graphene', '#3b3b3b', 'main/C/nk/Weber.yml', { monolayer: 0.335 }],
  // coating and infrared materials (thin-film data where available), metals
  ['Ge', 'Ge (film)', '#7b7f86', 'main/Ge/nk/Amotchkina-film.yml', { slim: true }],
  ['MgF2', 'MgF₂', '#cfe8d8', 'main/MgF2/nk/Dodge-o.yml'],
  ['Ta2O5', 'Ta₂O₅', '#e8d9b5', 'main/Ta2O5/nk/Bright-amorphous.yml', { slim: true }],
  ['Nb2O5', 'Nb₂O₅', '#d9c9e8', 'main/Nb2O5/nk/Franta.yml', { slim: true }],
  ['HfO2', 'HfO₂', '#c9dde8', 'main/HfO2/nk/Franta.yml', { slim: true }],
  ['ZnS', 'ZnS (film)', '#e8e3a0', 'main/ZnS/nk/Amotchkina.yml'],
  ['ZnSe', 'ZnSe', '#e8c07a', 'main/ZnSe/nk/Connolly.yml'],
  ['Si3N4', 'Si₃N₄', '#b5c7a3', 'main/Si3N4/nk/Luke.yml'],
  ['CaF2', 'CaF₂', '#eef3f7', 'main/CaF2/nk/Malitson.yml'],
  ['Al', 'Al', '#c8ccd2', 'main/Al/nk/Rakic.yml', { slim: true }],
  ['Cu', 'Cu', '#c8753a', 'main/Cu/nk/Johnson.yml', { slim: true }],
  // 2D materials (in-plane index; thickness = number of monolayers) and the glasses of the SPR sensors of Sebek et al.,
  // ACS Omega 8, 20792 (2023); monolayers as in the SPR literature: hBN 0.333, MoS₂ 0.65, WS₂ 0.80 nm
  ['hBN', 'hBN', '#d9d2f2', 'main/BN/nk/Grudinin-o.yml', { monolayer: 0.333, slim: true }],
  ['MoS2', 'MoS₂', '#5d6f93', 'main/MoS2/nk/Ermolaev-o.yml', { monolayer: 0.65, slim: true }],
  ['WS2', 'WS₂', '#6f8a5e', 'main/WS2/nk/Ermolaev.yml', { monolayer: 0.8, slim: true }],
  ['GeO2', 'GeO₂', '#ece4cf', 'main/GeO2/nk/Fleming.yml'],
  ['K-FIR97UV', 'K-FIR97UV (Sumita)', '#e3eef5', 'specs/sumita/optical/K-FIR97UV.yml'],
  ['FSL3', 'FSL3 (Ohara)', '#e6f0f5', 'specs/ohara/optical/FSL3.yml'],
];

const out: MaterialDef[] = [
  { id: 'Air', name: 'Air', color: '#f4f6fa', model: { type: 'constant', n: 1, k: 0 }, source: 'n = 1', builtin: true },
];
// Ramer–Douglas–Peucker on (λ, n, k): the indices to keep.
function thin(l: number[], n: number[], k: number[], tol: number): number[] {
  const keep = new Set([0, l.length - 1]);
  const rec = (a: number, b: number) => {
    let worst = -1;
    let err = 0;
    for (let i = a + 1; i < b; i++) {
      const t = (l[i] - l[a]) / (l[b] - l[a]);
      const en = Math.abs(n[a] + t * (n[b] - n[a]) - n[i]) / Math.max(1e-3, Math.abs(n[i]));
      const ek = Math.abs(k[a] + t * (k[b] - k[a]) - k[i]) / Math.max(1e-3, Math.abs(k[i]), 1e-2 * Math.abs(n[i]));
      if (Math.max(en, ek) > err) [err, worst] = [Math.max(en, ek), i];
    }
    if (worst > 0 && err > tol) {
      keep.add(worst);
      rec(a, worst);
      rec(worst, b);
    }
  };
  rec(0, l.length - 1);
  return [...keep].sort((x, y) => x - y);
}

for (const [id, name, color, page, extra] of pages) {
  const r = parseRii(readFileSync(join(db, 'data', page), 'utf8'));
  if (typeof r === 'string') throw new Error(`${page}: ${r}`);
  const { slim, ...rest } = extra ?? {};
  let model = r.model;
  let range = r.range;
  if (slim && model.type === 'tabulated') {
    const t = model.table; // λ in µm
    const inRange = t.lambda.map((x, i) => i).filter((i) => t.lambda[i] >= 0.15 && t.lambda[i] <= 25);
    const L = inRange.map((i) => t.lambda[i]);
    const N = inRange.map((i) => t.n[i]);
    const K = inRange.map((i) => t.k[i]);
    const idx = thin(L, N, K, 3e-4);
    model = { ...model, table: { lambda: idx.map((i) => L[i]), n: idx.map((i) => N[i]), k: idx.map((i) => K[i]) } };
    range = [L[0] * 1000, L[L.length - 1] * 1000];
    console.log(`  ${id}: ${t.lambda.length} → ${idx.length} points (${range.map((x) => x.toFixed(0)).join('–')} nm)`);
  }
  out.push({ id, name, color, model, range, source: `refractiveindex.info ${page}${r.source ? ` — ${r.source}` : ''}`, builtin: true, ...rest });
}
writeFileSync('src/physics/builtins.json', JSON.stringify(out) + '\n');
console.log(out.map((m) => `${m.id}: ${m.model.type} ${m.range?.map((x) => x.toFixed(0)).join('–') ?? ''}`).join('\n'));
