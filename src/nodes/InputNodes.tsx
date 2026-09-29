import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { Quantity, SweepKind } from '../engine/types.ts';
import type { AppNode, ParamData, ParamNode, SweepData, SweepNode } from '../types.ts';
import { Messages, NumInput, OutPort, Radios } from './ui.tsx';

// The spacing of a range: its step, or its number of values (ends included; the step is then shown).
function RangeSpacing(props: { by?: 'step' | 'count'; step: number; count?: number; min: number; max: number; unit?: string; stepStep: number; onChange: (patch: { by?: 'step' | 'count'; step?: number; count?: number }) => void }) {
  const { by = 'step', step, count, min, max, unit, stepStep, onChange } = props;
  const n = count ?? Math.max(2, Math.floor((max - min) / step + 1e-9) + 1);
  const derived = n > 1 ? (max - min) / (n - 1) : 0;
  return (
    <>
      <label>
        <select className="nodrag spacing" value={by} onChange={(e) => onChange(e.target.value === 'count' ? { by: 'count', count: n } : { by: 'step' })}>
          <option value="step">Step{unit ? ` [${unit}]` : ''}</option>
          <option value="count">No. of values</option>
        </select>
        {by === 'count' ? (
          <NumInput value={n} min={1} step={1} onChange={(v) => onChange({ count: Math.round(v) })} />
        ) : (
          <NumInput value={step} step={stepStep} onChange={(v) => onChange({ step: v })} />
        )}
      </label>
      {by === 'count' && Number.isFinite(derived) && n > 1 && <div className="hint">step = {+derived.toPrecision(6)}{unit ? ` ${unit}` : ''} (ends included)</div>}
    </>
  );
}

const PARAM_DEFAULTS: Record<Quantity, Omit<ParamData, 'quantity' | 'mode'>> = {
  theta: { value: 60, min: 40, max: 85, step: 0.05 },
  lambda: { value: 633, min: 500, max: 1000, step: 1 },
};

export function ParamNodeView({ id, data }: NodeProps<ParamNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ParamData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const theta = data.quantity === 'theta';
  const unit = theta ? '°' : 'nm';
  const sym = theta ? 'θ' : 'λ';
  const field = (key: 'value' | 'min' | 'max', label: string) => (
    <label>
      {label} [{unit}]
      <NumInput value={data[key]} step={1} onChange={(v) => set({ [key]: v })} />
    </label>
  );

  return (
    <div className={`node node-param ${theta ? 'q-theta' : 'q-lambda'}`}>
      <Radios<Quantity>
        name={`${id}-q`}
        value={data.quantity}
        options={[['theta', 'Angle θ'], ['lambda', 'Wavelength λ']]}
        onChange={(quantity) => set({ quantity, ...PARAM_DEFAULTS[quantity] })}
      />
      <Radios<ParamData['mode']>
        name={`${id}-m`}
        value={data.mode}
        options={[['constant', 'Constant'], ['range', 'Range']]}
        onChange={(mode) => set({ mode })}
      />
      {data.mode === 'constant' ? (
        field('value', sym)
      ) : (
        <>
          {field('min', `${sym} min`)}
          {field('max', `${sym} max`)}
          <RangeSpacing by={data.by} step={data.step} count={data.count} min={data.min} max={data.max} unit={unit} stepStep={theta ? 0.01 : 0.1} onChange={set} />
          {result?.info?.count !== undefined && <div className="hint">{String(result.info.count)} points</div>}
        </>
      )}
      <Messages result={result} />
      <OutPort label={sym} port={`param-${data.quantity}`} />
    </div>
  );
}

export function SweepNodeView({ id, data }: NodeProps<SweepNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<SweepData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);

  return (
    <div className="node node-sweep">
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Radios<SweepKind>
        name={`${id}-k`}
        value={data.kind}
        options={[['number', 'Numeric'], ['polarization', 'Polarization']]}
        onChange={(kind) => set({ kind })}
      />
      {data.kind === 'number' && (
        <>
          <Radios<SweepData['mode']>
            name={`${id}-m`}
            value={data.mode}
            options={[['range', 'Range'], ['list', 'List']]}
            onChange={(mode) => set({ mode })}
          />
          {data.mode === 'range' ? (
            <>
              <label>Min <NumInput value={data.min} onChange={(min) => set({ min })} /></label>
              <label>Max <NumInput value={data.max} onChange={(max) => set({ max })} /></label>
              <RangeSpacing by={data.by} step={data.step} count={data.count} min={data.min} max={data.max} stepStep={0.1} onChange={set} />
            </>
          ) : (
            <label>
              Values
              <input className="nodrag list" value={data.list} placeholder="40, 45, 50" onChange={(e) => set({ list: e.target.value })} />
            </label>
          )}
          <div className="hint">Connect to a Layer's thickness, a Material's index, or a DBR sweep port (λ₀, periods, cavity).</div>
        </>
      )}
      {data.kind === 'polarization' && <div className="hint">Computes p (TM) and s (TE). Connect to Compute TMM's polarization port.</div>}
      {result?.info?.count !== undefined && <div className="hint">{String(result.info.count)} values</div>}
      <Messages result={result} />
      <OutPort label="sweep" port={`sweep-${data.kind}`} />
    </div>
  );
}
