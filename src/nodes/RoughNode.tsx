import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { RoughInfo } from '../engine/evaluate.ts';
import type { AppNode, RoughData, RoughNode } from '../types.ts';
import { useConnected } from './hooks.ts';
import { Messages, NumInput, OutPort, Port } from './ui.tsx';

// Roughness: the top or bottom interface of a layer made rough; its profile (at the nominal values) drawn over one cell.
export function RoughNodeView({ id, data }: NodeProps<RoughNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<RoughData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as RoughInfo | undefined;
  const sizeSwept = useConnected('size');
  const clSwept = useConnected('cl');
  const seedSwept = useConnected('seed');
  return (
    <div className="node node-rough">
      <div className="port-row">
        <Port kind="target" id="in" port="layer" />
        <span className="muted">layer</span>
        <span className="val">{info?.target ?? '—'}</span>
      </div>
      <label title="Which interface of the layer is rough: its top (towards the incident medium) or its bottom">
        Interface
        <select className="nodrag" value={data.side} onChange={(e) => set({ side: e.target.value as RoughData['side'] })}>
          <option value="top">top (incident side)</option>
          <option value="bottom">bottom (exit side)</option>
        </select>
      </label>
      <div className="port-row">
        <Port kind="target" id="size" port="sweep-number" />
        <label>
          <select className="nodrag" value={data.kind} onChange={(e) => set({ kind: e.target.value as RoughData['kind'] })} title="The height given: the RMS (standard deviation) of the profile or its peak-to-peak height">
            <option value="rms">RMS [nm]</option>
            <option value="pp">peak-to-peak [nm]</option>
          </select>
          {sizeSwept ? <span className="val swept">swept</span> : <NumInput value={data.size} min={0} step={0.5} onChange={(size) => set({ size })} />}
        </label>
      </div>
      <div className="port-row">
        <Port kind="target" id="cl" port="sweep-number" />
        <label title="Correlation length: the autocorrelation of the heights is exp(−r²/cl²) (small cl: sharp features, large cl: smooth hills)">
          Correlation length [nm]
          {clSwept ? <span className="val swept">swept</span> : <NumInput value={data.cl} min={0} step={1} onChange={(cl) => set({ cl })} />}
        </label>
      </div>
      <div className="port-row">
        <Port kind="target" id="seed" port="sweep-number" />
        <label title="The random realization: sweep it (integers) and average the results for the statistics">
          Seed
          {seedSwept ? <span className="val swept">swept</span> : <NumInput value={data.seed} step={1} onChange={(seed) => set({ seed })} />}
        </label>
      </div>
      {info && <ProfileView info={info} side={data.side} />}
      {info && (
        <div className="hint">
          profile: RMS {info.rms.toFixed(2)} nm · peak-to-peak {info.pp.toFixed(2)} nm · cl ≈ {Number.isFinite(info.clFit) ? info.clFit.toFixed(1) : '—'} nm
          {info.swept.length > 0 && <> (first step of {info.swept.join(', ')})</>}
        </div>
      )}
      <div className="row wrap">
        <label title="Length of the periodic cell of the profile (RCWA: the period; a grating in the stack imposes its own)">
          Cell [nm]
          <NumInput className="short" value={data.cell} min={1} step={100} onChange={(cell) => set({ cell })} />
        </label>
        <label title="Points of the profile over the cell">
          Points
          <NumInput className="short" value={data.px} min={16} step={100} onChange={(px) => set({ px })} />
        </label>
      </div>
      <div className="row wrap">
        <label title="Horizontal slices of the rough zone (overlapping rough interfaces add their slices)">
          Slices
          <NumInput className="tiny" value={data.slices} min={1} step={1} onChange={(slices) => set({ slices })} />
        </label>
        <label title="Compute TMM (and Berreman): each slice becomes an effective medium of its material fractions. Compute RCWA uses the pixels.">
          TMM medium
          <select className="nodrag" value={data.ema} onChange={(e) => set({ ema: e.target.value as RoughData['ema'] })}>
            <option value="bruggeman">Bruggeman</option>
            <option value="maxwell-garnett">Maxwell-Garnett</option>
            <option value="looyenga">Looyenga</option>
          </select>
        </label>
      </div>
      <Messages result={result} />
      <OutPort label="layer" port="layer" />
    </div>
  );
}

// The layer side of the profile filled with the layer's colour, the mean plane dashed.
function ProfileView({ info, side }: { info: RoughInfo; side: RoughData['side'] }) {
  const W = 280;
  const H = 70;
  const p = info.profile;
  const amp = Math.max(1e-9, ...p.map(Math.abs));
  const y = (v: number) => H / 2 - (v / amp) * (H / 2 - 4);
  const pts = p.map((v, i) => `${((i / (p.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const edge = side === 'top' ? H : 0;
  return (
    <svg className="rough-profile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Height profile over one cell">
      <polygon points={`0,${edge} ${pts} ${W},${edge}`} fill={info.color} fillOpacity={0.55} />
      <polyline points={pts} fill="none" stroke="var(--text)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--muted)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <text x={3} y={11} fontSize={10} fill="var(--muted)">
        ±{amp.toFixed(1)} nm
      </text>
      <text x={W - 3} y={H - 3} fontSize={10} fill="var(--muted)" textAnchor="end">
        {info.cell} nm
      </text>
    </svg>
  );
}
