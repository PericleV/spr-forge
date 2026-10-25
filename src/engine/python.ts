// Python script: what goes to Python and what comes back, pure (the running itself is in src/python, Pyodide in a worker
// of its own). Every input port (A, B, C …) is a variable: the data of a computation a Data object (its quantities as
// N-D arrays over its axes, .df a pandas table), a material a Material (ñ(λ) tabulated), a number a float, a sweep an
// array. The variables the code makes are the outputs: numbers, arrays and Data for the analysis and view nodes, Material
// for a Layer. A run is asked for when Run is pressed (or, with Auto run, when the code or the data change: their digest);
// its result is kept by the engine and given back to the evaluation.

export type PyAxis = { id: string; label: string; unit: string; values: Float64Array; labels?: string[] };
export type PyField = { key: string; label: string; unit: string; values: Float64Array };
// a value as Python gets it, and as the code gives it back
export type PyValue =
  | { kind: 'value'; value: number }
  | { kind: 'array'; values: Float64Array }
  | { kind: 'data'; name: string; axes: PyAxis[]; fields: PyField[] }
  | { kind: 'material'; name: string; lam: Float64Array; n: Float64Array; k: Float64Array; title?: string };
export type PyOut = PyValue & { name: string };
// a figure of matplotlib (its picture) and a file the code saved
export type PyFigure = { num: number; svg: string };
export type PyFile = { name: string; mime: string; bytes: Uint8Array };
// the last expression shown as Jupyter does: a text, or a table (its first rows)
export type PyDisplay = { text: string } | { table: { columns: string[]; rows: string[][]; total: number } };
// a run: what it was asked with (its digest, the Run count), its outputs, its printed text, an error (its line in the
// code), its figures and files, how long it took
export type PyResult = { key: string; run: number; outputs: PyOut[]; skipped: { name: string; type: string }[]; console: string; display?: PyDisplay; error?: { message: string; line?: number }; figures: PyFigure[]; files: PyFile[]; ms: number };
// a run asked for: the digest, the Run count, the code, the variables
export type PyJob = { key: string; run: number; code: string; vars: { name: string; value: PyValue }[] };

// the port an output goes out on: a material, or data (numbers and arrays as one-point / indexed data)
export type PyPortKind = 'data' | 'material';
export const portKindOf = (o: Pick<PyOut, 'kind'>): PyPortKind => (o.kind === 'material' ? 'material' : 'data');

// what the node shows of a run (Evaluation info)
export type PyVarShown = { letter: string; name: string; kind: PyValue['kind']; size: string };
export type PyInfo = { vars: PyVarShown[]; job?: PyJob; result?: PyResult; running: boolean; stale: boolean; headless?: boolean };

// a Python name: letters, digits and _ (not a digit first, not a keyword)
const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
export const validName = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !KEYWORDS.has(s);

// the letter of input k: A … Z, then AA, AB …
export const letterOf = (k: number): string => (k < 26 ? String.fromCharCode(65 + k) : letterOf(Math.floor(k / 26) - 1) + String.fromCharCode(65 + (k % 26)));

export const sizeText = (v: PyValue): string =>
  v.kind === 'value' ? '1' : v.kind === 'array' ? `${v.values.length}` : v.kind === 'data' ? v.axes.map((a) => `${a.values.length}`).join(' × ') || '1' : `${v.lam.length} λ`;

// A digest of the code and the variables (FNV-1a over their names, numbers and texts): a run is asked for when it changes.
export function digest(code: string, vars: PyJob['vars'], run: number): string {
  let h = 0x811c9dc5;
  const byte = (b: number) => {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      byte(c);
      byte(c >> 8);
    }
    byte(0);
  };
  const nums = (a: Float64Array) => {
    const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < b.length; i++) byte(b[i]);
    byte(1);
  };
  str(code);
  str(String(run));
  for (const { name, value: v } of vars) {
    str(name);
    str(v.kind);
    if (v.kind === 'value') nums(Float64Array.of(v.value));
    else if (v.kind === 'array') nums(v.values);
    else if (v.kind === 'data') {
      str(v.name);
      for (const a of v.axes) {
        str(a.id);
        str(a.unit);
        nums(a.values);
      }
      for (const f of v.fields) {
        str(f.key);
        nums(f.values);
      }
    } else {
      str(v.name);
      nums(v.lam);
      nums(v.n);
      nums(v.k);
    }
  }
  return (h >>> 0).toString(36) + code.length.toString(36);
}

// The digest of a project's Python code (all its scripts): the code allowed to run is kept by it (python/runner.ts).
export function codeDigest(codes: string[]): string {
  let h = 0x811c9dc5;
  for (const s of codes) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
