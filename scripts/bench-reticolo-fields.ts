// Computes the reference fields of conical-incidence cases with RETICOLO (res3) under GNU Octave and stores them in
// scripts/reference/reticolo-fields.json (read by check-tmm.ts, which does not need Octave).
// Usage: npm run bench:reticolo-fields   (env OCTAVE, RETICOLO as for bench:reticolo)
// Reticolo's z axis points up from the bottom of the drawn region (margin below + layers + margin above): the check maps
// it onto our depth z (down from the top of the first layer) and mirrors the components (Ex, Ey, −Ez, −Hx, −Hy, Hz).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RETICOLO_CASES, RETICOLO_FIELD_CASES, type Cx, type RetCase } from './reticolo-cases.ts';

const OCTAVE = process.env.OCTAVE ?? 'C:\\Program Files\\GNU Octave\\Octave-11.1.0\\mingw64\\bin\\octave-cli.exe';
const RETICOLO = process.env.RETICOLO ?? 'D:\\reticolo\\RETICOLO V10\\V10_2025\\reticolo_allege_v10';

const num = (z: Cx) => (z[1] ? `(${z[0]}+${z[1]}i)` : `${z[0]}`);
function texture(L: RetCase['layers'][number], period: number): string {
  if (!L.segs) return `{${num(L.n!)}}`;
  const segs = [...L.segs].sort((a, b) => a.from - b.from);
  return `{[${segs.map((s) => s.to * period).join(',')}],[${segs.map((s) => num(s.n)).join(',')}]}`;
}

function fieldScript(f: (typeof RETICOLO_FIELD_CASES)[number]): string {
  const c = RETICOLO_CASES.find((q) => q.id === f.case)!;
  const tex = [`{${num(c.top)}}`, `{${num(c.bottom)}}`, ...c.layers.map((L) => texture(L, c.period))];
  const heights = [f.margin, ...c.layers.map((L) => L.d), f.margin];
  const profile = `{[${heights.join(',')}],[1,${c.layers.map((_, i) => i + 3).join(',')},2]}`;
  const npts = `[${[f.npts, ...c.layers.map(() => f.npts), f.npts].join(',')}]`;
  return `
parm = res0; parm.not_io = 1; parm.res1.champ = 1;
textures = {${tex.map((t) => (t.startsWith('{{') ? t.slice(1, -1) : t)).join(',')}};
aa = res1(${c.lam}, ${c.period}, textures, ${c.N}, ${c.top[0]}*sin(${c.theta}*pi/180), ${c.phi}, parm);
p3 = res0; p3.not_io = 1; p3.res2.result = 0; p3.res3.npts = ${npts};
xs = [${f.xs.join(',')}];
[e, z, o] = res3(xs, aa, ${profile}, ${c.pol === 's' ? '[0,1]' : '[1,0]'}, p3);
for iz = 1:numel(z); for ix = 1:${f.xs.length};
  v = squeeze(e(iz, ix, :));
  printf('FIELD ${f.case} %.15g %.15g', z(iz), xs(ix));
  printf(' %.15g', [real(v) imag(v)]');
  printf('\\n');
end; end
`;
}

const script = `warning('off','all'); addpath('${RETICOLO}');\n${RETICOLO_FIELD_CASES.map(fieldScript).join('')}\n`;
const dir = join(tmpdir(), 'spr-flow-reticolo');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'bench_reticolo_fields.m'), script);
console.log(`running ${RETICOLO_FIELD_CASES.length} field cases with Reticolo (${OCTAVE}) …`);
const t0 = Date.now();
const out = execFileSync(OCTAVE, ['--no-gui', '--quiet', '--eval', `cd('${dir.replace(/\\/g, '/')}'); bench_reticolo_fields`], { encoding: 'utf8', maxBuffer: 64 << 20 });
// per case: points { z, x, f: [Ex, Ey, Ez, Hx, Hy, Hz] as [re, im] }
const results: Record<string, { z: number; x: number; f: Cx[] }[]> = {};
for (const line of out.split(/\r?\n/)) {
  const m = /^FIELD (\S+) (.*)$/.exec(line.trim());
  if (!m) continue;
  const v = m[2].trim().split(/\s+/).map(Number);
  const [z, x] = v;
  const f = [0, 1, 2, 3, 4, 5].map((k): Cx => [v[2 + 2 * k], v[3 + 2 * k]]);
  (results[m[1]] ??= []).push({ z, x, f });
}
const missing = RETICOLO_FIELD_CASES.filter((f) => !results[f.case]?.length).map((f) => f.case);
if (missing.length) {
  console.error(out.slice(-3000));
  throw new Error(`no Reticolo field for ${missing.join(', ')}`);
}
mkdirSync(new URL('./reference/', import.meta.url), { recursive: true });
writeFileSync(new URL('./reference/reticolo-fields.json', import.meta.url), JSON.stringify({ reticolo: 'V10 (2025)', date: new Date().toISOString().slice(0, 10), results }, null, 1));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s → scripts/reference/reticolo-fields.json`);
