import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { forEachLine, metaOf } from '../engine/dataset.ts';
import type { FitInfo } from '../engine/evaluate.ts';
import { COMPONENTS, dispersionParams, guessDispersion, guessSpectrum, newComponent, rangeFor, type ComponentType } from '../engine/fitmodels.ts';
import { runFit, type FitJob } from '../engine/fitRunner.ts';
import type { Axis } from '../engine/types.ts';
import { exportCsv } from '../plot/export.ts';
import { FigureTools } from '../plot/FigureTools.tsx';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { AppNode, FitData, FitNode } from '../types.ts';
import { ComponentsEditor, ParamRow } from './fitui.tsx';
import { ColorField, Messages, NumInput, Port, Radios } from './ui.tsx';
import { CHART_W } from './sizes.ts';

const PART_COLORS = ['#4e79a7', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#9c755f'];
const MAX_BATCH = 2000;

export function FitNodeView({ id, data }: NodeProps<FitNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<FitData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as FitInfo | undefined;
  const out = result?.outs.out;
  const chart = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState('');
  // the fit running in its worker (Stop ends it; closing the node too)
  const job = useRef<FitJob | null>(null);
  useEffect(() => () => job.current?.stop(), []);
  const spectrum = data.mode === 'spectrum';
  const ready = !!info && info.xs.length > 0 && (spectrum ? !!info.ys : !!info.short);

  const win = (a: ArrayLike<number>) => Array.from(a).slice(info!.i0, info!.i1 + 1);
  const mode2 = data.mode2 ?? 'linear';
  const defs = dispersionParams(mode2);
  const ctx = { energy: info?.energy ?? false, xref: info?.xref ?? 0, mode2 };
  const xw = ready ? win(info.xs) : [];
  const yw = ready ? (spectrum ? win(info.ys!) : [...info.short!, ...info.long!]) : [];
  const xRange: [number, number] = xw.length ? [Math.min(...xw), Math.max(...xw)] : [0, 1];
  const yRange: [number, number] = yw.length ? [Math.min(...yw), Math.max(...yw)] : [0, 1];
  const fresh = !!data.stats && data.stats.hash === info?.hash;

  const guess = () => {
    if (!ready) return;
    if (spectrum) set({ components: guessSpectrum(data.components, xw, win(info.ys!)), stats: null, autoGuess: false });
    else {
      const g = guessDispersion(xw, info.short!, info.long!, info.xref, ctx);
      set({
        disp: Object.fromEntries(defs.map((d) => [d.key, data.disp[d.key]?.fixed ? data.disp[d.key] : { value: g[d.key], fixed: false }])),
        stats: null,
        autoGuess: false,
      });
    }
  };
  // Estimate the starting parameters once data are available.
  useEffect(() => {
    if (data.autoGuess && ready) guess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.autoGuess, ready]);

  // Fits run in a worker: the page stays responsive; the result is applied when it arrives.
  const fit = async () => {
    if (!ready || job.current) return;
    const hash = info.hash;
    setBusy('Fitting…');
    job.current = runFit(
      spectrum
        ? { type: 'spectrum', comps: data.components, xs: xw, ys: win(info.ys!), ctx }
        : { type: 'dispersion', params: data.disp, data: { xs: xw, short: info.short!, long: info.long! }, ctx },
    );
    const r = await job.current.promise;
    job.current = null;
    setBusy('');
    if (r.type === 'spectrum') set({ components: r.result.comps, stats: { ...r.result.stats, hash } });
    else if (r.type === 'dispersion') set({ disp: r.result.params, stats: { ...r.result.stats, hash } });
    else if (r.type === 'error' && r.message !== 'stopped') setBusy(`The fit failed: ${r.message}`);
  };

  // Fit every curve of the dataset, each starting from the previous result.
  const fitAll = async () => {
    const ds = out?.type === 'data' ? out.dataset : null;
    const along = ds?.axes.findIndex((a) => a.id === info?.along) ?? -1;
    const field = ds && (metaOf(ds, data.field) ?? ds.meta[0]).key;
    if (!ds || !info || along < 0 || !field || info.curves > MAX_BATCH || job.current) return;
    const hashAll = info.hashAll;
    const lines: number[][] = [];
    forEachLine(ds, field, along, (kk, ys) => (lines[kk] = win(ys)));
    setBusy(`Fitting ${info.curves} curves…`);
    job.current = runFit({ type: 'batch', comps: data.components, xs: xw, lines, ctx }, (done, total) => setBusy(`Fitting ${total} curves… ${done} done`));
    const r = await job.current.promise;
    job.current = null;
    setBusy('');
    if (r.type === 'batch') set({ batch: { hash: hashAll, ...r.result } });
    else if (r.type === 'error' && r.message !== 'stopped') setBusy(`The fit failed: ${r.message}`);
  };

  const addComponent = (type: ComponentType) => {
    const c = newComponent(type);
    const guessed = ready ? guessSpectrum([...data.components, c], xw, win(info.ys!)).at(-1)! : c;
    set({ components: [...data.components, guessed], stats: null });
  };

  // Chart: data, model and components (spectrum) or branches and uncoupled modes (dispersion).
  const axisLabel = info?.axes.find((a) => a.id === info.along)?.label ?? 'x';
  const xAxis: Axis | null = ready ? { id: info.along ?? 'x', label: axisLabel, unit: info.xUnit, values: info.xs } : null;
  const series: Series[] = [];
  if (ready && spectrum) {
    series.push({ key: 'data', label: 'data', color: '#8a93a6', y: info.ys!, width: 1.4 });
    if (data.showParts && data.components.length > 1)
      info.parts!.forEach((p, i) =>
        series.push({ key: `part${i}`, label: COMPONENTS[data.components[i].type].label, color: PART_COLORS[i % PART_COLORS.length], y: p, dash: '4 3', width: 1.2 }),
      );
    series.push({ key: 'model', label: 'fit', color: data.color, y: info.model!, width: 2.2 });
  } else if (ready) {
    series.push(
      { key: 'd1', label: 'data (branch 1)', color: '#8a93a6', x: xw, y: info.short!, dots: true, width: 1 },
      { key: 'd2', label: 'data (branch 2)', color: '#8a93a6', x: xw, y: info.long!, dots: true, width: 1 },
      { key: 'u1', label: 'mode 1 (uncoupled)', color: PART_COLORS[0], x: xw, y: info.mode1!, dash: '4 3', width: 1.2 },
      { key: 'u2', label: 'mode 2 (uncoupled)', color: PART_COLORS[1], x: xw, y: info.mode2!, dash: '4 3', width: 1.2 },
      { key: 'm1', label: 'fit', color: data.color, x: xw, y: info.mShort!, width: 2.2 },
      { key: 'm2', label: 'fit', color: data.color, x: xw, y: info.mLong!, width: 2.2 },
    );
  }
  const csv = () => {
    if (!ready) return;
    if (spectrum) {
      exportCsv(
        [`${axisLabel} [${info.xUnit}]`, 'data', 'fit', 'residual', ...data.components.map((c, i) => `${COMPONENTS[c.type].label} ${i + 1}`)],
        info.xs.map((x, i) => [x, info.ys![i], info.model![i], info.ys![i] - info.model![i], ...info.parts!.map((p) => p[i])]),
        'fit',
      );
    } else {
      exportCsv(
        [`${axisLabel} [${info.xUnit}]`, 'branch 1', 'branch 2', 'fit 1', 'fit 2', 'mode 1', 'mode 2'],
        xw.map((x, i) => [x, info.short![i], info.long![i], info.mShort![i], info.mLong![i], info.mode1![i], info.mode2![i]]),
        'dispersion-fit',
      );
    }
  };

  const sigma = (key: string) => (fresh ? data.stats!.sigma[key] : undefined);
  const fields = info?.fields ?? [];

  return (
    <div className="node node-fit">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
        {ready && <FigureTools target={chart} name="fit" csv={csv} />}
      </div>
      <Radios<FitData['mode']>
        name={`${id}-mode`}
        value={data.mode}
        options={[['spectrum', 'Spectrum (components)'], ['dispersion', 'Coupled-oscillator dispersion']]}
        onChange={(mode) => set({ mode, stats: null, autoGuess: true })}
      />
      <div className="row wrap">
        {spectrum ? (
          <label className="radio">
            fit
            <select className="nodrag" value={data.field} onChange={(e) => set({ field: e.target.value, stats: null })}>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>{f.short}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="radio">
              branches
              <select className="nodrag" value={data.branch1} onChange={(e) => set({ branch1: e.target.value, autoGuess: true })}>
                <option value="">—</option>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>{f.short}</option>
                ))}
              </select>
              <select className="nodrag" value={data.branch2} onChange={(e) => set({ branch2: e.target.value, autoGuess: true })}>
                <option value="">—</option>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>{f.short}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="radio">
          along
          <select className="nodrag" value={data.along || info?.along || ''} onChange={(e) => set({ along: e.target.value, stats: null, autoGuess: true })}>
            {info?.axes.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <span className="interval">
          <NumInput className="short" value={data.lo} placeholder="min" onChange={(lo) => set({ lo })} />–
          <NumInput className="short" value={data.hi} placeholder="max" onChange={(hi) => set({ hi })} />
          <span className="muted">{info?.xUnit}</span>
        </span>
      </div>
      {info?.slices.map((s) => (
        <label key={s.id} className="radio">
          curve at {s.label} =
          <select className="nodrag" value={info.fixedIdx[s.id]} onChange={(e) => set({ fixed: { ...data.fixed, [s.id]: Number(e.target.value) } })}>
            {s.labels.map((l, j) => (
              <option key={j} value={j}>{l}</option>
            ))}
          </select>
        </label>
      ))}
      {!spectrum && (
        <>
          <label className="radio">
            mode 2
            <select className="nodrag" value={mode2} onChange={(e) => set({ mode2: e.target.value as FitData['mode2'], stats: null, autoGuess: true })}>
              <option value="linear">linear in x (e.g. cavity thickness)</option>
              <option value="angle">cavity vs angle: E₀/√(1 − sin²θ/n_eff²)</option>
            </select>
          </label>
          <div className="hint">
            Branch positions vs the tuning axis, e.g. the “metrics” of a FWHM node with two intervals.
            {mode2 === 'angle' ? ' The tuning axis must be θ (the angle in the incident medium).' : ''}
            {info?.energy ? ' Computed in energy, shown in nm.' : ''}
          </div>
        </>
      )}

      <div className="nodrag nowheel chart" ref={chart}>
        {xAxis && series.length ? (
          <LinePlot
            xAxis={xAxis}
            series={series}
            yLabel={spectrum ? (fields.find((f) => f.key === data.field)?.short ?? 'y') : 'position'}
            yUnit={info?.yUnit ?? ''}
            width={CHART_W}
            height={250}
            overlays={
              Number.isFinite(data.lo) || Number.isFinite(data.hi) ? [{ kind: 'span', key: 'win', lo: data.lo, hi: data.hi, color: data.color }] : []
            }
          />
        ) : (
          <div className="empty small">Connect a data output (Compute TMM, Plot, an analysis node’s metrics…).</div>
        )}
      </div>

      <div className="row wrap">
        <button className="nodrag" disabled={!ready} onClick={guess}>Guess</button>
        {job.current ? (
          <button className="nodrag btn-stop" onClick={() => job.current?.stop()} title="Stop the fit (the parameters stay as they were)">■ Stop</button>
        ) : (
          <button className="nodrag primary" disabled={!ready} onClick={fit}>Fit</button>
        )}
        {spectrum && (info?.curves ?? 0) > 1 && (
          <button className="nodrag" disabled={!ready || !!busy || (info?.curves ?? 0) > MAX_BATCH} onClick={fitAll} title="Fit every curve of the dataset; parameters go to the metrics output">
            Fit all {info?.curves} curves
          </button>
        )}
        {data.batch && (
          <button className="nodrag" onClick={() => set({ batch: null })} title="Forget the fit of all curves">
            clear all-curves fit
          </button>
        )}
        {spectrum && (
          <label className="radio">
            <input className="nodrag" type="checkbox" checked={data.showParts} onChange={(e) => set({ showParts: e.target.checked })} />
            components
          </label>
        )}
      </div>
      <div className="stack-rows results">
        <div className="val">
          R² = {info && Number.isFinite(info.live.r2) ? info.live.r2.toFixed(5) : '—'} · RMSE = {info && Number.isFinite(info.live.rmse) ? info.live.rmse.toPrecision(3) : '—'}
          {fresh ? ` · fitted (${data.stats!.iterations} it., ${data.stats!.points} pts)` : data.stats ? ' · the data changed since the fit' : ''}
        </div>
        {!spectrum && info?.crossing !== undefined && Number.isFinite(info.crossing) && (
          <div className="val">
            zero detuning at {axisLabel} = {+info.crossing.toFixed(4)} {info.xUnit}
            {info.minGap !== undefined && Number.isFinite(info.minGap) && ` · smallest branch gap ${+info.minGap.toFixed(3)} ${info.yUnit}`}
            {info.omegaMeV !== undefined && Number.isFinite(info.omegaMeV) && ` · Ω = ${info.omegaMeV.toFixed(1)} meV`}
          </div>
        )}
        {data.batch && info?.batchValid && <div className="val">all {info.curves} curves fitted → metrics output</div>}
        {busy && <div className="val">{busy}</div>}
      </div>

      {spectrum ? (
        <ComponentsEditor
          components={data.components}
          onChange={(components) => set({ components, stats: null })}
          onAdd={addComponent}
          xRange={xRange}
          yRange={yRange}
          xUnit={info?.xUnit ?? ''}
          yUnit={info?.yUnit ?? ''}
          sigma={sigma}
        />
      ) : (
        <div className="fit-comp">
          {defs.map((p) => {
            const param = data.disp[p.key] ?? { value: NaN, fixed: false };
            // Positions and widths are in the units of the branches (y); the slope per unit of x.
            const kind = p.kind === 'x' ? 'offset' : p.kind;
            return (
              <ParamRow
                key={p.key}
                def={p}
                param={param}
                unit={p.kind === 'slope' ? `${info?.yUnit || '1'}/${info?.xUnit || '1'}` : p.kind === 'index' ? '' : (info?.yUnit ?? '')}
                range={
                  p.kind === 'slope' || p.kind === 'index'
                    ? rangeFor(p.kind, param.value, xRange, yRange)
                    : rangeFor(kind === 'width' ? 'positive' : 'offset', param.value, xRange, yRange)
                }
                sigma={sigma(p.key)}
                onChange={(v) => set({ disp: { ...data.disp, [p.key]: v }, stats: null })}
              />
            );
          })}
        </div>
      )}

      <ColorField label="fit colour" title="Colour of the fitted curve on the plots" value={data.color} onChange={(color) => set({ color })} />
      <Messages result={result} />
      <div className="port-row out">
        data + fit curves
        <Port kind="source" id="out" port="data" />
      </div>
      <div className="port-row out">
        parameters (metrics)
        <Port kind="source" id="metrics" port="data" />
      </div>
    </div>
  );
}
