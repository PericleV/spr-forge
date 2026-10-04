import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { axisTitle, axisValueText, line, metaOf, TMM_META } from '../engine/dataset.ts';
import type { CompareSource } from '../engine/evaluate.ts';
import type { Annotation, Axis, FieldMeta } from '../engine/types.ts';
import { viridis } from '../plot/colors.ts';
import { exportCsv } from '../plot/export.ts';
import { FigureTools } from '../plot/FigureTools.tsx';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import { markKey, overlaysFor, visibleMarks, type Overlay } from '../plot/overlays.ts';
import type { AppNode, CompareCurve, CompareData, CompareNode, Dash } from '../types.ts';
import { Port } from './ui.tsx';

const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#59a14f', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac'];
const DASH: Record<Dash, string | undefined> = { solid: undefined, dash: '7 4', dot: '2 3' };
const MAX_FAMILY = 24;

const newId = () => crypto.randomUUID().slice(0, 8);
const hex = ([r, g, b]: number[]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export function CompareNodeView({ id, data }: NodeProps<CompareNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<CompareData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const sources = useMemo(() => (result?.info?.sources ?? []) as CompareSource[], [result]);
  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const chart = useRef<HTMLDivElement>(null);
  const [family, setFamily] = useState({ src: '', axis: '' });

  const setCurve = (cid: string, patch: Partial<CompareCurve>) =>
    set({ curves: data.curves.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });

  // Give every newly connected source a default curve.
  useEffect(() => {
    const fresh = sources.filter((s) => !data.seen.includes(s.id));
    if (!fresh.length) return;
    const curves = [...data.curves];
    for (const s of fresh)
      curves.push({ id: newId(), src: s.id, field: 'R', fixed: {}, color: PALETTE[curves.length % PALETTE.length], dash: 'solid', label: '', visible: true });
    updateNodeData(id, { curves, seen: [...data.seen, ...fresh.map((s) => s.id)] });
  }, [sources, data.seen, data.curves, id, updateNodeData]);

  // Candidate x axes: every non-singleton axis of any source.
  const xAxes = useMemo(() => {
    const m = new Map<string, Axis>();
    for (const s of sources) for (const a of s.dataset?.axes ?? []) if (a.values.length > 1 && !m.has(a.id)) m.set(a.id, a);
    return m;
  }, [sources]);
  const x = xAxes.has(data.x) ? data.x : xAxes.has('theta') ? 'theta' : xAxes.has('lambda') ? 'lambda' : ([...xAxes.keys()][0] ?? '');

  const drawn = useMemo(() => {
    const series: Series[] = [];
    const notes: string[] = [];
    const overlays: Overlay[] = [];
    const metas: FieldMeta[] = [];
    const marks = new Map<string, Annotation>();
    const visible = data.curves.filter((c) => c.visible).length;
    for (const c of data.curves) {
      const src = byId.get(c.src);
      if (!c.visible || !src?.dataset) continue;
      const ds = src.dataset;
      const xi = ds.axes.findIndex((a) => a.id === x);
      if (xi < 0 || ds.axes[xi].values.length < 2) {
        notes.push(`${src.name}: no ${xAxes.get(x)?.label ?? x} axis.`);
        continue;
      }
      const idx = ds.axes.map((a) => Math.min(a.values.length - 1, c.fixed[a.id] ?? Math.floor((a.values.length - 1) / 2)));
      const slice = ds.axes
        .flatMap((a, i) => (i !== xi && a.values.length > 1 ? [`${a.label}=${axisValueText(a, idx[i])}`] : []))
        .join(', ');
      const meta = metaOf(ds, c.field) ?? ds.meta[0];
      metas.push(meta);
      overlays.push(...overlaysFor(visibleMarks(src.annotations, data.showMarks, data.hiddenMarks), ds, xi, meta.key, idx, visible <= 3));
      for (const a of src.annotations) if (a.kind !== 'span' && a.datasetKey === ds.key) marks.set(markKey(a), a);
      series.push({
        key: c.id,
        label: c.label || `${src.name} ${meta.short}${slice ? ` (${slice})` : ''}`,
        color: c.color,
        dash: DASH[c.dash],
        x: ds.axes[xi].values,
        y: line(ds, meta.key, xi, idx),
      });
    }
    return { series, notes, overlays, metas, marks: [...marks.values()] };
  }, [data.curves, byId, x, xAxes, data.showMarks, data.hiddenMarks]);

  // A common y label/scale when all curves show the same quantity.
  const one = drawn.metas.length && drawn.metas.every((m) => m.key === drawn.metas[0].key) ? drawn.metas[0] : null;
  const xAxis = xAxes.get(x);

  const csv = () => {
    const header = drawn.series.flatMap((s) => [`${xAxis ? axisTitle(xAxis) : 'x'} (${s.label})`, s.label]);
    const n = Math.max(0, ...drawn.series.map((s) => s.y.length));
    const rows = Array.from({ length: n }, (_, i) => drawn.series.flatMap((s) => [s.x?.[i] ?? NaN, s.y[i] ?? NaN]));
    exportCsv(header, rows, 'compare');
  };

  // One curve per value (up to MAX_FAMILY, evenly picked) of a source axis.
  const addFamily = (src: CompareSource, axisId: string) => {
    const axis = src.dataset?.axes.find((a) => a.id === axisId);
    if (!axis) return;
    const k = Math.min(axis.values.length, MAX_FAMILY);
    const picks = Array.from({ length: k }, (_, i) => Math.round((i * (axis.values.length - 1)) / Math.max(1, k - 1)));
    const base = data.curves.find((c) => c.src === src.id);
    set({
      curves: [
        ...data.curves,
        ...picks.map((v, i) => ({
          id: newId(),
          src: src.id,
          field: base?.field ?? 'R',
          fixed: { ...base?.fixed, [axis.id]: v },
          color: hex(viridis((0.9 * i) / Math.max(1, k - 1))),
          dash: 'solid' as Dash,
          label: '',
          visible: true,
        })),
      ],
    });
  };
  const familySrc = byId.get(family.src) ?? sources[0];
  const familyAxes = familySrc?.dataset?.axes.filter((a) => a.values.length > 1 && a.id !== x) ?? [];

  return (
    <div className="node node-compare">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
        <span className="val muted">{sources.length} source{sources.length === 1 ? '' : 's'}</span>
        {drawn.series.length > 0 && <FigureTools target={chart} name="compare" csv={csv} />}
      </div>
      <div className="row wrap">
        <label className="radio">
          X
          <select className="nodrag" value={x} onChange={(e) => set({ x: e.target.value })}>
            {[...xAxes.values()].map((a) => (
              <option key={a.id} value={a.id}>{axisTitle(a)}</option>
            ))}
          </select>
        </label>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.autoY} onChange={(e) => set({ autoY: e.target.checked })} />
          Auto scale
        </label>
      </div>

      <div className="nodrag nowheel chart" ref={chart}>
        {xAxis && drawn.series.length ? (
          <LinePlot
            xAxis={xAxis}
            series={drawn.series}
            yLabel={one?.short ?? 'value'}
            yUnit={one?.unit ?? ''}
            yDomain={data.autoY || !one ? undefined : one.domain}
            overlays={drawn.overlays}
          />
        ) : (
          <div className="empty">{sources.length ? 'No visible curves.' : 'Connect the data outputs of one or more Compute TMM nodes.'}</div>
        )}
      </div>
      {drawn.series.length > 1 && (
        <div className="legend">
          {drawn.series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {drawn.marks.length > 0 && (
        <div className="legend marks">
          <label className="radio" title="Show the marks of the analysis nodes (minima, FWHM, fits, ranges …)">
            <input className="nodrag" type="checkbox" checked={data.showMarks !== false} onChange={(e) => set({ showMarks: e.target.checked })} />
            marks
          </label>
          {data.showMarks !== false &&
            drawn.marks.map((m) => {
              const k = markKey(m);
              const off = data.hiddenMarks?.includes(k);
              return (
                <button
                  key={k}
                  className={`nodrag mark-toggle${off ? ' off' : ''}`}
                  title={off ? 'Show this mark' : 'Hide this mark'}
                  onClick={() => set({ hiddenMarks: off ? (data.hiddenMarks ?? []).filter((x) => x !== k) : [...(data.hiddenMarks ?? []), k] })}
                >
                  <i className={m.kind === 'curve' ? 'dashed' : m.kind === 'area' ? 'area' : 'dot'} style={{ background: m.color, color: m.color }} />
                  {m.label}
                </button>
              );
            })}
        </div>
      )}
      {drawn.notes.map((n) => <div className="msg warn" key={n}>{n}</div>)}

      <div className="section">Curves</div>
      <div className="curves nowheel">
        {data.curves.map((c) => {
          const src = byId.get(c.src);
          const axes = src?.dataset?.axes.filter((a) => a.values.length > 1 && a.id !== x) ?? [];
          return (
            <div className={`curve ${c.visible ? '' : 'off'}`} key={c.id}>
              <div className="row">
                <input className="nodrag" type="checkbox" title="visible" checked={c.visible} onChange={(e) => setCurve(c.id, { visible: e.target.checked })} />
                <input className="nodrag color" type="color" value={c.color} onChange={(e) => setCurve(c.id, { color: e.target.value })} />
                <select className="nodrag src" value={c.src} title={src?.name} onChange={(e) => setCurve(c.id, { src: e.target.value })}>
                  {!src && <option value={c.src}>(disconnected)</option>}
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select className="nodrag" value={c.field} onChange={(e) => setCurve(c.id, { field: e.target.value })}>
                  {(src?.dataset?.meta ?? TMM_META).map((f) => (
                    <option key={f.key} value={f.key}>{f.short}</option>
                  ))}
                </select>
                <select className="nodrag" value={c.dash} onChange={(e) => setCurve(c.id, { dash: e.target.value as Dash })}>
                  <option value="solid">—</option>
                  <option value="dash">- -</option>
                  <option value="dot">···</option>
                </select>
                <input className="nodrag label" value={c.label} placeholder="auto label" onChange={(e) => setCurve(c.id, { label: e.target.value })} />
                <button className="nodrag" title="duplicate" onClick={() => set({ curves: [...data.curves, { ...c, id: newId(), color: PALETTE[data.curves.length % PALETTE.length] }] })}>⧉</button>
                <button className="nodrag" title="remove" onClick={() => set({ curves: data.curves.filter((k) => k.id !== c.id) })}>×</button>
              </div>
              {axes.length > 0 && (
                <div className="row wrap slice">
                  {axes.map((a) => {
                    const v = Math.min(a.values.length - 1, c.fixed[a.id] ?? Math.floor((a.values.length - 1) / 2));
                    return (
                      <label key={a.id} className="radio">
                        {a.label}
                        <select className="nodrag" value={v} onChange={(e) => setCurve(c.id, { fixed: { ...c.fixed, [a.id]: Number(e.target.value) } })}>
                          {a.values.map((_, i) => (
                            <option key={i} value={i}>{axisValueText(a, i)}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="row wrap">
        <button
          className="nodrag"
          disabled={!sources.length}
          onClick={() =>
            set({ curves: [...data.curves, { id: newId(), src: sources[0].id, field: 'R', fixed: {}, color: PALETTE[data.curves.length % PALETTE.length], dash: 'solid', label: '', visible: true }] })
          }
        >
          + curve
        </button>
        {familySrc && familyAxes.length > 0 && (
          <>
            <span className="muted">family of</span>
            <select className="nodrag" value={familySrc.id} onChange={(e) => setFamily({ src: e.target.value, axis: '' })}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className="muted">along</span>
            <select
              className="nodrag"
              value={familyAxes.some((a) => a.id === family.axis) ? family.axis : familyAxes[0].id}
              onChange={(e) => setFamily({ src: familySrc.id, axis: e.target.value })}
            >
              {familyAxes.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <button className="nodrag" onClick={() => addFamily(familySrc, familyAxes.some((a) => a.id === family.axis) ? family.axis : familyAxes[0].id)}>
              + add
            </button>
          </>
        )}
      </div>
    </div>
  );
}
