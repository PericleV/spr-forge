// Histogram of a set of values (e.g. a metric over Monte Carlo samples) with its summary statistics.
import { binsOf, histStats } from './histStats.ts';
import { niceTicks } from './scale.ts';

const fmt = (v: number) => (Number.isFinite(v) ? `${+v.toPrecision(4)}` : '—');

export function Histogram(props: { values: ArrayLike<number>; label: string; unit: string; bins?: number; color?: string; width?: number; height?: number; marks?: { x: number; label: string }[] }) {
  const { values, label, unit, bins = 0, color = '#7b5bd6', width = 520, height = 260, marks = [] } = props;
  const { edges, counts } = binsOf(values, bins);
  const st = histStats(values);
  if (!edges.length || !st) return <div className="empty small">No finite values.</div>;
  const M = { l: 48, r: 12, t: 10, b: 38 };
  const pw = width - M.l - M.r;
  const ph = height - M.t - M.b;
  const [x0, x1] = [edges[0], edges[edges.length - 1]];
  const cmax = Math.max(...counts);
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * pw;
  const sy = (c: number) => M.t + ph - (c / (cmax || 1)) * ph;
  const xt = niceTicks(x0, x1, 6).filter((t) => t.v >= x0 && t.v <= x1);
  const yt = niceTicks(0, cmax, 4).filter((t) => t.v <= cmax);
  const lines = [
    { x: st.mean, label: 'mean', dash: '' },
    { x: st.median, label: 'median', dash: '4 3' },
    ...marks.map((m) => ({ ...m, dash: '2 2' })),
  ];
  return (
    <div>
      <svg className="plot" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        {yt.map((t) => (
          <g key={`y${t.v}`}>
            <line x1={M.l} x2={M.l + pw} y1={sy(t.v)} y2={sy(t.v)} className="grid" />
            <text x={M.l - 5} y={sy(t.v) + 3} className="tick" textAnchor="end">{t.text}</text>
          </g>
        ))}
        {counts.map((c, i) => (
          <rect key={i} x={sx(edges[i]) + 0.5} y={sy(c)} width={Math.max(0.5, sx(edges[i + 1]) - sx(edges[i]) - 1)} height={M.t + ph - sy(c)} fill={color} opacity={0.75}>
            <title>{`${fmt(edges[i])} – ${fmt(edges[i + 1])}: ${c}`}</title>
          </rect>
        ))}
        {lines.map((l) =>
          l.x >= x0 && l.x <= x1 ? (
            <g key={l.label}>
              <line x1={sx(l.x)} x2={sx(l.x)} y1={M.t} y2={M.t + ph} stroke="var(--text)" strokeWidth={1.2} strokeDasharray={l.dash} />
              <text x={sx(l.x) + 3} y={M.t + 11} className="tick">{l.label}</text>
            </g>
          ) : null,
        )}
        {xt.map((t) => (
          <text key={`x${t.v}`} x={sx(t.v)} y={M.t + ph + 14} className="tick" textAnchor="middle">{t.text}</text>
        ))}
        <rect x={M.l} y={M.t} width={pw} height={ph} className="frame" />
        <text x={M.l + pw / 2} y={height - 4} className="axis-title" textAnchor="middle">{unit ? `${label} [${unit}]` : label}</text>
        <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">count</text>
      </svg>
      <div className="hist-stats">
        n = {st.n} · mean {fmt(st.mean)} · median {fmt(st.median)} · σ {fmt(st.std)} · p5 {fmt(st.p5)} · p95 {fmt(st.p95)} · min {fmt(st.min)} · max {fmt(st.max)}
      </div>
    </div>
  );
}
