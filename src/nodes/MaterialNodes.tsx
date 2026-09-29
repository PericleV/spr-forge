import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { useLibrary } from '../library/context.ts';
import { validRange } from '../physics/materials.ts';
import type { AnisoData, AnisoNode, AppNode, LayerData, LayerNode, MaterialData, MaterialNode, MaterialSweepNode } from '../types.ts';
import { useConnected } from './hooks.ts';
import { ColorField, MaterialSelect, Messages, NumInput, OutPort, Port } from './ui.tsx';

const TYPE_TEXT: Record<string, string> = {
  constant: 'constant n, k',
  tabulated: 'tabulated n, k',
  formula: 'dispersion formula',
  'drude-lorentz': 'Drude-Lorentz',
  ema: 'porous (effective medium)',
  'drude-carrier': 'doped semiconductor (Drude, carrier density)',
};

export function MaterialNodeView({ id, data }: NodeProps<MaterialNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<MaterialData>) => updateNodeData(id, patch);
  const { lib } = useLibrary();
  const result = useNodeResult(id);
  const def = lib.get(data.materialId);
  const range = def && validRange(def.id, lib);
  const swept = result?.info?.swept as number | undefined;
  const poresSwept = result?.info?.poresSwept as number | undefined;
  const color = data.color || def?.color || '#999999';
  const porous = def?.model.type === 'ema' ? def.model : undefined;
  const doped = def?.model.type === 'drude-carrier' ? def.model : undefined;

  return (
    <div className="node node-material">
      <MaterialSelect value={data.materialId} onChange={(materialId) => set({ materialId, color: lib.get(materialId)?.color ?? data.color })} />
      {def && (
        <div className="hint">
          {TYPE_TEXT[def.model.type]}
          {def.monolayer ? ` · 2D (${def.monolayer} nm/layer)` : ''}
          {range && Number.isFinite(range[1]) ? ` · ${+range[0].toFixed(0)}–${+range[1].toFixed(0)} nm` : ''}
        </div>
      )}
      <ColorField label="colour in drawings" title="Used by View Stack and wherever this material appears" value={color} onChange={(c) => set({ color: c })} />
      <div className="port-row">
        <Port kind="target" id="n" port="sweep-number" />
        <label>
          <span className="muted">Index sweep {swept !== undefined && <span className="val swept">({swept})</span>}</span>
          <select className="nodrag" value={data.indexMode} onChange={(e) => set({ indexMode: e.target.value as MaterialData['indexMode'] })}>
            <option value="absolute">sets n</option>
            <option value="offset">adds Δn</option>
          </select>
        </label>
      </div>
      {porous && (
        <div className="port-row">
          <Port kind="target" id="p" port="sweep-number" />
          <label>
            <span title="Volume fraction of pores, filled with the filler material; the effective index is recomputed">
              Pore fraction {poresSwept !== undefined && <span className="val swept">(swept {poresSwept})</span>}
            </span>
            {poresSwept === undefined && (
              <NumInput
                value={Number.isFinite(data.porosity) ? data.porosity : porous.porosity}
                min={0}
                step={0.01}
                onChange={(porosity) => set({ porosity })}
              />
            )}
          </label>
        </div>
      )}
      {porous && (
        <label title="What fills the pores. A neighbouring layer: its index as computed at every step (index sweeps, the Δn of a Sensitivity analysis), so the porous layer follows it — e.g. porous gold under water, with water swept.">
          <span className="muted">pores filled with</span>
          <select className="nodrag pores-fill" value={data.poresFill ?? 'library'} onChange={(e) => set({ poresFill: e.target.value as MaterialData['poresFill'] })}>
            <option value="library">{lib.get(porous.filler)?.name ?? porous.filler} (library)</option>
            <option value="prev">the layer before (incident side)</option>
            <option value="next">the layer after (exit side)</option>
          </select>
        </label>
      )}
      {doped && (
        <div className="port-row">
          <Port kind="target" id="p" port="sweep-number" />
          <label>
            <span title="Carrier density of the doped semiconductor (Drude); connect a Design variable to optimize it">
              Carrier density N [10²⁰ cm⁻³] {poresSwept !== undefined && <span className="val swept">(swept {poresSwept})</span>}
            </span>
            {poresSwept === undefined && <NumInput value={Number.isFinite(data.porosity) ? data.porosity : doped.N} min={0} step={0.1} onChange={(porosity) => set({ porosity })} />}
          </label>
        </div>
      )}
      <Messages result={result} />
      <OutPort label="material" port="material" />
    </div>
  );
}

export function MaterialSweepNodeView({ id, data }: NodeProps<MaterialSweepNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const result = useNodeResult(id);
  const names = (result?.info?.names ?? []) as string[];
  return (
    <div className="node node-matsweep">
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => updateNodeData(id, { name: e.target.value })} />
      </label>
      <div className="port-row">
        <Port kind="target" id="in" port="material" />
        <span className="muted">materials</span>
        <span className="val">{names.length ? names.join(', ') : '—'}</span>
      </div>
      <div className="hint">Connect several Material nodes; the output steps through them.</div>
      <Messages result={result} />
      <OutPort label="material" port="material" />
    </div>
  );
}

// principal indices (uniaxial: n_o, n_e; biaxial: n₁, n₂, n₃) and the orientation angles
const ANISO_PORTS = { uniaxial: [['o', 'n_o (ordinary)'], ['e', 'n_e (extraordinary)']], biaxial: [['o', 'n₁ (along x′)'], ['e', 'n₂ (along y′)'], ['z', 'n₃ (along z′)']] } as const;
const ANISO_ANGLES = {
  uniaxial: [
    ['Tilt θ_c [°]', 'Angle of the optic axis from the layer plane: 0° in-plane, 90° along the normal (z)'],
    ['Azimuth φ_c [°]', 'Direction of the optic axis in the layer plane, from x (the plane of incidence at φ = 0)'],
  ],
  biaxial: [
    ['α [°]', 'Euler z-x-z: the principal axes turned by α about z'],
    ['β [°]', 'then tilted by β about the new x'],
    ['γ [°]', 'then turned by γ about the new z'],
  ],
} as const;

export function AnisoNodeView({ id, data }: NodeProps<AnisoNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<AnisoData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const comps = (result?.info?.comps ?? []) as string[];
  const swept = (result?.info?.swept ?? []) as boolean[];
  const kind = data.kind === 'biaxial' ? 'biaxial' : 'uniaxial';
  return (
    <div className="node node-aniso">
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        Type
        <select className="nodrag" value={kind} onChange={(e) => set({ kind: e.target.value as AnisoData['kind'] })}>
          <option value="uniaxial">uniaxial (n_o, n_e)</option>
          <option value="biaxial">biaxial (n₁, n₂, n₃)</option>
        </select>
      </label>
      {ANISO_PORTS[kind].map(([h, text], k) => (
        <div className="port-row" key={h}>
          <Port kind="target" id={h} port="material" />
          <span className="muted">{text}</span>
          <span className="val">{comps[k] ?? '—'}</span>
        </div>
      ))}
      {ANISO_ANGLES[kind].map(([text, tip], k) => (
        <div className="port-row" key={k}>
          <Port kind="target" id={`a${k}`} port="sweep-number" />
          <label title={tip}>
            {text}
            {swept[k] ? (
              <span className="val swept">swept</span>
            ) : (
              <NumInput value={data.angles[k] ?? 0} step={1} onChange={(v) => set({ angles: [0, 1, 2].map((j) => (j === k ? v : (data.angles[j] ?? 0))) })} />
            )}
          </label>
        </div>
      ))}
      <ColorField label="colour in drawings" title="Used by View Stack and wherever this material appears" value={data.color} onChange={(c) => set({ color: c })} />
      <div className="hint">Into a Layer; computed by the Berreman 4×4 method.</div>
      <Messages result={result} />
      <OutPort label="material" port="material" />
    </div>
  );
}

export function LayerNodeView({ id, data }: NodeProps<LayerNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<LayerData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const mono = result?.info?.mono as number | undefined;
  const swept = result?.info?.swept as number | undefined;
  const dSwept = useConnected('d');
  const aniso = !!result?.info?.aniso;
  const lcSlices = result?.info?.lcSlices as number | undefined;
  const pitchSet = Number.isFinite(data.pitch) && data.pitch !== 0;
  const helixSense = Math.sign(pitchSet ? data.pitch! : (data.twist ?? 0)) || 0;

  return (
    <div className="node node-layer">
      <label>
        Label
        <input className="nodrag" value={data.label} placeholder="optional" onChange={(e) => set({ label: e.target.value })} />
      </label>
      <div className="port-row">
        <Port kind="target" id="mat" port="material" />
        <span className="muted">Material</span>
        <span className="val">{(result?.info?.matText as string | undefined) ?? '—'}</span>
      </div>
      <div className="port-row">
        <Port kind="target" id="d" port="sweep-number" />
        <label>
          {mono ? 'Layers (2D)' : 'Thickness [nm]'}
          {dSwept ? (
            <span className="val swept">swept ({swept ?? '—'})</span>
          ) : mono ? (
            <NumInput value={data.layers2D} min={1} step={1} onChange={(layers2D) => set({ layers2D })} />
          ) : (
            <NumInput value={data.thickness} min={0} step={1} onChange={(thickness) => set({ thickness })} />
          )}
        </label>
      </div>
      {mono && !dSwept && <div className="hint">= {+(data.layers2D * mono).toFixed(3)} nm ({mono} nm per layer)</div>}
      {aniso && (
        <>
          <label title="Cholesteric pitch: the director turns 360° over this length; > 0 right-handed, < 0 left-handed. Set, it replaces the twist and follows a swept thickness. Empty: use the twist.">
            Pitch [nm]
            <NumInput value={data.pitch ?? NaN} step={1} placeholder="(twist)" onChange={(pitch) => set({ pitch })} />
          </label>
          <label title="Liquid crystals: the director turns about z by this angle from the top face (incident side) to the bottom face; 0 = uniform">
            Twist [°]
            <NumInput value={pitchSet ? +((360 * data.thickness) / data.pitch!).toFixed(3) : (data.twist ?? 0)} step={1} disabled={pitchSet} onChange={(twist) => set({ twist })} />
          </label>
          {helixSense !== 0 && (
            <div className="hint">
              {helixSense > 0 ? 'Right' : 'Left'}-handed helix: at normal incidence it Bragg-reflects {helixSense > 0 ? 'σ−' : 'σ+'} circular light (helicity {helixSense > 0 ? '−1' : '+1'}) and passes {helixSense > 0 ? 'σ+' : 'σ−'}.
            </div>
          )}
          <label title="The tilt of the optic axis at the bottom face (it goes linearly from the material's tilt at the top); empty = constant">
            Tilt at bottom [°]
            <NumInput value={data.tiltEnd ?? NaN} step={1} placeholder="constant" onChange={(tiltEnd) => set({ tiltEnd })} />
          </label>
          {lcSlices !== undefined && (
            <label title="A pure twist is solved exactly at normal incidence; at oblique incidence, or with a tilt profile, the layer is cut into this many uniform sublayers; empty = auto (one per 4.5° of twist, at least 20)">
              Sublayers
              <NumInput value={data.slices ?? NaN} min={1} step={1} placeholder={`auto (${lcSlices})`} onChange={(slices) => set({ slices })} />
            </label>
          )}
        </>
      )}
      <Messages result={result} />
      <OutPort label="layer" port="layer" />
    </div>
  );
}
