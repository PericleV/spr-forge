// Binding kinetics (the reaction, its protocol and the surface it happens on) and Sensorgram (the SPR signal of it: the
// structure of a Compute TMM recomputed at every time with a binding layer, read out as the dip or R at a point; the
// instrument as in Tolerance). The Sensorgram's curves are drawn by a Plot connected to its outputs.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult, useProgress } from '../engine/engine.ts';
import { analyteOf, rsaModel, type KineticsInfo, type SensorgramInfo } from '../engine/evaluate.ts';
import { ANALYTES, footprint, MODEL_TEXT, type KineticModel } from '../engine/kinetics.ts';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { Overlay } from '../plot/overlays.ts';
import type { AppNode, KineticsData, KineticsNode, KineticsStepData, SensorgramData, SensorgramNode } from '../types.ts';
import { LocateControls } from './AnalysisNodes.tsx';
import { useConnected } from './hooks.ts';
import { InstrumentControls } from './InstrumentControls.tsx';
import { Messages, NumInput, OutPort, Port } from './ui.tsx';
import { CHART_W } from './sizes.ts';

const PALETTE = ['#2e86c1', '#e15759', '#59a14f', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#9c755f'];
const fmt = (v: number, p = 4) => (Number.isFinite(v) ? `${+v.toPrecision(p)}` : '—');

// The protocol steps as bands on a time chart (injections shaded).
const stepBands = (steps: { t0: number; t1: number; label: string; c: number }[], color: string): Overlay[] =>
  steps.flatMap((s, i) => (s.c > 0 || /regen/i.test(s.label) ? [{ kind: 'band' as const, key: `st${i}`, lo: s.t0, hi: s.t1, color, label: s.label }] : []));

// Step labels the node writes itself (renamed when the concentration changes); any other label is the user's.
const AUTO_LABELS = ['', 'buffer', 'injection'];
const autoLabel = (c: number) => (c > 0 ? 'injection' : 'buffer');

const SWEEPABLE: [KineticsData['sweepOf'], string][] = [
  ['c', 'concentration (scales the injections)'],
  ['ka', 'ka'],
  ['kd', 'kd'],
  ['rmax', 'Rmax'],
  ['kt', 'kt'],
  ['ka2', 'ka2'],
  ['kd2', 'kd2'],
  ['tau', 'τ (swelling)'],
  ['ionic', 'ionic strength'],
  ['zeta', 'ζ potential'],
];

export function KineticsNodeView({ id, data }: NodeProps<KineticsNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<KineticsData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as KineticsInfo | undefined;
  const swelling = data.model === 'swelling';
  const sweepOn = useConnected('sweep');
  const setStep = (i: number, patch: Partial<KineticsStepData>) => set({ steps: data.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const k = (label: string, key: keyof KineticsData, unit: string, step: number, title?: string) => (
    <label className="radio" title={title}>
      {label} <NumInput className="short" value={data[key] as number} step={step} onChange={(v) => set({ [key]: v } as Partial<KineticsData>)} /> <span className="muted">{unit}</span>
    </label>
  );
  const custom = data.analyte === 'custom';
  const an = analyteOf(data);
  const orient = data.orient ?? 'side';
  const rsaOk = rsaModel(data.model);
  const rsa = rsaOk && data.surface === 'rsa';
  const geo = footprint(an.dims, orient);
  const S = info?.surface;
  const series: Series[] = info?.curves.map((c, i) => ({ key: `c${i}`, label: c.label, color: PALETTE[i % PALETTE.length], y: c.y, width: 1.6 })) ?? [];
  const dim = (i: number) => (
    <NumInput className="tiny" value={an.dims[i]} step={0.5} onChange={(v) => set({ dims: an.dims.map((x, j) => (j === i ? v : x)) as [number, number, number] })} />
  );
  return (
    <div className="node node-kinetics">
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder={MODEL_TEXT[data.model]} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        Model
        <select className="nodrag" value={data.model} onChange={(e) => set({ model: e.target.value as KineticModel })}>
          {(Object.keys(MODEL_TEXT) as KineticModel[]).map((m) => (
            <option key={m} value={m}>{MODEL_TEXT[m]}</option>
          ))}
        </select>
      </label>
      <div className="section">Constants</div>
      <div className="row wrap">
        {!swelling && (
          <>
            {k(data.model === 'bivalent' || data.model === 'hetero' || data.model === 'twostate' ? 'ka1' : 'ka', 'ka', 'M⁻¹s⁻¹', 1e4, 'Association rate constant')}
            {k(data.model === 'bivalent' || data.model === 'hetero' || data.model === 'twostate' ? 'kd1' : 'kd', 'kd', 's⁻¹', 1e-4, 'Dissociation rate constant')}
            {!rsa && k(data.model === 'hetero' ? 'Rmax1' : 'Rmax', 'rmax', 'RU', 100, 'Response at saturation of the ligand sites (1000 RU ≈ 1 ng/mm²)')}
          </>
        )}
        {data.model === 'transport' && k('kt', 'kt', 'RU M⁻¹s⁻¹', 1e8, 'Mass-transport coefficient (two-compartment model): kt = km · MW · 10⁹ with km in m/s')}
        {data.model === 'bivalent' && (
          <>
            {k('ka2', 'ka2', 'RU⁻¹s⁻¹', 1e-4, 'Second binding step (to a second ligand: per RU of free ligand)')}
            {k('kd2', 'kd2', 's⁻¹', 1e-4)}
          </>
        )}
        {data.model === 'hetero' && (
          <>
            {k('ka2', 'ka2', 'M⁻¹s⁻¹', 1e4, 'The second kind of site')}
            {k('kd2', 'kd2', 's⁻¹', 1e-4)}
            {k('Rmax2', 'rmax2', 'RU', 100)}
          </>
        )}
        {data.model === 'twostate' && (
          <>
            {k('ka2', 'ka2', 's⁻¹', 1e-3, 'Forward rate of the conformational change AB → AB*')}
            {k('kd2', 'kd2', 's⁻¹', 1e-3, 'Backward rate AB* → AB')}
          </>
        )}
        {swelling && k('τ', 'tau', 's', 10, 'Time constant of the swelling: ds/dt = (s∞ − s)/τ')}
      </div>
      {!swelling && data.ka > 0 && <div className="hint">KD = kd/ka = {fmt((data.kd / data.ka) * 1e9)} nM</div>}
      <div className="port-row">
        <Port kind="target" id="sweep" port="sweep-number" />
        <span className="muted">sweep (optional)</span>
        <select className="nodrag" value={data.sweepOf} title="The constant the connected Sweep varies (one curve per value)" onChange={(e) => set({ sweepOf: e.target.value as KineticsData['sweepOf'] })}>
          {SWEEPABLE.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {sweepOn && info?.swept && <span className="val swept">{info.swept}</span>}
      </div>

      {!swelling && (
        <>
          <div className="section">Analyte</div>
          <div className="row wrap">
            <select className="nodrag" value={data.analyte} onChange={(e) => set({ analyte: e.target.value })}>
              {Object.entries(ANALYTES).map(([key, a]) => (
                <option key={key} value={key}>{a.name}</option>
              ))}
              <option value="custom">custom values</option>
            </select>
            <select className="nodrag" value={orient} title="How the molecule sits on the surface: lying (its two longest axes on the surface) or standing (its longest axis up)" onChange={(e) => set({ orient: e.target.value as KineticsData['orient'] })}>
              <option value="side">lying (side-on)</option>
              <option value="end">standing (end-on)</option>
            </select>
          </div>
          <div className="row wrap" title="Molecular weight, refractive index increment, density (1 / partial specific volume) and the dimensions a × b × c of the molecule">
            {custom ? (
              <>
                <label className="radio">MW <NumInput className="short" value={data.mw / 1000} step={1} onChange={(v) => set({ mw: v * 1000 })} /> kDa</label>
                <label className="radio">dn/dc <NumInput className="tiny" value={data.dndc} step={0.005} onChange={(dndc) => set({ dndc })} /> mL/g</label>
                <label className="radio">ρ <NumInput className="tiny" value={data.rho} step={0.05} onChange={(rho) => set({ rho })} /> g/cm³</label>
                <label className="radio">size {dim(0)} × {dim(1)} × {dim(2)} nm</label>
              </>
            ) : (
              <span className="muted">MW {fmt(an.mw / 1000)} kDa · dn/dc {an.dndc} mL/g · ρ {an.rho} g/cm³ · {an.dims.join(' × ')} nm</span>
            )}
          </div>
          <div className="hint">on the surface: {fmt(geo.height, 3)} nm high, footprint ⌀ {fmt(geo.foot, 3)} nm</div>

          <div className="section">Surface</div>
          {rsaOk && (
            <label title="Ligand sites: the analyte binds to immobilized ligands, Rmax typed (free sites Rmax − R). Free surface: the molecules adsorb anywhere and cannot overlap (random sequential adsorption): the area left shrinks faster than the free sites, and Rmax is the jamming capacity of a random monolayer.">
              binding to
              <select className="nodrag" value={rsa ? 'rsa' : 'ligand'} onChange={(e) => set({ surface: e.target.value as KineticsData['surface'] })}>
                <option value="ligand">ligand sites (Rmax)</option>
                <option value="rsa">a free surface (random adsorption)</option>
              </select>
            </label>
          )}
          <div className="row wrap">
            <label className="radio" title="Ionic strength of the buffer (1:1 salt): sets the Debye length κ⁻¹ = 0.304 nm / √I[M] of the double layer around the molecules">
              I <NumInput className="short" value={data.ionic ?? 150} step={10} onChange={(ionic) => set({ ionic })} /> mM
            </label>
            <label className="radio" title="ζ potential of the analyte molecules: bound molecules repel each other across the double layer and pack as hard discs of a larger, effective diameter (Adamczyk)">
              ζ <NumInput className="tiny" value={data.zeta ?? 0} step={5} onChange={(zeta) => set({ zeta })} /> mV
            </label>
          </div>
          {S && (
            <div className="hint">
              Debye length {fmt(S.debye, 3)} nm; repulsion gap h* {fmt(S.gap, 3)} nm → effective ⌀ {fmt(S.dEff, 3)} nm. A random monolayer is full when the molecules cover {fmt(S.thetaMax, 3)} of the
              area: Γ∞ = {fmt(S.capacity, 3)} ng/mm² ({fmt(S.capacity * 1000, 3)} RU)
              {rsa ? ' = Rmax' : info?.rmax !== undefined ? `; Rmax = ${fmt((100 * info.rmax) / (S.capacity * 1000), 3)} % of it` : ''}.
            </div>
          )}
        </>
      )}

      <div className="section">Protocol</div>
      <table className="zone-table protocol-table">
        <thead>
          <tr>
            <th>#</th>
            <th>step</th>
            <th>duration [s]</th>
            <th>{swelling ? 's∞' : 'c [nM]'}</th>
            {!swelling && <th title="Regeneration: the bound analyte is removed at the start of the step">regen.</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {data.steps.map((s, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input className="nodrag step-label" value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} /></td>
              <td><NumInput className="short" value={s.t} step={10} onChange={(t) => setStep(i, { t })} /></td>
              <td>
                {swelling ? (
                  <NumInput className="short" value={s.swell ?? 0} step={0.1} onChange={(swell) => setStep(i, { swell })} />
                ) : (
                  <NumInput className="short" value={s.c} step={10} onChange={(c) => setStep(i, { c, ...(AUTO_LABELS.includes(s.label) ? { label: autoLabel(c) } : {}) })} />
                )}
              </td>
              {!swelling && (
                <td><input className="nodrag" type="checkbox" checked={!!s.regen} onChange={(e) => setStep(i, { regen: e.target.checked || undefined })} /></td>
              )}
              <td><button className="nodrag" title="remove" onClick={() => set({ steps: data.steps.filter((_, j) => j !== i) })}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row wrap">
        <button className="nodrag" onClick={() => set({ steps: [...data.steps, { label: swelling ? 'step' : autoLabel(0), t: 120, c: 0 }] })}>+ step</button>
        <label className="radio" title="Time between the samples of the output (the integration itself is finer)">sample every <NumInput className="tiny" value={data.dt} step={1} onChange={(dt) => set({ dt })} /> s</label>
      </div>
      {swelling && <div className="hint">s∞: the relative thickness increase the layer tends to in each step (e.g. 0 in buffer, 0.5 after a pH or temperature change).</div>}
      {info && info.t.length > 1 && series.length > 0 && (
        <div className="nodrag nowheel chart">
          <LinePlot xAxis={{ id: 'time', label: 't', unit: 's', values: info.t }} series={series} yLabel={swelling ? 's' : 'R'} yUnit={swelling ? '' : 'RU'} width={CHART_W} height={180} overlays={stepBands(info.steps, '#2e86c1')} />
        </div>
      )}
      {info?.steady && info.steady.length > 0 && (
        <div className="stack-rows results">
          {info.steady.map((r, i) => (
            <div className="val" key={i}>{r}</div>
          ))}
        </div>
      )}
      <Messages result={result} />
      <OutPort label="kinetics" port="data" />
      {!swelling && (
        <div className="port-row out" title="The response at the end of every injection vs its concentration, the Langmuir isotherm fitted and (1:1 models) the fraction of its equilibrium each injection reached">
          steady state (R vs c)
          <Port kind="source" id="steady" port="data" />
        </div>
      )}
    </div>
  );
}

export function SensorgramNodeView({ id, data }: NodeProps<SensorgramNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<SensorgramData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as SensorgramInfo | undefined;
  const progress = useProgress(`${id}:sg`);
  const seedOn = useConnected('seed');
  const toExit = !data.target;
  const alongLabel = info?.along === 'lambda' ? 'λ' : 'θ';
  return (
    <div className="node node-sensorgram">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">structure (Compute TMM)</span>
      </div>
      <div className="port-row">
        <Port kind="target" id="kinetics" port="data" />
        <span className="muted">Binding kinetics</span>
        {info?.analyte && <span className="val">{info.swelling ? 'polymer swelling' : info.analyte}</span>}
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="sensorgram" onChange={(e) => set({ name: e.target.value })} />
      </label>

      <div className="section">Where the signal changes</div>
      <label>
        Target
        <select className="nodrag" value={data.target} onChange={(e) => set({ target: e.target.value })}>
          {(info?.targets ?? [{ value: '', label: 'Exit medium: a binding layer on it' }]).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      {toExit && !info?.swelling && (
        <label title="The binding layer. Monolayer → multilayer: as high as the molecule (its orientation in Binding kinetics), the bound mass filling it, up to a full random monolayer; more mass makes it thicker. Compact: all the mass as a dense layer of the analyte, d = Γ/ρ (what an SPR fit at the protein index reports).">
          layer
          <select className="nodrag" value={data.thick === 'compact' ? 'compact' : 'auto'} onChange={(e) => set({ thick: e.target.value as SensorgramData['thick'] })}>
            <option value="auto">monolayer → multilayer (from the molecule)</option>
            <option value="compact">compact (d = Γ/ρ)</option>
          </select>
        </label>
      )}
      {info?.layer && <div className="hint">{info.layer}</div>}
      <div className="row wrap">
        <label className="radio" title="How the analyte (or, for swelling, the solvent) and the layer's medium mix: linear in the index (de Feijter: n = n_buffer + dn/dc · Γ/d), or an effective medium">
          mixing
          <select className="nodrag" value={data.mixing} onChange={(e) => set({ mixing: e.target.value as SensorgramData['mixing'] })}>
            <option value="linear">linear in n (de Feijter)</option>
            <option value="bruggeman">Bruggeman</option>
            <option value="maxwell-garnett">Maxwell-Garnett</option>
          </select>
        </label>
        {!info?.swelling && (
          <label className="radio" title="The flowing analyte solution raises the bulk index of the sensing medium: Δn = dn/dc · c · MW">
            <input className="nodrag" type="checkbox" checked={data.bulk} onChange={(e) => set({ bulk: e.target.checked })} />
            bulk effect
          </label>
        )}
        <label className="radio" title="Baseline drift: the buffer index changes linearly in time (temperature: water dn/dT ≈ −1·10⁻⁴ /K), 1 µRIU = 10⁻⁶">
          drift <NumInput className="tiny" value={data.drift ?? 0} step={0.1} onChange={(drift) => set({ drift })} /> µRIU/min
        </label>
      </div>
      {info?.nP !== undefined && !info.swelling && (
        <div className="hint">
          analyte index n = {info.nP.toFixed(4)} (buffer + dn/dc · ρ, at {fmt(info.lam0 ?? NaN, 5)} nm); bound mass from the kinetics, 1000 RU = 1 ng/mm²
        </div>
      )}

      <div className="section">Read-out</div>
      <div className="row wrap">
        {(info?.axes.length ?? 0) > 1 && (
          <label className="radio">
            along
            <select className="nodrag" value={data.along || info!.along || ''} onChange={(e) => set({ along: e.target.value })}>
              {info!.axes.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
        )}
        <select className="nodrag" value={data.readout} onChange={(e) => set({ readout: e.target.value as SensorgramData['readout'] })}>
          <option value="dip">dip position</option>
          <option value="value">R at a fixed point</option>
        </select>
        {data.readout === 'value' && (
          <label className="radio">
            at {alongLabel} <NumInput className="short" value={data.at} placeholder="middle" step={0.1} onChange={(at) => set({ at })} /> {info?.unit === '°' ? '°' : info?.unit}
          </label>
        )}
        {data.readout === 'dip' && (
          <label className="radio" title="The dip found exactly between the grid points at every time (golden-section search with the transfer matrix); without detector noise">
            <input className="nodrag" type="checkbox" checked={data.track} onChange={(e) => set({ track: e.target.checked })} />
            exact dip tracking
          </label>
        )}
      </div>
      {data.readout === 'dip' && <LocateControls data={data} set={set} />}
      <label className="radio" title="The times of the kinetics computed (evenly picked, the last one kept)">max times <NumInput className="short" value={data.maxTimes} step={50} onChange={(maxTimes) => set({ maxTimes })} /></label>

      <div className="section">Instrument (measurement)</div>
      <InstrumentControls data={data} set={set} />
      <div className="port-row">
        <Port kind="target" id="seed" port="sweep-number" />
        <span className="radio" title="The realization of the detector noise (same seed = the same noise). A Sweep of seeds gives one noisy series per seed (a new axis of both outputs).">
          seed {seedOn ? <span className="val swept">swept{info?.seeds ? ` (${info.seeds})` : ''}</span> : <NumInput className="tiny" value={data.seed ?? 1} step={1} onChange={(seed) => set({ seed })} />}
        </span>
      </div>

      {result?.pending && (
        <div className="msg busy">
          Computing the sensorgram… {progress !== undefined && `${Math.round(progress * 100)}%`}
          <div className="bar" style={{ width: `${(progress ?? 0) * 100}%` }} />
        </div>
      )}
      {info && info.rows.length > 0 && (
        <div className="stack-rows results">
          {info.rows.map((r, i) => (
            <div className="val" key={i}>{r}</div>
          ))}
        </div>
      )}
      <Messages result={result} />
      <div className="port-row out" title="The reflectance at every time as measured (through the instrument) and, with an instrument, R exact">
        R(t, {alongLabel})
        <Port kind="source" id="out" port="data" />
      </div>
      <div className="port-row out" title="Δ of the read-out vs t; the layer (height, index, volume fraction), Γ, the coverage, Γ/Γ∞, molecules/µm², their spacing, d eq">
        sensorgram (Δ, layer, Γ, coverage)
        <Port kind="source" id="sensorgram" port="data" />
      </div>
    </div>
  );
}
