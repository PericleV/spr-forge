import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useReactFlow, type Edge, type NodeProps } from '@xyflow/react';
import { hash } from '../engine/dataset.ts';
import { useNodeResult } from '../engine/engine.ts';
import { solutionOf, type LayerGaInfo, type OptimizerInfo } from '../engine/evaluate.ts';
import type { AlgoParams, Crossover, CrossoverType, DeStrategy, FrontPoint, Mutation, MutationType } from '../engine/optimize.ts';
import { paramsOf, pauseRun, resumeRun, startRun, stopRun, useRunState } from '../engine/optimizerRuntime.ts';
import { useLibrary } from '../library/context.ts';
import { exportCsv } from '../plot/export.ts';
import { FigureTools } from '../plot/FigureTools.tsx';
import { LinePlot } from '../plot/LinePlot.tsx';
import type { AppNode, OptimizerAlgorithm, OptimizerData, OptimizerNode, OptimizerRun } from '../types.ts';
import { Messages, NumInput, Port } from './ui.tsx';
import { LayerGaPanel } from './LayerGaPanel.tsx';
import { iterationsFor } from '../defaults.ts';
import { CHART_W } from './sizes.ts';

const ALGORITHMS: [OptimizerAlgorithm, string, string][] = [
  ['adam', 'Adam (gradient, multistart)', 'Local, fast on smooth merits (zone integrals); several random starts in parallel.'],
  ['de', 'Differential evolution', 'Global search with a population; handles integer variables.'],
  ['nm', 'Nelder-Mead', 'Local, derivative-free; good for a few variables or to refine.'],
  ['ga', 'Genetic algorithm', 'Global search: tournament selection, SBX crossover, polynomial mutation, 2 elites.'],
  ['pso', 'Particle swarm', 'Global search: particles pulled towards their own and the swarm’s best points.'],
  ['lm', 'Levenberg-Marquardt (least squares)', 'Local, very fast for fitting a curve to a measurement (Curve match with RMS metric).'],
  ['nsga2', 'NSGA-II (multi-objective)', 'Pareto front of the objectives (each input is one objective); pick a trade-off on the chart.'],
  ['sa', 'Simulated annealing', 'Global search: random moves, worse ones accepted with probability exp(−Δ/T) while the temperature decreases (Kirkpatrick 1983; Pan et al. 2024).'],
  ['layerga', 'Genetic — layer sequences (Sebek et al. 2023)', 'SPR sensors built layer by layer from the materials ticked for each role: mutations (thickness, material, swap, add, delete) and crossovers of whole structures, a wheel weighted by the sensitivity S = Δθ/Δn, 10 % elites (M. Sebek et al., ACS Omega 8, 20792 (2023)). Its own objective: no Design variables or objectives needed.'],
];
const POPULATION = new Set<OptimizerAlgorithm>(['de', 'ga', 'pso', 'nsga2']);
const GENERATIONS = new Set<OptimizerAlgorithm>(['de', 'ga', 'nsga2']);

// Scatter of a Pareto front: two objectives against each other; click a point to select it.
function ParetoPlot(props: { front: FrontPoint[]; i: number; j: number; names: string[]; selected: number; onPick: (k: number) => void }) {
  const { front, i, j, names, selected, onPick } = props;
  const W = CHART_W;
  const H = 230;
  const M = { l: 58, r: 12, t: 10, b: 36 };
  const ext = (k: number): [number, number] => {
    const v = front.map((p) => p.f[k]).filter(Number.isFinite);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const pad = (hi - lo || Math.abs(lo) || 1) * 0.06;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = ext(i);
  const [y0, y1] = ext(j);
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const order = front.map((_, k) => k).sort((a, b) => front[a].f[i] - front[b].f[i]);
  const ticks = (a: number, b: number) => [0, 0.25, 0.5, 0.75, 1].map((t) => a + t * (b - a));
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    let best = -1;
    let bd = Infinity;
    front.forEach((p, k) => {
      const d = (sx(p.f[i]) - mx) ** 2 + (sy(p.f[j]) - my) ** 2;
      if (d < bd) [best, bd] = [k, d];
    });
    if (best >= 0 && bd < 400) onPick(best);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="pareto" onClick={pick}>
      <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="none" stroke="var(--border)" />
      {ticks(x0, x1).map((v, k) => (
        <text key={`x${k}`} x={sx(v)} y={H - M.b + 14} textAnchor="middle" className="tick">{+v.toPrecision(3)}</text>
      ))}
      {ticks(y0, y1).map((v, k) => (
        <text key={`y${k}`} x={M.l - 4} y={sy(v) + 3} textAnchor="end" className="tick">{+v.toPrecision(3)}</text>
      ))}
      <text x={(W + M.l) / 2} y={H - 4} textAnchor="middle" className="axis-title">{names[i] ?? `objective ${i + 1}`}</text>
      <text x={12} y={(H - M.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - M.b) / 2})`} className="axis-title">{names[j] ?? `objective ${j + 1}`}</text>
      <polyline points={order.map((k) => `${sx(front[k].f[i])},${sy(front[k].f[j])}`).join(' ')} fill="none" stroke="#f2b701" strokeOpacity={0.35} />
      {front.map((p, k) => (
        <circle key={k} cx={sx(p.f[i])} cy={sy(p.f[j])} r={k === selected ? 5.5 : 3.2} fill={k === selected ? '#e15759' : '#f2b701'} stroke={k === selected ? 'var(--text)' : 'none'} />
      ))}
    </svg>
  );
}

const fmt = (v: number) => (Number.isFinite(v) ? `${+v.toPrecision(6)}` : '—');
const time = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

// The part of the graph an optimization needs: the objectives and everything upstream of them.
function snapshotOf(nodes: AppNode[], edges: Edge[], ancestors: string[]) {
  const keep = new Set(ancestors);
  const ns = nodes.filter((n) => keep.has(n.id)).map(({ id, type, position, data }) => ({ id, type, position, data }) as AppNode);
  const es = edges
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle }));
  return { nodes: ns, edges: es };
}

// Graph key without the design variables' current values (they are what the optimizer changes).
const graphKey = (nodes: AppNode[], edges: Edge[]) =>
  hash(JSON.stringify([nodes.map((n) => [n.id, n.type, n.type === 'variable' ? { ...n.data, value: 0 } : n.data]), edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle])]));

// A labelled number field of the algorithm settings.
function Field(props: { label: string; title?: string; value: number; step?: number; min?: number; placeholder?: string; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="radio" title={props.title}>
      {props.label}
      <NumInput className="tiny" value={props.value} step={props.step} min={props.min} placeholder={props.placeholder} onChange={props.onChange} />
    </label>
  );
}

const CROSSOVERS: [CrossoverType, string, string][] = [
  ['sbx', 'SBX (simulated binary)', 'Children spread around the parents; larger η keeps them closer.'],
  ['blx', 'BLX-α (blend)', 'Uniform in the parents’ interval widened by α on each side.'],
  ['uniform', 'Uniform', 'Each variable taken from one parent or the other (50 %).'],
  ['arithmetic', 'Arithmetic', 'Weighted mean of the parents with one random weight.'],
];
const MUTATIONS: [MutationType, string, string][] = [
  ['polynomial', 'Polynomial', 'Small changes most likely; larger η = smaller steps.'],
  ['gaussian', 'Gaussian', 'Normal step with σ as a fraction of the variable’s range.'],
  ['uniform', 'Uniform (random reset)', 'A new random value in [min, max].'],
];
const DE_STRATEGIES: [DeStrategy, string][] = [
  ['rand/1/bin', 'rand/1/bin (robust, default)'],
  ['best/1/bin', 'best/1/bin (fast, may converge early)'],
  ['current-to-best/1/bin', 'current-to-best/1/bin'],
  ['rand/2/bin', 'rand/2/bin (more exploration)'],
  ['rand/1/exp', 'rand/1/exp (exponential crossover)'],
];

function GeneticOperators(props: { c: Crossover; m: Mutation; onC: (c: Crossover) => void; onM: (m: Mutation) => void }) {
  const { c, m, onC, onM } = props;
  return (
    <>
      <div className="row wrap">
        <label className="radio" title={CROSSOVERS.find(([t]) => t === c.type)?.[2]}>
          crossover
          <select className="nodrag" value={c.type} onChange={(e) => onC({ ...c, type: e.target.value as CrossoverType })}>
            {CROSSOVERS.map(([t, l]) => (
              <option key={t} value={t}>{l}</option>
            ))}
          </select>
        </label>
        <Field label="p" title="Probability that a pair is crossed (else the parents are copied)" value={c.prob} step={0.05} onChange={(prob) => onC({ ...c, prob })} />
        {c.type === 'sbx' && <Field label="η" title="SBX distribution index" value={c.eta} step={1} onChange={(eta) => onC({ ...c, eta })} />}
        {c.type === 'blx' && <Field label="α" title="BLX widening on each side" value={c.alpha} step={0.05} onChange={(alpha) => onC({ ...c, alpha })} />}
      </div>
      <div className="row wrap">
        <label className="radio" title={MUTATIONS.find(([t]) => t === m.type)?.[2]}>
          mutation
          <select className="nodrag" value={m.type} onChange={(e) => onM({ ...m, type: e.target.value as MutationType })}>
            {MUTATIONS.map(([t, l]) => (
              <option key={t} value={t}>{l}</option>
            ))}
          </select>
        </label>
        <Field label="p" title="Probability per variable (empty = 1 / number of variables)" value={m.prob} step={0.05} placeholder="1/n" onChange={(prob) => onM({ ...m, prob })} />
        {m.type === 'polynomial' && <Field label="η" title="Polynomial mutation distribution index" value={m.eta} step={1} onChange={(eta) => onM({ ...m, eta })} />}
        {m.type === 'gaussian' && <Field label="σ" title="Standard deviation as a fraction of the range" value={m.sigma} step={0.01} onChange={(sigma) => onM({ ...m, sigma })} />}
      </div>
    </>
  );
}

// A new algorithm: its default iteration count, unless the count was changed by the user.
const switchAlgorithm = (d: OptimizerData, algorithm: OptimizerAlgorithm): Partial<OptimizerData> =>
  d.iterations === iterationsFor(d.algorithm) ? { algorithm, iterations: iterationsFor(algorithm) } : { algorithm };

// Every setting of the chosen algorithm.
function AlgorithmSettings({ data, set, objectives }: { data: OptimizerData; set: (patch: Partial<OptimizerData>) => void; objectives: { id: string; name: string }[] }) {
  const P = paramsOf(data);
  const a = data.algorithm;
  const setP = <K extends keyof AlgoParams>(k: K, patch: Partial<AlgoParams[K]>) => set({ params: { ...data.params, [k]: { ...data.params?.[k], ...patch } } });
  const pop = POPULATION.has(a);
  return (
    <div className="algo-settings">
      <div className="row wrap">
        <Field label={GENERATIONS.has(a) ? 'generations' : 'iterations'} value={data.iterations} min={1} step={10} onChange={(iterations) => set({ iterations })} />
        {pop && <Field label="population" value={data.population} min={8} step={1} onChange={(population) => set({ population })} />}
        {!['nm', 'lm'].includes(a) && <Field label="seed" title="Random seed (same seed = same run)" value={data.seed} step={1} onChange={(seed) => set({ seed })} />}
      </div>
      {a === 'adam' && (
        <div className="row wrap">
          <Field label="lr" title="Step size in the normalized (sigmoid) space" value={P.adam.lr} step={0.01} onChange={(lr) => setP('adam', { lr })} />
          <Field label="starts" title="Parallel starts: the current values plus random points" value={P.adam.starts} min={1} step={1} onChange={(starts) => setP('adam', { starts })} />
          <Field label="β₁" title="Decay of the first moment (momentum)" value={P.adam.beta1} step={0.01} onChange={(beta1) => setP('adam', { beta1 })} />
          <Field label="β₂" title="Decay of the second moment" value={P.adam.beta2} step={0.001} onChange={(beta2) => setP('adam', { beta2 })} />
          <Field label="h" title="Finite-difference step (normalized space)" value={P.adam.h} step={0.0001} onChange={(h) => setP('adam', { h })} />
          <Field label="stop after" title="Stop after this many iterations without improvement (0 = never)" value={P.adam.stall} step={10} onChange={(stall) => setP('adam', { stall })} />
        </div>
      )}
      {a === 'adam' && (
        <>
          <div className="row wrap">
            <Field label="lr × " title="Learning-rate decay: lr · decay^⌊step / every⌋ (staircase; 1 = constant)" value={P.adam.decay} step={0.05} onChange={(decay) => setP('adam', { decay })} />
            <Field label="every" title="Steps between two learning-rate decreases" value={P.adam.decaySteps} min={1} step={10} onChange={(decaySteps) => setP('adam', { decaySteps })} />
            <Field label="stage 1 iterations" title="First stage: only the objectives ticked “1”, with their own learning rate (0 = one stage)" value={P.adam.stage1Iter} min={0} step={10} onChange={(stage1Iter) => setP('adam', { stage1Iter })} />
            {P.adam.stage1Iter > 0 && <Field label="stage 1 lr" value={P.adam.stage1Lr} step={0.005} onChange={(stage1Lr) => setP('adam', { stage1Lr })} />}
          </div>
          {P.adam.stage1Iter > 0 && objectives.length > 0 && (
            <div className="stack-rows">
              <div className="muted">objectives in stage 1 / stage 2 (none ticked in stage 2 = all)</div>
              {objectives.map((o) => {
                const on1 = P.adam.stage1Obj.includes(o.id);
                const on2 = P.adam.stage2Obj.includes(o.id);
                const toggle = (key: 'stage1Obj' | 'stage2Obj', on: boolean) =>
                  setP('adam', { [key]: on ? [...P.adam[key].filter((x) => x !== o.id), o.id] : P.adam[key].filter((x) => x !== o.id) });
                return (
                  <div className="row" key={o.id}>
                    <label className="radio"><input className="nodrag" type="checkbox" checked={on1} onChange={(e) => toggle('stage1Obj', e.target.checked)} /> 1</label>
                    <label className="radio"><input className="nodrag" type="checkbox" checked={on2} onChange={(e) => toggle('stage2Obj', e.target.checked)} /> 2</label>
                    <span className="ellipsis">{o.name}</span>
                  </div>
                );
              })}
              {!P.adam.stage1Obj.some((id) => objectives.some((o) => o.id === id)) && <div className="msg info">No objective ticked for stage 1: one stage on all objectives.</div>}
            </div>
          )}
        </>
      )}
      {a === 'de' && (
        <div className="row wrap">
          <label className="radio">
            strategy
            <select className="nodrag" value={P.de.strategy} onChange={(e) => setP('de', { strategy: e.target.value as DeStrategy })}>
              {DE_STRATEGIES.map(([s, l]) => (
                <option key={s} value={s}>{l}</option>
              ))}
            </select>
          </label>
          <Field label="F" title="Differential weight (lower end of the dither range)" value={P.de.F} step={0.05} onChange={(F) => setP('de', { F })} />
          <Field label="F max" title="Upper end: F is drawn in [F, F max) each generation; F max ≤ F = fixed F" value={P.de.Fmax} step={0.05} onChange={(Fmax) => setP('de', { Fmax })} />
          <Field label="CR" title="Crossover rate" value={P.de.CR} step={0.05} onChange={(CR) => setP('de', { CR })} />
        </div>
      )}
      {a === 'nm' && (
        <div className="row wrap">
          <Field label="initial step" title="Size of the starting simplex, as a fraction of each range" value={P.nm.step} step={0.01} onChange={(step) => setP('nm', { step })} />
          <Field label="tolerance" title="Stop when the simplex is smaller than this (fraction of the range)" value={P.nm.tol} step={1e-7} onChange={(tol) => setP('nm', { tol })} />
        </div>
      )}
      {a === 'ga' && (
        <>
          <div className="row wrap">
            <Field label="tournament" title="Tournament size of the selection" value={P.ga.tournament} min={1} step={1} onChange={(tournament) => setP('ga', { tournament })} />
            <Field label="elites" title="Best individuals copied unchanged to the next generation" value={P.ga.elites} min={0} step={1} onChange={(elites) => setP('ga', { elites })} />
          </div>
          <GeneticOperators c={P.ga.crossover} m={P.ga.mutation} onC={(crossover) => setP('ga', { crossover })} onM={(mutation) => setP('ga', { mutation })} />
        </>
      )}
      {a === 'nsga2' && (
        <GeneticOperators c={P.nsga2.crossover} m={P.nsga2.mutation} onC={(crossover) => setP('nsga2', { crossover })} onM={(mutation) => setP('nsga2', { mutation })} />
      )}
      {a === 'pso' && (
        <>
          <div className="row wrap">
            <Field label="w" title="Inertia at the start" value={P.pso.w} step={0.01} onChange={(w) => setP('pso', { w })} />
            <Field label="w end" title="Inertia at the end (linear decrease; = w for constant inertia)" value={P.pso.wEnd} step={0.01} onChange={(wEnd) => setP('pso', { wEnd })} />
            <Field label="c₁" title="Cognitive coefficient (pull to the particle’s own best)" value={P.pso.c1} step={0.05} onChange={(c1) => setP('pso', { c1 })} />
            <Field label="c₂" title="Social coefficient (pull to the neighbourhood’s best)" value={P.pso.c2} step={0.05} onChange={(c2) => setP('pso', { c2 })} />
          </div>
          <div className="row wrap">
            <Field label="v max" title="Velocity limit as a fraction of each range" value={P.pso.vmax} step={0.05} onChange={(vmax) => setP('pso', { vmax })} />
            <label className="radio" title="Global: every particle follows the swarm’s best. Ring: only its neighbours (slower, less premature convergence)">
              topology
              <select className="nodrag" value={P.pso.topology} onChange={(e) => setP('pso', { topology: e.target.value as 'global' | 'ring' })}>
                <option value="global">global best</option>
                <option value="ring">ring (local best)</option>
              </select>
            </label>
            {P.pso.topology === 'ring' && <Field label="neighbours" title="Neighbours on each side in the ring" value={P.pso.neighbours} min={1} step={1} onChange={(neighbours) => setP('pso', { neighbours })} />}
          </div>
        </>
      )}
      {a === 'sa' && (
        <div className="row wrap">
          <Field label="T₀" title="Initial temperature in merit units (0 = automatic: ~80 % of the worse moves accepted at the start)" value={P.sa.t0} step={0.1} onChange={(t0) => setP('sa', { t0 })} />
          <Field label="cooling" title="T ← cooling · T after each temperature level (Pan et al.: 0.95)" value={P.sa.cooling} step={0.01} onChange={(cooling) => setP('sa', { cooling })} />
          <Field label="moves / T" title="Moves of each chain per temperature level (Pan et al.: 1000)" value={P.sa.perTemp} min={1} step={10} onChange={(perTemp) => setP('sa', { perTemp })} />
          <Field label="step" title="Size of the random moves as a fraction of each range (shrinks with √(T/T₀))" value={P.sa.step} step={0.01} onChange={(step) => setP('sa', { step })} />
          <Field label="chains" title="Independent chains run in parallel (one candidate each per batch)" value={P.sa.chains} min={1} step={1} onChange={(chains) => setP('sa', { chains })} />
        </div>
      )}
      {a === 'lm' && (
        <div className="row wrap">
          <Field label="λ₀" title="Initial damping (small = Gauss-Newton, large = gradient descent)" value={P.lm.lambda0} step={0.001} onChange={(lambda0) => setP('lm', { lambda0 })} />
          <Field label="h" title="Finite-difference step of the Jacobian (normalized space)" value={P.lm.h} step={1e-6} onChange={(h) => setP('lm', { h })} />
        </div>
      )}
      {data.params?.[a as keyof AlgoParams] && (
        <button className="nodrag link" onClick={() => set({ params: { ...data.params, [a]: undefined } })}>reset to defaults</button>
      )}
    </div>
  );
}

export function OptimizerNodeView({ id, data }: NodeProps<OptimizerNode>) {
  const { updateNodeData, getNodes, getEdges } = useReactFlow<AppNode>();
  const set = (patch: Partial<OptimizerData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as OptimizerInfo | undefined;
  const run = useRunState(id);
  const { list } = useLibrary();
  const active = run?.status === 'running' || run?.status === 'paused';
  const enabled = (info?.variables ?? []).filter((v) => !data.disabled.includes(v.id));
  const solution = solutionOf({ ...data, live: undefined });

  const currentKey = useMemo(() => {
    if (!info) return '';
    const s = snapshotOf(getNodes(), getEdges(), info.ancestors);
    return graphKey(s.nodes, s.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const start = () => {
    if (!info || !enabled.length || !info.objectives.length) return;
    const s = snapshotOf(getNodes(), getEdges(), info.ancestors);
    const from = data.startFromOutput && solution ? solution.values : {};
    startRun({
      nodeId: id,
      nodes: s.nodes,
      edges: s.edges,
      materials: list.filter((m) => !m.builtin),
      variables: enabled.map((v) => ({ ...v, value: Math.min(v.max, Math.max(v.min, from[v.id] ?? v.value)) })),
      objectives: info.objectives.map((o) => o.id),
      objectiveNames: info.objectives.map((o) => o.name),
      settings: data,
      snapshot: graphKey(s.nodes, s.edges),
      // The new run becomes the output solution; the live preview ends in the same update (two updates at the same
      // moment: the second, built from the node as it was, would drop the new run).
      onFinish: (r: OptimizerRun | null) =>
        updateNodeData(id, (n) => (r ? { runs: [r, ...(n.data as OptimizerData).runs].slice(0, 10), outputRun: '', outputPoint: -1, live: undefined } : { live: undefined })),
    });
  };

  // Live preview: the outputs follow the best point of the running optimization (about once a second).
  const lastPreview = useRef(0);
  const convChart = useRef<HTMLDivElement>(null);
  const paretoChart = useRef<HTMLDivElement>(null);
  // a preview left in a saved project (no run going on): cleared once
  useEffect(() => {
    if (data.live && !active) set({ live: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!run || !active) return;
    if (!data.preview || !run.bestX.length) return;
    const now = Date.now();
    if (now - lastPreview.current < 1000) return;
    lastPreview.current = now;
    set({ live: Object.fromEntries(run.variables.map((v, i) => [v.id, run.bestX[i]])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, data.preview, active]);

  const history = run?.history.length && active ? run.history : ((data.runs.find((r) => r.id === data.outputRun) ?? data.runs[0])?.history ?? run?.history ?? []);

  // Pareto front: live during a run, else the one of the output run (a click puts that point on the outputs).
  const outRun = data.runs.find((r) => r.id === data.outputRun) ?? data.runs[0];
  const liveFront = active && !!run?.front?.length;
  const front = liveFront ? run!.front! : (outRun?.front ?? []);
  const frontNames = (liveFront ? run!.objectives : outRun?.objectives) ?? [];
  const [axes, setAxes] = useState<[number, number]>([0, 1]);

  // the genetic algorithm over layer sequences: its own panel (materials of each role, rules, run, result)
  if (data.algorithm === 'layerga')
    return (
      <div className="node node-optimizer">
        <div className="port-row">
          <Port kind="target" id="obj" port="objective" />
          <span className="muted">objectives</span>
          <span className="val muted">not used by this algorithm</span>
        </div>
        <select className="nodrag" value={data.algorithm} disabled={active} onChange={(e) => set(switchAlgorithm(data, e.target.value as OptimizerAlgorithm))}>
          {ALGORITHMS.map(([a, t]) => (
            <option key={a} value={a}>{t}</option>
          ))}
        </select>
        <div className="hint">{ALGORITHMS.find(([a]) => a === data.algorithm)?.[2]}</div>
        <LayerGaPanel id={id} data={data} info={result?.info as LayerGaInfo | undefined} canStart={!result?.errors.length} />
        <div className="section">Outputs</div>
        <div className="port-row out" title="Reflectance of the best structure against θ at n_s and n_s + Δn">
          data (R of the best structure)
          <Port kind="source" id="out" port="data" />
        </div>
        <div className="port-row out" title="Prism | layers | sensing medium">
          stack (best structure)
          <Port kind="source" id="stack" port="stack" />
        </div>
        <Messages result={result} />
      </div>
    );
  const nObj = front[0]?.f.length ?? 0;
  const [fi, fj] = axes[0] < nObj && axes[1] < nObj ? axes : [0, Math.min(1, nObj - 1)];
  const picked = liveFront ? -1 : (data.outputPoint ?? -1);
  const sel = picked >= 0 ? front[picked] : undefined;
  const noResiduals = data.algorithm === 'lm' && !!info?.objectives.some((o) => !o.residuals && !(o.cost >= 0));
  const changed = !!run && run.snapshot !== currentKey && run.status !== 'idle';
  const varName = (vid: string) => info?.variables.find((v) => v.id === vid)?.name ?? outRun?.names[vid] ?? vid;

  return (
    <div className="node node-optimizer">
      <div className="port-row">
        <Port kind="target" id="obj" port="objective" />
        <span className="muted">objectives</span>
        <span className="val muted">{info?.objectives.length ?? 0} objective(s) · merit = {fmt(info?.merit ?? NaN)}</span>
      </div>

      <select className="nodrag" value={data.algorithm} disabled={active} onChange={(e) => set(switchAlgorithm(data, e.target.value as OptimizerAlgorithm))}>
        {ALGORITHMS.map(([a, t]) => (
          <option key={a} value={a}>{t}</option>
        ))}
      </select>
      <div className="hint">{ALGORITHMS.find(([a]) => a === data.algorithm)?.[2]}</div>
      <AlgorithmSettings data={data} set={set} objectives={info?.objectives ?? []} />
      {data.algorithm === 'nsga2' && (info?.objectives.length ?? 0) < 2 && <div className="msg warn">NSGA-II needs two or more objectives connected.</div>}
      {noResiduals && <div className="msg warn">Levenberg-Marquardt needs least-squares objectives (Curve match, RMS); an objective here has a negative cost.</div>}
      <div className="row wrap">
        {!['nm', 'lm', 'nsga2'].includes(data.algorithm) && (
          <label className="radio">
            <input className="nodrag" type="checkbox" checked={data.polish} onChange={(e) => set({ polish: e.target.checked })} />
            polish with Nelder-Mead
          </label>
        )}
        <label className="radio" title="The outputs follow the best point during the run (re-simulated about once a second)">
          <input className="nodrag" type="checkbox" checked={data.preview} onChange={(e) => set({ preview: e.target.checked })} />
          live preview
        </label>
        <label className="radio" title="Start the next run from the output solution instead of the Design variables' values">
          <input className="nodrag" type="checkbox" checked={!!data.startFromOutput} onChange={(e) => set({ startFromOutput: e.target.checked })} />
          start from the output solution
        </label>
      </div>

      <div className="section">Variables</div>
      <div className="opt-vars">
        {info?.variables.map((v) => {
          const i = run?.variables.findIndex((r) => r.id === v.id) ?? -1;
          const shown = active && i >= 0 ? run!.bestX[i] : solution?.values[v.id];
          return (
            <div className="opt-var" key={v.id}>
              <input
                className="nodrag"
                type="checkbox"
                disabled={active}
                checked={!data.disabled.includes(v.id)}
                onChange={(e) => set({ disabled: e.target.checked ? data.disabled.filter((x) => x !== v.id) : [...data.disabled, v.id] })}
              />
              <span>{v.name}</span>
              <span className="val muted">[{fmt(v.min)}, {fmt(v.max)}]{v.integer ? ' int' : ''}</span>
              <span className="val">start {fmt(v.value)}</span>
              <span className="val best">{shown !== undefined ? `${active ? 'best' : 'optimized'} ${fmt(shown)}` : ''}</span>
            </div>
          );
        })}
      </div>

      <div className="row wrap">
        {!active && (
          <button className="nodrag btn-run" disabled={!enabled.length || !info?.objectives.length || !!result?.errors.length} onClick={start}>
            ▶ Start
          </button>
        )}
        {run?.status === 'running' && <button className="nodrag" onClick={() => pauseRun(id)}>❚❚ Pause</button>}
        {run?.status === 'paused' && <button className="nodrag btn-run" onClick={() => resumeRun(id)}>▶ Resume</button>}
        {active && <button className="nodrag btn-stop" onClick={() => stopRun(id)}>■ Stop</button>}
      </div>
      {run && (
        <div className="stack-rows results">
          <div className="val">
            {run.status}{run.phase && active ? ` · ${run.phase}` : ''} · iteration {run.iteration} · {run.evaluations} evaluations · {time(run.elapsed)}
            {run.elapsed > 0 ? ` · ${Math.round(run.evaluations / run.elapsed)} eval/s` : ''}
          </div>
          <div className="val">best merit = {fmt(run.best)}</div>
          {info?.objectives.map((o, k) => (
            <div className="val" key={o.id}>
              {o.name}: start {fmt(o.cost)}{run.bestParts[k] !== undefined ? ` · best ${fmt(run.bestParts[k])}` : ''}
            </div>
          ))}
          {run.message && <div className="msg err">{run.message}</div>}
          {changed && <div className="msg warn">The graph changed since this run started; its results refer to the graph at Start.</div>}
        </div>
      )}
      {history.length > 1 && (
        <div className="row chart-head">
          <span className="muted">Convergence (best merit per iteration)</span>
          <FigureTools
            target={convChart}
            name="optimizer-convergence"
            csv={() => exportCsv(['iteration', 'best merit'], history.map((v, i) => [i + 1, v]), 'optimizer-convergence')}
          />
        </div>
      )}
      {history.length > 1 && (
        <div className="nodrag nowheel chart" ref={convChart}>
          <LinePlot
            xAxis={{ id: 'it', label: 'iteration', unit: '', values: history.map((_, i) => i + 1) }}
            series={[{ key: 'best', label: 'best merit', color: '#f2b701', y: history, width: 2 }]}
            yLabel="best merit"
            yUnit=""
            width={CHART_W}
            height={170}
          />
        </div>
      )}

      {front.length > 1 && nObj >= 2 && (
        <>
          <div className="row chart-head">
            <div className="section">Pareto front ({front.length} points)</div>
            <FigureTools
              target={paretoChart}
              name="pareto-front"
              csv={() => {
                // every objective and the variables of each point
                const ids = outRun && !liveFront ? Object.keys(outRun.values) : enabled.map((v) => v.id);
                exportCsv(
                  ['point', ...frontNames.map((n, k) => n || `f${k + 1}`), ...ids.map(varName)],
                  front.map((p, k) => [k + 1, ...p.f, ...ids.map((_, m) => p.x[m])]),
                  'pareto-front',
                );
              }}
            />
          </div>
          {nObj > 2 && (
            <div className="row wrap">
              <label className="radio">
                x
                <select className="nodrag" value={fi} onChange={(e) => setAxes([Number(e.target.value), fj])}>
                  {frontNames.map((n, k) => (
                    <option key={k} value={k}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="radio">
                y
                <select className="nodrag" value={fj} onChange={(e) => setAxes([fi, Number(e.target.value)])}>
                  {frontNames.map((n, k) => (
                    <option key={k} value={k}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="nodrag nowheel chart" ref={paretoChart}>
            <ParetoPlot front={front} i={fi} j={fj} names={frontNames} selected={picked} onPick={(k) => !liveFront && outRun && set({ outputRun: outRun.id, outputPoint: k })} />
          </div>
          {sel ? (
            <div className="stack-rows results">
              <div className="val">{sel.f.map((v, k) => `${frontNames[k] ?? `f${k + 1}`} = ${fmt(v)}`).join(' · ')}</div>
              <div className="val muted">{Object.keys(outRun!.values).map((vid, k) => `${varName(vid)} = ${fmt(sel.x[k])}`).join(', ')}</div>
              <div className="row">
                <button className="nodrag" onClick={() => set({ outputPoint: -1 })}>Use the best merit instead</button>
              </div>
            </div>
          ) : (
            <div className="hint">{liveFront ? 'Front of the running optimization.' : 'Click a point: it becomes the solution on the outputs.'}</div>
          )}
        </>
      )}

      <div className="section">Outputs</div>
      <label className="radio" title="Compute TMM node re-run with the solution's values">
        simulation of
        <select className="nodrag" value={data.outputCompute || info?.computes[0]?.id || ''} onChange={(e) => set({ outputCompute: e.target.value })}>
          {info?.computes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <div className="hint">
        {info?.solution ? `Solution: ${info.solution}.` : 'After a run, the outputs give the optimized structure and its simulation.'}
        {data.runs.length > 1 ? ' Choose another run in the list below.' : ''}
      </div>
      <div className="port-row out">
        data (optimized)
        <Port kind="source" id="out" port="data" />
      </div>
      <div className="port-row out">
        stack (optimized)
        <Port kind="source" id="stack" port="stack" />
      </div>

      {data.runs.length > 0 && (
        <details className="nodrag" open={data.runs.length > 1}>
          <summary>Runs ({data.runs.length})</summary>
          <div className="runs">
            {data.runs.map((r) => (
              <div className={`run${r.id === outRun?.id ? ' chosen' : ''}`} key={r.id}>
                <label className="radio" title="Put this run's solution on the outputs">
                  <input className="nodrag" type="radio" name={`${id}-out`} checked={r.id === outRun?.id} onChange={() => set({ outputRun: r.id, outputPoint: -1 })} />
                  <span className="val">
                    {new Date(r.started).toLocaleTimeString()} · {r.algorithm} · merit {fmt(r.merit)} · {r.evaluations} eval · {time(r.seconds)}
                    {r.stopped ? ' · stopped' : ''}
                  </span>
                </label>
                <span className="val muted">{Object.entries(r.values).map(([k, v]) => `${r.names[k] ?? k} = ${fmt(v)}`).join(', ')}</span>
                <div className="row">
                  <button className="nodrag" onClick={() => set({ runs: data.runs.filter((x) => x.id !== r.id), ...(r.id === data.outputRun ? { outputRun: '', outputPoint: -1 } : {}) })}>
                    remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      <Messages result={result} />
    </div>
  );
}
