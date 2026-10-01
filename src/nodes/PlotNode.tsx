import { useMemo, useRef } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { axisTitle, axisValueText, grid, line, metaOf, strides } from '../engine/dataset.ts';
import type { Annotation, Dataset } from '../engine/types.ts';
import { seriesColor } from '../plot/colors.ts';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import { MapPlot } from '../plot/MapPlot.tsx';
import { markKey, overlaysFor, tracesFor, visibleMarks, zonesFor, type MapZone } from '../plot/overlays.ts';
import { FigureTools } from '../plot/FigureTools.tsx';
import { exportCsv } from '../plot/export.ts';
import type { AppNode, PlotData, PlotMode, PlotNode } from '../types.ts';
import { MapViewControls, NumInput, OutPort, Port } from './ui.tsx';
import { Histogram } from '../plot/Histogram.tsx';
import { binsOf } from '../plot/histStats.ts';
import { gridFromPoints } from '../plot/mapGrid.ts';

const MAX_CURVES = 60;
const NO_ANNOTATIONS: Annotation[] = [];

type View = {
  mode: 'curves' | 'map' | 'point' | 'histogram';
  x: number; // axis indices into ds.axes
  y: number;
  series: number; // -1 = none
  fixed: number[]; // index per axis (used for the axes not shown)
  sliders: number[]; // axes controlled by a slider
  free: number[]; // non-singleton axes
};

// Resolve the stored (possibly stale) choices against the axes of the current dataset.
function resolveView(ds: Dataset, d: PlotData): View {
  const ids = ds.axes.map((a) => a.id);
  const free = ds.axes.flatMap((a, i) => (a.values.length > 1 ? [i] : []));
  const has = (id: string) => free.includes(ids.indexOf(id));
  const pick = (id: string) => ids.indexOf(id);
  const fixed = ds.axes.map((a) => Math.min(a.values.length - 1, Math.max(0, d.fixed[a.id] ?? Math.floor((a.values.length - 1) / 2))));
  if (!free.length) return { mode: 'point', x: -1, y: -1, series: -1, fixed, sliders: [], free };

  const x = has(d.x) ? pick(d.x) : has('theta') ? pick('theta') : has('lambda') ? pick('lambda') : has('x') ? pick('x') : has('point') ? pick('point') : free[0];
  // values over Monte Carlo samples only: their distribution
  const onlySamples = free.length === 1 && ids[free[0]] === 'sample';
  let mode: View['mode'] = d.mode === 'auto' ? (onlySamples ? 'histogram' : has('theta') && has('lambda') ? 'map' : 'curves') : d.mode;
  // a map of three quantities (X and Y quantities) needs no second axis
  if (mode === 'map' && free.length < 2 && !d.xField && !d.yField) mode = 'curves';
  if (mode === 'histogram') {
    // histogram of the field over the X axis (the other axes held at their sliders)
    return { mode, x, y: -1, series: -1, fixed, sliders: free.filter((i) => i !== x), free };
  }

  let y = -1;
  let series = -1;
  if (mode === 'map') {
    // (none when a map of quantities has a single swept axis)
    y = has(d.y) && pick(d.y) !== x ? pick(d.y) : (free.find((i) => ids[i] === 'lambda' && i !== x) ?? free.find((i) => i !== x) ?? -1);
  } else if (d.series !== 'none') {
    if (has(d.series) && pick(d.series) !== x) series = pick(d.series);
    else if (d.series === '') series = free.find((i) => i !== x && (ids[i].startsWith('sweep:') || ids[i] === 'design' || ids[i] === 'sample' || ids[i] === 'source')) ?? -1;
  }
  const sliders = free.filter((i) => i !== x && i !== y && i !== series);
  return { mode, x, y, series, fixed, sliders, free };
}

export function PlotNodeView({ id, data }: NodeProps<PlotNode>) {
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  const set = (patch: Partial<PlotData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  // a zone edited on the map goes back to its analysis node (an interval of FWHM, or the interval of Min / max, Sensitivity)
  const editZone = (z: MapZone, pts: MapZone['pts']) => {
    const owner = getNode(z.edit.node);
    if (!owner) return;
    if (owner.type === 'fwhm') {
      const intervals = owner.data.intervals.map((iv, j) => (j === z.edit.index && iv.path ? { ...iv, path: { ...iv.path, pts } } : iv));
      updateNodeData(owner.id, { intervals });
    } else if ((owner.type === 'extremum' || owner.type === 'sensitivity') && owner.data.path) updateNodeData(owner.id, { path: { ...owner.data.path, pts } });
  };
  const out = result?.outs.out;
  const ds = out?.type === 'data' ? out.dataset : null;
  const connected = !!result?.info?.connected;
  const view = useMemo(() => (ds ? resolveView(ds, data) : null), [ds, data]);
  const meta = (ds && (metaOf(ds, data.field) ?? ds.meta[0])) || { key: data.field, label: data.field, short: data.field, unit: '' };
  const field = meta.key;
  // a quantity as X (curves, maps) and as Y (maps)
  // merged data (source × row): X is a quantity by default (the first swept parameter kept as a quantity, else the first
  // quantity other than the plotted one), not the row number
  const autoX = ds && !data.xField && ds.axes.some((a) => a.id === 'point') ? (ds.meta.find((m) => m.key.startsWith('ax:')) ?? ds.meta.find((m) => m.key !== field))?.key : undefined;
  const xKey = data.xField || autoX;
  const xMeta = (ds && xKey && metaOf(ds, xKey)) || undefined;
  const yMeta = (ds && data.yField && metaOf(ds, data.yField)) || undefined;
  const yDomain = data.autoY ? undefined : meta.domain;
  const allMarks = out?.type === 'data' ? out.annotations : NO_ANNOTATIONS;
  const annotations = useMemo(() => visibleMarks(allMarks, data.showMarks, data.hiddenMarks), [allMarks, data.showMarks, data.hiddenMarks]);

  const seriesAxis = ds && view && view.series >= 0 ? ds.axes[view.series] : null;
  const selected = useMemo(() => {
    if (!seriesAxis) return [0];
    const all = seriesAxis.values.map((_, i) => i);
    const sel = data.seriesSel?.axis === seriesAxis.id ? data.seriesSel.idx.filter((i) => i < all.length) : all;
    if (sel.length <= MAX_CURVES) return sel;
    return Array.from({ length: MAX_CURVES }, (_, k) => sel[Math.round((k * (sel.length - 1)) / (MAX_CURVES - 1))]);
  }, [seriesAxis, data.seriesSel]);
  const selCount = seriesAxis
    ? data.seriesSel?.axis === seriesAxis.id
      ? data.seriesSel.idx.filter((i) => i < seriesAxis.values.length).length
      : seriesAxis.values.length
    : 0;

  const series: (Series & { idx: number[] })[] = useMemo(() => {
    if (!ds || !view || view.mode !== 'curves') return [];
    return selected.map((si, k) => {
      const idx = [...view.fixed];
      if (view.series >= 0) idx[view.series] = si;
      return {
        key: String(si),
        label: seriesAxis ? `${seriesAxis.label} = ${axisValueText(seriesAxis, si)}` : meta.short,
        color: seriesColor(k, selected.length),
        y: line(ds, field, view.x, idx),
        ...(xMeta ? { x: line(ds, xMeta.key, view.x, idx), dots: true, noLine: !!data.noLines } : {}),
        idx,
      };
    });
  }, [ds, view, selected, seriesAxis, field, meta.short, xMeta, data.noLines]);

  const histValues = useMemo(() => (ds && view?.mode === 'histogram' ? line(ds, field, view.x, view.fixed) : null), [ds, view, field]);

  const map = useMemo(
    () => (ds && view?.mode === 'map' && !xMeta && !yMeta && view.y >= 0 ? grid(ds, field, view.x, view.y, view.fixed) : null),
    [ds, view, field, xMeta, yMeta],
  );
  // a map of three quantities: all the points of the data, on the grid of their distinct X and Y values
  // a map with a quantity as X or Y: every point of the data at (X, Y), coloured by Z, on the grid of the distinct values
  const pointMap = useMemo(() => {
    if (!ds || !view || view.mode !== 'map' || !(xMeta || yMeta) || (!yMeta && view.y < 0)) return null;
    const st = strides(ds.axes);
    const axisAt = (i: number) => Float64Array.from({ length: ds.size }, (_, k) => ds.axes[i].values[Math.floor(k / st[i]) % ds.axes[i].values.length]);
    const xs = xMeta ? ds.fields[xMeta.key] : axisAt(view.x);
    const ys = yMeta ? ds.fields[yMeta.key] : axisAt(view.y);
    return gridFromPoints(xs, ys, ds.fields[field]);
  }, [ds, view, field, xMeta, yMeta]);
  const pmX = xMeta ? { id: `field:${xMeta.key}`, label: xMeta.short, unit: xMeta.unit } : ds && view ? ds.axes[view.x] : null;
  const pmY = yMeta ? { id: `field:${yMeta.key}`, label: yMeta.short, unit: yMeta.unit } : ds && view && view.y >= 0 ? ds.axes[view.y] : null;

  // Analysis marks for every drawn curve (labels only when few curves are shown).
  const overlays = useMemo(
    () => (ds && view && !xMeta ? series.flatMap((s) => overlaysFor(annotations, ds, view.x, field, s.idx, series.length <= 3)) : []),
    [annotations, ds, view, series, field, xMeta],
  );
  const traces = useMemo(
    () => (ds && view?.mode === 'map' && view.y >= 0 && !xMeta && !yMeta ? tracesFor(annotations, ds, view.x, view.y, field, view.fixed) : []),
    [annotations, ds, view, field, xMeta, yMeta],
  );
  const zones = useMemo(() => (ds && view?.mode === 'map' && view.y >= 0 && !xMeta && !yMeta ? zonesFor(annotations, ds, view.x, view.y) : []), [annotations, ds, view, xMeta, yMeta]);
  const marks = [...new Map(allMarks.filter((a) => a.kind !== 'span' && a.kind !== 'zone' && a.datasetKey === ds?.key).map((a) => [markKey(a), a])).values()];
  const toggleMark = (k: string) => {
    const h = data.hiddenMarks ?? [];
    set({ hiddenMarks: h.includes(k) ? h.filter((x) => x !== k) : [...h, k] });
  };

  const chart = useRef<HTMLDivElement>(null);
  const fileName = `${out?.type === 'data' ? out.name : 'plot'}_${meta.short}`;
  const csv = () => {
    if (!ds || !view) return;
    if (view.mode === 'curves' && xMeta) {
      exportCsv(['curve', `${xMeta.short}${xMeta.unit ? ` [${xMeta.unit}]` : ''}`, meta.short], series.flatMap((s) => Array.from(s.y, (y, i) => [s.label, s.x![i], y])), fileName);
    } else if (view.mode === 'curves') {
      const xa = ds.axes[view.x];
      exportCsv(
        [axisTitle(xa), ...series.map((s) => `${meta.short} ${s.label}`)],
        xa.values.map((x, i) => [xa.labels?.[i] ?? x, ...series.map((s) => s.y[i])]),
        fileName,
      );
    } else if (view.mode === 'histogram' && histValues) {
      const { edges, counts } = binsOf(histValues, data.bins ?? 0);
      exportCsv([`${meta.short} bin from`, `${meta.short} bin to`, 'count'], counts.map((c, i) => [edges[i], edges[i + 1], c]), `${fileName}_histogram`);
      const xa = ds.axes[view.x];
      exportCsv([axisTitle(xa), meta.short], xa.values.map((x, i) => [xa.labels?.[i] ?? x, histValues[i]]), `${fileName}_values`);
    } else if (view.mode === 'map' && map) {
      const [xa, ya] = [ds.axes[view.x], ds.axes[view.y]];
      const rows = ya.values.flatMap((y, j) => xa.values.map((x, i) => [x, y, map[j * xa.values.length + i]]));
      exportCsv([axisTitle(xa), axisTitle(ya), meta.short], rows, fileName);
    }
  };

  // the choices of X and Y: the swept parameters of the data (not the source / row numbers of merged data), then its quantities
  const structural = (id: string) => id === 'source' || id === 'point';
  const coordOptions =
    ds && view
      ? [
          ...view.free.filter((i) => !structural(ds.axes[i].id)).map((i) => <option key={`a${i}`} value={`axis:${ds.axes[i].id}`}>{axisTitle(ds.axes[i])}</option>),
          ...ds.meta.map((f) => <option key={`f${f.key}`} value={`field:${f.key}`}>{f.label}{f.unit ? ` [${f.unit}]` : ''}</option>),
        ]
      : null;
  const fieldOptions = (ds?.meta ?? [meta]).map((f) => (
    <option key={f.key} value={f.key}>{f.label}{f.unit ? ` [${f.unit}]` : ''}</option>
  ));
  const setCoord = (which: 'x' | 'y', v: string) => {
    const [kind, id] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)];
    if (which === 'x') set(kind === 'field' ? { xField: id } : { x: id, xField: '' });
    else set(kind === 'field' ? { yField: id } : { y: id, yField: '' });
  };
  // with a quantity as X, the parameter the points of a curve follow (when there is a choice)
  const alongChoices = view ? view.free.filter((i) => i !== view.series) : [];
  const setSel = (idx: number[]) => seriesAxis && set({ seriesSel: { axis: seriesAxis.id, idx } });
  const isSel = (i: number) => data.seriesSel?.axis !== seriesAxis?.id || data.seriesSel!.idx.includes(i);
  const axisOptions = (list: number[]) =>
    list.map((i) => (
      <option key={ds!.axes[i].id} value={ds!.axes[i].id}>{axisTitle(ds!.axes[i])}</option>
    ));

  return (
    <div className="node node-plot">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data</span>
        {out?.type === 'data' && <span className="val muted">{out.name}{out.pending && ' · updating…'}</span>}
        {ds && view?.mode !== 'point' && <FigureTools target={chart} name={fileName} csv={csv} />}
      </div>

      <div className="row wrap">
        <select className="nodrag" value={data.mode} onChange={(e) => set({ mode: e.target.value as PlotMode })}>
          <option value="auto">View: auto</option>
          <option value="curves">View: curves</option>
          <option value="map">View: 2D map</option>
          <option value="histogram">View: histogram</option>
        </select>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.autoY} onChange={(e) => set({ autoY: e.target.checked })} />
          Auto scale
        </label>
      </div>

      {ds && view && view.mode !== 'point' && (
        <div className="row wrap">
          {view.mode === 'histogram' ? (
            <>
              <label className="radio">
                of
                <select className="nodrag" value={field} onChange={(e) => set({ field: e.target.value })}>
                  {fieldOptions}
                </select>
              </label>
              <label className="radio">
                over
                <select className="nodrag" value={ds.axes[view.x].id} onChange={(e) => set({ x: e.target.value })}>
                  {axisOptions(view.free)}
                </select>
              </label>
              <label className="radio" title="0 = automatic (Freedman–Diaconis)">
                bins <NumInput className="tiny" value={data.bins ?? 0} min={0} step={1} onChange={(bins) => set({ bins })} />
              </label>
            </>
          ) : (
            <>
              <label className="radio" title="What is on the horizontal axis: a swept parameter of the data, or any of its quantities (e.g. the FWHM against the resonance angle)">
                X
                <select className="nodrag" value={xMeta ? `field:${xMeta.key}` : `axis:${ds.axes[view.x].id}`} onChange={(e) => setCoord('x', e.target.value)}>
                  {coordOptions}
                </select>
              </label>
              <label className="radio">
                Y
                {view.mode === 'map' ? (
                  <select className="nodrag" value={yMeta ? `field:${yMeta.key}` : view.y >= 0 ? `axis:${ds.axes[view.y].id}` : ''} onChange={(e) => setCoord('y', e.target.value)}>
                    {!yMeta && view.y < 0 && <option value="">choose</option>}
                    {coordOptions}
                  </select>
                ) : (
                  <select className="nodrag" value={field} onChange={(e) => set({ field: e.target.value })}>
                    {fieldOptions}
                  </select>
                )}
              </label>
              {view.mode === 'map' && (
                <label className="radio" title="The colour of the map">
                  Z (colour)
                  <select className="nodrag" value={field} onChange={(e) => set({ field: e.target.value })}>
                    {fieldOptions}
                  </select>
                </label>
              )}
              {view.mode === 'curves' && view.free.length > 1 && (
                <label className="radio" title="One curve for each value of this parameter (e.g. each step of a sweep)">
                  Curves for
                  <select className="nodrag" value={view.series >= 0 ? ds.axes[view.series].id : 'none'} onChange={(e) => set({ series: e.target.value })}>
                    <option value="none">— (single curve)</option>
                    {axisOptions(view.free.filter((i) => i !== view.x))}
                  </select>
                </label>
              )}
              {xMeta && view.mode === 'curves' && alongChoices.length > 1 && (
                <label className="radio" title="With a quantity as X, the points of a curve follow this parameter of the data (in its order)">
                  joined along
                  <select className="nodrag" value={ds.axes[view.x].id} onChange={(e) => set({ x: e.target.value })}>
                    {axisOptions(alongChoices)}
                  </select>
                </label>
              )}
              {xMeta && view.mode === 'curves' && (
                <label className="radio" title="Points without the lines joining them">
                  <input className="nodrag" type="checkbox" checked={!!data.noLines} onChange={(e) => set({ noLines: e.target.checked })} />
                  points only
                </label>
              )}
            </>
          )}
        </div>
      )}

      {ds &&
        view?.sliders.map((i) => {
          const a = ds.axes[i];
          return (
            <label key={a.id} className="slider">
              <span>{a.label}</span>
              <input
                className="nodrag"
                type="range"
                min={0}
                max={a.values.length - 1}
                step={1}
                value={view.fixed[i]}
                onChange={(e) => set({ fixed: { ...data.fixed, [a.id]: Number(e.target.value) } })}
              />
              <span className="val">{axisValueText(a, view.fixed[i])}</span>
            </label>
          );
        })}

      {seriesAxis && (
        <details className="nodrag">
          <summary>
            Curves shown: {selCount} / {seriesAxis.values.length}
            {selCount > MAX_CURVES && ` (drawing ${MAX_CURVES})`}
          </summary>
          <div className="row">
            <button className="nodrag" onClick={() => set({ seriesSel: null })}>All</button>
            <button className="nodrag" onClick={() => setSel([])}>None</button>
          </div>
          <div className="checks nowheel">
            {seriesAxis.values.map((_, i) => (
              <label key={i} className="radio">
                <input
                  className="nodrag"
                  type="checkbox"
                  checked={isSel(i)}
                  onChange={(e) => {
                    const cur = seriesAxis.values.map((_, k) => k).filter(isSel);
                    setSel(e.target.checked ? [...cur, i].sort((a, b) => a - b) : cur.filter((k) => k !== i));
                  }}
                />
                {axisValueText(seriesAxis, i)}
              </label>
            ))}
          </div>
        </details>
      )}

      {ds && (view?.mode === 'curves' || view?.mode === 'map') && <Limits data={data} set={set} />}
      {ds && view?.mode === 'map' && <MapViewControls view={data.mapView} onChange={(mapView) => set({ mapView })} />}
      <div className="nodrag nowheel chart" ref={chart}>
        {ds && view?.mode === 'curves' && (
          <LinePlot
            xAxis={xMeta ? { id: `field:${xMeta.key}`, label: xMeta.short, unit: xMeta.unit, values: [] } : ds.axes[view.x]}
            series={series}
            yLabel={meta.short}
            yUnit={meta.unit}
            yDomain={yDomain}
            xLim={data.xLim}
            yLim={data.yLim}
            overlays={overlays}
          />
        )}
        {ds && view?.mode === 'histogram' && histValues && (
          <Histogram values={histValues} label={meta.short} unit={meta.unit} bins={data.bins ?? 0} />
        )}
        {ds && view?.mode === 'map' && pointMap && pmX && pmY && (
          <MapPlot
            xAxis={{ id: pmX.id, label: pmX.label, unit: pmX.unit, values: pointMap.x }}
            yAxis={{ id: pmY.id, label: pmY.label, unit: pmY.unit, values: pointMap.y }}
            values={pointMap.values}
            zLabel={meta.short}
            zUnit={meta.unit}
            zDomain={yDomain}
            xLim={data.xLim}
            yLim={data.yLim}
            view={data.mapView}
          />
        )}
        {ds && view?.mode === 'map' && (xMeta || yMeta) && !pointMap && <div className="empty small">Choose X, Y and Z.</div>}
        {ds && view?.mode === 'map' && map && (
          <MapPlot
            xAxis={ds.axes[view.x]}
            yAxis={ds.axes[view.y]}
            values={map}
            zLabel={meta.short}
            zUnit={meta.unit}
            zDomain={yDomain}
            xLim={data.xLim}
            yLim={data.yLim}
            view={data.mapView}
            traces={traces}
            zones={zones}
            onZone={editZone}
          />
        )}
        {ds && view?.mode === 'point' && (
          <div className="empty">
            <table className="point">
              <tbody>
                {ds.meta.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td className="val">
                      {+ds.fields[f.key][0].toFixed(5)}
                      {f.unit ? ` ${f.unit}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!ds && (
          <div className="empty">
            {!connected
              ? 'Connect the data output of a Compute TMM node.'
              : out?.type === 'data' && out.pending
                ? 'Computing…'
                : (result?.warnings.find((w) => w.includes('press')) ?? 'No valid data — see the messages in the upstream nodes.')}
          </div>
        )}
      </div>

      {series.length > 1 && series.length <= 12 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {marks.length > 0 && view?.mode !== 'point' && (
        <div className="legend marks">
          <label className="radio" title="Show the marks of the analysis nodes (minima, FWHM, fits, ranges …)">
            <input className="nodrag" type="checkbox" checked={data.showMarks !== false} onChange={(e) => set({ showMarks: e.target.checked })} />
            marks
          </label>
          {data.showMarks !== false &&
            marks.map((a) => {
              const off = data.hiddenMarks?.includes(markKey(a));
              return (
                <button key={a.id} className={`nodrag mark-toggle${off ? ' off' : ''}`} title={off ? 'Show this mark' : 'Hide this mark'} onClick={() => toggleMark(markKey(a))}>
                  <i className={a.kind === 'curve' ? 'dashed' : a.kind === 'area' ? 'area' : 'dot'} style={{ background: a.color, color: a.color }} />
                  {a.label}
                </button>
              );
            })}
        </div>
      )}
      {series.length > 12 && seriesAxis && (
        <div className="legend">
          <span>
            {seriesAxis.label}: <i className="grad" /> {axisValueText(seriesAxis, selected[0])} → {axisValueText(seriesAxis, selected[selected.length - 1])}
          </span>
        </div>
      )}

      <OutPort label="data" port="data" />
    </div>
  );
}

// Manual axis limits (empty = automatic); a drag on a line chart still zooms inside them.
function Limits({ data, set }: { data: PlotData; set: (patch: Partial<PlotData>) => void }) {
  const x = data.xLim ?? [NaN, NaN];
  const y = data.yLim ?? [NaN, NaN];
  const any = [...x, ...y].some(Number.isFinite);
  const lim = (v: [number, number]) => (v.some(Number.isFinite) ? v : undefined);
  return (
    <div className="row wrap limits">
      <span className="muted">limits</span>
      <span className="interval">
        x <NumInput className="short" value={x[0]} placeholder="auto" onChange={(v) => set({ xLim: lim([v, x[1]]) })} />–
        <NumInput className="short" value={x[1]} placeholder="auto" onChange={(v) => set({ xLim: lim([x[0], v]) })} />
      </span>
      <span className="interval">
        y <NumInput className="short" value={y[0]} placeholder="auto" onChange={(v) => set({ yLim: lim([v, y[1]]) })} />–
        <NumInput className="short" value={y[1]} placeholder="auto" onChange={(v) => set({ yLim: lim([y[0], v]) })} />
      </span>
      {any && (
        <button className="nodrag" title="Back to automatic limits" onClick={() => set({ xLim: undefined, yLim: undefined })}>
          auto
        </button>
      )}
    </div>
  );
}
