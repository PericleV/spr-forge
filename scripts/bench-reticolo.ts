// Computes the cross-validation cases (reticolo-cases.ts) with RETICOLO under GNU Octave and stores the diffraction
// efficiencies in scripts/reference/reticolo.json (read by check-tmm.ts, which does not need Octave).
// Usage: npm run bench:reticolo   (env OCTAVE = octave-cli executable, RETICOLO = folder of reticolo_allege)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RETICOLO_CASES, type Cx, type RetCase } from './reticolo-cases.ts';

const OCTAVE = process.env.OCTAVE ?? 'C:\\Program Files\\GNU Octave\\Octave-11.1.0\\mingw64\\bin\\octave-cli.exe';
const RETICOLO = process.env.RETICOLO ?? 'D:\\reticolo\\RETICOLO V10\\V10_2025\\reticolo_allege_v10';

const num = (z: Cx) => (z[1] ? `(${z[0]}+${z[1]}i)` : `${z[0]}`);

// Reticolo texture: {[x1 … xN], [n1 … nN]}, n_p on (x_{p−1}, x_p), n1 on (x_N − Λ, x1): the right edges of our segments.
// Reticolo's z axis points up: the tensor mirrored z → −z (the xz, yz, zx, zy components change sign)
function texture(L: RetCase['layers'][number], period: number): string {
  if (L.eps) {
    const e = L.eps.map((v, k) => ([2, 5, 6, 7].includes(k) ? ([-v[0], -v[1]] as Cx) : v));
    return `{[${[0, 1, 2].map((r) => e.slice(3 * r, 3 * r + 3).map(num).join(',')).join(';')}]}`;
  }
  if (!L.segs) return `{${num(L.n!)}}`;
  const segs = [...L.segs].sort((a, b) => a.from - b.from);
  return `{[${segs.map((s) => s.to * period).join(',')}],[${segs.map((s) => num(s.n)).join(',')}]}`;
}

function caseScript(c: RetCase): string {
  const tex = [`{${num(c.top)}}`, `{${num(c.bottom)}}`, ...c.layers.map((L) => texture(L, c.period))];
  const profile = `{[0,${c.layers.map((L) => L.d).join(',')},0],[1,${c.layers.map((_, i) => i + 3).join(',')},2]}`;
  if (c.phi !== undefined) {
    // conical: Reticolo's 2D solver with one harmonic along y; efficiency, efficiency_TE, efficiency_TM of each order
    const inc = c.pol === 's' ? 'TEinc' : 'TMinc';
    return `
parm = res0; parm.not_io = 1;
textures = {${tex.map((t) => (t.startsWith('{{') ? t.slice(1, -1) : t)).join(',')}};
aa = res1(${c.lam}, ${c.period}, textures, ${c.N}, ${c.top[0]}*sin(${c.theta}*pi/180), ${c.phi}, parm);
ef = res2(aa, ${profile});
r = ef.${inc}_top_reflected; t = ef.${inc}_top_transmitted;
printf('CASE ${c.id} R');
for k = 1:size(r.order, 1); printf(' %d:%.15g:%.15g:%.15g', r.order(k, 1), r.efficiency(k), r.efficiency_TE(k), r.efficiency_TM(k)); end
printf(' T');
for k = 1:size(t.order, 1); printf(' %d:%.15g:%.15g:%.15g', t.order(k, 1), t.efficiency(k), t.efficiency_TE(k), t.efficiency_TM(k)); end
printf('\\n');
`;
  }
  return `
parm = res0(${c.pol === 's' ? 1 : -1}); parm.not_io = 1;
textures = {${tex.map((t) => (t.startsWith('{{') ? t.slice(1, -1) : t)).join(',')}};
aa = res1(${c.lam}, ${c.period}, textures, ${c.N}, ${c.top[0]}*sin(${c.theta}*pi/180), parm);
ef = res2(aa, ${profile});
r = ef.inc_top_reflected; t = ef.inc_top_transmitted;
printf('CASE ${c.id} R');
for k = 1:numel(r.order); printf(' %d:%.15g', r.order(k), r.efficiency(k)); end
printf(' T');
for k = 1:numel(t.order); printf(' %d:%.15g', t.order(k), t.efficiency(k)); end
printf('\\n');
`;
}

const script = `warning('off','all'); addpath('${RETICOLO}');\n${RETICOLO_CASES.map(caseScript).join('')}\nretio;\n`;
const dir = join(tmpdir(), 'spr-flow-reticolo');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'bench_reticolo.m');
writeFileSync(file, script);
console.log(`running ${RETICOLO_CASES.length} cases with Reticolo (${OCTAVE}) …`);
const t0 = Date.now();
const out = execFileSync(OCTAVE, ['--no-gui', '--quiet', '--eval', `cd('${dir.replace(/\\/g, '/')}'); bench_reticolo`], { encoding: 'utf8', maxBuffer: 64 << 20 });
// planar: order:efficiency; conical: order:efficiency:TE part:TM part
type Res = { R: Record<string, number>; T: Record<string, number>; RTE?: Record<string, number>; RTM?: Record<string, number>; TTE?: Record<string, number>; TTM?: Record<string, number> };
const results: Record<string, Res> = {};
for (const line of out.split(/\r?\n/)) {
  const m = /^CASE (\S+) R(.*) T(.*)$/.exec(line.trim());
  if (!m) continue;
  const tok = (s: string) => s.trim().split(/\s+/).filter(Boolean).map((p) => p.split(':'));
  const col = (s: string, k: number) => Object.fromEntries(tok(s).map((p) => [p[0], Number(p[k])]));
  const conical = tok(m[2])[0]?.length === 4;
  results[m[1]] = { R: col(m[2], 1), T: col(m[3], 1), ...(conical ? { RTE: col(m[2], 2), RTM: col(m[2], 3), TTE: col(m[3], 2), TTM: col(m[3], 3) } : {}) };
}
const missing = RETICOLO_CASES.filter((c) => !results[c.id]).map((c) => c.id);
if (missing.length) {
  console.error(out.slice(-3000));
  throw new Error(`no Reticolo result for ${missing.join(', ')}`);
}
mkdirSync(new URL('./reference/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('./reference/reticolo.json', import.meta.url),
  JSON.stringify({ reticolo: 'V10 (2025)', octave: OCTAVE.match(/Octave-[\d.]+/)?.[0] ?? '', date: new Date().toISOString().slice(0, 10), results }, null, 1),
);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s → scripts/reference/reticolo.json`);
