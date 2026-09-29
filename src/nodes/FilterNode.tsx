import { useEffect, useState } from 'react';
import { useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { FilterInfo } from '../engine/evaluate.ts';
import { PRESETS, startDesign, startDesignRun, stopDesignRun, useDesignRun, type Preset } from '../engine/filters.ts';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { Overlay } from '../plot/overlays.ts';
import type { AppNode, FilterBand, FilterData, FilterNode } from '../types.ts';
import { useConnected } from './hooks.ts';
import { Messages, NumInput, OutPort, Port } from './ui.tsx';
import { odOf, type SpecKind } from '../engine/spec.ts';
import { MATERIAL_LETTERS } from '../engine/design.ts';
import { CHART_W } from './sizes.ts';

const LETTERS = MATERIAL_LETTERS;
const fmt = (v: number, p = 4) => (Number.isFinite(v) ? `${+v.toPrecision(p)}` : '—');
const time = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

function MatPort({ id, label, name, hint }: { id: string; label: string; name?: string; hint: string }) {
  const connected = useConnected(id);
  return (
    <div className="port-row">
      <Port kind="target" id={id} port="material" />
      <span className="muted">{label}</span>
      <span className="val">{connected ? (name ?? 'connected') : <span className="muted">{hint}</span>}</span>
    </div>
  );
}

export function FilterNodeView({ id, data }: NodeProps<FilterNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const set = (patch: Partial<FilterData>) => updateNodeData(id, patch);
  const updateNodeInternals = useUpdateNodeInternals();
  const result = useNodeResult(id);
  const info = result?.info as FilterInfo | undefined;
  const run = useDesignRun(id);
  const running = run?.status === 'running';
  useEffect(() => updateNodeInternals(id), [id, data.materials, data.thick, updateNodeInternals]);
  const dropEdges = (handles: string[]) => setEdges((es) => es.filter((e) => !(e.target === id && handles.includes(e.targetHandle ?? ''))));

  const applyPreset = (preset: FilterData['preset']) => {
    if (preset === 'custom') return set({ preset });
    const p = PRESETS[preset];
    set({ preset, bands: p.bands, lmin: p.lmin, lmax: p.lmax, lambdaRef: p.lambdaRef, ...p.start });
  };
  const setBand = (i: number, patch: Partial<FilterBand>) => set({ preset: 'custom', bands: data.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  // design cleaner: by default four layers fewer than the thicker coating
  const cleanDefault = Math.max(1, Math.max(data.design.front.length, data.design.back.length) - 4);
  const start = () => {
    const problem = info?.problem;
    if (!problem) return;
    const s0 = startDesign(data, problem);
    const settings = { algorithm: data.algorithm, iterations: data.iterations, needleStep: data.needleStep, lambdaRef: data.lambdaRef, candidates: data.candidates, cleanTo: data.cleanTo ?? cleanDefault, seed: Date.now() % 100000 };
    startDesignRun(id, problem, s0, settings, (p, final) =>
      // the node keeps the design: the stack output follows the run (at most every progress message)
      updateNodeData(id, { design: p.design, merit: p.merit, history: final ? p.history : p.history.slice(-400), historyD: final ? p.historyD : p.historyD.slice(-400) }),
    );
  };
  const [vsThickness, setVsThickness] = useState(false);
  const nm = Math.min(LETTERS.length, Math.max(2, data.materials));

  // chart: the design's R or T, the target values as steps
  const xs = info?.lambdas ?? [];
  // the chart shows OD = −log₁₀ T when a target is an optical density, else R (all bands on R) or T
  const showQ: 'R' | 'T' | 'OD' = info?.usesOD ? 'OD' : data.bands.every((b) => b.q === 'R') && !info?.targetConnected ? 'R' : 'T';
  const y = showQ === 'R' ? info?.R : showQ === 'T' ? info?.T : info?.T.map(odOf);
  const series: Series[] = y?.length ? [{ key: 'y', label: `${showQ} (${info!.pol}, ${info!.angle}°)`, color: '#d9772b', y, width: 2 }] : [];
  // a target value drawn in the chart's quantity: R ↔ T as 1 − R (lossless picture), T ↔ OD
  const conv = (q: string, v: number) => {
    const T = q === 'T' ? v : q === 'R' ? 1 - v : q === 'OD' ? 10 ** -v : NaN;
    return showQ === 'OD' ? odOf(T) : showQ === 'T' ? T : q === 'R' ? v : 1 - T;
  };
  if (xs.length && !info?.targetConnected)
    data.bands.forEach((b, i) => {
      const v = conv(b.q, b.value);
      if (Number.isFinite(v)) series.push({ key: `t${i}`, label: i === 0 ? 'target' : '', color: 'var(--text)', x: [b.lo, b.hi], y: [v, v], dash: b.kind && b.kind !== 'eq' ? '2 3' : '5 3', width: 1.4 });
    });
  // connected targets: their points at the first angle and polarization, one dashed curve per quantity and kind
  if (xs.length && info?.targetConnected && info.problem) {
    const pr = info.problem;
    const first = pr.samples.find((s) => s.ai === 0);
    const groups = new Map<string, { x: number[]; y: number[]; kind: string }>();
    for (const s of pr.samples) {
      if (s.ai !== 0 || s.pol !== first?.pol) continue;
      const key = `${s.q}|${s.kind ?? 'eq'}`;
      const g = groups.get(key) ?? groups.set(key, { x: [], y: [], kind: s.kind ?? 'eq' }).get(key)!;
      g.x.push(pr.lambdas[s.li]);
      g.y.push(conv(s.q, s.target));
    }
    [...groups.values()].forEach((g, i) => series.push({ key: `tc${i}`, label: i === 0 ? 'target' : '', color: 'var(--text)', x: g.x, y: g.y, dash: g.kind !== 'eq' ? '2 3' : '5 3', width: 1.4 }));
  }
  const overlays: Overlay[] = info?.targetConnected ? [] : data.bands.map((b, i) => ({ kind: 'band', key: `b${i}`, lo: b.lo, hi: b.hi, color: '#d9772b', label: `${i + 1}` }));
  const history = run?.status === 'running' ? run.history : data.history;
  const historyD = run?.status === 'running' ? run.historyD : (data.historyD ?? []);
  const byD = vsThickness && historyD.length === history.length;
  const nLayers = data.design.front.length + data.design.back.length;

  return (
    <div className="node node-filter">
<label>
        Name
        <input className="nodrag" value={data.name} placeholder="Filter" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row wrap">
        <label className="radio">
          type
          <select className="nodrag preset" value={data.preset} disabled={running} onChange={(e) => applyPreset(e.target.value as FilterData['preset'])}>
            <option value="custom">custom bands</option>
            {(Object.keys(PRESETS) as Preset[]).map((k) => (
              <option key={k} value={k}>{PRESETS[k].label}</option>
            ))}
          </select>
        </label>
        {data.preset !== 'custom' && <span className="hint">{PRESETS[data.preset].note}</span>}
      </div>

      <div className="section">Materials</div>
      {Array.from({ length: nm }, (_, k) => (
        <MatPort key={k} id={`m${k}`} label={`${LETTERS[k]} ${k === 0 ? '(high index)' : k === 1 ? '(low index)' : ''}`} name={info?.names[k]} hint="connect a Material" />
      ))}
      <div className="row wrap">
        <button className="nodrag" disabled={running || nm >= LETTERS.length} title="Another coating material (the algorithms choose among all of them)" onClick={() => set({ materials: nm + 1 })}>
          + material
        </button>
        <button
          className="nodrag"
          disabled={running || nm <= 2}
          onClick={() => {
            dropEdges([`m${nm - 1}`]);
            set({ materials: nm - 1, design: { front: data.design.front.filter((L) => L.m < nm - 1), back: data.design.back.filter((L) => L.m < nm - 1) } });
          }}
        >
          − material
        </button>
        <span className="muted">{nm} materials ({LETTERS.slice(0, nm).join(', ')})</span>
      </div>
      <MatPort id="incident" label="Incident medium" hint="connect (e.g. Air)" />
      <MatPort id="sub" label="Substrate" hint="connect (e.g. BK7)" />
      <label className="radio" title="A plate of finite thickness: no interference inside it; both faces count">
        <input
          className="nodrag"
          type="checkbox"
          checked={data.thick}
          disabled={running}
          onChange={(e) => {
            if (!e.target.checked) dropEdges(['backMedium']);
            set({ thick: e.target.checked, ...(e.target.checked ? {} : { sides: 'front' }) });
          }}
        />
        thick substrate
      </label>
      {data.thick && (
        <>
          <div className="row wrap">
            <label className="radio">
              thickness [mm] <NumInput className="tiny" value={data.dSub} step={0.1} onChange={(dSub) => set({ dSub })} />
            </label>
            <label className="radio">
              design
              <select className="nodrag" value={data.sides} disabled={running} onChange={(e) => set({ sides: e.target.value as FilterData['sides'] })}>
                <option value="front">front coating</option>
                <option value="back">back coating</option>
                <option value="both">both coatings</option>
              </select>
            </label>
          </div>
          <MatPort id="backMedium" label="Back medium" hint="as incident" />
        </>
      )}

      <div className="section">Target</div>
      <div className="row wrap">
        <span className="interval">
          λ <NumInput className="short" value={data.lmin} onChange={(lmin) => set({ lmin })} />–<NumInput className="short" value={data.lmax} onChange={(lmax) => set({ lmax })} /> nm, step{' '}
          <NumInput className="tiny" value={data.step} onChange={(step) => set({ step })} />
        </span>
      </div>
      <div className="port-row">
        <Port kind="target" id="target" port="data" />
        <span className="muted" title="Target curves (several allowed) replace the bands. A Target curve sets the quantity, polarization, angle, kind (=, ≥, ≤) and tolerance of its bands; for the others the quantity is chosen here.">targets (optional, replace the bands)</span>
        {info?.targetConnected && (
          <select className="nodrag" value={data.targetQ} title="Quantity of the targets that do not set one" onChange={(e) => set({ targetQ: e.target.value as FilterData['targetQ'] })}>
            <option value="T">are T</option>
            <option value="R">are R</option>
            <option value="A">are A</option>
            <option value="OD">are OD</option>
          </select>
        )}
      </div>
      {!info?.targetConnected && (
        <div className="zones">
          {data.bands.map((b, i) => (
            <div className="zone-row" key={i}>
              <b>{i + 1}</b>
              <NumInput className="short" value={b.lo} onChange={(lo) => setBand(i, { lo })} />–
              <NumInput className="short" value={b.hi} onChange={(hi) => setBand(i, { hi })} />
              <select className="nodrag" value={b.q} onChange={(e) => setBand(i, { q: e.target.value as FilterBand['q'] })}>
                <option value="T">T</option>
                <option value="R">R</option>
                <option value="A">A</option>
                <option value="OD">OD</option>
              </select>
              <select className="nodrag" value={b.kind ?? 'eq'} title="Equal to the value, or only ≥ / ≤ it (no error when met)" onChange={(e) => setBand(i, { kind: e.target.value as SpecKind })}>
                <option value="eq">=</option>
                <option value="ge">≥</option>
                <option value="le">≤</option>
              </select>
              <NumInput className="tiny" value={b.value} step={b.q === 'OD' ? 0.5 : 0.05} onChange={(value) => setBand(i, { value })} />
              <span className="muted" title="Tolerance: the error is divided by it">±</span>
              <NumInput className="tiny" value={b.tol ?? 1} step={0.01} onChange={(tol) => setBand(i, { tol })} />
              <span className="muted">w</span>
              <NumInput className="tiny" value={b.weight} step={0.5} onChange={(weight) => setBand(i, { weight })} />
              <button className="nodrag" title="remove" onClick={() => set({ preset: 'custom', bands: data.bands.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button
            className="nodrag"
            onClick={() => {
              const last = data.bands.at(-1);
              const lo = last ? Math.min(data.lmax - 10, last.hi + 20) : data.lmin;
              set({ preset: 'custom', bands: [...data.bands, { lo, hi: Math.min(data.lmax, lo + 50), q: 'T', value: 1, weight: 1 }] });
            }}
          >
            + band
          </button>
        </div>
      )}
      <div className="row wrap">
        <label className="radio" title="The merit is averaged over these angles">
          angles [°] <input className="nodrag short-text" value={data.angles} onChange={(e) => set({ angles: e.target.value })} />
        </label>
        <label className="radio">
          polarization
          <select className="nodrag" value={data.pol} onChange={(e) => set({ pol: e.target.value as FilterData['pol'] })}>
            <option value="unpolarized">unpolarized (mean)</option>
            <option value="both">s and p (each)</option>
            <option value="s">s (TE)</option>
            <option value="p">p (TM)</option>
          </select>
        </label>
        <label className="radio" title="Exponent p of the merit MF = [Σ w |e/Δ|^p / Σ w]^(1/p): 2 = least squares; larger p pushes down the worst deviations (2–16)">
          merit p <NumInput className="tiny" value={data.p ?? 2} step={1} onChange={(p) => set({ p })} />
        </label>
      </div>

      <div className="section">Constraints</div>
      <div className="row wrap">
        <label className="radio" title="Thinner layers are removed">min d <NumInput className="tiny" value={data.minD} step={1} onChange={(minD) => set({ minD })} /></label>
        <label className="radio">max d <NumInput className="tiny" value={data.maxD} step={50} onChange={(maxD) => set({ maxD })} /></label>
        <label className="radio" title="Per coating">max layers <NumInput className="tiny" value={data.maxLayers} step={1} onChange={(maxLayers) => set({ maxLayers })} /></label>
        <label className="radio" title="Per coating, nm (a penalty above it)">max total <NumInput className="short" value={data.maxTotal} step={100} onChange={(maxTotal) => set({ maxTotal })} /></label>
      </div>

      <div className="section">Design</div>
      <div className="row wrap">
        <label className="radio">
          method
          <select className="nodrag" value={data.algorithm} disabled={running} onChange={(e) => set({ algorithm: e.target.value as FilterData['algorithm'] })}>
            <option value="needle">needle optimization (classical)</option>
            <option value="deep">deep search (needle + gradual evolution)</option>
            <option value="gradual">gradual evolution (classical)</option>
            <option value="random">random perturbations + refinement</option>
            <option value="refine">refine thicknesses only</option>
            <option value="clean">design cleaner (fewer layers)</option>
          </select>
        </label>
        {data.algorithm !== 'refine' && data.algorithm !== 'clean' && (
          <label className="radio" title={data.algorithm === 'random' ? 'Number of perturbation trials' : 'Maximum number of steps'}>
            {data.algorithm === 'random' ? 'trials' : 'steps'} <NumInput className="tiny" value={data.iterations} step={5} onChange={(iterations) => set({ iterations })} />
          </label>
        )}
        {(data.algorithm === 'needle' || data.algorithm === 'deep') && <label className="radio" title="Spacing of the needle probes inside the layers">probe [nm] <NumInput className="tiny" value={data.needleStep} step={1} onChange={(needleStep) => set({ needleStep })} /></label>}
        {data.algorithm === 'deep' && (
          <label className="radio" title="Candidates refined at each step (all local minima of the needle function, the best gradual-evolution moves); refinements that fall behind the best trajectory are stopped early">
            candidates <NumInput className="tiny" value={data.candidates ?? 12} step={2} onChange={(candidates) => set({ candidates })} />
          </label>
        )}
        {data.algorithm === 'clean' && (
          <label className="radio" title="Layers are removed one at a time (each removal refined, the best kept) until every coating has at most this many">
            down to <NumInput className="tiny" value={data.cleanTo ?? cleanDefault} step={1} onChange={(cleanTo) => set({ cleanTo })} /> layers
          </label>
        )}
        <label className="radio" title="Quarter-wave reference for the start stack and the gradual evolution">λ ref <NumInput className="short" value={data.lambdaRef} onChange={(lambdaRef) => set({ lambdaRef })} /></label>
      </div>
      <div className="row wrap">
        <label className="radio">
          start from
          <select className="nodrag" value={data.start} disabled={running} onChange={(e) => set({ start: e.target.value as FilterData['start'] })}>
            <option value="current">the current design</option>
            <option value="qw">quarter-wave stack (H L)ᴺ</option>
            <option value="layer">one layer</option>
            <option value="bare">no layers</option>
            <option value="formula">a formula</option>
          </select>
        </label>
        {data.start === 'formula' && (
          <input
            className="nodrag mono formula-input"
            value={data.formula ?? ''}
            placeholder="e.g. (1.92H 2.08L)^100"
            title={`Quarter waves at λ ref: a coefficient before a material letter (${LETTERS.slice(0, nm).join(', ')}), groups (…)^N`}
            onChange={(e) => set({ formula: e.target.value })}
          />
        )}
        {data.start === 'qw' && <label className="radio">N <NumInput className="tiny" value={data.startPeriods} step={1} onChange={(startPeriods) => set({ startPeriods })} /></label>}
        {data.start === 'layer' && (
          <>
            <select className="nodrag" value={data.startMat} onChange={(e) => set({ startMat: Number(e.target.value) })}>
              {Array.from({ length: nm }, (_, k) => (
                <option key={k} value={k}>{LETTERS[k]} {info?.names[k] ? `(${info.names[k]})` : ''}</option>
              ))}
            </select>
            <NumInput className="tiny" value={data.startD} step={10} onChange={(startD) => set({ startD })} /> nm
          </>
        )}
      </div>
      <div className="row wrap">
        {!running ? (
          <button className="nodrag btn-run" disabled={!info?.problem || !!result?.errors.length} onClick={start}>▶ Start</button>
        ) : (
          <button className="nodrag btn-stop" onClick={() => stopDesignRun(id)}>■ Stop</button>
        )}
        <button className="nodrag" disabled={running || !nLayers} onClick={() => set({ design: { front: [], back: [] }, merit: NaN, history: [], historyD: [] })}>clear design</button>
      </div>
      {run && (
        <div className="stack-rows results">
          <div className="val">
            {run.status}{running ? ` · ${run.phase}` : ''} · step {run.iteration} · {run.layers} layers · {time(run.elapsed)}
            {running && run.threads > 0 && <span className="muted" title="Candidate designs refined side by side in sub-workers"> · {run.threads} threads</span>}
          </div>
          {run.message && <div className="msg err">{run.message}</div>}
        </div>
      )}
      <div className="stack-rows results">
        <div className="val">
          MF = {info && info.mf < 1e-9 ? '0 (every target met)' : fmt(info?.mf ?? NaN)}{(data.p ?? 2) !== 2 ? ` (p = ${data.p})` : ''}
          {info && info.merit > (info.mf ?? 0) ** (data.p ?? 2) * (1 + 1e-9) + 1e-15 ? ` · + thickness penalty ${fmt(info.merit - info.mf ** (data.p ?? 2), 3)}` : ''} · {data.design.front.length} front layers, {fmt(info?.total.front ?? 0, 5)} nm
          {data.thick ? ` · ${data.design.back.length} back layers, ${fmt(info?.total.back ?? 0, 5)} nm` : ''}
        </div>
      </div>

      {xs.length > 0 && (
        <div className="nodrag nowheel chart">
          <LinePlot xAxis={{ id: 'lambda', label: 'λ', unit: 'nm', values: xs }} series={series} yLabel={showQ === 'OD' ? 'OD (−log₁₀ T)' : showQ} yUnit="" yDomain={showQ === 'OD' ? undefined : [0, 1]} width={CHART_W} height={210} overlays={overlays} />
        </div>
      )}
      {history.length > 1 && (
        <div className="nodrag nowheel chart">
          <LinePlot
            xAxis={byD ? { id: 'thickness', label: 'total thickness', unit: 'nm', values: historyD } : { id: 'step', label: 'step', unit: '', values: history.map((_, i) => i) }}
            series={[{ key: 'm', label: 'merit', color: '#d9772b', y: history.map((v) => Math.log10(v)), width: 2, dots: true }]}
            yLabel="log₁₀ merit"
            yUnit=""
            width={CHART_W}
            height={140}
          />
          <label className="radio" title="The merit against the total physical thickness of the design (as in the needle / gradual evolution literature)">
            <input className="nodrag" type="checkbox" checked={vsThickness} onChange={(e) => setVsThickness(e.target.checked)} /> vs total thickness
          </label>
        </div>
      )}
      {nLayers > 0 && (
        <details className="nodrag">
          <summary>Layers ({nLayers})</summary>
          <div className="stack-rows">
            {data.thick && <div className="muted">front (from the incident side):</div>}
            {data.design.front.map((L, i) => (
              <div key={`f${i}`}>{i + 1}. {info?.names[L.m] ?? LETTERS[L.m]} {L.d.toFixed(2)} nm</div>
            ))}
            {data.thick && data.design.back.length > 0 && <div className="muted">back (from the substrate):</div>}
            {data.design.back.map((L, i) => (
              <div key={`b${i}`}>{i + 1}. {info?.names[L.m] ?? LETTERS[L.m]} {L.d.toFixed(2)} nm</div>
            ))}
          </div>
        </details>
      )}
      <Messages result={result} />
      <OutPort label="stack" port="stack" />
    </div>
  );
}
