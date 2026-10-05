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
  const tmm = data.tmm ?? 'profile';
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
      <label title="How much this interface copies the rough interface before it (on the incident side), e.g. a film that replicates its substrate: 0 = independent, 1 = the same shape (conformal). Empty: automatic — a film thinner than the sum of the two RMS heights is conformal, a thicker one independent.">
        Follows the interface before
        <NumInput className="tiny" value={data.corr ?? NaN} placeholder="auto" min={0} step={0.1} onChange={(corr) => set({ corr })} />
      </label>
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
      <label title="How Compute TMM (and Berreman) describes the rough zone. This profile: the slices of the realization above (it changes with the seed and the cell). Ensemble: the heights of a Gaussian distribution of the same RMS — the limit of a large illuminated area, no seed, smooth for optimizers. Linear ramp: a uniform distribution (the fractions, and with “linear in n” the index, change linearly across the zone). Compute RCWA always computes the profile.">
        TMM zone
        <select className="nodrag" value={tmm} onChange={(e) => set({ tmm: e.target.value as RoughData['tmm'] })}>
          <option value="ensemble">ensemble (Gaussian heights)</option>
          <option value="ramp">linear ramp</option>
          <option value="profile">this profile (seed)</option>
        </select>
      </label>
      <div className="row wrap">
        <label title="Horizontal slices of the rough zone (overlapping rough interfaces add their slices)">
          Slices
          <NumInput className="tiny" value={data.slices} min={1} step={1} onChange={(slices) => set({ slices })} />
        </label>
        <label title="Compute TMM: each slice becomes an effective medium of its material fractions. Bruggeman, shape of the features: a Bruggeman medium per direction with the depolarization factors of features σ high and cl wide — between the two Wiener bounds, follows RCWA of the smooth profile (rough gold: the SPR dip within ~0.1°; recommended). Wiener, horizontal laminae: in-plane the weighted mean of ε, along the normal the harmonic one (a very gentle surface; to first order the roughness disappears). Wiener, vertical walls: the reverse (columnar roughness). The tensor media run through Berreman. Compute RCWA uses the profile itself.">
          TMM medium
          <select className="nodrag" value={data.ema} onChange={(e) => set({ ema: e.target.value as RoughData['ema'] })}>
            <option value="shape">Bruggeman, shape of the features (σ/cl)</option>
            <option value="bruggeman">Bruggeman (isotropic)</option>
            <option value="maxwell-garnett">Maxwell-Garnett</option>
            <option value="looyenga">Looyenga</option>
            <option value="linear">linear in n</option>
            <option value="wiener">Wiener, horizontal laminae</option>
            <option value="aniso">Wiener, vertical walls</option>
          </select>
        </label>
        {data.ema === 'shape' && (
          <select className="nodrag" value={data.surf ?? '1d'} title="The features: ridges of a 1D profile (the profile of this node, as Compute RCWA sees it; checked against RCWA) or bumps of a surface rough in both directions (a real film; spheroids, not checkable by the 1D RCWA)" onChange={(e) => set({ surf: e.target.value as RoughData['surf'] })}>
            <option value="1d">1D profile (ridges)</option>
            <option value="2d">2D surface (bumps)</option>
          </select>
        )}
      </div>
      {tmm !== 'profile' && (
        <div className="hint">
          Compute TMM: {tmm === 'ramp' ? `a uniform height distribution${data.kind === 'rms' ? ` over 2√3·RMS = ${(2 * Math.sqrt(3) * data.size).toFixed(2)} nm` : ' over the peak-to-peak height'}` : 'a Gaussian height distribution (RMS = σ)'}; the seed, the cell and cl only shape the profile of Compute RCWA.
        </div>
      )}
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
