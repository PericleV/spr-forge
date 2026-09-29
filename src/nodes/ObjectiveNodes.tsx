import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { ObjectiveInfo, ZonesInfo } from '../engine/evaluate.ts';
import type { MetricGoal, MetricStat, Outside, Zone, ZoneGoal, ZoneReduce } from '../engine/objectives.ts';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { Overlay } from '../plot/overlays.ts';
import type { AppNode, ObjectiveData, ObjectiveNode, VariableData, VariableNode, ZonesData, ZonesNode } from '../types.ts';
import { Messages, NumInput, OutPort, Port, SliceControls } from './ui.tsx';
import { CHART_W } from './sizes.ts';

const fmt = (v: number) => (Number.isFinite(v) ? `${+v.toPrecision(5)}` : '—');

export function VariableNodeView({ id, data }: NodeProps<VariableNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<VariableData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const ok = data.max > data.min;
  // a new interval keeps the value inside it (moved to the nearest end)
  const within = (r: { min: number; max: number }): Partial<VariableData> =>
    r.max > r.min && Number.isFinite(data.value) ? { ...r, value: Math.min(r.max, Math.max(r.min, data.value)) } : r;
  return (
    <div className="node node-variable">
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="e.g. d SiO₂" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row">
        <input
          // a new interval redraws the slider (the browser does not move its thumb when only min / max change)
          key={`${data.min}:${data.max}:${data.integer}`}
          className="nodrag nowheel slider-wide"
          type="range"
          min={data.min}
          max={data.max}
          step={data.integer ? 1 : (data.max - data.min) / 1000 || 0.001}
          value={Number.isFinite(data.value) ? data.value : data.min}
          disabled={!ok}
          onChange={(e) => set({ value: Number(e.target.value) })}
        />
        <NumInput className="short" value={data.value} step={data.integer ? 1 : 0.1} onChange={(value) => set({ value })} />
      </div>
      <div className="row">
        <label className="radio">min <NumInput className="short" value={data.min} onChange={(min) => set(within({ min, max: data.max }))} /></label>
        <label className="radio">max <NumInput className="short" value={data.max} onChange={(max) => set(within({ min: data.min, max }))} /></label>
      </div>
      <label className="radio">
        <input className="nodrag" type="checkbox" checked={data.integer} onChange={(e) => set({ integer: e.target.checked })} />
        integer (e.g. number of periods)
      </label>
      <div className="hint">Connect to any sweep port (thickness, index, pore fraction, DBR λ₀ / periods / cavity). The optimizer varies it in [min, max].</div>
      <Messages result={result} />
      <OutPort label="value" port="sweep-number" />
    </div>
  );
}

const GOALS: [MetricGoal, string][] = [
  ['min', 'minimize'],
  ['max', 'maximize'],
  ['target', 'reach target'],
  ['le', 'keep ≤ (constraint)'],
  ['ge', 'keep ≥ (constraint)'],
];

export function ObjectiveNodeView({ id, data }: NodeProps<ObjectiveNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ObjectiveData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as ObjectiveInfo | undefined;
  return (
    <div className="node node-objective">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row wrap">
        <select className="nodrag" value={data.stat} onChange={(e) => set({ stat: e.target.value as MetricStat })}>
          <option value="mean">mean of</option>
          <option value="min">minimum of</option>
          <option value="max">maximum of</option>
          <option value="rms">RMS of</option>
        </select>
        <select className="nodrag" value={data.field} onChange={(e) => set({ field: e.target.value })}>
          {(info?.fields.length ? info.fields : [{ key: data.field, short: data.field }]).map((f) => (
            <option key={f.key} value={f.key}>{f.short}</option>
          ))}
        </select>
        <SliceControls slice={info?.slice} pol={data.pol} angle={data.angle} onChange={set} />
      </div>
      <div className="row wrap">
        <select className="nodrag" value={data.along} onChange={(e) => set({ along: e.target.value })}>
          <option value="">over all values</option>
          {info?.axes.map((a) => (
            <option key={a.id} value={a.id}>for {a.label} in</option>
          ))}
        </select>
        {data.along && (
          <span className="interval">
            <NumInput className="short" value={data.lo} placeholder="min" onChange={(lo) => set({ lo })} />–
            <NumInput className="short" value={data.hi} placeholder="max" onChange={(hi) => set({ hi })} />
          </span>
        )}
      </div>
      <div className="row wrap">
        <select className="nodrag" value={data.goal} onChange={(e) => set({ goal: e.target.value as MetricGoal })}>
          {GOALS.map(([g, t]) => (
            <option key={g} value={g}>{t}</option>
          ))}
        </select>
        {(data.goal === 'target' || data.goal === 'le' || data.goal === 'ge') && <NumInput className="short" value={data.target} onChange={(target) => set({ target })} />}
      </div>
      <div className="row">
        <label className="radio" title="Typical size of the value; the cost is divided by it">scale <NumInput className="short" value={data.scale} onChange={(scale) => set({ scale })} /></label>
        <label className="radio">weight <NumInput className="short" value={data.weight} step={0.1} onChange={(weight) => set({ weight })} /></label>
      </div>
      <div className="stack-rows results">
        <div className="val">value = {fmt(info?.value ?? NaN)} {info?.unit}</div>
        <div className="val">cost = {fmt(info?.cost ?? NaN)}</div>
      </div>
      <Messages result={result} />
      <OutPort label="objective" port="objective" />
    </div>
  );
}

const ZONE_COLORS: Record<ZoneGoal, string> = { max: '#59a14f', min: '#e15759', target: '#4e79a7', ge: '#59a14f', le: '#e15759' };

export function ZonesNodeView({ id, data }: NodeProps<ZonesNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ZonesData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as ZonesInfo | undefined;
  const xs = info?.xs ?? [];
  const setZone = (i: number, patch: Partial<Zone>) => set({ zones: data.zones.map((z, j) => (j === i ? { ...z, ...patch } : z)) });
  const fields = info?.fields ?? [];
  const addZone = () => {
    const [a, b] = xs.length ? [xs[0], xs[xs.length - 1]] : [0, 1];
    const last = data.zones.at(-1);
    const lo = last ? Math.min(b, last.hi + (b - a) * 0.1) : a + (b - a) * 0.3;
    const hi = Math.min(b, lo + (b - a) * 0.15);
    // the quantity is chosen by the user (nothing is drawn before)
    set({ zones: [...data.zones, { lo: +lo.toFixed(2), hi: +hi.toFixed(2), field: '', goal: 'max', target: 1, weight: 1 }] });
  };

  // Curves of the used fields, the zones as bands and the step target (for quantities in [0, 1]).
  const series: Series[] = Object.entries(info?.curves ?? {}).map(([f, y], i) => ({
    key: f,
    label: f,
    color: ['#8a93a6', '#f28e2b', '#b07aa1'][i % 3],
    y,
    width: 1.8,
  }));
  const unitRange = fields.length > 0 && data.zones.every((z) => (fields.find((f) => f.key === z.field)?.domain ?? [0, 0])[1] === 1);
  const sliceChoice = !!info?.slice && (info.slice.polAxis || info.slice.angles.length > 1);
  if (xs.length && unitRange && data.zones.length) {
    const level = (g: ZoneGoal, t: number) => (g === 'max' ? 1 : g === 'min' ? 0 : t); // target, ≥, ≤: the value
    const out = data.outside === 'min' ? 0 : data.outside === 'max' ? 1 : NaN;
    const sorted = [...data.zones].sort((p, q) => p.lo - q.lo);
    const px: number[] = [xs[0]];
    const py: number[] = [out];
    for (const z of sorted) {
      px.push(z.lo, z.lo, z.hi, z.hi);
      py.push(out, level(z.goal, z.target), level(z.goal, z.target), out);
    }
    px.push(xs[xs.length - 1]);
    py.push(out);
    series.push({ key: 'step', label: 'target', color: 'var(--text)', x: px, y: py, dash: '5 3', width: 1.4 });
  }
  const overlays: Overlay[] = data.zones.map((z, i) => ({ kind: 'band', key: `z${i}`, lo: z.lo, hi: z.hi, color: ZONE_COLORS[z.goal], label: `${i + 1}` }));
  const axisLabel = info?.axes.find((a) => a.id === info.along)?.label ?? 'x';

  return (
    <div className="node node-zones">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row wrap">
        <label className="radio">
          along
          <select className="nodrag" value={data.along || info?.along || ''} onChange={(e) => set({ along: e.target.value })}>
            {info?.axes.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className="radio">
          in each zone
          <select className="nodrag" value={data.reduce} onChange={(e) => set({ reduce: e.target.value as ZoneReduce })}>
            <option value="mean">mean (integral / width)</option>
            <option value="worst">worst point (soft-min)</option>
            <option value="contrast">contrast in / out</option>
          </select>
        </label>
        {data.reduce === 'worst' && (
          <label className="radio" title="Softness of the soft-min (in units of the quantity)">τ <NumInput className="tiny" value={data.tau} step={0.005} onChange={(tau) => set({ tau })} /></label>
        )}
      </div>
      {sliceChoice && (
        <div className="row wrap">
          <span className="muted" title="Default slice of the zones (a zone can set its own) and of the region outside them">curves</span>
          <SliceControls slice={info?.slice} pol={data.pol} angle={data.angle} onChange={set} />
        </div>
      )}

      <div className="nodrag nowheel chart">
        {xs.length ? (
          <LinePlot xAxis={{ id: info!.along ?? 'x', label: axisLabel, unit: info!.unit, values: xs }} series={series} yLabel="value" yUnit="" width={CHART_W} height={220} overlays={overlays} />
        ) : (
          <div className="empty small">{result?.errors.length || result?.warnings.length ? 'No spectrum (see the message below).' : 'Connect a spectrum (Compute TMM or a node after it).'}</div>
        )}
      </div>

      <div className="zones">
        {data.zones.map((z, i) => (
          <div className="zone-row" key={i}>
            <i className="swatch" style={{ background: ZONE_COLORS[z.goal] }} />
            <b>{i + 1}</b>
            <NumInput className="short" value={z.lo} onChange={(lo) => setZone(i, { lo })} />–
            <NumInput className="short" value={z.hi} onChange={(hi) => setZone(i, { hi })} />
            <select className="nodrag" value={z.goal} onChange={(e) => setZone(i, { goal: e.target.value as ZoneGoal })}>
              <option value="max">maximize</option>
              <option value="min">minimize</option>
              <option value="target">target</option>
              <option value="ge">keep ≥</option>
              <option value="le">keep ≤</option>
            </select>
            <select className="nodrag" value={z.field} onChange={(e) => setZone(i, { field: e.target.value })}>
              <option value="">— quantity —</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>{f.short}</option>
              ))}
            </select>
            {sliceChoice && <SliceControls slice={info?.slice} pol={z.pol} angle={z.angle} onChange={(patch) => setZone(i, patch)} compact />}
            {(z.goal === 'target' || z.goal === 'ge' || z.goal === 'le') && <NumInput className="tiny" value={z.target} step={0.05} onChange={(target) => setZone(i, { target })} />}
            <span className="muted">w</span>
            <NumInput className="tiny" value={z.weight} step={0.1} onChange={(weight) => setZone(i, { weight })} />
            <span className="val">{fmt(info?.zoneValues[i] ?? NaN)}</span>
            <button className="nodrag" title="remove" onClick={() => set({ zones: data.zones.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button className="nodrag" onClick={addZone}>+ zone</button>
      </div>
      <div className="row wrap">
        <label className="radio">
          outside the zones
          <select className="nodrag" value={data.outside} onChange={(e) => set({ outside: e.target.value as Outside })}>
            <option value="ignore">ignore</option>
            <option value="min">minimize</option>
            <option value="max">maximize</option>
          </select>
        </label>
        {(data.outside !== 'ignore' || data.reduce === 'contrast') && (
          <>
            <select className="nodrag" value={data.outsideField} onChange={(e) => set({ outsideField: e.target.value })}>
              <option value="">— quantity —</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>{f.short}</option>
              ))}
            </select>
            <span className="muted">w</span>
            <NumInput className="tiny" value={data.outsideWeight} step={0.1} onChange={(outsideWeight) => set({ outsideWeight })} />
          </>
        )}
        <label className="radio">weight <NumInput className="tiny" value={data.weight} step={0.1} onChange={(weight) => set({ weight })} /></label>
      </div>
      <div className="stack-rows results">
        <div className="val">
          cost = {fmt(info?.cost ?? NaN)}
          {info && Number.isFinite(info.outsideValue) ? ` · mean outside = ${fmt(info.outsideValue)}` : ''}
          {info && info.count > 1 ? ` · averaged over ${info.count} curves` : ''}
        </div>
      </div>
      <Messages result={result} />
      <OutPort label="objective" port="objective" />
      <OutPort id="marked" label="data + target" port="data" title="The input spectrum with the zones and the step target drawn on it (for a Plot)" />
      <OutPort id="target" label="target (data)" port="data" title="The step target alone (Compare plot, CSV)" />
    </div>
  );
}
