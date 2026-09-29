import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { axisTitle, axisValueText } from '../engine/dataset.ts';
import type { Axis } from '../engine/types.ts';
import { VIRIDIS_LUT, VIRIDIS_STOPS } from './colors.ts';
import type { Trace } from './overlays.ts';
import type { MapView } from '../types.ts';
import { bilinear, capValues, fracIndex, gaussianBlur, logTicks } from './mapGrid.ts';
import { applyLim, axisTicks, nearest, niceTicks } from './scale.ts';

type Props = {
  xAxis: Axis;
  yAxis: Axis;
  values: Float64Array; // values[iy * nx + ix]
  zLabel: string;
  zUnit: string;
  zDomain?: [number, number]; // omitted = auto
  xLim?: [number, number]; // manual limits of the view (NaN bound = automatic)
  yLim?: [number, number];
  view?: MapView; // colour range, log scale, smoothing, blur (display only)
  width?: number;
  height?: number;
  traces?: Trace[]; // analysis results drawn across the map (e.g. resonance position)
};

const M = { l: 54, r: 74, t: 10, b: 38 };

// Extent covering whole cells (half a step beyond the first and last sample).
const cellExtent = (v: number[]): [number, number] =>
  v.length < 2 ? [v[0] - 0.5, v[0] + 0.5] : [v[0] - (v[1] - v[0]) / 2, v[v.length - 1] + (v[v.length - 1] - v[v.length - 2]) / 2];

export function MapPlot({ xAxis, yAxis, values, zLabel, zUnit, zDomain, xLim, yLim, view, width = 520, height = 300, traces = [] }: Props) {
  const pw = width - M.l - M.r;
  const ph = height - M.t - M.b;
  const canvas = useRef<HTMLCanvasElement>(null);
  const grad = useId();
  const clip = useId();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const nx = xAxis.values.length;

  const xData = cellExtent(xAxis.values);
  const yData = cellExtent(yAxis.values);
  const [x0, x1] = applyLim(xData, xLim);
  const [y0, y1] = applyLim(yData, yLim);
  const log = !!view?.zLog;
  const blur = view?.blur ?? 0;
  const smooth = !!view?.smooth;
  // what is coloured: log10 of the values (≤ 0 left empty) and / or blurred; the data themselves are not changed
  const cap = view?.cap;
  const capHide = !!view?.capHide;
  const grid = useMemo(() => {
    // the cap first (in the units of the data), then log and blur
    const c = capValues(values, cap, capHide);
    const g = log ? c.map((v) => (v > 0 ? Math.log10(v) : NaN)) : c;
    return blur > 0 ? gaussianBlur(g, nx, values.length / nx, blur) : g;
  }, [values, log, blur, nx, cap, capHide]);
  const [z0, z1] = useMemo((): [number, number] => {
    let auto: [number, number] = [0, 1];
    if (zDomain && !log) auto = zDomain;
    else {
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of grid) {
        if (!Number.isFinite(v)) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      if (Number.isFinite(lo)) auto = hi - lo < 1e-12 ? [lo - 0.5, hi + 0.5] : [lo, hi];
    }
    const lim = view?.zLim;
    const t = (v: number) => (log ? (v > 0 ? Math.log10(v) : NaN) : v);
    return applyLim(auto, lim && [t(lim[0]), t(lim[1])]);
  }, [grid, zDomain, log, view?.zLim]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(pw * dpr);
    const H = Math.round(ph * dpr);
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    // outside the data (limits wider than the data): left empty
    const pick = (v: number[], ext: [number, number], p: number) => (p < Math.min(...ext) || p > Math.max(...ext) ? -1 : nearest(v, p));
    const col = Int32Array.from({ length: W }, (_, c) => pick(xAxis.values, cellExtent(xAxis.values), x0 + ((c + 0.5) / W) * (x1 - x0)));
    const row = Int32Array.from({ length: H }, (_, r) => pick(yAxis.values, cellExtent(yAxis.values), y1 - ((r + 0.5) / H) * (y1 - y0)));
    // smooth: bilinear between the sample points (fractional indices)
    const fcol = smooth ? Float64Array.from({ length: W }, (_, c) => fracIndex(xAxis.values, x0 + ((c + 0.5) / W) * (x1 - x0))) : null;
    const frow = smooth ? Float64Array.from({ length: H }, (_, r) => fracIndex(yAxis.values, y1 - ((r + 0.5) / H) * (y1 - y0))) : null;
    const ny = values.length / nx;
    const span = z1 - z0 || 1;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        if (row[r] < 0 || col[c] < 0) continue;
        const v = fcol && frow ? bilinear(grid, nx, ny, frow[r], fcol[c]) : grid[row[r] * nx + col[c]];
        const p = (r * W + c) * 4;
        if (!Number.isFinite(v)) continue;
        const k = Math.round(Math.min(1, Math.max(0, (v - z0) / span)) * 255) * 3;
        img.data[p] = VIRIDIS_LUT[k];
        img.data[p + 1] = VIRIDIS_LUT[k + 1];
        img.data[p + 2] = VIRIDIS_LUT[k + 2];
        img.data[p + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [values, grid, smooth, xAxis, yAxis, nx, x0, x1, y0, y1, z0, z1, pw, ph]);

  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * pw;
  const sy = (v: number) => M.t + ph - ((v - y0) / (y1 - y0)) * ph;
  const sz = (v: number) => M.t + ph - ((v - z0) / (z1 - z0 || 1)) * ph;

  const point = (e: MouseEvent<SVGRectElement>): [number, number] => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    return [((e.clientX - r.left) * width) / r.width, ((e.clientY - r.top) * height) / r.height];
  };

  let tip: { x: number; y: number; lines: string[] } | null = null;
  if (hover) {
    const i = nearest(xAxis.values, x0 + ((hover[0] - M.l) / pw) * (x1 - x0));
    const j = nearest(yAxis.values, y1 - ((hover[1] - M.t) / ph) * (y1 - y0));
    const v = values[j * nx + i];
    tip = {
      x: hover[0],
      y: hover[1],
      lines: [
        `${xAxis.label} = ${axisValueText(xAxis, i)}`,
        `${yAxis.label} = ${axisValueText(yAxis, j)}`,
        `${zLabel} = ${Number.isFinite(v) ? v.toFixed(4) : '—'}${zUnit}`,
      ],
    };
  }
  const tipW = 150;
  const barX = M.l + pw + 14;

  return (
    <div className="map" style={{ width, height }}>
      <canvas ref={canvas} style={{ left: M.l, top: M.t, width: pw, height: ph }} />
      <svg width={width} height={height} className="plot">
        <defs>
          <linearGradient id={grad} x1="0" y1="1" x2="0" y2="0">
            {VIRIDIS_STOPS.map((c, k) => (
              <stop key={c} offset={k / (VIRIDIS_STOPS.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
        {axisTicks(xAxis, x0, x1).map((t) => (
          <g key={`x${t.v}`}>
            <line x1={sx(t.v)} x2={sx(t.v)} y1={M.t + ph} y2={M.t + ph + 4} className="axis-line" />
            <text x={sx(t.v)} y={M.t + ph + 14} className="tick" textAnchor="middle">{t.text}</text>
          </g>
        ))}
        {axisTicks(yAxis, y0, y1, 5).map((t) => (
          <g key={`y${t.v}`}>
            <line x1={M.l - 4} x2={M.l} y1={sy(t.v)} y2={sy(t.v)} className="axis-line" />
            <text x={M.l - 6} y={sy(t.v)} className="tick" textAnchor="end" dominantBaseline="middle">{t.text}</text>
          </g>
        ))}
        <clipPath id={clip}>
          <rect x={M.l} y={M.t} width={pw} height={ph} />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          {traces.map((t) => (
            <path
              key={t.key}
              d={t.x.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(t.y[i]).toFixed(1)}`).join('')}
              fill="none"
              stroke={t.color}
              strokeWidth={2}
            />
          ))}
        </g>
        <rect x={M.l} y={M.t} width={pw} height={ph} className="frame" />
        <text x={M.l + pw / 2} y={height - 4} className="axis-title" textAnchor="middle">{axisTitle(xAxis)}</text>
        <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">
          {axisTitle(yAxis)}
        </text>

        <rect x={barX} y={M.t} width={12} height={ph} fill={`url(#${grad})`} />
        {(log ? logTicks(z0, z1) : niceTicks(z0, z1, 5)).map((t) => (
          <text key={t.v} x={barX + 16} y={sz(t.v)} className="tick" dominantBaseline="middle">{t.text}</text>
        ))}
        <text x={barX} y={M.t + ph + 14} className="tick">{`${zUnit ? `${zLabel} [${zUnit}]` : zLabel}${log ? ' (log)' : ''}`}</text>
        {cap !== undefined && Number.isFinite(cap) && (
          <text x={barX} y={M.t + ph + 27} className="tick">{capHide ? `hidden > ${+cap.toPrecision(4)}` : `≥ ${+cap.toPrecision(4)}`}</text>
        )}

        {tip && (
          <g data-export="skip" transform={`translate(${tip.x + 12 + tipW > M.l + pw ? tip.x - 12 - tipW : tip.x + 12} ${Math.min(tip.y + 8, M.t + ph - 52)})`}>
            <rect width={tipW} height={tip.lines.length * 14 + 8} rx={4} className="tip" />
            {tip.lines.map((l, k) => (
              <text key={k} x={6} y={16 + k * 14} className="tip-text">{l}</text>
            ))}
          </g>
        )}
        <rect
          data-export="skip"
          x={M.l}
          y={M.t}
          width={pw}
          height={ph}
          fill="transparent"
          className="nodrag"
          onMouseMove={(e) => setHover(point(e))}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
    </div>
  );
}
