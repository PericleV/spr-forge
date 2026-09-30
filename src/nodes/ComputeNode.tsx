import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult, useProgress } from '../engine/engine.ts';
import type { ComputeInfo } from '../engine/evaluate.ts';
import { polChoice, polPatch } from './pol.ts';
import type { AppNode, ComputeData, ComputeNode } from '../types.ts';
import { useConnected } from './hooks.ts';
import { Messages, NumInput, OutPort, Port } from './ui.tsx';

export function ComputeNodeView({ id, data }: NodeProps<ComputeNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const result = useNodeResult(id);
  const progress = useProgress(id);
  const info = result?.info as ComputeInfo | undefined;
  const out = result?.outs.out;
  const ready = out?.type === 'data' && out.dataset && !out.pending;
  const set = (patch: Partial<ComputeData>) => updateNodeData(id, patch);
  const phiSwept = useConnected('phi');

  return (
    <div className="node node-compute">
<label>
        Name
        <input className="nodrag" value={data.name} placeholder="TMM" onChange={(e) => updateNodeData(id, { name: e.target.value })} />
      </label>

      <div className="port-row">
        <Port kind="target" id="stack" port="stack" />
        Stack
      </div>
      {info?.stackRows && (
        <div className="stack-rows">
          {info.stackRows.map((r, i) => (
            <div key={i} className="val">{r}</div>
          ))}
        </div>
      )}
      <div className="port-row">
        <Port kind="target" id="lambda" port="param-lambda" />
        λ {info?.lambdaText && <span className="val">{info.lambdaText}</span>}
      </div>
      <div className="port-row">
        <Port kind="target" id="theta" port="param-theta" />
        θ {info?.thetaText && <span className="val">{info.thetaText}</span>}
      </div>
      <div className="port-row">
        <Port kind="target" id="phi" port="sweep-number" />
        <label title="Azimuth of the plane of incidence, from x. It matters only with anisotropic layers (the optic axis has a direction in the plane); isotropic films give the same result at any φ.">
          <span>Azimuth φ [°]{phiSwept && <span className="val swept"> swept</span>}</span>
          {!phiSwept && <NumInput className="short" value={data.phi ?? 0} step={5} onChange={(phi) => set({ phi: Number.isFinite(phi) ? phi : 0 })} />}
        </label>
      </div>
      <div className="port-row">
        <Port kind="target" id="pol" port="sweep-polarization" />
        Polarization
        {info?.polSwept ? (
          <span className="val swept">swept (p, s)</span>
        ) : (
          <select
            className="nodrag"
            value={polChoice(data.polMix, data.polarization)}
            onChange={(e) => set(polPatch(e.target.value, data.polMix))}
          >
            <option value="p">TM (p)</option>
            <option value="s">TE (s)</option>
            <option value="cp">σ+ circular (helicity +1)</option>
            <option value="cm">σ− circular (helicity −1)</option>
            <option value="jones">Jones (ψ, δ)</option>
          </select>
        )}
      </div>
      {data.polMix && !info?.polSwept && polChoice(data.polMix, data.polarization) === 'jones' && (
        <div className="row wrap" title="Incident field E = cos ψ p̂ + sin ψ e^{iδ} ŝ (unit power): ψ = 0 TM, 90° TE; ψ = 45° with δ = ±90°: circular. The outputs give the TE / TM parts of R and T.">
          <label className="radio">ψ <NumInput className="tiny" value={data.polMix.psi} step={5} onChange={(psi) => set({ polMix: { ...data.polMix!, psi } })} /> °</label>
          <label className="radio">δ <NumInput className="tiny" value={data.polMix.delta} step={15} onChange={(delta) => set({ polMix: { ...data.polMix!, delta } })} /> °</label>
          <span className="hint">ψ = 45°, δ = ±90°: circular</span>
        </div>
      )}
      {info?.berreman && <div className="hint">Berreman 4×4 (anisotropic layers{data.polMix ? ', Jones / circular state' : ''}): R, T also split into TE / TM and circular σ± parts.</div>}

      <Messages result={result} />
      {result?.pending && (
        <div className="msg busy">
          Computing… {progress !== undefined && `${Math.round(progress * 100)}%`}
          <div className="bar" style={{ width: `${(progress ?? 0) * 100}%` }} />
        </div>
      )}
      {ready && info && (
        <div className="msg okay">
          ✓ R, T, A{info.berreman ? ', TE / TM and σ± parts' : ''}{data.polMix ? '' : ', φr, φt'} · {info.dims} ({info.size?.toLocaleString('en')} pts)
        </div>
      )}
      {ready && info?.gdNote && <div className="hint">{info.gdNote}</div>}
      <OutPort label="data" port="data" />
    </div>
  );
}
