import { useRef } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { ImportInfo, MatchInfo, TargetInfo } from '../engine/evaluate.ts';
import { COMPONENTS, newComponent, type ComponentType } from '../engine/fitmodels.ts';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { Overlay } from '../plot/overlays.ts';
import type { AppNode, ImportData, ImportNode, MatchData, MatchNode, TargetBand, TargetData, TargetNode } from '../types.ts';
import { ComponentsEditor } from './fitui.tsx';
import { ColorField, Messages, NumInput, OutPort, Port, Radios, SliceControls } from './ui.tsx';
import type { SpecKind } from '../engine/spec.ts';
import { CHART_W } from './sizes.ts';

const fmt = (v: number) => (Number.isFinite(v) ? `${+v.toPrecision(5)}` : '—');
const AXIS_LABEL = { lambda: 'λ', theta: 'θ', x: 'x' } as const;
const QUANTITIES: [string, string][] = [
  ['R', 'R'],
  ['T', 'T'],
  ['A', 'A'],
  ['OD', 'OD (−log₁₀ T)'],
];

// Kind of a target: =, ≥, ≤ (value '' = the node's default, for the bands).
function KindSelect({ value, onChange, inherit }: { value?: SpecKind; onChange: (k?: SpecKind) => void; inherit?: boolean }) {
  return (
    <select className="nodrag" value={value ?? ''} title="Equal to the value, or only ≥ / ≤ it (no error when met)" onChange={(e) => onChange((e.target.value || undefined) as SpecKind | undefined)}>
      {inherit && <option value="">·</option>}
      <option value="eq">=</option>
      <option value="ge">≥</option>
      <option value="le">≤</option>
    </select>
  );
}

export function ImportNodeView({ id, data }: NodeProps<ImportNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ImportData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as ImportInfo | undefined;
  const file = useRef<HTMLInputElement>(null);
  const out = result?.outs.out;
  const ds = out?.type === 'data' ? out.dataset : null;
  const series: Series[] = ds ? ds.meta.map((m, i) => ({ key: m.key, label: m.short, color: i ? ['#f28e2b', '#59a14f', '#b07aa1'][(i - 1) % 3] : data.color, y: ds.fields[m.key], dots: ds.size < 60 })) : [];
  return (
    <div className="node node-import">
      <div className="row">
        <button className="nodrag" onClick={() => file.current?.click()}>Load file…</button>
        <span className="muted ellipsis">{data.fileName || 'no file'}</span>
        <input
          ref={file}
          type="file"
          hidden
          accept=".csv,.txt,.dat,.tsv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) set({ text: await f.text(), fileName: f.name, name: data.name || f.name.replace(/\.[^.]+$/, '') });
            e.target.value = '';
          }}
        />
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="measured" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Radios<ImportData['axis']>
        name={`${id}-axis`}
        value={data.axis}
        options={[['lambda', 'Wavelength'], ['theta', 'Angle'], ['x', 'Other']]}
        onChange={(axis) => set({ axis, unit: axis === 'lambda' ? 'nm' : axis === 'theta' ? 'deg' : 'none' })}
      />
      <div className="row wrap">
        {data.axis === 'lambda' && (
          <label className="radio">
            x in
            <select className="nodrag" value={data.unit} onChange={(e) => set({ unit: e.target.value as ImportData['unit'] })}>
              <option value="nm">nm</option>
              <option value="um">µm</option>
              <option value="eV">eV (converted to nm)</option>
            </select>
          </label>
        )}
        <label className="radio" title="Multiplies every value, e.g. 0.01 for data in %">
          scale <NumInput className="tiny" value={data.scale} step={0.01} onChange={(scale) => set({ scale })} />
        </label>
      </div>
      <label title="Comma-separated names of the value columns (R, T, A are recognised). Empty = from the header line.">
        Column names
        <input className="nodrag" value={data.names} placeholder="from the header, e.g. R, T" onChange={(e) => set({ names: e.target.value })} />
      </label>
      <ColorField label="curve colour" value={data.color} onChange={(color) => set({ color })} />
      {ds && (
        <div className="nodrag nowheel chart">
          <LinePlot xAxis={ds.axes[0]} series={series} yLabel={ds.meta.length === 1 ? ds.meta[0].short : 'value'} yUnit="" width={CHART_W} height={180} />
        </div>
      )}
      {info && (
        <div className="stack-rows results">
          <div className="val">
            {info.rows} points · {AXIS_LABEL[data.axis]} {fmt(info.range[0])}–{fmt(info.range[1])} {ds?.axes[0].unit} · {info.columns.join(', ')}
          </div>
        </div>
      )}
      <div className="hint">x in the first column, one or more value columns after it; header and # lines are skipped.</div>
      <Messages result={result} />
      <OutPort label="data" port="data" />
    </div>
  );
}

export function TargetNodeView({ id, data }: NodeProps<TargetNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<TargetData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as TargetInfo | undefined;
  const fromInput = data.mode === 'data' || data.mode === 'fit';
  const xUnit = info?.unit ?? (data.axis === 'lambda' ? 'nm' : '°');
  // a grid in wavenumbers: min / max / step in cm⁻¹, the target itself on λ (nm)
  const perCm = !fromInput && data.axis === 'lambda' && data.gridUnit === 'cm-1';
  const [xLo, xHi] = perCm ? [1e7 / data.max, 1e7 / data.min] : [data.min, data.max];
  const span = Number.isFinite(xHi - xLo) ? xHi - xLo : 100;
  const mid = Number.isFinite(xLo + xHi) ? (xLo + xHi) / 2 : 0;
  const addComponent = (type: ComponentType) => {
    const c = newComponent(type);
    for (const p of COMPONENTS[type].params)
      if (p.kind === 'x') c.params[p.key].value = +mid.toFixed(2);
      else if (p.kind === 'width') c.params[p.key].value = +(span / 10).toFixed(2);
    set({ components: [...data.components, c] });
  };
  const setBand = (i: number, patch: Partial<TargetBand>) => set({ bands: data.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const addBand = () => {
    const last = data.bands.at(-1);
    const lo = last ? Math.min(data.max, last.hi) : data.min + span * 0.3;
    set({ bands: [...data.bands, { lo: +lo.toFixed(2), hi: +Math.min(data.max, lo + span * 0.2).toFixed(2), value: last ? 1 - last.value : 1, weight: 1 }] });
  };
  const xs = info?.xs ?? [];
  const ys = info?.target ?? [];
  const yRange: [number, number] = ys.length ? [Math.min(0, ...ys.filter(Number.isFinite)), Math.max(1, ...ys.filter(Number.isFinite))] : [0, 1];
  const overlays: Overlay[] = data.mode === 'bands' ? data.bands.map((b, i) => ({ kind: 'band', key: `b${i}`, lo: b.lo, hi: b.hi, color: '#4e79a7', label: `${i + 1}` })) : [];
  return (
    <div className="node node-target">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Radios<TargetData['mode']>
        name={`${id}-mode`}
        value={data.mode}
        options={[
          ['bands', 'Bands'],
          ['components', 'Model'],
          ['data', 'From data'],
          ['fit', 'From a fit'],
        ]}
        onChange={(mode) => {
          // Data and fit targets take their x from the input (the window starts open); generated ones need a range.
          if (mode === 'data' || mode === 'fit') set({ mode, ...(fromInput ? {} : { min: NaN, max: NaN }) });
          else if (!(data.min < data.max)) set({ mode, ...(data.axis === 'lambda' ? { min: 400, max: 800, step: 2 } : { min: 40, max: 85, step: 0.1 }) });
          else set({ mode });
        }}
      />
      <div className="row wrap">
        {!fromInput && (
          <Radios<TargetData['axis']> name={`${id}-axis`} value={data.axis} options={[['lambda', 'λ (nm)'], ['theta', 'θ (°)']]} onChange={(axis) => set({ axis })} />
        )}
        <span className="interval">
          {fromInput ? 'window' : perCm ? 'ν̃' : AXIS_LABEL[data.axis]}
          <NumInput className="short" value={data.min} placeholder="min" onChange={(min) => set({ min })} />–
          <NumInput className="short" value={data.max} placeholder="max" onChange={(max) => set({ max })} />
          {!fromInput && (
            <>
              step <NumInput className="tiny" value={data.step} onChange={(step) => set({ step })} />
            </>
          )}
        </span>
        {!fromInput && data.axis === 'lambda' && (
          <select
            className="nodrag"
            value={data.gridUnit ?? 'nm'}
            title="Grid points evenly spaced in λ (nm) or in wavenumber (cm⁻¹, as in infrared spectroscopy); the target is always drawn and matched on λ"
            onChange={(e) => {
              const gridUnit = e.target.value as 'nm' | 'cm-1';
              if (gridUnit === (data.gridUnit ?? 'nm')) return;
              // the same range in the other unit (the step keeps the point count about the same)
              const conv = (v: number) => (v > 0 ? +(1e7 / v).toPrecision(6) : NaN);
              const [min, max] = [conv(data.max), conv(data.min)];
              const n = Math.max(1, Math.round((data.max - data.min) / data.step));
              set({ gridUnit, min, max, step: Number.isFinite(max - min) ? +((max - min) / n).toPrecision(3) : data.step });
            }}
          >
            <option value="nm">nm</option>
            <option value="cm-1">cm⁻¹</option>
          </select>
        )}
      </div>
      <div className="row wrap">
        <span className="muted" title="What the target is: quantity ('matched' = the quantity chosen in Curve match / the Filter designer), polarization, angle, kind and tolerance (the error is divided by it: 0.01 gives MF = 100·RMS). Bands can override each of them.">target is</span>
        <select className="nodrag" value={data.quantity ?? ''} onChange={(e) => set({ quantity: e.target.value })}>
          <option value="">the matched quantity</option>
          {QUANTITIES.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <SliceControls pol={data.pol} angle={data.angle} onChange={set} always compact />
        <KindSelect value={data.kind ?? 'eq'} onChange={(kind) => set({ kind: kind ?? 'eq' })} />
        <label className="radio" title="Tolerance: the error is divided by it">
          ± <NumInput className="tiny" value={data.tol ?? 1} step={0.01} onChange={(tol) => set({ tol })} />
        </label>
      </div>
      {data.mode === 'data' && (
        <label className="radio">
          field
          <select className="nodrag" value={data.field} onChange={(e) => set({ field: e.target.value })}>
            {(info?.fields.length ? info.fields : [{ key: data.field, short: data.field }]).map((f) => (
              <option key={f.key} value={f.key}>{f.short}</option>
            ))}
          </select>
        </label>
      )}
      {data.mode === 'fit' && (
        <label className="radio">
          curve
          <select className="nodrag" value={data.fitId} onChange={(e) => set({ fitId: e.target.value })}>
            <option value="">first fitted curve</option>
            {info?.fits.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
      )}

      <div className="nodrag nowheel chart">
        {xs.length ? (
          <LinePlot
            xAxis={{ id: data.axis, label: fromInput ? 'x' : AXIS_LABEL[data.axis], unit: xUnit, values: xs }}
            series={[{ key: 'target', label: 'target', color: data.color, y: ys, width: 2 }]}
            yLabel="target"
            yUnit=""
            width={CHART_W}
            height={190}
            overlays={overlays}
          />
        ) : (
          <div className="empty small">{fromInput ? 'Connect data (Import, Compute TMM or a Fit node).' : 'Set the range and add bands or components.'}</div>
        )}
      </div>

      {data.mode === 'bands' && (
        <div className="zones">
          {data.bands.map((b, i) => (
            <div className="band-block" key={i}>
              <div className="zone-row">
                <b>{i + 1}</b>
                <NumInput className="short" value={b.lo} onChange={(lo) => setBand(i, { lo })} />–
                <NumInput className="short" value={b.hi} onChange={(hi) => setBand(i, { hi })} />
                <select className="nodrag" value={b.q ?? ''} title="Quantity of this band (· = the node's)" onChange={(e) => setBand(i, { q: e.target.value || undefined })}>
                  <option value="">·</option>
                  {QUANTITIES.map(([k]) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <KindSelect value={b.kind} inherit onChange={(kind) => setBand(i, { kind })} />
                <NumInput className="tiny" value={b.value} step={0.05} onChange={(value) => setBand(i, { value })} />
                <span className="muted">w</span>
                <NumInput className="tiny" value={b.weight} step={0.1} onChange={(weight) => setBand(i, { weight })} />
                <button className="nodrag" title="remove" onClick={() => set({ bands: data.bands.filter((_, j) => j !== i) })}>×</button>
              </div>
              <div className="zone-row sub">
                <select className="nodrag" value={b.pol ?? ''} title="Polarization of this band (· = the node's)" onChange={(e) => setBand(i, { pol: (e.target.value || undefined) as TargetBand['pol'] })}>
                  <option value="">pol. ·</option>
                  <option value="all">each pol.</option>
                  <option value="s">s (TE)</option>
                  <option value="p">p (TM)</option>
                  <option value="avg">mean s,p</option>
                </select>
                <span className="radio" title="Angle of this band (empty = the node's)">
                  θ <NumInput className="tiny" value={b.angle ?? NaN} placeholder="·" onChange={(angle) => setBand(i, { angle: Number.isFinite(angle) ? angle : undefined })} />
                </span>
                <span className="radio" title="Tolerance of this band (empty = the node's)">
                  ± <NumInput className="tiny" value={b.tol ?? NaN} placeholder="·" step={0.01} onChange={(tol) => setBand(i, { tol: Number.isFinite(tol) ? tol : undefined })} />
                </span>
              </div>
            </div>
          ))}
          <button className="nodrag" onClick={addBand}>+ band</button>
          <div className="hint">Outside the bands the curve is free (not matched). “·” = the node's setting above.</div>
        </div>
      )}
      {data.mode === 'components' && (
        <ComponentsEditor
          components={data.components}
          onChange={(components) => set({ components })}
          onAdd={addComponent}
          xRange={[xLo, xHi]}
          yRange={yRange}
          xUnit={xUnit}
          yUnit=""
        />
      )}
      {info?.terms.length ? (
        <div className="stack-rows results">
          {info.terms.map((t, i) => (
            <div key={i} className="val">
              {t.label}: {t.text} · {t.points} points
            </div>
          ))}
        </div>
      ) : null}
      <Messages result={result} />
      <OutPort label="target" port="data" />
    </div>
  );
}

export function MatchNodeView({ id, data }: NodeProps<MatchNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<MatchData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as MatchInfo | undefined;
  const xs = info?.xs ?? [];
  const overlays: Overlay[] = Number.isFinite(data.lo) || Number.isFinite(data.hi) ? [{ kind: 'span', key: 'span', lo: data.lo, hi: data.hi, color: '#8a93a6' }] : [];
  const errorName = { rms: 'RMS error', mae: 'mean |error|', max: 'max |error|', pnorm: `p-norm (p = ${data.p ?? 2})`, msemax: `MSE + ${data.lambdaMax ?? 0.01}·max e²` }[data.metric];
  const TERM_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#b07aa1', '#e15759'];
  const terms = info?.terms ?? [];
  const series: Series[] = terms.flatMap((t, i) => [
    { key: `t${i}`, label: i === 0 ? 'target' : '', color: 'var(--text)', x: t.xs, y: t.target, dash: '5 3', width: 1.6, dots: t.xs.length < 60 },
    { key: `s${i}`, label: `${t.label} (${t.q})`, color: TERM_COLORS[i % TERM_COLORS.length], x: t.xs, y: t.sim, width: 2 },
  ]);
  return (
    <div className="node node-match">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">simulation</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="port-row">
        <Port kind="target" id="target" port="data" />
        <span className="muted">target (Target / Import)</span>
      </div>
      <div className="row wrap">
        <label className="radio">
          simulated
          <select className="nodrag" value={data.field} onChange={(e) => set({ field: e.target.value })}>
            {(info?.fields.length ? info.fields : [{ key: data.field, short: data.field }]).map((f) => (
              <option key={f.key} value={f.key}>{f.short}</option>
            ))}
          </select>
        </label>
        <label className="radio">
          metric
          <select className="nodrag" value={data.metric} onChange={(e) => set({ metric: e.target.value as MatchData['metric'] })}>
            <option value="rms">least squares (RMS)</option>
            <option value="mae">mean |error|</option>
            <option value="max">max |error|</option>
            <option value="pnorm">p-norm</option>
            <option value="msemax">MSE + λ·max error² (He et al.)</option>
          </select>
        </label>
        {data.metric === 'msemax' && (
          <label className="radio" title="Weight of the largest squared error (He et al. 2021: 0.01)">
            λ <NumInput className="tiny" value={data.lambdaMax ?? 0.01} step={0.005} onChange={(lambdaMax) => set({ lambdaMax })} />
          </label>
        )}
        {data.metric === 'pnorm' && (
          <label className="radio" title="MF = [Σ w |e/Δ|^p / Σ w]^(1/p): larger p approaches the worst point">
            p <NumInput className="tiny" value={data.p ?? 2} step={1} onChange={(p) => set({ p })} />
          </label>
        )}
      </div>
      {info?.slice && (info.slice.polAxis || info.slice.angles.length > 1) && (
        <div className="row wrap">
          <span className="muted" title="Curves compared with the target terms that do not set their own polarization / angle">curves</span>
          <SliceControls slice={info.slice} pol={data.pol} angle={data.angle} onChange={set} />
        </div>
      )}
      <div className="row wrap">
        <span className="interval">
          interval
          <NumInput className="short" value={data.lo} placeholder="min" onChange={(lo) => set({ lo })} />–
          <NumInput className="short" value={data.hi} placeholder="max" onChange={(hi) => set({ hi })} />
        </span>
        <label className="radio">weight <NumInput className="tiny" value={data.weight} step={0.1} onChange={(weight) => set({ weight })} /></label>
      </div>
      <div className="row wrap">
        <label className="radio" title="Compare only the target points below (or above) a level, e.g. the resonances of a target with dips on a baseline of 1: target < 0.95">
          <input
            className="nodrag"
            type="checkbox"
            checked={!!data.only && Number.isFinite(data.only.level)}
            onChange={(e) => set({ only: e.target.checked ? { op: 'lt', level: 0.95 } : undefined })}
          />
          only where the target is
        </label>
        {data.only && Number.isFinite(data.only.level) && (
          <>
            <select className="nodrag" value={data.only.op} onChange={(e) => set({ only: { ...data.only!, op: e.target.value as 'lt' | 'gt' } })}>
              <option value="lt">&lt;</option>
              <option value="gt">&gt;</option>
            </select>
            <NumInput className="tiny" value={data.only.level} step={0.01} onChange={(level) => set({ only: { ...data.only!, level } })} />
          </>
        )}
      </div>
      <div className="nodrag nowheel chart">
        {xs.length ? (
          <LinePlot
            xAxis={{ id: 'x', label: 'x', unit: info!.unit, values: xs }}
            series={series}
            yLabel={[...new Set(terms.map((t) => t.q))].join(', ') || data.field}
            yUnit={info!.yUnit}
            width={CHART_W}
            height={200}
            overlays={overlays}
          />
        ) : (
          <div className="empty small">Connect a simulation (Compute TMM) and a target.</div>
        )}
      </div>
      <div className="stack-rows results">
        <div className="val">
          {errorName} = {fmt(info?.rmse ?? NaN)} {info?.goal ? '' : info?.yUnit} · cost = {fmt(info?.cost ?? NaN)}
          {info && info.used ? ` · ${info.used} points` : ''}
          {info && info.count > 1 ? ` · mean of ${info.count} curves` : ''}
        </div>
      </div>
      <div className="hint">
        {info?.goal ? 'The target sets the quantity, polarization, angle, kind (=, ≥, ≤) and tolerance of its terms. ' : ''}Least squares (and p-norms) enable Levenberg-Marquardt in the Optimization Engine.
      </div>
      <Messages result={result} />
      <OutPort label="objective" port="objective" />
      <OutPort id="marked" label="data + target" port="data" title="The simulation with the target curve drawn on it (for a Plot)" />
      <OutPort id="target" label="target (data)" port="data" title="The target curve (as connected)" />
    </div>
  );
}
