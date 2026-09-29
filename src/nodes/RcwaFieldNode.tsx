import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { FIELD_COMPONENTS, type RcwaFieldInfo } from '../engine/evaluate.ts';
import { runFieldMap, stopFieldMap, useFieldRun } from '../engine/rcwaFieldRun.ts';
import { exportCsv } from '../plot/export.ts';
import { MapPlot } from '../plot/MapPlot.tsx';
import type { Trace } from '../plot/overlays.ts';
import type { AppNode, RcwaFieldData, RcwaFieldNode } from '../types.ts';
import { MapViewControls, Messages, NumInput, OutPort, Port } from './ui.tsx';
import { CHART_W } from './sizes.ts';

const fmt = (v: number, digits = 4) => (Number.isFinite(v) ? `${+v.toFixed(digits)}` : '—');

const RES_TITLES = { R: 'the minimum of R', T: 'the maximum of T', A: 'the maximum of A' } as const;
// Which resonance λ / θ start at (and go back to with “res”): the minimum of R, or the maximum of T or A.
function ResChoice({ value, onChange }: { value: 'R' | 'T' | 'A'; onChange: (v: 'R' | 'T' | 'A') => void }) {
  return (
    <label className="radio" title="The point where λ / θ start, and where “res” takes them back">
      resonance at
      <select className="nodrag" value={value} onChange={(e) => onChange(e.target.value as 'R' | 'T' | 'A')}>
        <option value="R">minimum of R</option>
        <option value="T">maximum of T</option>
        <option value="A">maximum of A</option>
      </select>
    </label>
  );
}

// A slider plus number box over λ or θ; “res” takes it back to the resonance.
function ValueSlider(props: { label: string; unit: string; v: RcwaFieldInfo['lambda']; res: 'R' | 'T' | 'A'; onChange: (v: number) => void; onReset: () => void }) {
  const { label, unit, v, res, onChange, onReset } = props;
  if (!v.free) return <div className="hint">{label} = {fmt(v.value)} {unit} (fixed by the computation)</div>;
  const step = (v.max - v.min) / 1000;
  return (
    <label className="slider">
      <span>{label} [{unit}]</span>
      <input className="nodrag nowheel" type="range" min={v.min} max={v.max} step={step} value={v.value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="row">
        <NumInput className="short" value={+v.value.toFixed(4)} step={step} onChange={onChange} />
        {v.auto ? (
          <span className="muted" title={`At the resonance: ${RES_TITLES[res]}`}>res</span>
        ) : (
          <button className="nodrag" title={`Back to the resonance (${RES_TITLES[res]})`} onClick={onReset}>res</button>
        )}
      </span>
    </label>
  );
}

export function RcwaFieldNodeView({ id, data }: NodeProps<RcwaFieldNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<RcwaFieldData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as RcwaFieldInfo | undefined;
  const run = useFieldRun(id);
  const running = run?.status === 'running';
  const setAt = (k: string, v: number) => set({ at: { ...data.at, [k]: v } });
  const resetAt = (k: string) => set({ at: Object.fromEntries(Object.entries(data.at).filter(([x]) => x !== k)) });
  const comps = FIELD_COMPONENTS(info?.pol ?? 'p', !!info?.conical);
  const map = info?.map;

  const start = () => {
    if (!info?.job) return;
    const key = info.key;
    // a new value on every run: the graph re-reads the stored map even when the inputs did not change
    runFieldMap(id, key, info.job, () => updateNodeData(id, { runKey: `${key}:${Date.now()}` }));
  };

  // outlines: interfaces (horizontal) and the material walls of the grating slices (vertical), in height = −z
  const traces: Trace[] = [];
  if (map && data.outlines && info?.period) {
    const x1 = map.xs[map.xs.length - 1];
    map.boundaries.forEach((z, i) => traces.push({ key: `b${i}`, x: [0, x1], y: [-z, -z], color: '#ffffff' }));
    map.outlines.forEach((o, i) => {
      for (let p = 0; p < data.periods; p++)
        o.xs.forEach((x, j) => traces.push({ key: `w${i}-${p}-${j}`, x: [x + p * info.period!, x + p * info.period!], y: [-o.z0, -o.z1], color: '#ffffff' }));
    });
  }
  const csv = () => {
    if (!map) return;
    const rows: number[][] = [];
    map.zs.forEach((z, r) => map.xs.forEach((x, c) => rows.push([x, z, map.values[r * map.xs.length + c]])));
    exportCsv(['x [nm]', 'z [nm]', info?.quantity.label ?? 'value'], rows, 'rcwa-field-map');
  };

  return (
    <div className="node node-rcwafield">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
        {map && <button className="nodrag" onClick={csv} title="Export the map as CSV">CSV</button>}
      </div>
      <div className="row wrap">
        <select className="nodrag" value={data.quantity} onChange={(e) => set({ quantity: e.target.value as RcwaFieldData['quantity'] })}>
          <option value="E2">|E|² / |E₀|²</option>
          <option value="H2">|H|² / |H₀|²</option>
          <option value="comp">Field component</option>
        </select>
        {data.quantity === 'comp' && (
          <>
            <select className="nodrag" value={comps.includes(data.component) ? data.component : comps[0]} onChange={(e) => set({ component: e.target.value as RcwaFieldData['component'] })}>
              {comps.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className="nodrag" value={data.part} onChange={(e) => set({ part: e.target.value as RcwaFieldData['part'] })}>
              <option value="abs">|·|</option>
              <option value="re">Re</option>
              <option value="im">Im</option>
              <option value="phase">phase</option>
            </select>
          </>
        )}
      </div>
      {info && (
        <>
          <ResChoice value={data.res ?? 'R'} onChange={(res) => set({ res })} />
          <ValueSlider label="λ" unit="nm" v={info.lambda} res={data.res ?? 'R'} onChange={(v) => setAt('lambda', v)} onReset={() => resetAt('lambda')} />
          <ValueSlider label="θ" unit="°" v={info.theta} res={data.res ?? 'R'} onChange={(v) => setAt('theta', v)} onReset={() => resetAt('theta')} />
          {info.sweeps.map((s) => (
            <label key={s.id} className="radio">
              {s.label} =
              <select className="nodrag" value={s.index} onChange={(e) => setAt(s.id, Number(e.target.value))}>
                {s.labels.map((l, j) => (
                  <option key={j} value={j}>{l}</option>
                ))}
              </select>
            </label>
          ))}
        </>
      )}
      <div className="row wrap">
        <label className="radio">periods <NumInput className="tiny" value={data.periods} min={1} step={1} onChange={(periods) => set({ periods })} /></label>
        <label className="radio" title="Points across (x)">Nx <NumInput className="tiny" value={data.nx} min={8} step={20} onChange={(nx) => set({ nx })} /></label>
        <label className="radio" title="Points through the depth (z)">Nz <NumInput className="tiny" value={data.nz} min={8} step={20} onChange={(nz) => set({ nz })} /></label>
      </div>
      <div className="row wrap">
        <label className="radio">show <NumInput className="tiny" value={data.zIn} min={0} step={50} onChange={(zIn) => set({ zIn })} /> nm above</label>
        <label className="radio"><NumInput className="tiny" value={data.zOut} min={0} step={50} onChange={(zOut) => set({ zOut })} /> nm below</label>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.outlines} onChange={(e) => set({ outlines: e.target.checked })} />
          outlines
        </label>
      </div>
      <div className="row wrap">
        {!running ? (
          <button className="nodrag btn-run" disabled={!info?.job || !!result?.errors.length} onClick={start} title="Compute the map (it is not recomputed automatically)">
            ▶ Run
          </button>
        ) : (
          <button className="nodrag btn-stop" onClick={() => stopFieldMap(id)}>■ Stop</button>
        )}
        {info && <span className="val muted">{info.point}</span>}
      </div>
      {running && (
        <div className="msg busy">
          Computing the field map… {Math.round((run!.progress ?? 0) * 100)}% · {run!.seconds.toFixed(1)} s
          <div className="bar" style={{ width: `${(run!.progress ?? 0) * 100}%` }} />
        </div>
      )}
      {run?.status === 'error' && <div className="msg err">{run.message}</div>}
      {map && <MapViewControls view={data.mapView} onChange={(mapView) => set({ mapView })} />}
      <div className="nodrag nowheel chart">
        {map ? (
          <MapPlot
            xAxis={{ id: 'x', label: 'x', unit: 'nm', values: map.xs }}
            yAxis={{ id: 'h', label: '−z (height)', unit: 'nm', values: map.zs.map((z) => -z).reverse() }}
            values={(() => {
              const nx = map.xs.length;
              const rows = map.zs.length;
              const v = new Float64Array(nx * rows);
              for (let r = 0; r < rows; r++) v.set(map.values.subarray((rows - 1 - r) * nx, (rows - r) * nx), r * nx);
              return v;
            })()}
            zLabel={info!.quantity.label}
            zUnit={info!.quantity.unit}
            width={CHART_W}
            height={360}
            traces={traces}
            view={data.mapView}
          />
        ) : (
          <div className="empty small">{info?.stale ? 'Out of date — press Run.' : 'Press Run to compute the field map.'}</div>
        )}
      </div>
      {map && run?.status === 'done' && <div className="hint">computed in {run.seconds.toFixed(1)} s · incident medium at the top</div>}
      <Messages result={result} />
      <OutPort label="map (data)" port="data" />
    </div>
  );
}
