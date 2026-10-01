import { NODE_COLORS } from '../nodeColors.ts';
import { useRef } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { FieldInfo } from '../engine/evaluate.ts';
import { exportCsv } from '../plot/export.ts';
import { FigureTools } from '../plot/FigureTools.tsx';
import { LinePlot } from '../plot/LinePlot.tsx';
import { MapPlot } from '../plot/MapPlot.tsx';
import type { Overlay, Trace } from '../plot/overlays.ts';
import { COMPONENTS, type Component } from '../physics/field.ts';
import type { AppNode, FieldData, FieldNode, FieldQuantity } from '../types.ts';
import { MapViewControls, Messages, NumInput, Port } from './ui.tsx';
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

// A slider plus number box over a continuous range (λ or θ).
// Starts at the resonance (ResChoice); after a manual change, “res” puts it back there.
function ValueSlider(props: { label: string; unit: string; v: FieldInfo['lambda']; res: 'R' | 'T' | 'A'; onChange: (v: number) => void; onReset: () => void }) {
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

export function FieldNodeView({ id, data }: NodeProps<FieldNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<FieldData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as FieldInfo | undefined;
  const chart = useRef<HTMLDivElement>(null);
  const setAt = (key: string, v: number) => set({ at: { ...data.at, [key]: v } });
  const resetAt = (key: string) => set({ at: Object.fromEntries(Object.entries(data.at).filter(([k]) => k !== key)) });
  const q = info?.quantity ?? { label: '', unit: '' };

  const bandOverlays: Overlay[] = [];
  if (info && data.layers)
    info.bands.forEach((b, i) => bandOverlays.push({ kind: 'band', key: `b${i}`, lo: b.lo, hi: b.hi, color: b.color, label: data.labels ? b.label : undefined }));
  if (info) info.boundaries.forEach((z, i) => bandOverlays.push({ kind: 'vline', key: `v${i}`, x: z, color: 'var(--axis)' }));
  const traces: Trace[] =
    info?.mapY && data.layers
      ? info.boundaries.map((z, i) => ({ key: `t${i}`, x: [z, z], y: [info.mapY!.values[0], info.mapY!.values.at(-1)!], color: '#ffffff' }))
      : [];
  // penetration depth: the band from the edge to where |E| is 1/e of its edge value (profile), its line across the map
  const dp = data.depth;
  const dep = dp?.on ? info?.depth : undefined;
  const DEPTH_COLOR = '#d6336c';
  if (dp?.on && dp.overlay && dep && Number.isFinite(dep.delta)) {
    const zEnd = dep.edge + dep.dir * dep.delta;
    bandOverlays.push({ kind: 'band', key: 'depth', lo: Math.min(dep.edge, zEnd), hi: Math.max(dep.edge, zEnd), color: DEPTH_COLOR, label: `δ = ${fmt(dep.delta, 1)} nm` });
    bandOverlays.push({ kind: 'vline', key: 'depth-end', x: zEnd, color: DEPTH_COLOR });
  }
  if (dp?.on && dp.overlay && info?.depthMap) {
    const m = info.depthMap;
    const k = m.ys.map((_, j) => j).filter((j) => Number.isFinite(m.at[j]));
    if (k.length) traces.push({ key: 'depth', x: k.map((j) => m.at[j]), y: k.map((j) => m.ys[j]), color: DEPTH_COLOR });
  }
  const setDepth = (patch: Partial<NonNullable<FieldData['depth']>>) => set({ depth: { on: false, region: 'exit', edge: 'auto', overlay: true, ...dp, ...patch } });
  const dRegion = dp?.region ?? 'exit';
  const finiteRegion = dRegion.startsWith('layer:');

  const cut = info?.rcwa; // a profile cut from an RCWA field map
  const csv = () => {
    const out = result?.outs.out;
    if (out?.type !== 'data' || !out.dataset) return;
    const f = out.dataset.fields;
    const z = out.dataset.axes[0].values;
    if (cut) exportCsv([`${cut.along} [nm]`, q.label], z.map((v, i) => [v, f.f[i]]), cut.along === 'x' ? `field-profile_z${+cut.zAt.toFixed(1)}nm` : `field-profile_x${+cut.x.toFixed(1)}nm`);
    else exportCsv(['z [nm]', '|E|²/|E0|²', '|H|²/|H0|²', 'absorption [1/nm]'], z.map((v, i) => [v, f.E2[i], f.H2[i], f.abs[i]]), 'field-profile');
  };

  const comps = COMPONENTS.filter((c) => (info?.pol === 's' ? ['Ey', 'Hx', 'Hz'] : ['Ex', 'Ez', 'Hy']).includes(c));

  return (
    <div className="node node-field">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
        {info && <FigureTools target={chart} name="field-profile" csv={data.view === 'profile' || cut ? csv : undefined} />}
      </div>

      {cut && (
        <>
          <div className="row wrap">
            <label className="radio" title="A cross-section of the RCWA field map (the quantity is chosen there): through the depth at one x, or across the periods at one depth z">
              cut
              <select className="nodrag" value={cut.along} onChange={(e) => set({ cut: e.target.value as 'z' | 'x' })}>
                <option value="z">along z (at x)</option>
                <option value="x">along x (at z)</option>
              </select>
            </label>
          </div>
          {cut.along === 'z' ? (
            <label className="slider">
              <span>x [nm]</span>
              <input className="nodrag nowheel" type="range" min={0} max={cut.xs.length - 1} step={1} value={cut.index} onChange={(e) => setAt('x', Number(e.target.value))} />
              <span className="val">
                {cut.x.toFixed(1)} ({((cut.x / cut.period) % 1).toFixed(3)} Λ)
              </span>
            </label>
          ) : (
            <label className="slider">
              <span>z [nm]</span>
              <input className="nodrag nowheel" type="range" min={0} max={cut.zs.length - 1} step={1} value={cut.zIndex} onChange={(e) => setAt('z', Number(e.target.value))} />
              <span className="val" title={cut.where}>
                {cut.zAt.toFixed(1)} · {cut.where}
              </span>
            </label>
          )}
        </>
      )}

      {!cut && <div className="row wrap">
        <select className="nodrag" value={data.quantity} onChange={(e) => set({ quantity: e.target.value as FieldQuantity })}>
          <option value="E2">|E|² / |E₀|² (enhancement)</option>
          <option value="H2">|H|² / |H₀|²</option>
          <option value="abs">Absorption density</option>
          <option value="comp">Field component…</option>
        </select>
        {data.quantity === 'comp' && (
          <>
            <select className="nodrag" value={data.component} onChange={(e) => set({ component: e.target.value as Component })}>
              {comps.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className="nodrag" value={data.part} onChange={(e) => set({ part: e.target.value as FieldData['part'] })}>
              <option value="abs">|·|</option>
              <option value="re">Re</option>
              <option value="im">Im</option>
              <option value="phase">phase</option>
            </select>
          </>
        )}
        <select className="nodrag" value={data.view} onChange={(e) => set({ view: e.target.value as FieldData['view'] })}>
          <option value="profile">Profile at a point</option>
          <option value="map">Map vs z and …</option>
        </select>
        {data.view === 'map' && (
          <select className="nodrag" value={data.mapAxis} onChange={(e) => set({ mapAxis: e.target.value as FieldData['mapAxis'] })}>
            <option value="lambda">λ</option>
            <option value="theta">θ</option>
          </select>
        )}
      </div>}

      {info && !cut && (
        <>
          <ResChoice value={data.res ?? 'R'} onChange={(res) => set({ res })} />
          {!(data.view === 'map' && data.mapAxis === 'lambda') && (
            <ValueSlider label="λ" unit="nm" v={info.lambda} res={data.res ?? 'R'} onChange={(v) => setAt('lambda', v)} onReset={() => resetAt('lambda')} />
          )}
          {!(data.view === 'map' && data.mapAxis === 'theta') && (
            <ValueSlider label="θ" unit="°" v={info.theta} res={data.res ?? 'R'} onChange={(v) => setAt('theta', v)} onReset={() => resetAt('theta')} />
          )}
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
        {!cut && <span className="interval">
          show <NumInput className="short" value={data.zIn} min={0} step={10} onChange={(zIn) => set({ zIn })} /> nm before and
          <NumInput className="short" value={data.zOut} min={0} step={10} onChange={(zOut) => set({ zOut })} /> nm after the structure
        </span>}
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.layers} onChange={(e) => set({ layers: e.target.checked })} />
          layers
        </label>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.labels} onChange={(e) => set({ labels: e.target.checked })} />
          labels
        </label>
      </div>

      {!cut && info && (
        <div className="row wrap">
          <label className="radio" title="Where |E| has fallen to 1/e of its value at the edge of a region (as for surface plasmons: 1/Im k_z for an evanescent wave), measured on the profile">
            <input className="nodrag" type="checkbox" checked={!!dp?.on} onChange={(e) => setDepth({ on: e.target.checked })} />
            penetration depth
          </label>
          {dp?.on && (
            <>
              <label className="radio">
                in
                <select className="nodrag" value={dRegion} onChange={(e) => setDepth({ region: e.target.value })}>
                  {info.depthRegions.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </label>
              {finiteRegion && (
                <label className="radio" title="The edge of the layer it is measured from (auto: where |E| is larger)">
                  from
                  <select className="nodrag" value={dp.edge} onChange={(e) => setDepth({ edge: e.target.value as NonNullable<FieldData['depth']>['edge'] })}>
                    <option value="auto">auto</option>
                    <option value="top">its top</option>
                    <option value="bottom">its bottom</option>
                  </select>
                </label>
              )}
              <label className="radio">
                <input className="nodrag" type="checkbox" checked={dp.overlay} onChange={(e) => setDepth({ overlay: e.target.checked })} />
                on the plot
              </label>
            </>
          )}
        </div>
      )}

      <div className="nodrag nowheel chart" ref={chart}>
        {info?.z && info.y && (data.view === 'profile' || cut) ? (
          <LinePlot
            xAxis={{ id: cut?.along ?? 'z', label: cut?.along ?? 'z', unit: 'nm', values: Array.from(info.z) }}
            series={[{ key: 'f', label: q.label, color: NODE_COLORS.field, y: info.y, width: 2 }]}
            yLabel={q.label}
            yUnit={q.unit}
            width={CHART_W}
            height={280}
            overlays={bandOverlays}
          />
        ) : info?.map && info.mapX && info.mapY && data.view === 'map' ? (
          <>
            <MapViewControls view={data.mapView} onChange={(mapView) => set({ mapView })} />
            <MapPlot xAxis={info.mapX} yAxis={info.mapY} values={info.map} zLabel={q.label} zUnit={q.unit} width={CHART_W} height={280} traces={traces} view={data.mapView} />
          </>
        ) : (
          <div className="empty small">Connect the data output of a Compute TMM node (or of a node after it).</div>
        )}
      </div>

      {cut && <div className="stack-rows results"><div className="val">{info!.point}</div></div>}
      {dp?.on && dep && (
        <div className="stack-rows results">
          <div className="val">
            {Number.isFinite(dep.delta)
              ? `δ = ${fmt(dep.delta, 2)} nm in ${dep.label}, from z = ${fmt(dep.edge, 2)} nm (|E| from ${fmt(dep.e0, 3)} to ${fmt(dep.e0 / Math.E, 3)} of the incident field)`
              : `No penetration depth in ${dep.label}`}
            {dep.analytic !== undefined && Number.isFinite(dep.delta) ? ` · 1/Im k_z = ${fmt(dep.analytic, 2)} nm` : ''}
          </div>
          {dep.note && <div className="hint">{dep.note}</div>}
        </div>
      )}
      {dp?.on && info?.depthMap && (
        <div className="stack-rows results">
          <div className="val">
            δ in {info.depthRegions.find((r) => r.id === dRegion)?.label}: {fmt(Math.min(...Array.from(info.depthMap.delta).filter(Number.isFinite)), 1)} … {fmt(Math.max(...Array.from(info.depthMap.delta).filter(Number.isFinite)), 1)} nm over the map (output: δ vs {data.mapAxis === 'theta' ? 'θ' : 'λ'})
          </div>
        </div>
      )}
      {info && Number.isFinite(info.R) && (
        <div className="stack-rows results">
          <div className="val">{info.point}</div>
          <div className="val">
            R = {fmt(info.R)} · T = {fmt(info.T)} · A = {fmt(1 - info.R - info.T)}
            {Number.isFinite(info.decay) ? ` · 1/e depth of |E|² in the exit medium = ${fmt(info.decay, 1)} nm` : ' · the exit wave propagates'}
          </div>
          <div className="field-table">
            {info.rows.map((r, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <i className="swatch" style={{ background: r.color }} />
                <span>{r.name}</span>
                <span className="val">A = {fmt(r.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <Messages result={result} />
      <div className="port-row out">
        profile
        <Port kind="source" id="out" port="data" />
      </div>
      {/* a cut of an RCWA map has no layer absorptions */}
      {!cut && (
        <div className="port-row out">
          absorption per layer
          <Port kind="source" id="metrics" port="data" />
        </div>
      )}
      {dp?.on && (
        <div className="port-row out">
          penetration depth
          <Port kind="source" id="depth" port="data" />
        </div>
      )}
    </div>
  );
}
