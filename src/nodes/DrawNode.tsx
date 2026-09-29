import { useId, useMemo, useRef, type ReactElement } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { matName, nominalMat } from '../engine/evaluate.ts';
import { gratingSlices } from '../engine/grating.ts';
import type { MaterialValue, StackLayer, StackValue } from '../engine/types.ts';
import { useLibrary } from '../library/context.ts';
import { FigureTools } from '../plot/FigureTools.tsx';
import type { AppNode, DrawData, DrawNode } from '../types.ts';
import { Messages, OutPort, Port } from './ui.tsx';
import { LayerListView } from './LayerListView.tsx';

type Block = {
  key: string;
  medium?: 'incident' | 'exit' | 'out';
  layer?: StackLayer;
  mat: MaterialValue;
  name: string;
  weight: number;
  bracket?: { periods: number; first: boolean; last: boolean };
};

const W = 480;
const H = 380;
const MEDIUM = 42; // size of the semi-infinite media along the stack direction
const OBLIQUE = 45; // drawn angle of an oblique incident ray, degrees

const luminance = (hex: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return 1;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function blocksOf(stack: StackValue, d: DrawData): Block[] {
  const weight = (L: StackLayer) =>
    d.scale === 'equal' ? 1 : d.scale === 'log' ? Math.log10(1 + Math.max(L.d, 0.1)) : Math.max(L.d, 0);
  const layers = stack.layers.filter((L) => !L.pad);
  const film = (L: StackLayer, key: string, bracket?: Block['bracket']): Block => ({
    key,
    layer: L,
    mat: L.mat,
    name: L.label || L.mat.name,
    weight: weight(L),
    bracket,
  });
  const out: Block[] = [];
  if (stack.incident)
    out.push({ key: 'incident', medium: 'incident', mat: nominalMat(stack.incident), name: `${matName(stack.incident)} (incident)`, weight: 0 });
  for (let i = 0; i < layers.length; ) {
    const g = layers[i].group;
    if (d.compress && g && g.periods > 1) {
      const period = layers.slice(i, i + g.size);
      period.forEach((P, k) => out.push(film(P, `${P.key}#${i + k}`, { periods: g.periods, first: k === 0, last: k === period.length - 1 })));
      while (i < layers.length && layers[i].group?.id === g.id) i++;
    } else {
      out.push(film(layers[i], `${layers[i].key}#${i}`));
      i++;
    }
  }
  const sub = stack.substrate;
  if (stack.exit)
    out.push({
      key: 'exit',
      medium: 'exit',
      mat: nominalMat(stack.exit),
      name: sub ? `${matName(stack.exit)} (substrate, ${+(sub.d / 1e6).toFixed(3)} mm)` : `${matName(stack.exit)} (exit)`,
      weight: 0,
    });
  if (sub) {
    // back coating, then the medium behind the plate
    sub.back.filter((L) => !L.pad).forEach((L, i) => out.push(film(L, `back:${L.key}#${i}`)));
    const o = sub.out ?? stack.incident;
    if (o) out.push({ key: 'out', medium: 'out', mat: nominalMat(o), name: `${matName(o)} (back medium)`, weight: 0 });
  }
  return out;
}

// Incident ray reaching the first interface: from one side at OBLIQUE degrees, or along the normal.
function LightRay({ vertical, side, hit }: { vertical: boolean; side: 'left' | 'center' | 'right'; hit: [number, number] }) {
  const th = side === 'center' ? 0 : (OBLIQUE * Math.PI) / 180;
  const sign = side === 'right' ? -1 : 1; // right (or below when horizontal) comes from the other side
  const len = (MEDIUM - 6) / Math.cos(th);
  const [hx, hy] = hit;
  const [sx, sy] = vertical
    ? [hx - sign * len * Math.sin(th), hy - len * Math.cos(th)]
    : [hx - len * Math.cos(th), hy - sign * len * Math.sin(th)];
  const a = Math.atan2(hy - sy, hx - sx);
  const head = (s: number) => `M${hx},${hy} L${hx - 8 * Math.cos(a + s)},${hy - 8 * Math.sin(a + s)}`;
  return <path className="light" d={`M${sx},${sy} L${hx},${hy} ${head(0.4)} ${head(-0.4)}`} />;
}

// A grating layer drawn as its staircase over a few periods (along the layer; slices across it).
function GratingPattern({ g, r, vertical }: { g: NonNullable<StackLayer['grating']>; r: { x: number; y: number; width: number; height: number }; vertical: boolean }) {
  const slices = gratingSlices(g);
  const periods = 4;
  const along = vertical ? r.width : r.height; // direction of x (the period)
  const across = vertical ? r.height : r.width; // depth direction
  const out: ReactElement[] = [];
  let z = 0;
  slices.forEach((sl, k) => {
    const h = sl.h * across;
    for (let p = 0; p < periods; p++)
      for (const [j, seg] of sl.segs.entries()) {
        const x0 = ((p + seg.from) / periods) * along;
        const w = ((seg.to - seg.from) / periods) * along;
        const fill = g.mats[seg.m]?.color ?? '#999';
        out.push(
          vertical ? (
            <rect key={`${k}-${p}-${j}`} x={r.x + x0} y={r.y + z} width={w} height={h} fill={fill} />
          ) : (
            <rect key={`${k}-${p}-${j}`} x={r.x + z} y={r.y + x0} width={h} height={w} fill={fill} />
          ),
        );
      }
    z += h;
  });
  return <g>{out}</g>;
}

// Label override key: one entry per stack layer identity (a DBR period layer is shared by all periods).
const overrideKey = (b: Block) => (b.medium ? b.medium : b.layer!.key);

export function DrawNodeView({ id, data }: NodeProps<DrawNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<DrawData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const { lib } = useLibrary();
  const stack = result?.info?.stack as StackValue | undefined;
  const fig = useRef<HTMLDivElement>(null);
  const pattern = useId();

  const blocks = useMemo(() => (stack ? blocksOf(stack, data) : []), [stack, data]);
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return blocks.filter((b) => !seen.has(overrideKey(b)) && seen.add(overrideKey(b)));
  }, [blocks]);

  const nameOf = (b: Block) => data.overrides[overrideKey(b)]?.label || b.name;
  const thickText = (L: StackLayer) => (L.layers2D ? `${L.layers2D} ML` : `${+L.d.toFixed(1)} nm`) + (L.vary ? ' (swept)' : '');
  const textOf = (b: Block) => {
    if (data.labels === 'none') return '';
    if (b.medium || data.labels === 'name') return nameOf(b);
    if (data.labels === 'd') return thickText(b.layer!);
    return `${nameOf(b)} · ${thickText(b.layer!)}`;
  };
  const porous = (b: Block) => lib.get(b.mat.id)?.model.type === 'ema';
  const setLabel = (key: string, label: string) => set({ overrides: { ...data.overrides, [key]: { label } } });

  // Layout along the stack direction.
  const vertical = data.orientation === 'vertical';
  const along = vertical ? H - 20 : W - 20;
  const media = blocks.filter((b) => b.medium).length;
  const films = blocks.filter((b) => !b.medium);
  const totalW = films.reduce((s, b) => s + b.weight, 0);
  const room = along - media * MEDIUM;
  const minPx = 3;
  const sizes = blocks.map((b) =>
    b.medium ? MEDIUM : totalW > 0 ? Math.max(minPx, (b.weight / totalW) * (room - minPx * films.length) + minPx) : room / Math.max(1, films.length),
  );
  const pos: number[] = [];
  sizes.reduce((p, s, i) => ((pos[i] = p), p + s), 10);

  // Cross-direction extent of the blocks, leaving room for outside labels and brackets.
  const side = data.labelPos;
  const [c0, c1] = vertical
    ? side === 'right' ? [20, 250] : side === 'left' ? [210, 440] : [60, 390]
    : side === 'inside' ? [60, 300] : [100, 260];
  const rect = (i: number) =>
    vertical ? { x: c0, y: pos[i], width: c1 - c0, height: sizes[i] } : { x: pos[i], y: c0, width: sizes[i], height: c1 - c0 };
  const lightOptions: [DrawData['light'], string][] = vertical
    ? [['none', 'Light: none'], ['left', 'Light: from left'], ['center', 'Light: normal'], ['right', 'Light: from right']]
    : [['none', 'Light: none'], ['left', 'Light: from above'], ['center', 'Light: normal'], ['right', 'Light: from below']];

  return (
    <div className="node node-draw">
      <div className="port-row">
        <Port kind="target" id="in" port="stack" />
        <span className="muted">stack</span>
        {stack && <FigureTools target={fig} name="stack" />}
      </div>
      <div className="row wrap">
        <select className="nodrag" value={data.orientation} onChange={(e) => set({ orientation: e.target.value as DrawData['orientation'] })}>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
        <select className="nodrag" value={data.scale} onChange={(e) => set({ scale: e.target.value as DrawData['scale'] })}>
          <option value="proportional">Thickness: proportional</option>
          <option value="log">Thickness: log</option>
          <option value="equal">Thickness: equal</option>
        </select>
        <select className="nodrag" value={data.labels} onChange={(e) => set({ labels: e.target.value as DrawData['labels'] })}>
          <option value="name">Labels: name</option>
          <option value="name+d">Labels: name + thickness</option>
          <option value="d">Labels: thickness</option>
          <option value="none">Labels: none</option>
        </select>
        <select className="nodrag" value={data.labelPos} onChange={(e) => set({ labelPos: e.target.value as DrawData['labelPos'] })}>
          <option value="inside">inside</option>
          <option value="right">{vertical ? 'right' : 'below'}</option>
          <option value="left">{vertical ? 'left' : 'above'}</option>
        </select>
        <select className="nodrag" value={data.light} onChange={(e) => set({ light: e.target.value as DrawData['light'] })}>
          {lightOptions.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.compress} onChange={(e) => set({ compress: e.target.checked })} />
          compress periods
        </label>
      </div>

      <div className="nodrag chart" ref={fig}>
        {stack ? (
          <svg width={W} height={H} className="plot">
            <defs>
              <pattern id={pattern} width="6" height="6" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="1.1" fill="rgba(0,0,0,0.35)" />
              </pattern>
            </defs>
            {blocks.map((b, i) => {
              const r = rect(i);
              const text = textOf(b);
              const center = vertical ? r.y + r.height / 2 : r.x + r.width / 2;
              const fits = vertical ? r.height >= 12 : r.width >= 12;
              const inside = data.labelPos === 'inside' && fits;
              const out = data.labelPos === 'left' ? c0 - 8 : c1 + 8;
              return (
                <g key={b.key}>
                  {/* the media in the colour of their material, like the layers */}
                  <rect {...r} fill={b.mat.color} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
                  {b.layer?.grating && <GratingPattern g={b.layer.grating} r={r} vertical={vertical} />}
                  {porous(b) && <rect {...r} fill={`url(#${pattern})`} />}
                  {text && inside && (
                    <text
                      x={vertical ? (c0 + c1) / 2 : center}
                      y={vertical ? center : (c0 + c1) / 2}
                      transform={vertical ? undefined : `rotate(-90 ${center} ${(c0 + c1) / 2})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="draw-label"
                      style={{ fill: luminance(b.mat.color) < 0.45 ? '#fff' : '#1d2330' }}
                    >
                      {text}
                    </text>
                  )}
                  {text && !inside && vertical && (
                    <text x={out} y={center} textAnchor={data.labelPos === 'left' ? 'end' : 'start'} dominantBaseline="middle" className="draw-label">
                      {text}
                    </text>
                  )}
                  {text && !inside && !vertical && (
                    <text
                      x={center}
                      y={out}
                      transform={`rotate(-45 ${center} ${out})`}
                      textAnchor={data.labelPos === 'left' ? 'start' : 'end'}
                      dominantBaseline="middle"
                      className="draw-label"
                    >
                      {text}
                    </text>
                  )}
                </g>
              );
            })}
            {blocks.map((b, i) => {
              if (!b.bracket?.first) return null;
              const j = blocks.findIndex((x, k) => k >= i && x.bracket?.last);
              const a = pos[i];
              const z = pos[j] + sizes[j];
              const at = vertical ? (data.labelPos === 'right' ? c0 - 6 : c1 + 6) : data.labelPos === 'left' ? c1 + 6 : c0 - 6;
              const dir = vertical ? (data.labelPos === 'right' ? -1 : 1) : data.labelPos === 'left' ? 1 : -1;
              const tip = at + dir * 6;
              const path = vertical ? `M${at},${a} L${tip},${a} L${tip},${z} L${at},${z}` : `M${a},${at} L${a},${tip} L${z},${tip} L${z},${at}`;
              const mid = (a + z) / 2;
              return (
                <g key={`br${i}`}>
                  <path d={path} fill="none" className="bracket" />
                  <text
                    x={vertical ? tip + dir * 4 : mid}
                    y={vertical ? mid : tip + dir * 10}
                    textAnchor={vertical ? (dir > 0 ? 'start' : 'end') : 'middle'}
                    dominantBaseline="middle"
                    className="draw-label bold"
                  >
                    ×{b.bracket.periods}
                  </text>
                </g>
              );
            })}
            {data.light !== 'none' && stack.incident && (
              <LightRay
                vertical={vertical}
                side={data.light}
                hit={vertical ? [(c0 + c1) / 2, pos[0] + sizes[0]] : [pos[0] + sizes[0], (c0 + c1) / 2]}
              />
            )}
          </svg>
        ) : (
          <div className="empty">Connect a Layer or a stack.</div>
        )}
      </div>

      {stack && <LayerListView stack={stack} name="stack" />}
      {unique.length > 0 && (
        <details className="nodrag">
          <summary>Labels ({unique.length}) — colours come from the Material nodes</summary>
          <div className="curves nowheel">
            {unique.map((b) => {
              const k = overrideKey(b);
              return (
                <div className="row" key={k}>
                  <i className="swatch" style={{ background: b.mat.color }} />
                  <input className="nodrag label" value={data.overrides[k]?.label ?? ''} placeholder={b.name} onChange={(e) => setLabel(k, e.target.value)} />
                </div>
              );
            })}
          </div>
        </details>
      )}
      <Messages result={result} />
      <OutPort label="stack" port="stack" />
    </div>
  );
}
