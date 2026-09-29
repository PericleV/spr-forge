// Optimization Engine, algorithm 'layerga' (genetic algorithm over layer sequences, Sebek et al. 2023): the materials of
// each role ticked from the library with the limits of the role, the sensing medium, the conditions, the run, the result.
import { useReactFlow } from '@xyflow/react';
import { layerGaOf } from '../defaults.ts';
import type { LayerGaInfo, LayerGaLibEntry } from '../engine/evaluate.ts';
import { mergedGenes, type SprClass } from '../engine/sprDesign.ts';
import { layerGaSettings, startSprRun, stopSprRun, useSprRun } from '../engine/sprRuns.ts';
import { LinePlot, type Series } from '../plot/LinePlot.tsx';
import type { Overlay } from '../plot/overlays.ts';
import type { AppNode, LayerGaData, LayerRoleRule, OptimizerData } from '../types.ts';
import { NumInput } from './ui.tsx';
import { CHART_W } from './sizes.ts';

const fmt = (v: number, p = 4) => (Number.isFinite(v) ? `${+v.toPrecision(p)}` : '—');
const time = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const nText = (e: LayerGaLibEntry) => (e.n.im > 1e-4 ? `${e.n.re.toFixed(2)} + ${e.n.im.toFixed(2)}i` : e.n.re.toFixed(3));
// a list entry: the name and the index at λ (unless the name already gives it)
const entry = (e: LayerGaLibEntry) => (/\bn\s*=/.test(e.name) ? e.name : `${e.name} (n = ${nText(e)})`);

// The roles, the library materials offered for each (the class suggested by the index at λ) and the thickness unit.
const ROLES: { role: SprClass; label: string; unit: string; offer: (e: LayerGaLibEntry) => boolean; hint: string }[] = [
  { role: 'plasmonic', label: 'Plasmonic metals', unit: 'nm', offer: (e) => !e.twoD && (e.suggested === 'plasmonic' || e.suggested === 'metal'), hint: 'The article: 1–3 layers (at least one), 5–100 nm' },
  { role: 'metal', label: 'Other metals', unit: 'nm', offer: (e) => !e.twoD && (e.suggested === 'metal' || e.suggested === 'plasmonic'), hint: 'The article: at most one layer (Cr, Ti…)' },
  { role: 'dielectric', label: 'Dielectrics', unit: 'nm', offer: (e) => !e.twoD && e.suggested === 'dielectric', hint: 'The article: at most 3 layers, 5–100 nm' },
  { role: 'twoD', label: '2D materials', unit: 'layers', offer: (e) => e.twoD, hint: 'The article: at most 4 layers of 1–50 monolayers' },
];

// Ticked materials as chips (× removes one) and a list to add another.
function Picker(props: { ids: string[]; library: LayerGaLibEntry[]; offer: (e: LayerGaLibEntry) => boolean; disabled: boolean; onChange: (ids: string[]) => void }) {
  const { ids, library, offer, disabled, onChange } = props;
  const byId = new Map(library.map((e) => [e.id, e]));
  const more = library.filter((e) => offer(e) && !ids.includes(e.id));
  return (
    <div className="chips">
      {ids.map((id) => (
        <span className="chip" key={id} title={byId.has(id) ? `n = ${nText(byId.get(id)!)} at λ` : 'not in the library'}>
          {byId.get(id)?.name ?? id}
          {!disabled && (
            <button className="nodrag" title="Remove" aria-label={`Remove ${byId.get(id)?.name ?? id}`} onClick={() => onChange(ids.filter((x) => x !== id))}>
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && more.length > 0 && (
        <select className="nodrag add-chip" value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
          <option value="">+ add</option>
          {more.map((e) => (
            <option key={e.id} value={e.id}>{entry(e)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function LayerGaPanel({ id, data, info, canStart }: { id: string; data: OptimizerData; info?: LayerGaInfo; canStart: boolean }) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const g = layerGaOf(data);
  // every change goes through the node's current data (a run updates the result meanwhile)
  const setG = (patch: Partial<LayerGaData>) => updateNodeData(id, (n) => ({ layerGa: { ...layerGaOf(n.data as OptimizerData), ...patch } }));
  const setRole = (role: SprClass, patch: Partial<LayerRoleRule>) => setG({ roles: { ...g.roles, [role]: { ...g.roles[role], ...patch } } });
  const run = useSprRun(id);
  const running = run?.status === 'running';
  const library = info?.library ?? [];
  const unit = g.objective === 'FOM' ? '1/RIU' : 'deg/RIU';

  const start = () => {
    const problem = info?.problem;
    if (!problem) return;
    startSprRun(id, problem, layerGaSettings(g), (p) => {
      if (!p.best) return;
      const best = { prism: problem.prisms[p.best.s.p].id, layers: p.best.s.genes.map((x) => ({ role: problem.mats[x.m].cls, mat: problem.mats[x.m].id, t: x.t })) };
      setG({ best, history: p.history, mean: p.mean, lineage: p.best.ops });
    });
  };

  // the best structure, merged, from the prism side
  const pr = info?.problem;
  const st = info?.structure;
  const ev = info?.eval;
  const layerText = st && pr ? mergedGenes(st.genes).map((x) => `${x.t}${pr.mats[x.m].cls === 'twoD' ? ' L' : ' nm'} ${pr.mats[x.m].name}`) : [];
  // charts: the best structure at n_s and n_s + Δn; the convergence (best, mean, every member of every population)
  const th = info?.thetas ?? [];
  const series: Series[] = th.length
    ? [
        { key: 'r0', label: `n = ${fmt(info!.ns, 5)}`, color: '#4e79a7', y: info!.R0, width: 2 },
        { key: 'r1', label: `n = ${fmt(info!.ns + g.dn, 5)}`, color: '#f28e2b', y: info!.R1, width: 2 },
      ]
    : [];
  const overlays: Overlay[] = ev?.ok
    ? [
        { kind: 'vline', key: 'a', x: ev.a.theta, color: '#4e79a7' },
        { kind: 'vline', key: 'b', x: ev.b.theta, color: '#f28e2b' },
      ]
    : [];
  const history = running ? (run?.history ?? []) : g.history;
  const mean = running ? (run?.mean ?? []) : g.mean;
  const scatter = run?.scatter;
  const conv: Series[] = history.length
    ? [
        ...(scatter && scatter.x.length ? [{ key: 'pop', label: 'population', color: '#9aa7b8', x: scatter.x.slice(-6000), y: scatter.y.slice(-6000), width: 0, dots: true }] : []),
        { key: 'mean', label: 'mean', color: '#76b7b2', y: mean, width: 1.6, dash: '4 3' },
        { key: 'best', label: 'best', color: '#e15759', y: history, width: 2.2 },
      ]
    : [];
  const mediumOffer = library.filter((e) => !e.twoD && e.suggested === 'dielectric');
  // prisms offered: transparent, clearly denser than the sensing medium (the dip must fall below grazing incidence)
  const prismOffer = (e: LayerGaLibEntry) => !e.twoD && e.transparent && e.suggested === 'dielectric' && e.n.re >= (Number.isFinite(info?.ns) ? info!.ns : 1) + 0.05;

  return (
    <div className="layer-ga">
      <div className="section">Materials of each role</div>
      <div className="role-row">
        <div className="role-name" title="The algorithm picks one of them (with sensitivity as the goal, usually the lowest index)">Prisms</div>
        <Picker ids={g.prisms} library={library} offer={prismOffer} disabled={running} onChange={(prisms) => setG({ prisms })} />
      </div>
      {ROLES.map((r) => {
        const rule = g.roles[r.role];
        return (
          <div className="role-row" key={r.role}>
            <div className="role-name" title={r.hint}>{r.label}</div>
            <div>
              <Picker ids={rule.mats} library={library} offer={r.offer} disabled={running} onChange={(mats) => setRole(r.role, { mats })} />
              <div className="row wrap role-rules">
                <label className="radio" title={`Layers of this role in a structure: at least min (always); at most max in the first population${g.holdCounts ? ' and in every generation' : ' (mutations may add more later, as in the article)'}`}>
                  layers <NumInput className="tiny" value={rule.min} step={1} onChange={(min) => setRole(r.role, { min })} /> – <NumInput className="tiny" value={rule.max} step={1} onChange={(max) => setRole(r.role, { max })} />
                </label>
                <label className="radio" title={r.role === 'twoD' ? 'Number of monolayers of each layer' : 'Thickness of each layer, in 1 nm steps'}>
                  thickness <NumInput className="tiny" value={rule.tMin} step={1} onChange={(tMin) => setRole(r.role, { tMin })} /> – <NumInput className="tiny" value={rule.tMax} step={r.role === 'twoD' ? 5 : 10} onChange={(tMax) => setRole(r.role, { tMax })} /> {r.unit}
                </label>
              </div>
            </div>
          </div>
        );
      })}
      <div className="row wrap">
        <label className="radio" title="The maximum numbers of layers of the roles hold in every generation (the article: only in the first population)">
          <input className="nodrag" type="checkbox" checked={g.holdCounts} disabled={running} onChange={(e) => setG({ holdCounts: e.target.checked })} /> keep the limits in every generation
        </label>
        <label className="radio" title="At most this many layers in a structure">
          ≤ <NumInput className="tiny" value={g.maxLayers} step={1} onChange={(maxLayers) => setG({ maxLayers })} /> layers in all
        </label>
      </div>

      <div className="section">Sensing medium and working point</div>
      <div className="row wrap">
        <label className="radio">
          medium
          <select className="nodrag" value={g.medium} disabled={running} onChange={(e) => setG({ medium: e.target.value })}>
            {!mediumOffer.some((e) => e.id === g.medium) && <option value={g.medium}>{g.medium}</option>}
            {mediumOffer.map((e) => (
              <option key={e.id} value={e.id}>{entry(e)}</option>
            ))}
          </select>
        </label>
        <label className="radio" title="Change of the sensing medium's index (the article: 1.332 → 1.337)">Δn <NumInput className="short" value={g.dn} step={0.001} onChange={(dn) => setG({ dn })} /></label>
        <label className="radio">λ <NumInput className="short" value={g.lambda} step={1} onChange={(lambda) => setG({ lambda })} /> nm</label>
      </div>
      <div className="row wrap">
        <label className="radio" title="Coarse angular scan; the dip is then refined">
          θ <NumInput className="tiny" value={g.thetaMin} step={1} onChange={(thetaMin) => setG({ thetaMin })} /> – <NumInput className="tiny" value={g.thetaMax} step={1} onChange={(thetaMax) => setG({ thetaMax })} /> °, step <NumInput className="tiny" value={g.step} step={0.05} onChange={(step) => setG({ step })} />
        </label>
      </div>

      <div className="section">Rules of the result</div>
      <div className="row wrap">
        <label className="radio">
          maximize
          <select className="nodrag" value={g.objective} disabled={running} onChange={(e) => setG({ objective: e.target.value as LayerGaData['objective'] })}>
            <option value="S">S = Δθ / Δn (the article)</option>
            <option value="FOM">FOM = S / FWHM</option>
          </select>
        </label>
        <label className="radio" title="Dips beyond this angle do not count: near-grazing resonances are hard to use (the article notes it)">
          <input className="nodrag" type="checkbox" checked={g.maxTheta < 90} disabled={running} onChange={(e) => setG({ maxTheta: e.target.checked ? 85 : 90 })} /> dip at most
          {g.maxTheta < 90 && <NumInput className="tiny" value={g.maxTheta} step={1} onChange={(maxTheta) => setG({ maxTheta })} />}
          {g.maxTheta < 90 && '°'}
        </label>
      </div>
      <div className="row wrap">
        <label className="radio" title="The conditions of the article's single-mode sensors: a deep dip, not wider on the low-angle side, smooth">
          <input className="nodrag" type="checkbox" checked={g.single} disabled={running} onChange={(e) => setG({ single: e.target.checked })} /> single-mode dip
        </label>
        {g.single && (
          <>
            <label className="radio">depth ≥ <NumInput className="tiny" value={g.minDepth} step={0.05} onChange={(minDepth) => setG({ minDepth })} /></label>
            <label className="radio" title="Left / right half width of the dip">left / right ≤ <NumInput className="tiny" value={g.maxAsym} step={0.05} onChange={(maxAsym) => setG({ maxAsym })} /></label>
            <label className="radio" title="At most 2 extrema of R′ and 3 of R″ within ±2 half widths of the dip">
              <input className="nodrag" type="checkbox" checked={g.smooth} onChange={(e) => setG({ smooth: e.target.checked })} /> smooth
            </label>
          </>
        )}
        <label className="radio" title="With several dips: the dip of n_s + Δn with the same shape (ratio of the steepest slopes), not simply the deepest">
          <input className="nodrag" type="checkbox" checked={g.trace} disabled={running} onChange={(e) => setG({ trace: e.target.checked })} /> follow the dip
        </label>
      </div>

      <div className="section">Genetic algorithm</div>
      <div className="row wrap">
        <label className="radio">population <NumInput className="tiny" value={g.population} step={10} onChange={(population) => setG({ population })} /></label>
        <label className="radio">generations <NumInput className="tiny" value={g.generations} step={10} onChange={(generations) => setG({ generations })} /></label>
        <label className="radio" title="The best structures kept unchanged in the next generation">elites <NumInput className="tiny" value={Math.round(g.elite * 100)} step={5} onChange={(v) => setG({ elite: v / 100 })} /> %</label>
        <label className="radio" title="Children made by one mutation (the rest by one crossover); the article: 33 %">mutations <NumInput className="tiny" value={Math.round(g.mutation * 100)} step={5} onChange={(v) => setG({ mutation: v / 100 })} /> %</label>
        <label className="radio" title="Random seed (same seed = same run)">seed <NumInput className="tiny" value={g.seed} step={1} onChange={(seed) => setG({ seed })} /></label>
      </div>

      <div className="row wrap">
        {!running ? (
          <button className="nodrag btn-run" disabled={!info?.problem || !canStart} onClick={start}>▶ Start</button>
        ) : (
          <button className="nodrag btn-stop" onClick={() => stopSprRun(id)}>■ Stop</button>
        )}
        <button className="nodrag" disabled={running || !g.best} onClick={() => setG({ best: undefined, history: [], mean: [], lineage: undefined })}>clear result</button>
      </div>
      {run && (
        <div className="stack-rows results">
          <div className="val">
            {run.status}
            {run.phase === 'initial' && running ? ` · first population ${run.found} / ${g.population} (${run.tried} random structures tried)` : ` · generation ${run.generation} / ${run.generations}`}
            {Number.isFinite(run.best) ? ` · best ${fmt(run.best)} ${unit}` : ''} · {run.feasible} valid structures · {run.evaluations} evaluated · {time(run.elapsed)}
          </div>
          {run.message && <div className="msg err">{run.message}</div>}
        </div>
      )}
      <div className="stack-rows results">
        {ev?.ok && (
          <div className="val">
            S = {fmt(ev.S)} deg/RIU · θ {ev.a.theta.toFixed(3)}° → {ev.b.theta.toFixed(3)}° · R min {ev.a.R.toFixed(3)} · FWHM {fmt(ev.fwhm, 3)}° · FOM {fmt(ev.fom)} /RIU
          </div>
        )}
        {ev && !ev.ok && <div className="muted">no valid resonance: {ev.why}</div>}
        {st && pr && (
          <div className="val" title="From the prism to the sensing medium (adjacent layers of one material merged)">
            {pr.prisms[st.p].name} | {layerText.join(' | ')} | medium
          </div>
        )}
      </div>
      {th.length > 0 && (
        <div className="nodrag nowheel chart">
          <LinePlot xAxis={{ id: 'theta', label: 'θ', unit: '°', values: th }} series={series} yLabel="R (TM)" yUnit="" yDomain={[0, 1]} width={CHART_W} height={190} overlays={overlays} />
        </div>
      )}
      {history.length > 1 && (
        <div className="nodrag nowheel chart">
          <LinePlot xAxis={{ id: 'generation', label: 'generation', unit: '', values: history.map((_, i) => i) }} series={conv} yLabel={g.objective === 'FOM' ? 'FOM' : 'S'} yUnit={unit} width={CHART_W} height={150} />
        </div>
      )}
      {!!g.lineage?.length && (
        <details className="nodrag">
          <summary>How the best structure was made (last steps)</summary>
          <div className="stack-rows">
            {g.lineage.map((s, i) => (
              <div key={i} className="muted">{s}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
