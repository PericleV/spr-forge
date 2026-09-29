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

// Interval inputs in units of the analysed axis; empty = open end.
function IntervalInput({ value, unit, onChange }: { value: Interval; unit?: string; onChange: (v: Interval) => void }) {
  return (
    <span className="interval">
      <NumInput className="short" value={value.lo} placeholder="min" onChange={(lo) => onChange({ ...value, lo })} />
      –
      <NumInput className="short" value={value.hi} placeholder="max" onChange={(hi) => onChange({ ...value, hi })} />
      <span className="muted">{unit}</span>
    </span>
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
        <div className="row" key={j}>
          <span className="muted">#{j + 1}</span>
          <IntervalInput value={iv} unit={info?.unit} onChange={(v) => setInterval(j, v)} />
          {intervals.length > 1 && (
            <button className="nodrag" title="remove" onClick={() => set({ intervals: intervals.filter((_, k) => k !== j) })}>×</button>
          )}
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
