import { useEffect } from 'react';
import { useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { AppNode, CombineData, CombineNode, DbrCavity, DbrData, DbrNode, DbrPeriodLayer, ReverseData, ReverseNode } from '../types.ts';
import { useConnected } from './hooks.ts';
import { Messages, NumInput, OutPort, Port } from './ui.tsx';

// Drop edges into handles that no longer exist.
function useDropEdges(id: string) {
  const { setEdges } = useReactFlow<AppNode>();
  return (handles: string[]) =>
    setEdges((eds) => eds.filter((e) => !(e.target === id && handles.includes(e.targetHandle ?? ''))));
}

function StackSummary({ rows }: { rows?: string[] }) {
  if (!rows?.length) return null;
  return (
    <div className="stack-rows">
      {rows.map((r, i) => (
        <div key={i} className="val">{r}</div>
      ))}
    </div>
  );
}

// A material input port showing what is connected.
function MediumPort({ id, label, hint }: { id: string; label: string; hint: string }) {
  const connected = useConnected(id);
  return (
    <div className="port-row">
      <Port kind="target" id={id} port="material" />
      <span className="muted">{label}</span>
      <span className="val muted">{connected ? 'connected' : hint}</span>
    </div>
  );
}

export function CombineNodeView({ id, data }: NodeProps<CombineNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<CombineData>) => updateNodeData(id, patch);
  const updateNodeInternals = useUpdateNodeInternals();
  const dropEdges = useDropEdges(id);
  const result = useNodeResult(id);
  const items = (result?.info?.items ?? []) as (string | null)[];
  useEffect(() => updateNodeInternals(id), [id, data.count, data.thick, updateNodeInternals]);
  const backRows = (result?.info?.rows as string[] | undefined)?.filter((r) => r.startsWith('back:')) ?? [];

  const setCount = (n: number) => {
    if (n < 1 || n > 30) return;
    if (n < data.count) dropEdges([`item-${data.count - 1}`]);
    set({ count: n });
  };

  return (
    <div className="node node-combine">
<label>
        Name
        <input className="nodrag" value={data.name} placeholder="Combine stack" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <MediumPort id="incident" label="Incident medium" hint="from first item" />
      <div className="section">Items (top → bottom)</div>
      {Array.from({ length: data.count }, (_, i) => (
        <div className="port-row" key={i}>
          <Port kind="target" id={`item-${i}`} port="layer" />
          <span className="role">{i + 1}</span>
          {items[i] ? <span className="val">{items[i]}</span> : <span className="val muted">empty</span>}
        </div>
      ))}
      <div className="row btns">
        <button className="nodrag" onClick={() => setCount(data.count - 1)}>− item</button>
        <button className="nodrag" onClick={() => setCount(data.count + 1)}>+ item</button>
      </div>
      <MediumPort id="exit" label={data.thick ? 'Substrate' : 'Exit medium'} hint="from last item" />
      <label className="radio" title="A plate of finite thickness (mm): no interference inside it; its back side can be coated">
        <input
          className="nodrag"
          type="checkbox"
          checked={!!data.thick}
          onChange={(e) => {
            if (!e.target.checked) dropEdges(['back', 'backMedium']);
            set({ thick: e.target.checked, dSub: data.dSub ?? 1 });
          }}
        />
        thick substrate (incoherent)
      </label>
      {data.thick && (
        <>
          <label className="radio">
            thickness [mm] <NumInput className="short" value={data.dSub ?? 1} min={0} step={0.1} onChange={(dSub) => set({ dSub })} />
          </label>
          <div className="port-row">
            <Port kind="target" id="back" port="stack" />
            <span className="muted">Back coating (from the substrate outwards)</span>
          </div>
          {backRows.length > 0 && <div className="val muted small">{backRows.length} back layer(s)</div>}
          <MediumPort id="backMedium" label="Back medium" hint="as incident" />
        </>
      )}
      <Messages result={result} />
      <OutPort label="stack" port="stack" />
    </div>
  );
}

export function DbrNodeView({ id, data }: NodeProps<DbrNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<DbrData>) => updateNodeData(id, patch);
  const updateNodeInternals = useUpdateNodeInternals();
  const dropEdges = useDropEdges(id);
  const result = useNodeResult(id);
  const info = result?.info ?? {};
  const thick = (info.thickness ?? []) as (number | undefined)[];
  const cavThick = (info.cavities ?? []) as (number | undefined)[];
  const names = (info.names ?? []) as string[];
  const cavNames = (info.cavityNames ?? []) as string[];
  const twoD = (info.twoD ?? []) as boolean[];
  const cavTwoD = (info.cavityTwoD ?? []) as boolean[];
  const l0Swept = useConnected('lambda0');
  const nSwept = useConnected('periods');
  const cavSwept = useConnected('cavd');
  // Handles appear with the layer modes (thickness sweep ports): React Flow must re-measure them.
  const handleKey = `${data.period.map((p) => p.mode).join()}|${twoD.join()}|${data.cavities.length}`;
  useEffect(() => updateNodeInternals(id), [id, handleKey, updateNodeInternals]);

  const setLayer = (j: number, patch: Partial<DbrPeriodLayer>) =>
    set({ period: data.period.map((p, k) => (k === j ? { ...p, ...patch } : p)) });
  const setCavity = (i: number, patch: Partial<DbrCavity>) =>
    set({ cavities: data.cavities.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const letter = (j: number) => String.fromCharCode(65 + j);

  return (
    <div className="node node-dbr">
<label>
        Name
        <input className="nodrag" value={data.name} placeholder="DBR" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <MediumPort id="incident" label="Incident medium" hint="none (optional)" />

      <div className="section">Period</div>
      {data.period.map((p, j) => (
        <PeriodRow
          key={j}
          j={j}
          p={p}
          name={names[j]}
          twoD={twoD[j]}
          d={thick[j]}
          onChange={(patch) => {
            // λ₀/4 layers have no thickness sweep: drop its connection
            if (patch.mode === 'qw' && !twoD[j]) dropEdges([`d${j}`]);
            setLayer(j, patch);
          }}
        />
      ))}
      <div className="row btns">
        <button className="nodrag" disabled={data.period.length <= 1} onClick={() => {
          dropEdges([`p${data.period.length - 1}`, `d${data.period.length - 1}`]);
          set({ period: data.period.slice(0, -1) });
        }}>− layer</button>
        <button className="nodrag" onClick={() => set({ period: [...data.period, { mode: 'qw', d: 100, label: '', layers2D: 1 }] })}>+ layer</button>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.closing} onChange={(e) => set({ closing: e.target.checked })} />
          closing {letter(0)}
        </label>
      </div>
      <div className="port-row">
        <Port kind="target" id="periods" port="sweep-number" />
        <label>
          Periods N
          {nSwept ? <span className="val swept">swept</span> : <NumInput className="short" value={data.periods} min={1} step={1} onChange={(periods) => set({ periods })} />}
        </label>
      </div>
      <div className="port-row">
        <Port kind="target" id="lambda0" port="sweep-number" />
        <label title={info.usesL0 === false ? 'No layer uses λ₀: every thickness is in nm' : 'Sets the λ₀/4 layers and the m·λ₀/2 cavities'}>
          <span className={info.usesL0 === false ? 'muted' : ''}>Design λ₀ [nm]{info.usesL0 === false ? ' (not used)' : ''}</span>
          {l0Swept ? <span className="val swept">swept</span> : <NumInput className="short" value={data.lambda0} min={1} onChange={(lambda0) => set({ lambda0 })} />}
        </label>
      </div>

      <div className="section">Cavities</div>
      {data.cavities.map((c, i) => (
        <CavityRow
          key={i}
          i={i}
          c={c}
          name={cavNames[i]}
          twoD={cavTwoD[i]}
          d={cavThick[i]}
          thicknessSwept={cavSwept}
          onChange={(patch) => setCavity(i, patch)}
        />
      ))}
      <div className="row btns">
        <button className="nodrag" disabled={!data.cavities.length} onClick={() => {
          const i = data.cavities.length - 1;
          dropEdges([`c${i}`, `pos${i}`]);
          set({ cavities: data.cavities.slice(0, -1) });
        }}>− cavity</button>
        <button className="nodrag" onClick={() => set({ cavities: [...data.cavities, { after: Math.ceil(data.periods / 2), mode: 'half', d: 200, m: 1, layers2D: 1 }] })}>
          + cavity
        </button>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.mirrorAfterCavity} onChange={(e) => set({ mirrorAfterCavity: e.target.checked })} />
          mirror order after cavity
        </label>
      </div>
      {data.cavities.length > 0 && (
        <div className="port-row">
          <Port kind="target" id="cavd" port="sweep-number" />
          <span className="muted">Cavity thickness sweep [nm] {cavSwept && <span className="val swept">(connected)</span>}</span>
        </div>
      )}

      <MediumPort id="exit" label="Exit medium" hint="none (optional)" />
      <StackSummary rows={info.rows as string[] | undefined} />
      {(info.variants as number) > 1 && <div className="hint">{String(info.variants)} structure variants</div>}
      <Messages result={result} />
      <OutPort label="stack" port="stack" />
    </div>
  );
}

// One layer of the period: material port, λ₀/4 or nm (or number of 2D layers), and a thickness sweep port when in nm.
function PeriodRow(props: { j: number; p: DbrPeriodLayer; name?: string; twoD?: boolean; d?: number; onChange: (patch: Partial<DbrPeriodLayer>) => void }) {
  const { j, p, name, twoD, d, onChange } = props;
  const letter = String.fromCharCode(65 + j);
  const swept = useConnected(`d${j}`);
  const sweepable = twoD || p.mode === 'nm';
  return (
    <>
      <div className="port-row dbr-row">
        <Port kind="target" id={`p${j}`} port="material" />
        <b>{letter}</b>
        <span className="val mat">{name || <span className="muted">connect material</span>}</span>
        {twoD ? (
          <>
            {swept ? <span className="val swept">layers swept</span> : <NumInput className="tiny" value={p.layers2D} min={1} step={1} onChange={(layers2D) => onChange({ layers2D })} />}
            <span className="muted">layers</span>
            {!swept && <span className="val">{d !== undefined ? `${d.toFixed(2)} nm` : ''}</span>}
          </>
        ) : (
          <>
            <select className="nodrag" value={p.mode} onChange={(e) => onChange({ mode: e.target.value as DbrPeriodLayer['mode'] })}>
              <option value="qw">λ₀/4</option>
              <option value="nm">nm</option>
            </select>
            {p.mode === 'nm' ? (
              swept ? <span className="val swept">d swept</span> : <NumInput className="short" value={p.d} min={0} onChange={(v) => onChange({ d: v })} />
            ) : (
              <span className="val">{d !== undefined ? `${d.toFixed(1)} nm` : ''}</span>
            )}
          </>
        )}
      </div>
      {sweepable && (
        <div className="port-row sub-port">
          <Port kind="target" id={`d${j}`} port="sweep-number" />
          <span className="muted">
            ↳ {letter} {twoD ? 'number of layers' : 'thickness [nm]'} sweep {swept && <span className="val swept">(connected)</span>}
          </span>
        </div>
      )}
    </>
  );
}

function CavityRow(props: {
  i: number;
  c: DbrCavity;
  name?: string;
  twoD?: boolean;
  d?: number;
  thicknessSwept: boolean;
  onChange: (patch: Partial<DbrCavity>) => void;
}) {
  const { i, c, name, twoD, d, thicknessSwept, onChange } = props;
  const posSwept = useConnected(`pos${i}`);
  return (
    <>
      <div className="port-row dbr-row">
        <Port kind="target" id={`c${i}`} port="material" />
        <b>C{i + 1}</b>
        <span className="val mat">{name || <span className="muted">connect material</span>}</span>
        {thicknessSwept ? (
          <span className="val swept">{twoD ? 'layers swept' : 'd swept'}</span>
        ) : twoD ? (
          <>
            <NumInput className="tiny" value={c.layers2D} min={1} step={1} onChange={(layers2D) => onChange({ layers2D })} />
            <span className="muted">layers</span>
            {d !== undefined && <span className="val">{d.toFixed(2)} nm</span>}
          </>
        ) : (
          <>
            <select className="nodrag" value={c.mode} onChange={(e) => onChange({ mode: e.target.value as DbrCavity['mode'] })}>
              <option value="half">m·λ₀/2</option>
              <option value="nm">nm</option>
            </select>
            {c.mode === 'nm' ? (
              <NumInput className="short" value={c.d} min={0} onChange={(v) => onChange({ d: v })} />
            ) : (
              <NumInput className="tiny" value={c.m} min={1} step={1} onChange={(m) => onChange({ m })} />
            )}
            {c.mode === 'half' && d !== undefined && <span className="val">{d.toFixed(1)} nm</span>}
          </>
        )}
      </div>
      <div className="port-row dbr-row sub">
        <Port kind="target" id={`pos${i}`} port="sweep-number" />
        <span className="muted">after period</span>
        {posSwept ? <span className="val swept">swept</span> : <NumInput className="tiny" value={c.after} min={0} step={1} onChange={(after) => onChange({ after })} />}
      </div>
    </>
  );
}

// Reverses the order of the layers (the last becomes the first), e.g. to illuminate a structure from the other side.
export function ReverseNodeView({ id, data }: NodeProps<ReverseNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<ReverseData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const rows = (result?.info?.rows ?? []) as string[];
  return (
    <div className="node node-reverse">
      <div className="port-row">
        <Port kind="target" id="in" port="stack" />
        <span className="muted">stack</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="Reverse stack" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="radio" title="Light then comes from the other side: the exit medium becomes the incident one">
        <input className="nodrag" type="checkbox" checked={data.swapMedia} onChange={(e) => set({ swapMedia: e.target.checked })} />
        also swap incident and exit media
      </label>
      {rows.length > 0 && (
        <div className="stack-rows">
          {rows.map((r, i) => (
            <div key={i}>{r}</div>
          ))}
        </div>
      )}
      <Messages result={result} />
      <OutPort label="stack" port="stack" />
    </div>
  );
}
