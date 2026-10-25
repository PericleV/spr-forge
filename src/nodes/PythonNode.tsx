// Python script: inputs A, B, C … (one free after the last used), the code (its editor), Run / Stop and what Python is
// doing, the printed text and the last expression (a table for a DataFrame), an error with its line, the figures of
// matplotlib and the files the code saved (to download), the outputs (one port per variable made: data or a material).
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { Maximize2, Play, Square, X } from 'lucide-react';
import { useNodeResult } from '../engine/engine.ts';
import { letterOf, portKindOf, validName, type PyInfo, type PyOut } from '../engine/python.ts';
import { allowProject, stopPython, usePython } from '../python/runner.ts';
import { PYODIDE_VERSION } from '../python/version.ts';
import type { AppNode, PythonData, PythonNode } from '../types.ts';
import { IC } from '../ui/iconProps.ts';
import { Messages, Port } from './ui.tsx';
import { PY_EXAMPLES } from './pythonExamples.ts';

const CodeEditor = lazy(() => import('./CodeEditor.tsx'));

const KIND_TEXT: Record<string, string> = { value: 'float', array: 'array', data: 'Data', material: 'Material' };
const outText = (o: PyOut) =>
  o.kind === 'value'
    ? Number.isFinite(o.value)
      ? String(+o.value.toPrecision(6))
      : 'NaN'
    : o.kind === 'array'
      ? `array, ${o.values.length} values`
      : o.kind === 'data'
        ? `Data: ${o.fields.map((f) => f.key).join(', ') || 'no quantity'} over ${o.axes.map((a) => `${a.id} (${a.values.length})`).join(' × ') || 'one point'}`
        : `Material “${o.title || o.name}”, ${o.lam.length > 1 ? `${+o.lam[0].toFixed(1)} to ${+o.lam[o.lam.length - 1].toFixed(1)} nm` : 'constant'}`;

export function PythonNodeView({ id, data }: NodeProps<PythonNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<PythonData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const py = (r?.info as { py?: PyInfo } | undefined)?.py;
  const res = py?.result;
  const status = usePython();
  const running = status.running === id;
  // the ports A, B …: one free after the last one used
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, ...used) + 2);
  const byLetter = new Map((py?.vars ?? []).map((v) => [v.letter, v]));
  // the outputs as last run kept as the node's ports (their connections stay while it runs again)
  const outs = res && !res.error ? res.outputs.map((o) => ({ name: o.name, kind: portKindOf(o) })) : null;
  const outsKey = outs ? JSON.stringify(outs) : '';
  useEffect(() => {
    if (outs && outsKey !== JSON.stringify(data.outs ?? [])) set({ outs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outsKey]);
  const hide = new Set(data.hide ?? []);
  const ports = (data.outs ?? []).filter((o) => !hide.has(o.name));
  const run = () => {
    if (!status.allowed) allowProject();
    set({ run: (data.run ?? 0) + 1 });
  };
  const names = (py?.vars ?? []).map((v) => v.name);
  const download = (f: { name: string; mime: string; bytes: Uint8Array }) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime }));
    a.download = f.name.split('/').pop() || f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const [big, setBig] = useState(false);
  const editor = (height: number) => (
    <Suspense fallback={<div className="code-editor muted">Loading the editor</div>}>
      <CodeEditor value={data.code} onChange={(code) => set({ code })} onRun={run} names={names} error={res?.error?.line} height={height} />
    </Suspense>
  );
  const mixed = /^\t+ +|^ +\t/m.test(data.code);
  return (
    <div className="node node-python">
      {Array.from({ length: count }, (_, k) => {
        const letter = letterOf(k);
        const v = byLetter.get(letter);
        return (
          <div className="port-row" key={k} title={`Optional: the data of a node, a material, a number or a sweep; in the code the variable ${data.vars?.[letter] || letter}`}>
            <Port kind="target" id={`in-${k}`} port="data" />
            <b>{letter}</b>
            <span className={`ellipsis${v ? '' : ' muted'}`}>{v ? `${v.name} · ${KIND_TEXT[v.kind] ?? v.kind} (${v.size})` : 'connect data, a material or a number (optional)'}</span>
          </div>
        );
      })}
      {editor(220)}
      {mixed && <div className="msg warn">Tabs and spaces are mixed in the indentation: Python may refuse it. Select all and press Shift+Tab, then Tab, to make it spaces.</div>}
      <div className="row wrap">
        <button className="nodrag btn-run" title="Run the code (Ctrl+Enter in the editor)" onClick={run}>
          <Play {...IC} /> Run
        </button>
        {running && (
          <button className="nodrag btn-stop" title="End the run (Python starts again at the next run)" onClick={stopPython}>
            <Square {...IC} /> Stop
          </button>
        )}
        <button className="nodrag" title="A larger editor" aria-label="A larger editor" onClick={() => setBig(true)}>
          <Maximize2 {...IC} />
        </button>
        <span className="muted ellipsis grow">{running ? status.text || 'Running' : res ? `${res.error ? '✗' : '✓'} ${res.ms} ms${py?.stale && data.auto !== true ? ' · changed since: press Run' : ''}` : ''}</span>
      </div>
      {!status.allowed && (
        <div className="msg warn">
          This project came from a file, a link or another session: its Python code has not run. Run it only if you trust where it came from (Python in this page can read the projects kept in this browser).{' '}
          <button className="nodrag" onClick={allowProject}>
            Allow and run
          </button>
        </div>
      )}
      {res?.error && <pre className="py-error nowheel">{`${res.error.line ? `Line ${res.error.line}: ` : ''}${res.error.message}`}</pre>}
      {!!res?.console && <pre className="py-console nowheel">{res.console}</pre>}
      {res?.display && ('text' in res.display ? <pre className="py-console nowheel">{res.display.text}</pre> : <PyTable t={res.display.table} />)}
      {res?.figures.map((f) => <img key={f.num} className="py-figure" alt={`matplotlib figure ${f.num}`} title={`matplotlib figure ${f.num}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.svg)}`} />)}
      {!!res?.files.length && (
        <div className="row wrap">
          <span className="muted">Files the code saved:</span>
          {res.files.map((f) => (
            <button key={f.name} className="nodrag" title={`The file the code saved (${(f.bytes.length / 1024).toFixed(0)} kB)`} onClick={() => download(f)}>
              Download {f.name}
            </button>
          ))}
        </div>
      )}
      <details className="py-options">
        <summary>Options and examples</summary>
        <label className="check" title="Off (the default): the code runs only when you press Run (Ctrl+Enter). On: again at every change of the code or the data">
          <input className="nodrag" type="checkbox" checked={data.auto === true} onChange={(e) => set({ auto: e.target.checked || undefined })} />
          Auto run
        </label>
        {!!py?.vars.length && (
          <div className="py-names">
            {py.vars.map((v) => (
              <VarName key={v.letter} letter={v.letter} value={data.vars?.[v.letter] ?? ''} onChange={(nm) => set({ vars: { ...data.vars, [v.letter]: nm || undefined } as Record<string, string> })} />
            ))}
          </div>
        )}
        {!!res?.outputs.length && (
          <div className="row wrap" title="The variables of the code given out as ports (untick those you do not want)">
            <span className="muted">Outputs</span>
            {res.outputs.map((o) => (
              <label key={o.name} className="check">
                <input className="nodrag" type="checkbox" checked={!hide.has(o.name)} onChange={(e) => set({ hide: e.target.checked ? (data.hide ?? []).filter((x) => x !== o.name) : [...(data.hide ?? []), o.name] })} />
                {o.name}
              </label>
            ))}
          </div>
        )}
        <select
          className="nodrag"
          value=""
          title="A start: it replaces the code"
          onChange={(e) => {
            const ex = PY_EXAMPLES[Number(e.target.value)];
            if (ex && (!data.code.trim() || confirm('Replace the code with this example?'))) set({ code: ex[1] });
          }}
        >
          <option value="">Examples</option>
          {PY_EXAMPLES.map(([l], k) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <div className="hint">
          Python 3.14 in the browser (Pyodide {PYODIDE_VERSION}, MPL-2.0): nothing is installed and the data never leave this computer. The first run downloads Python (about 10 MB) and each library the code imports (numpy, scipy, pandas, matplotlib, statsmodels, scikit-learn, scikit-image, OpenCV as cv2, sympy; lmfit, seaborn, pingouin, pybaselines, emcee, pint, tifffile and openpyxl from PyPI), then the browser keeps them.
        </div>
      </details>
      <Messages result={r} />
      {!!res?.skipped.length && (
        <div className="hint" title="Only numbers, real arrays, Data, Material and pandas tables become outputs (a complex array: give np.real and np.imag, or a Data or a Material)">
          Not given out: {res.skipped.map((s) => `${s.name} (${s.type})`).join(', ')}
        </div>
      )}
      {ports.map((o) => {
        const val = res?.outputs.find((q) => q.name === o.name);
        return (
          <div className="port-row out" key={o.name} title={`The variable ${o.name} of the code`}>
            <span className="muted ellipsis py-out-text">{val ? outText(val) : o.kind}</span>
            {o.name}
            <Port kind="source" id={`py-${o.name}`} port={o.kind} />
          </div>
        );
      })}
      {big && (
        <div className="welcome-backdrop" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
          <div className="py-big">
            <div className="row">
              <b>Python script</b>
              <span className="grow" />
              <button className="btn-run" onClick={run}>
                <Play {...IC} /> Run
              </button>
              <button onClick={() => setBig(false)} aria-label="Close" title="Close">
                <X {...IC} />
              </button>
            </div>
            {editor(Math.round(window.innerHeight * 0.7))}
          </div>
        </div>
      )}
    </div>
  );
}

// an input's name in the code (a Python name)
function VarName({ letter, value, onChange }: { letter: string; value: string; onChange: (v: string) => void }) {
  const ok = !value || validName(value);
  return (
    <label title="The input's name in the code (empty: its letter)">
      {letter} is called
      <input className="nodrag short-text" value={value} placeholder={letter} onChange={(e) => onChange(e.target.value.trim())} />
      {!ok && <span className="err-text">not a Python name</span>}
    </label>
  );
}

function PyTable({ t }: { t: { columns: string[]; rows: string[][]; total: number } }) {
  return (
    <div className="py-table nowheel">
      <table>
        <thead>
          <tr>
            {t.columns.map((c, k) => (
              <th key={k}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, k) => (
                <td key={k}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.total > t.rows.length && <div className="muted">{t.total} rows in all (the first {t.rows.length} shown)</div>}
    </div>
  );
}
