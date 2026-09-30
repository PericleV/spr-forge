import type { ReactNode } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult, useProgress } from '../engine/engine.ts';
import type { AnalysisInfo, SensitivityInfo } from '../engine/evaluate.ts';
import type { LevelMethod } from '../engine/metrics.ts';
import type { AppNode, ExtremumData, ExtremumNode, FwhmData, FwhmNode, Interval, SensitivityData, SensitivityNode } from '../types.ts';
import { ColorField, Messages, NumInput, Port } from './ui.tsx';

type Common = { field: string; along: string; color: string };

// Header, input port, analysed quantity/axis selectors and colour, shared by the analysis nodes.
function Frame<T extends Common>(props: {
  id: string;
  className: string;
  data: T;
  info?: AnalysisInfo;
  set: (patch: Partial<T>) => void;
  children: ReactNode;
}) {
  const { id, className, data, info, set } = props;
  const result = useNodeResult(id);
  return (
    <div className={`node node-analysis ${className}`}>
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
      </div>
      <div className="row wrap">
        <label className="radio">
          of
          <select className="nodrag" value={data.field} onChange={(e) => set({ field: e.target.value } as Partial<T>)}>
            {(info?.fields.length ? info.fields : [{ key: data.field, short: data.field }]).map((f) => (
              <option key={f.key} value={f.key}>{f.short}</option>
            ))}
          </select>
        </label>
        <label className="radio">
          along
          <select className="nodrag" value={data.along || info?.along || ''} onChange={(e) => set({ along: e.target.value } as Partial<T>)}>
            {!info?.axes.length && <option value="">—</option>}
            {info?.axes.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
      </div>
      {props.children}
      <ColorField label="mark colour" title="Colour of the marks this node draws on the plots" value={data.color} onChange={(color) => set({ color } as Partial<T>)} />
      {info?.rows.length ? (
        <div className="stack-rows results">
          {info.rows.map((r) => (
            <div key={r} className="val">{r}</div>
          ))}
        </div>
      ) : null}
      <Messages result={result} />
      <div className="port-row out">
        data + marks
        <Port kind="source" id="out" port="data" />
      </div>
      <div className="port-row out">
        metrics
        <Port kind="source" id="metrics" port="data" />
      </div>
    </div>
  );
}

// Interval inputs in units of the analysed axis; empty = open end. With a zone (the interval follows another axis) the
// fixed bounds give way to the zone's points.
function IntervalInput({ value, unit, onChange }: { value: Interval; unit?: string; onChange: (v: Interval) => void }) {
  if (value.path) return <span className="muted">zone ↓</span>;
  return (
    <span className="interval">
      <NumInput className="short" value={value.lo} placeholder="min" onChange={(lo) => onChange({ ...value, lo })} />
      –
      <NumInput className="short" value={value.hi} placeholder="max" onChange={(hi) => onChange({ ...value, hi })} />
      <span className="muted">{unit}</span>
    </span>
  );
}

// “Follows”: the interval becomes a zone that moves with another swept axis (e.g. θ), through points (y, start, end),
// straight lines between them; the points can also be dragged on a 2D map of the data (Plot).
function ZoneEditor({ value, info, along, onChange }: { value: Interval; info?: AnalysisInfo; along: string; onChange: (v: Interval) => void }) {
  const others = (info?.axes ?? []).filter((a) => a.id !== (along || info?.along));
  const alongAxis = info?.axes.find((a) => a.id === (along || info?.along));
  const p = value.path;
  if (!p) {
    if (!others.length) return null;
    const start = () => {
      const a = others[0];
      const lo = Number.isFinite(value.lo) ? value.lo : (alongAxis?.min ?? 0);
      const hi = Number.isFinite(value.hi) ? value.hi : (alongAxis?.max ?? 1);
      onChange({ ...value, path: { at: a.id, pts: [{ y: a.min, lo, hi }, { y: a.max, lo, hi }] } });
    };
    return (
      <button className="nodrag" title="The interval moves with another swept axis (a zone through points), e.g. to follow a resonance that shifts with θ" onClick={start}>
        follow {others[0].label} (zone)…
      </button>
    );
  }
  const atAxis = others.find((a) => a.id === p.at);
  const setPts = (pts: typeof p.pts) => onChange({ ...value, path: { ...p, pts } });
  const setPt = (i: number, patch: Partial<(typeof p.pts)[number]>) => setPts(p.pts.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const sorted = p.pts.map((q, i) => ({ q, i })).sort((a, b) => a.q.y - b.q.y);
  const add = () => {
    // a new point halfway between the last two (or after the last)
    const [a, b] = [sorted.at(-2)?.q, sorted.at(-1)!.q];
    const q = a ? { y: (a.y + b.y) / 2, lo: (a.lo + b.lo) / 2, hi: (a.hi + b.hi) / 2 } : { ...b, y: b.y + 1 };
    setPts([...p.pts, { y: +q.y.toPrecision(6), lo: +q.lo.toPrecision(6), hi: +q.hi.toPrecision(6) }]);
  };
  return (
    <div className="zone-edit">
      <div className="row wrap">
        <span className="muted">zone follows</span>
        <select className="nodrag" value={p.at} onChange={(e) => {
          const a = others.find((x) => x.id === e.target.value);
          if (a) onChange({ ...value, path: { at: a.id, pts: [{ ...p.pts[0], y: a.min }, { ...p.pts[p.pts.length - 1], y: a.max }] } });
        }}>
          {!atAxis && <option value={p.at}>{p.at} (not in the data)</option>}
          {others.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        <button
          className="nodrag"
          title="Back to a fixed interval (the range of the zone's first point)"
          onClick={() => onChange({ lo: sorted[0].q.lo, hi: sorted[0].q.hi })}
        >
          fixed interval
        </button>
      </div>
      <table className="zone-table">
        <thead>
          <tr>
            <th>{atAxis?.label ?? p.at}{atAxis?.unit ? ` [${atAxis.unit}]` : ''}</th>
            <th>from{alongAxis?.unit ? ` [${alongAxis.unit}]` : ''}</th>
            <th>to</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ q, i }) => (
            <tr key={i}>
              <td><NumInput className="short" value={q.y} onChange={(y) => setPt(i, { y })} /></td>
              <td><NumInput className="short" value={q.lo} onChange={(lo) => setPt(i, { lo })} /></td>
              <td><NumInput className="short" value={q.hi} onChange={(hi) => setPt(i, { hi })} /></td>
              <td>{p.pts.length > 2 && <button className="nodrag" title="remove" onClick={() => setPts(p.pts.filter((_, j) => j !== i))}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="nodrag" onClick={add}>+ point</button>
      <div className="hint">Straight lines between the points. On a 2D map of this data (Plot): drag the points, double-click inside the zone to add one, on a point to remove it.</div>
    </div>
  );
}

export function ExtremumNodeView({ id, data }: NodeProps<ExtremumNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ExtremumData>) => updateNodeData(id, patch);
  const info = useNodeResult(id)?.info as AnalysisInfo | undefined;
  return (
    <Frame id={id} className="node-extremum" data={data} info={info} set={set}>
      <div className="row wrap">
        <select className="nodrag" value={data.mode} onChange={(e) => set({ mode: e.target.value as ExtremumData['mode'] })}>
          <option value="min">Minimum</option>
          <option value="max">Maximum</option>
        </select>
        <span className="muted">in</span>
        <IntervalInput value={data} unit={info?.unit} onChange={({ lo, hi }) => set({ lo, hi })} />
      </div>
      <ZoneEditor value={data} info={info} along={data.along} onChange={({ lo, hi, path }) => set({ lo, hi, path })} />
      <div className="hint">Refined between samples with a parabola. Empty interval = whole range.</div>
    </Frame>
  );
}

const METHODS: [LevelMethod, string][] = [
  ['local', 'half depth (vs. opposite extreme)'],
  ['edges', 'half depth (vs. interval edges)'],
  ['absolute', 'at an absolute level'],
];

export function FwhmNodeView({ id, data }: NodeProps<FwhmNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<FwhmData>) => updateNodeData(id, patch);
  const info = useNodeResult(id)?.info as AnalysisInfo | undefined;
  const intervals = data.intervals.length ? data.intervals : [{ lo: NaN, hi: NaN }];
  const setInterval = (j: number, v: Interval) => set({ intervals: intervals.map((iv, k) => (k === j ? v : iv)) });
  return (
    <Frame id={id} className="node-fwhm" data={data} info={info} set={set}>
      <div className="row wrap">
        <select className="nodrag" value={data.kind} onChange={(e) => set({ kind: e.target.value as FwhmData['kind'] })}>
          <option value="dip">Dip</option>
          <option value="peak">Peak</option>
        </select>
        <select className="nodrag" value={data.method} onChange={(e) => set({ method: e.target.value as LevelMethod })}>
          {METHODS.map(([m, t]) => (
            <option key={m} value={m}>{t}</option>
          ))}
        </select>
        {data.method === 'absolute' && <NumInput className="short" value={data.level} step={0.01} placeholder="level" onChange={(level) => set({ level })} />}
      </div>
      {intervals.map((iv, j) => (
        <div key={j}>
          <div className="row">
            <span className="muted">#{j + 1}</span>
            <IntervalInput value={iv} unit={info?.unit} onChange={(v) => setInterval(j, v)} />
            {intervals.length > 1 && (
              <button className="nodrag" title="remove" onClick={() => set({ intervals: intervals.filter((_, k) => k !== j) })}>×</button>
            )}
          </div>
          <ZoneEditor value={iv} info={info} along={data.along} onChange={(v) => setInterval(j, v)} />
        </div>
      ))}
      <button className="nodrag" onClick={() => set({ intervals: [...intervals, { lo: NaN, hi: NaN }] })}>+ interval (another resonance)</button>
    </Frame>
  );
}

export function SensitivityNodeView({ id, data }: NodeProps<SensitivityNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<SensitivityData>) => updateNodeData(id, patch);
  const info = useNodeResult(id)?.info as SensitivityInfo | undefined;
  const progress = useProgress(`${id}:pert`);
  return (
    <Frame id={id} className="node-sensitivity" data={data} info={info} set={set}>
      <label>
        Perturb
        <select className="nodrag wide" value={info?.target ?? data.target} onChange={(e) => set({ target: e.target.value })}>
          {(info?.targets ?? []).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <div className="row wrap">
        <label className="radio">
          Δn <NumInput className="short" value={data.dn} step={0.001} onChange={(dn) => set({ dn })} />
        </label>
        <select className="nodrag" value={data.kind} onChange={(e) => set({ kind: e.target.value as SensitivityData['kind'] })}>
          <option value="dip">Dip</option>
          <option value="peak">Peak</option>
        </select>
        <span className="muted">in</span>
        <IntervalInput value={data} unit={info?.unit} onChange={({ lo, hi }) => set({ lo, hi })} />
      </div>
      <ZoneEditor value={data} info={info} along={data.along} onChange={({ lo, hi, path }) => set({ lo, hi, path })} />
      <div className="hint">Recomputes with Re(ñ) + Δn; S = Δ(position)/Δn, FOM = |S|/FWHM. The shifted curve is drawn dashed.</div>
      {info?.pendingPert && (
        <div className="msg busy">
          Computing the perturbed structure… {progress !== undefined && `${Math.round(progress * 100)}%`}
          <div className="bar" style={{ width: `${(progress ?? 0) * 100}%` }} />
        </div>
      )}
    </Frame>
  );
}
