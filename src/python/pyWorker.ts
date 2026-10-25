// Python for the Python scripts: Pyodide (CPython built for the browser, MPL-2.0; https://pyodide.org) loaded in this worker
// from the jsDelivr CDN the first time a script runs, then kept by the browser's cache; the packages the code imports
// (numpy, scipy, pandas, matplotlib, statsmodels, scikit-learn, OpenCV …) loaded when first imported; a few pure-Python
// packages Pyodide does not carry (lmfit, seaborn, pingouin …) installed from PyPI by micropip when first imported. One
// run at a time; Stop ends the worker (a new one is made for the next run).
import { RUNTIME } from './runtime.ts';
import type { PyJob, PyOut, PyResult, PyValue } from '../engine/python.ts';
import { PYODIDE_VERSION } from './version.ts';

const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type PyRequest = { id: string; job: PyJob };
export type PyReply = { type: 'status'; text: string } | { type: 'done'; id: string; result: PyResult };

// what is used of Pyodide's interface
type PyProxy = { toJs(o: { dict_converter: (e: Iterable<[string, unknown]>) => unknown; create_pyproxies: boolean }): unknown; destroy(): void };
type Pyodide = {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(names: string[], o?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  loadPackagesFromImports(code: string, o?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  globals: { get(name: string): (...a: unknown[]) => PyProxy };
  toPy(v: unknown): unknown;
};

const status = (text: string) => self.postMessage({ type: 'status', text } satisfies PyReply);

// Pure-Python packages from PyPI (Pyodide's own set lacks them): the name imported, the name to install
const PYPI_PACKAGES: Record<string, string> = {
  lmfit: 'lmfit',
  seaborn: 'seaborn',
  pingouin: 'pingouin',
  tifffile: 'tifffile',
  pybaselines: 'pybaselines',
  emcee: 'emcee',
  pint: 'pint',
  openpyxl: 'openpyxl',
};
const installed = new Set<string>();

let ready: Promise<Pyodide> | null = null;
function python(): Promise<Pyodide> {
  if (!ready)
    ready = (async () => {
      status('Loading Python (the first time: about 10 MB)');
      const mod = (await import(/* @vite-ignore */ `${CDN}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<Pyodide> };
      const py = await mod.loadPyodide({ indexURL: CDN });
      status('Loading numpy');
      await py.loadPackage(['numpy']);
      py.runPython(RUNTIME);
      return py;
    })();
  return ready;
}

// a value posted to Python: its numbers as the bytes of float64 (read there by numpy without a copy per element)
const bytes = (a: Float64Array) => new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
function plainValue(v: PyValue): unknown {
  if (v.kind === 'value') return v;
  if (v.kind === 'array') return { kind: 'array', values: bytes(v.values) };
  if (v.kind === 'material') return { kind: 'material', name: v.name, lam: bytes(v.lam), n: bytes(v.n), k: bytes(v.k) };
  return {
    kind: 'data',
    name: v.name,
    axes: v.axes.map((a) => ({ id: a.id, label: a.label, unit: a.unit, values: bytes(a.values), ...(a.labels ? { labels: a.labels } : {}) })),
    fields: v.fields.map((f) => ({ key: f.key, label: f.label, unit: f.unit, values: bytes(f.values) })),
  };
}
// the bytes of float64 back as numbers
const floats = (b: unknown) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(0);
  const out = new Float64Array(u.byteLength / 8);
  new Uint8Array(out.buffer).set(u.subarray(0, out.length * 8));
  return out;
};
type Raw = Record<string, unknown> & { name: string; kind: PyOut['kind'] };
function outBack(o: Raw): PyOut {
  if (o.kind === 'value') return { name: o.name, kind: 'value', value: Number(o.value) };
  if (o.kind === 'array') return { name: o.name, kind: 'array', values: floats(o.values) };
  if (o.kind === 'material') return { name: o.name, kind: 'material', lam: floats(o.lam), n: floats(o.n), k: floats(o.k), ...(o.title ? { title: String(o.title) } : {}) };
  const axes = (o.axes as Raw[]).map((a) => ({ id: String(a.id), label: String(a.label), unit: String(a.unit ?? ''), values: floats(a.values), ...(Array.isArray(a.labels) ? { labels: a.labels as string[] } : {}) }));
  const fields = (o.fields as Raw[]).map((f) => ({ key: String(f.key), label: String(f.label), unit: String(f.unit ?? ''), values: floats(f.values) }));
  return { name: o.name, kind: 'data', axes, fields };
}
const MIME: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', tif: 'image/tiff', tiff: 'image/tiff', eps: 'application/postscript', ps: 'application/postscript', csv: 'text/csv', txt: 'text/plain', json: 'application/json' };

self.onmessage = async (e: MessageEvent<PyRequest>) => {
  const { id, job } = e.data;
  const t0 = performance.now();
  const fail = (message: string): PyResult => ({ key: job.key, run: job.run, outputs: [], skipped: [], console: '', error: { message }, figures: [], files: [], ms: Math.round(performance.now() - t0) });
  let result: PyResult;
  try {
    const py = await python();
    // the packages the code imports (and pandas for a dataset's .df)
    const note = (m: string) => /^Loading|^Loaded/.test(m) && status(m.slice(0, 120));
    await py.loadPackagesFromImports(job.code, { messageCallback: note, errorCallback: () => undefined });
    if (/\.df\b|pandas/.test(job.code)) await py.loadPackage(['pandas'], { messageCallback: note });
    // (from PyPI: those imported and not yet installed in this worker)
    const wanted = Object.keys(PYPI_PACKAGES).filter((m) => !installed.has(m) && new RegExp(`^\\s*(?:import|from)\\s+${m}\\b`, 'm').test(job.code));
    if (wanted.length) {
      await py.loadPackage(['micropip'], { messageCallback: note });
      status(`Installing ${wanted.join(', ')} from PyPI (the first time)`);
      await py.runPythonAsync(`import micropip\nawait micropip.install(${JSON.stringify(wanted.map((m) => PYPI_PACKAGES[m]))})`);
      for (const m of wanted) installed.add(m);
    }
    status('Running');
    const run = py.globals.get('_run');
    const inputs = py.toPy(job.vars.map((v) => ({ name: v.name, value: plainValue(v.value) })));
    const out = run(job.code, inputs);
    const raw = out.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as {
      outputs: Raw[];
      skipped: PyResult['skipped'];
      console: string;
      display?: PyResult['display'];
      error?: PyResult['error'];
      figures: PyResult['figures'];
      files: { name: string; bytes: Uint8Array }[];
      ms: number;
    };
    out.destroy();
    (inputs as { destroy?: () => void }).destroy?.();
    const outputs = raw.outputs.map(outBack);
    const files = raw.files.map((f) => ({ name: f.name, mime: MIME[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream', bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(0) }));
    result = { key: job.key, run: job.run, outputs, skipped: raw.skipped, console: raw.console, ...(raw.display ? { display: raw.display } : {}), ...(raw.error ? { error: raw.error } : {}), figures: raw.figures, files, ms: raw.ms };
  } catch (err) {
    result = fail(`Python could not run: ${(err as Error).message ?? err}`);
    // Python not loaded (no network …): tried again at the next run
    if (!(await ready?.then(() => true, () => false))) ready = null;
  }
  self.postMessage({ type: 'done', id, result } satisfies PyReply);
};
