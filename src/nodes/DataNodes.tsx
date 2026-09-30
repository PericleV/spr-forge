// Data nodes: Extract data (quantities of a result, all curves or single values), Merge data (results side by side, each
// with its own points), Custom data (formulas of the quantities, point by point).
import { useEffect, useMemo, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { CustomInfo, ExtractInfo, MergeInfo } from '../engine/evaluate.ts';
import { flatten } from '../engine/dataOps.ts';
import { FUNCTION_NAMES } from '../engine/expr.ts';
import type { Dataset } from '../engine/types.ts';
import { exportCsv } from '../plot/export.ts';
import type { AppNode, CustomData, CustomNode, ExtractData, ExtractNode, MergeData, MergeNode } from '../types.ts';
import { Messages, OutPort, Port } from './ui.tsx';

const fmt = (v: number) => (Number.isFinite(v) ? `${+v.toPrecision(6)}` : '—');
const PREVIEW = 12;

// The first rows of a data set as a table (its swept axes as columns next to the quantities), with a CSV of all rows.
function ValuesTable({ ds, name }: { ds: Dataset; name: string }) {
  const t = useMemo(() => flatten(ds), [ds]);
  if (!t.columns.length) return null;
  const head = t.columns.map((c) => `${c.meta.short}${c.meta.unit ? ` [${c.meta.unit}]` : ''}`);
  return (
    <details className="nodrag data-table" open={t.n <= PREVIEW}>
      <summary>
        Values: {t.n} {t.n === 1 ? 'row' : 'rows'}
        <button
          className="nodrag"
          title="All the rows as a CSV file"
          onClick={(e) => {
            e.preventDefault();
            exportCsv(head, Array.from({ length: t.n }, (_, k) => t.columns.map((c) => c.values[k])), name);
          }}
        >
          CSV
        </button>
      </summary>
      <div className="nowheel data-scroll">
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.min(t.n, PREVIEW) }, (_, k) => (
              <tr key={k}>
                {t.columns.map((c) => (
                  <td key={c.key}>{fmt(c.values[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {t.n > PREVIEW && <div className="hint">… {t.n - PREVIEW} more rows (CSV for all)</div>}
      </div>
    </details>
  );
}

const outData = (outs: Record<string, unknown> | undefined) => {
  const o = outs?.out as { type?: string; dataset?: Dataset } | undefined;
  return o?.type === 'data' ? o.dataset : undefined;
};

export function ExtractNodeView({ id, data }: NodeProps<ExtractNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ExtractData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as ExtractInfo | undefined;
  const ds = outData(result?.outs);
  const all = info?.fields ?? [];
  const chosen = (k: string) => !data.fields.length || data.fields.includes(k);
  const toggle = (k: string) => {
    const cur = data.fields.length ? data.fields : all.map((m) => m.key);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    set({ fields: next.length === all.length ? [] : next });
  };
  return (
    <div className="node node-extract">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      {all.length > 0 && (
        <>
          <div className="section">Quantities</div>
          <div className="checks-inline">
            {all.map((m) => (
              <label key={m.key} className="radio" title={m.label}>
                <input className="nodrag" type="checkbox" checked={chosen(m.key)} onChange={() => toggle(m.key)} />
                {m.short}
                {m.unit ? ` [${m.unit}]` : ''}
              </label>
            ))}
          </div>
        </>
      )}
      {info?.axes.some((a) => a.labels.length > 1) && (
        <>
          <div className="section" title="Keep every curve along an axis, take the values at one of its steps (every axis fixed: single values), or average over it (e.g. over the seeds of a rough interface: the mean and the standard deviation of every quantity)">
            Along the axes
          </div>
          {info.axes
            .filter((a) => a.labels.length > 1)
            .map((a) => (
              <label key={a.id} className="radio">
                {a.label}
                {a.unit ? ` [${a.unit}]` : ''}
                <select
                  className="nodrag"
                  value={a.id in data.fixed ? String(data.fixed[a.id]) : data.mean?.includes(a.id) ? 'mean' : 'all'}
                  onChange={(e) => {
                    const fixed = { ...data.fixed };
                    const mean = (data.mean ?? []).filter((k) => k !== a.id);
                    if (e.target.value === 'mean') mean.push(a.id);
                    if (e.target.value === 'all' || e.target.value === 'mean') delete fixed[a.id];
                    else fixed[a.id] = Number(e.target.value);
                    set({ fixed, mean });
                  }}
                >
                  <option value="all">all ({a.labels.length})</option>
                  <option value="mean">mean over all (± std)</option>
                  {a.labels.map((l, i) => (
                    <option key={i} value={i}>
                      at {l}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </>
      )}
      {info && info.points > 0 && (
        <div className="stack-rows results">
          <div className="val">
            {info.points} {info.points === 1 ? 'value' : 'points'} of {ds?.meta.length ?? 0} {ds?.meta.length === 1 ? 'quantity' : 'quantities'}
            {info.curves > 1 ? ` · ${info.curves} curves` : ''}
          </div>
        </div>
      )}
      {ds && <ValuesTable ds={ds} name={data.name || 'extract'} />}
      <Messages result={result} />
      <OutPort label="data" port="data" />
    </div>
  );
}

export function MergeNodeView({ id, data }: NodeProps<MergeNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<MergeData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as MergeInfo | undefined;
  const ds = outData(result?.outs);
  return (
    <div className="node node-merge">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data (several)</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="merged data" onChange={(e) => set({ name: e.target.value })} />
      </label>
      {info?.sources.length ? (
        <div className="stack-rows">
          {info.sources.map((s) => (
            <label key={s.id} className="radio merge-source" title={s.fields.join(', ')}>
              <input
                className="nodrag"
                value={data.labels[s.id] ?? ''}
                placeholder={s.label}
                onChange={(e) => {
                  const labels = { ...data.labels };
                  if (e.target.value) labels[s.id] = e.target.value;
                  else delete labels[s.id];
                  set({ labels });
                }}
              />
              <span className="muted">
                {s.points} pts · {s.fields.slice(0, 4).join(', ')}
                {s.fields.length > 4 ? '…' : ''}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="hint">Each source keeps its own points. In a Plot: one curve per source; X can be any quantity (e.g. the resonance angle); three quantities make a map.</div>
      {ds && <ValuesTable ds={ds} name={data.name || 'merged'} />}
      <Messages result={result} />
      <OutPort label="data" port="data" />
    </div>
  );
}

export function CustomNodeView({ id, data }: NodeProps<CustomNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<CustomData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as CustomInfo | undefined;
  const ds = outData(result?.outs);
  const [focus, setFocus] = useState(0);
  // the short names given to new connections are kept, so that the formulas do not change when inputs are added or removed
  useEffect(() => {
    const missing = (info?.inputs ?? []).filter((x) => !data.aliases?.[x.key]);
    if (missing.length) updateNodeData(id, { aliases: { ...data.aliases, ...Object.fromEntries(missing.map((x) => [x.key, x.alias])) } });
  }, [info?.inputs, data.aliases, id, updateNodeData]);
  const setRow = (i: number, patch: Partial<CustomData['rows'][number]>) => set({ rows: data.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const insert = (name: string) => {
    const i = Math.min(focus, data.rows.length - 1);
    if (i < 0) return;
    const e = data.rows[i].expr;
    setRow(i, { expr: e && !/[\s(+\-*/^,]$/.test(e) ? `${e} ${name}` : `${e}${name}` });
  };
  return (
    <div className="node node-custom">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data (several)</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="custom data" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="section">Formulas (point by point)</div>
      {data.rows.map((r, i) => (
        <div className="row custom-row" key={i}>
          <input className="nodrag custom-name" value={r.name} placeholder={`f${i + 1}`} onChange={(e) => setRow(i, { name: e.target.value })} title="Name of the new quantity" />
          <span>=</span>
          <input className="nodrag custom-expr" value={r.expr} placeholder="e.g. a_FWHM1 / 2" onFocus={() => setFocus(i)} onChange={(e) => setRow(i, { expr: e.target.value })} />
          {data.rows.length > 1 && (
            <button className="nodrag" title="remove" onClick={() => set({ rows: data.rows.filter((_, j) => j !== i) })}>
              ×
            </button>
          )}
        </div>
      ))}
      <button className="nodrag" onClick={() => set({ rows: [...data.rows, { name: '', expr: '' }] })}>+ formula</button>
      {info?.inputs.length ? (
        <>
          <div className="section" title="Each input has a short name (editable); its quantities and axes are <name>_<quantity>. Click a name to add it to the formula being edited.">
            Inputs and their names
          </div>
          {info.inputs.map((x) => (
            <div key={x.key} className="custom-source">
              <div className="row">
                <input
                  className="nodrag"
                  value={data.aliases?.[x.key] ?? x.alias}
                  title="Short name of this input (letters, digits, _)"
                  onChange={(e) => set({ aliases: { ...data.aliases, [x.key]: e.target.value.trim() } })}
                />
                <span className="muted">{x.name}</span>
              </div>
              <div className="chips">
                {info.vars
                  .filter((v) => v.input === x.alias)
                  .map((v) => (
                    <button key={v.name} className="nodrag chip" title={v.label} onClick={() => insert(v.name)}>
                      {v.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
      <div className="hint">
        + − * / ^, ( ), {FUNCTION_NAMES.join(', ')}. The points are those of the first input; another input has the same points, or a single value (used everywhere).
      </div>
      {ds && <ValuesTable ds={ds} name={data.name || 'custom'} />}
      <Messages result={result} />
      <OutPort label="data" port="data" />
    </div>
  );
}
