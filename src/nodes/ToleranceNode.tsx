import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { ToleranceInfo } from '../engine/evaluate.ts';
import type { Dataset } from '../engine/types.ts';
import { exportCsv } from '../plot/export.ts';
import { Histogram } from '../plot/Histogram.tsx';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { Overlay } from '../plot/overlays.ts';
import type { AppNode, ToleranceCriterion, ToleranceData, ToleranceNode, ToleranceSpecBand } from '../types.ts';
import { useConnected } from './hooks.ts';
import { Messages, NumInput, Port } from './ui.tsx';
import { CHART_W } from './sizes.ts';

const COLOR = '#b5306a';

// Wide CSV of a dataset: one row per point, a column per axis and per field.
function datasetCsv(ds: Dataset, name: string) {
  const header = [...ds.axes.map((a) => (a.unit ? `${a.label} [${a.unit}]` : a.label)), ...ds.meta.map((m) => m.short)];
  const rows: (string | number)[][] = [];
  const idx = ds.axes.map(() => 0);
  for (let p = 0; p < ds.size; p++) {
    for (let i = ds.axes.length - 1, rem = p; i >= 0; i--) {
      idx[i] = rem % ds.axes[i].values.length;
      rem = Math.floor(rem / ds.axes[i].values.length);
    }
    rows.push([...ds.axes.map((a, i) => a.labels?.[idx[i]] ?? a.values[idx[i]]), ...ds.meta.map((m) => ds.fields[m.key][p])]);
  }
  exportCsv(header, rows, name);
}

export function ToleranceNodeView({ id, data }: NodeProps<ToleranceNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ToleranceData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as ToleranceInfo | undefined;
  const targetConnected = useConnected('target');
  const unitD = data.dMode === 'rel' ? '%' : 'nm';
  const setBand = (i: number, patch: Partial<ToleranceSpecBand>) => set({ specBands: data.specBands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const ds = (h: string) => {
    const o = result?.outs[h];
    return o?.type === 'data' ? o.dataset : null;
  };
  const xs = info?.xs ?? [];
  const series: Series[] = xs.length
    ? [
        { key: 'nom', label: `${data.field} nominal`, color: 'var(--text)', y: info!.nominal, width: 1.8 },
        { key: 'mean', label: `${data.field} mean`, color: COLOR, y: info!.mean, width: 1.6, dash: '5 3' },
      ]
    : [];
  const overlays: Overlay[] = xs.length ? [{ kind: 'area', key: 'range', x: xs, lo: info!.lo, hi: info!.hi, color: COLOR }] : [];
  if (data.spec && !targetConnected)
    data.specBands.forEach((b, i) => {
      if (b.q !== data.field) return;
      if (Number.isFinite(b.min) && b.min > 0) series.push({ key: `min${i}`, label: '', color: '#e15759', x: [b.lo, b.hi], y: [b.min, b.min], dash: '2 2', width: 1.2 });
      if (Number.isFinite(b.max) && b.max < 1) series.push({ key: `max${i}`, label: '', color: '#e15759', x: [b.lo, b.hi], y: [b.max, b.max], dash: '2 2', width: 1.2 });
    });
  const maxShare = Math.max(1e-12, ...(info?.ranking.map((r) => r.share) ?? [0]));
  const criteria = data.criteria ?? [];
  const setCrit = (i: number, patch: Partial<ToleranceCriterion>) => set({ criteria: criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const fmtS = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(4)) : '—');
  // the histogram: the RMS deviation, or a criterion metric (index in data.criteria)
  const [hist, setHist] = useState(-1);
  const critRows = info?.criteria?.flatMap((c) => c.rows.map((r) => ({ ...r, name: c.name }))) ?? [];
  const histRow = critRows.find((r) => r.index === hist);

  return (
    <div className="node node-tolerance">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row wrap">
        <label className="radio">samples <NumInput className="short" value={data.samples} min={2} step={50} onChange={(samples) => set({ samples })} /></label>
        <label className="radio" title="Same seed = same random errors">seed <NumInput className="tiny" value={data.seed} step={1} onChange={(seed) => set({ seed })} /></label>
        <label className="radio" title="σ is the standard deviation (uniform: ±√3 σ)">
          <select className="nodrag" value={data.dist} onChange={(e) => set({ dist: e.target.value as ToleranceData['dist'] })}>
            <option value="normal">normal</option>
            <option value="uniform">uniform</option>
          </select>
        </label>
        <label className="radio" title="Errors limited to ± this many σ (fabrication limits)">limit ± <NumInput className="tiny" value={data.clip} step={0.5} onChange={(clip) => set({ clip })} /> σ</label>
      </div>

      <div className="section">Errors</div>
      <label className="radio">
        <input className="nodrag" type="checkbox" checked={data.thickness} onChange={(e) => set({ thickness: e.target.checked })} />
        thickness
        <select className="nodrag" value={data.dMode} onChange={(e) => set({ dMode: e.target.value as ToleranceData['dMode'] })}>
          <option value="rel">relative (%)</option>
          <option value="abs">absolute (nm)</option>
        </select>
      </label>
      {data.thickness && (
        <div className="row wrap indent">
          <label className="radio" title="Independent for every layer">random σ <NumInput className="tiny" value={data.dSigma} step={0.1} onChange={(dSigma) => set({ dSigma })} /> {unitD}</label>
          <label className="radio" title="The same error for all layers of a material (e.g. calibration of a deposition source)">
            systematic σ <NumInput className="tiny" value={data.dSys} step={0.1} onChange={(dSys) => set({ dSys })} /> {unitD}
          </label>
        </div>
      )}
      {data.thickness && (info?.layers.length ?? 0) > 0 && (
        <details className="nodrag indent">
          <summary>σ per layer ({Object.keys(data.dOverride).length} set)</summary>
          <div className="stack-rows">
            {info!.layers.map((L) => (
              <div className="row" key={L.index}>
                <span className="grow">{L.side === 'back' ? 'back ' : ''}{L.name} · {+L.d.toFixed(1)} nm</span>
                <NumInput
                  className="tiny"
                  value={data.dOverride[String(L.index)] ?? NaN}
                  placeholder={String(data.dSigma)}
                  step={0.1}
                  onChange={(v) => {
                    const o = { ...data.dOverride };
                    if (Number.isFinite(v)) o[String(L.index)] = v;
                    else delete o[String(L.index)];
                    set({ dOverride: o });
                  }}
                />
                <span className="muted">{unitD}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <label className="radio">
        <input className="nodrag" type="checkbox" checked={data.index} onChange={(e) => set({ index: e.target.checked })} />
        refractive index (Δn)
      </label>
      {data.index && (
        <div className="row wrap indent">
          <label className="radio" title="Independent for every layer">random σ <NumInput className="short" value={data.nSigma} step={0.001} onChange={(nSigma) => set({ nSigma })} /></label>
          <label className="radio" title="The same for all layers of a material (Material node)">systematic σ <NumInput className="short" value={data.nSys} step={0.001} onChange={(nSys) => set({ nSys })} /></label>
        </div>
      )}
      {info?.layers.some((L) => L.grating) && (
        <>
          <label className="radio">
            <input className="nodrag" type="checkbox" checked={!!data.grating} onChange={(e) => set({ grating: e.target.checked })} />
            grating geometry (RCWA)
          </label>
          {data.grating && (
            <div className="row wrap indent">
              <label className="radio" title="Absolute error of the fill factor, random for every grating layer">fill σ <NumInput className="tiny" value={data.fillSigma ?? 0.02} step={0.01} onChange={(fillSigma) => set({ fillSigma })} /></label>
              <label className="radio" title="The same for all grating layers of a sample (scale of the lithography)">period σ <NumInput className="tiny" value={data.periodSigma ?? 0} step={1} onChange={(periodSigma) => set({ periodSigma })} /> nm</label>
            </div>
          )}
        </>
      )}
      {info?.layers.some((L) => L.grating) && (
        <label className="radio" title="Error of the azimuth φ of the plane of incidence (the alignment of the grating lines in the holder): each sample is computed at its own φ (conical incidence)">
          <input className="nodrag" type="checkbox" checked={!!data.azimuth} onChange={(e) => set({ azimuth: e.target.checked })} />
          azimuth φ (RCWA)
          {data.azimuth && (
            <>
              σ <NumInput className="tiny" value={data.phiSigma ?? 0.5} step={0.1} onChange={(phiSigma) => set({ phiSigma })} /> °
            </>
          )}
        </label>
      )}
      <label className="radio">
        <input className="nodrag" type="checkbox" checked={data.angle} onChange={(e) => set({ angle: e.target.checked })} />
        angle of incidence
        {data.angle && (
          <>
            σ <NumInput className="tiny" value={data.aSigma} step={0.1} onChange={(aSigma) => set({ aSigma })} /> °
          </>
        )}
      </label>

      <div className="section">Specification (yield)</div>
      <label className="radio">
        <input className="nodrag" type="checkbox" checked={data.spec} onChange={(e) => set({ spec: e.target.checked })} />
        pass / fail limits
      </label>
      <div className="port-row">
        <Port kind="target" id="target" port="data" />
        <span className="muted">target curve (optional): pass if within ±</span>
        <NumInput className="short" value={data.specTol} step={0.01} onChange={(specTol) => set({ specTol })} />
      </div>
      {data.spec && (info?.axes.length ?? 0) > 1 && (
        <label className="radio" title="The axis the limits (or the target curve) and the chart follow; the other axes give more curves, and a sample passes only when all of its curves do. Automatic: the target curve's axis, else λ, else θ.">
          limits along
          <select className="nodrag" value={data.along ?? ''} onChange={(e) => set({ along: e.target.value })}>
            <option value="">auto ({info!.axes.find((a) => a.id === info!.along)?.label ?? '—'})</option>
            {info!.axes.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
      )}
      {data.spec && !targetConnected && (
        <div className="zones">
          {data.specBands.map((b, i) => (
            <div className="zone-row" key={i}>
              <NumInput className="short" value={b.lo} onChange={(lo) => setBand(i, { lo })} />–
              <NumInput className="short" value={b.hi} onChange={(hi) => setBand(i, { hi })} />
              <NumInput className="short" value={b.min} placeholder="min" step={0.01} onChange={(min) => setBand(i, { min })} />
              <span>≤</span>
              <select className="nodrag" value={b.q} onChange={(e) => setBand(i, { q: e.target.value as ToleranceSpecBand['q'] })}>
                <option value="R">R</option>
                <option value="T">T</option>
                <option value="A">A</option>
              </select>
              <span>≤</span>
              <NumInput className="short" value={b.max} placeholder="max" step={0.01} onChange={(max) => setBand(i, { max })} />
              <button className="nodrag" title="remove" onClick={() => set({ specBands: data.specBands.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button
            className="nodrag"
            onClick={() => {
              const [a, b] = xs.length ? [xs[0], xs[xs.length - 1]] : [400, 800];
              set({ specBands: [...data.specBands, { lo: +a.toFixed(1), hi: +b.toFixed(1), q: data.field, min: 0, max: 1 }] });
            }}
          >
            + limit
          </button>
        </div>
      )}

      <div className="section">Criteria from analysis nodes</div>
      <div className="port-row">
        <Port kind="target" id="criteria" port="data" />
        <span className="muted">Min / max, FWHM or Sensitivity (their metrics output): recomputed on every sample</span>
      </div>
      {info?.criteria?.map((c) => (
        <div className="fit-comp" key={c.source}>
          <div className="row">
            <strong>{c.name}</strong>
            {!c.error && (
              <button
                className="nodrag remove"
                title="A condition on one of its metrics (leave min or max empty for one-sided limits; both empty: statistics only)"
                onClick={() => set({ criteria: [...criteria, { source: c.source, field: c.options[0]?.key ?? '', min: NaN, max: NaN }] })}
              >
                + condition
              </button>
            )}
          </div>
          {c.error && <div className="msg warn">{c.error}</div>}
          {c.pending && <div className="hint">Computing n + Δn for the {info.samples} samples…</div>}
          {criteria.map((cond, i) => {
            if (cond.source !== c.source) return null;
            const row = c.rows.find((r) => r.index === i);
            return (
              <div key={i}>
                <div className="zone-row">
                  <NumInput className="short" value={cond.min} placeholder="min" onChange={(min) => setCrit(i, { min })} />
                  <span>≤</span>
                  <select className="nodrag crit-field" value={cond.field} onChange={(e) => setCrit(i, { field: e.target.value })}>
                    {c.options.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}{o.unit ? ` [${o.unit}]` : ''}</option>
                    ))}
                  </select>
                  <span>≤</span>
                  <NumInput className="short" value={cond.max} placeholder="max" onChange={(max) => setCrit(i, { max })} />
                  <button className="nodrag" title="remove" onClick={() => set({ criteria: criteria.filter((_, j) => j !== i) })}>×</button>
                </div>
                {row && (
                  <div className="hint">
                    nominal {row.nominal} · samples: mean {fmtS(row.mean)} · σ {fmtS(row.std)} · p{data.pLo}–p{data.pHi} {fmtS(row.plo)} … {fmtS(row.phi)}
                    {row.unit ? ` ${row.unit}` : ''}
                    {Number.isFinite(cond.min) || Number.isFinite(cond.max) ? ` · pass ${row.passPct.toFixed(1)} %` : ''}
                    {row.perSample > 1 ? ` · ${row.perSample} curves per sample (the condition holds on all; statistics of their mean)` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="section">Results</div>
      {info?.where && <div className="hint">{info.where}</div>}
      <div className="row wrap">
        <label className="radio">
          show
          <select className="nodrag" value={data.field} onChange={(e) => set({ field: e.target.value as ToleranceData['field'] })}>
            <option value="R">R</option>
            <option value="T">T</option>
            <option value="A">A</option>
          </select>
        </label>
        <label className="radio" title="Percentiles of the shaded range (also in the statistics output)">
          range p <NumInput className="tiny" value={data.pLo} step={1} onChange={(pLo) => set({ pLo })} />–<NumInput className="tiny" value={data.pHi} step={1} onChange={(pHi) => set({ pHi })} />
        </label>
      </div>
      {info?.pendingMC && <div className="hint">Computing {info.samples} samples…</div>}
      {xs.length > 0 && (
        <div className="nodrag nowheel chart">
          <LinePlot
            xAxis={{ id: info!.along ?? 'x', label: info!.along === 'theta' ? 'θ' : info!.along === 'lambda' ? 'λ' : 'x', unit: info!.unit ?? '', values: xs }}
            series={series}
            yLabel={data.field}
            yUnit=""
            width={CHART_W}
            height={220}
            overlays={overlays}
          />
        </div>
      )}
      {info && info.stats.length > 0 && (
        <div className="stack-rows results">
          {Number.isFinite(info.yieldPct) && (
            <div className="val yield">
              yield = {info.yieldPct.toFixed(1)} % ({info.pass.reduce((a, b) => a + b, 0)} / {info.samples} samples pass)
            </div>
          )}
          {info.specWhere && <div className="hint">{info.specWhere}</div>}
          <div className="val">{info.stats.map((s) => `${s.label} ${s.value}`).join(' · ')}</div>
        </div>
      )}
      {info && info.dev.length > 0 && (
        <details className="nodrag">
          <summary>Distribution over the samples</summary>
          {critRows.length > 0 && (
            <select className="nodrag" value={histRow ? hist : -1} onChange={(e) => setHist(Number(e.target.value))}>
              <option value={-1}>RMS deviation of {data.field}</option>
              {critRows.map((r) => (
                <option key={r.index} value={r.index}>{r.label} ({r.name})</option>
              ))}
            </select>
          )}
          <div className="nowheel chart">
            {histRow ? (
              <Histogram values={histRow.values} label={histRow.label} unit={histRow.unit} color={COLOR} width={CHART_W} height={190} />
            ) : (
              <Histogram values={info.dev} label={`RMS deviation of ${data.field}`} unit="" color={COLOR} width={CHART_W} height={190} />
            )}
          </div>
        </details>
      )}
      {info && info.ranking.length > 0 && (
        <details className="nodrag" open>
          <summary>Critical errors (share of the spread explained)</summary>
          <div className="ranking">
            {info.ranking.slice(0, 10).map((r) => (
              <div className="rank-row" key={r.label}>
                <span className="rank-label">{r.label}</span>
                <span className="rank-bar">
                  <i style={{ width: `${(100 * r.share) / maxShare}%`, background: COLOR }} />
                </span>
                <span className="val">{(100 * r.share).toFixed(1)} %</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="row wrap">
        <span className="muted">export CSV:</span>
        <button className="nodrag" disabled={!ds('out')} onClick={() => datasetCsv(ds('out')!, 'tolerance_statistics')}>statistics</button>
        <button className="nodrag" disabled={!ds('samples')} onClick={() => datasetCsv(ds('samples')!, 'tolerance_samples')}>all samples</button>
        <button className="nodrag" disabled={!ds('errors')} onClick={() => datasetCsv(ds('errors')!, 'tolerance_errors')}>errors per sample</button>
      </div>
      <Messages result={result} />
      <div className="port-row out">
        statistics (mean, median, σ, min, max, percentiles)
        <Port kind="source" id="out" port="data" />
      </div>
      <div className="port-row out">
        all samples
        <Port kind="source" id="samples" port="data" />
      </div>
      <div className="port-row out">
        errors per sample (+ deviation, pass)
        <Port kind="source" id="errors" port="data" />
      </div>
    </div>
  );
}
