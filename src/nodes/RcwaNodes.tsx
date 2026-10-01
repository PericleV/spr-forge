import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useJobControl, useJobProgress, useNodeResult } from '../engine/engine.ts';
import { convDeviation, runConvergence, stopConvergence, useConvRun } from '../engine/rcwaConvRun.ts';
import { convergenceOrders, convergencePoints } from '../engine/runRcwa.ts';
import type { ComputeInfo, DrawGratingInfo, GratingInfo } from '../engine/evaluate.ts';
import { defaultPixels, gratingSlices, type GratingProfile } from '../engine/grating.ts';
import type { Dataset, MaterialValue } from '../engine/types.ts';
import { polChoice, polPatch } from './pol.ts';
import type { AppNode, DrawGratingData, DrawGratingNode, GratingData, GratingNode, RcwaData, RcwaNode } from '../types.ts';
import { useConnected } from './hooks.ts';
import { Messages, NumInput, OutPort, Port } from './ui.tsx';
import { CHART_W } from './sizes.ts';
import { LayerListView } from './LayerListView.tsx';
import { ComputationDone } from './ComputeNode.tsx';

const PROFILES: [GratingProfile, string][] = [
  ['lamellar', 'lamellar (binary)'],
  ['trapezoid', 'trapezoid'],
  ['sinus', 'sinusoidal'],
  ['blazed', 'blazed (sawtooth)'],
  ['pixel', 'pixel map (drawn)'],
];
const LETTERS = ['A', 'B', 'C'];
// the ASR option of Compute RCWA (adaptive spatial resolution): hidden for now
const SHOW_ASR = false;

// Nearest-neighbour resampling of a pixel map to a new Nx × Nz.
function resample(px: number[], nx: number, nz: number, nx2: number, nz2: number): number[] {
  if (px.length !== nx * nz) return defaultPixels(nx2, nz2);
  return Array.from({ length: nx2 * nz2 }, (_, k) => {
    const [i, j] = [k % nx2, Math.floor(k / nx2)];
    return px[Math.min(nz - 1, Math.floor(((j + 0.5) * nz) / nz2)) * nx + Math.min(nx - 1, Math.floor(((i + 0.5) * nx) / nx2))];
  });
}

function SweepRow(props: { id: string; label: string; value: number; step?: number; hint?: string; onChange: (v: number) => void }) {
  const swept = useConnected(props.id);
  return (
    <div className="port-row">
      <Port kind="target" id={props.id} port="sweep-number" />
      <label title={props.hint}>
        {props.label}
        {swept ? <span className="val swept">swept</span> : <NumInput className="short" value={props.value} step={props.step} onChange={props.onChange} />}
      </label>
    </div>
  );
}

function MatRow({ id, label, name }: { id: string; label: string; name?: string }) {
  const connected = useConnected(id);
  return (
    <div className="port-row">
      <Port kind="target" id={id} port="material" />
      <span className="muted">{label}</span>
      <span className="val">{connected ? name : <span className="muted">connect a Material</span>}</span>
    </div>
  );
}

export function GratingNodeView({ id, data }: NodeProps<GratingNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const set = (patch: Partial<GratingData>) => updateNodeData(id, patch);
  const updateNodeInternals = useUpdateNodeInternals();
  const result = useNodeResult(id);
  const info = result?.info as GratingInfo | undefined;
  const pixel = data.profile === 'pixel';
  useEffect(() => updateNodeInternals(id), [id, data.profile, data.materials, updateNodeInternals]);
  const drop = (handles: string[]) => setEdges((es) => es.filter((e) => !(e.target === id && handles.includes(e.targetHandle ?? ''))));
  const setRes = (nx: number, nz: number) => {
    if (!(nx >= 1 && nz >= 1)) return;
    set({ nx, slices: nz, pixels: pixel ? resample(data.pixels, data.nx, data.slices, nx, nz) : data.pixels });
  };
  return (
    <div className="node node-grating">
<label>
        Label
        <input className="nodrag" value={data.label} placeholder="grating" onChange={(e) => set({ label: e.target.value })} />
      </label>
      <MatRow id="ridge" label="Ridge (A)" name={info?.names[0]} />
      <MatRow id="groove" label="Groove (B)" name={info?.names[1]} />
      {pixel && data.materials >= 3 && <MatRow id="m2" label="Material C" name={info?.names[2]} />}
      <label className="radio">
        profile
        <select
          className="nodrag profile"
          value={data.profile}
          onChange={(e) => {
            const profile = e.target.value as GratingProfile;
            if (profile !== 'pixel') drop(['m2']);
            const toPixel = profile === 'pixel' && data.pixels.length !== data.nx * data.slices;
            set({ profile, ...(toPixel ? { pixels: defaultPixels(data.nx, data.slices, data.fill) } : {}), ...(profile === 'lamellar' || profile === 'pixel' ? {} : { slices: Math.max(data.slices, 8) }) });
          }}
        >
          {PROFILES.map(([p, l]) => (
            <option key={p} value={p}>{l}</option>
          ))}
        </select>
      </label>
      <SweepRow id="period" label="Period Λ [nm]" value={data.period} step={10} onChange={(period) => set({ period })} />
      <SweepRow id="d" label="Thickness (depth) [nm]" value={data.thickness} step={5} onChange={(thickness) => set({ thickness })} />
      {(data.profile === 'lamellar' || data.profile === 'trapezoid') && (
        <SweepRow id="fill" label={data.profile === 'trapezoid' ? 'Fill factor (bottom)' : 'Fill factor (ridge)'} value={data.fill} step={0.05} onChange={(fill) => set({ fill })} />
      )}
      {data.profile === 'trapezoid' && <SweepRow id="fillTop" label="Fill factor (top)" value={data.fillTop} step={0.05} onChange={(fillTop) => set({ fillTop })} />}
      <div className="row wrap">
        {!pixel && (
          <label className="radio" title="Position of the ridge centre in the period (0 – 1)">
            ridge at <NumInput className="tiny" value={data.shift} step={0.05} onChange={(shift) => set({ shift })} /> Λ
          </label>
        )}
        {data.profile !== 'lamellar' && (
          <label className="radio" title={pixel ? 'Pixel rows' : 'Staircase slices through the depth'}>
            Nz <NumInput className="tiny" value={data.slices} min={1} step={1} onChange={(nz) => setRes(data.nx, Math.round(nz))} />
          </label>
        )}
        <label className="radio" title="Columns of the pixel map and of the drawing grid (View Grating)">
          Nx <NumInput className="tiny" value={data.nx} min={2} step={4} onChange={(nx) => setRes(Math.round(nx), data.slices)} />
        </label>
        {pixel && (
          <label className="radio">
            <input
              className="nodrag"
              type="checkbox"
              checked={data.materials >= 3}
              onChange={(e) => {
                if (!e.target.checked) drop(['m2']);
                set({ materials: e.target.checked ? 3 : 2, pixels: e.target.checked ? data.pixels : data.pixels.map((v) => Math.min(1, v)) });
              }}
            />
            third material
          </label>
        )}
      </div>
      {pixel && <div className="hint">Draw the cells in a View Grating node connected to this layer.</div>}
      {pixel && data.pixels.length !== data.nx * data.slices && (
        <button className="nodrag" onClick={() => set({ pixels: defaultPixels(data.nx, data.slices, data.fill) })}>
          reset the pixel map ({data.nx} × {data.slices}, lamellar pattern)
        </button>
      )}
      {info && Number.isFinite(info.smallest) && (
        <div className="stack-rows results">
          <div className="val">
            {info.slices} slice{info.slices === 1 ? '' : 's'} · smallest feature {(100 * info.smallest).toFixed(1)} % of Λ ({(info.smallest * info.period).toFixed(1)} nm) · N ≥ {Math.ceil(1.5 / info.smallest)} orders suggested
          </div>
        </div>
      )}
      <Messages result={result} />
      <OutPort label="layer" port="layer" />
    </div>
  );
}

export function RcwaNodeView({ id, data }: NodeProps<RcwaNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<RcwaData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const progress = useJobProgress(id);
  const control = useJobControl();
  const info = result?.info as ComputeInfo | undefined;
  const job = info?.job;
  // remaining time from the rate so far (after a few percent, so the first slow steps do not mislead)
  const eta = progress && progress.p > 0.03 && progress.p < 1 ? (progress.seconds * (1 - progress.p)) / progress.p : undefined;
  const out = result?.outs.out;
  const ready = out?.type === 'data' && out.dataset && !out.pending;
  const phiSwept = useConnected('phi');
  const ordersSwept = useConnected('orders');
  return (
    <div className="node node-compute node-rcwa">
<label>
        Name
        <input className="nodrag" value={data.name} placeholder="RCWA" onChange={(e) => set({ name: e.target.value })} />
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
        <Port kind="target" id="lambda" port="param-lambda" />λ {info?.lambdaText && <span className="val">{info.lambdaText}</span>}
      </div>
      <div className="port-row">
        <Port kind="target" id="theta" port="param-theta" />θ {info?.thetaText && <span className="val">{info.thetaText}</span>}
      </div>
      <div className="port-row">
        <Port kind="target" id="phi" port="sweep-number" />
        <label title="Azimuth of the plane of incidence, from the grating vector (x, across the grating lines). 0: classical (planar) diffraction; ≠ 0: conical incidence, TE and TM coupled — the outputs add the TE / TM parts of every order. A Sweep or a Design variable can drive it.">
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
        <div className="row wrap" title="Incident field E = cos ψ p̂ + sin ψ e^{iδ} ŝ (unit power): ψ = 0 TM, 90° TE; ψ = 45° with δ = ±90°: circular. TE and TM interfere at φ ≠ 0; the outputs give the TE / TM parts.">
          <label className="radio">ψ <NumInput className="tiny" value={data.polMix.psi} step={5} onChange={(psi) => set({ polMix: { ...data.polMix!, psi } })} /> °</label>
          <label className="radio">δ <NumInput className="tiny" value={data.polMix.delta} step={15} onChange={(delta) => set({ polMix: { ...data.polMix!, delta } })} /> °</label>
          <span className="hint">ψ = 45°, δ = ±90°: circular</span>
        </div>
      )}
      <div className="port-row">
        <Port kind="target" id="orders" port="sweep-number" />
        <label className="radio" title="Fourier orders −N … +N kept in the computation (accuracy vs speed). A Sweep on this port computes every step at its own N: the data get an axis “orders N” (convergence figures: R, a Min / max or FWHM result vs N).">
          orders N {ordersSwept ? <span className="val swept">swept</span> : <NumInput className="tiny" value={data.orders} min={0} step={1} onChange={(orders) => set({ orders: Math.round(orders) })} />}
        </label>
        <label className="radio" title="Diffraction efficiencies output for the orders −M … +M">
          outputs ±<NumInput className="tiny" value={data.show} min={0} step={1} onChange={(show) => set({ show: Math.round(show) })} />
        </label>
      </div>
      {/* ASR hidden for now (the code stays): shown only where a saved project has it on, to turn it off */}
      {(SHOW_ASR || data.asr) && (
      <div className="row wrap">
        <label className="radio" title="Adaptive spatial resolution (Granet): a change of coordinate that puts more harmonics near the edges of the profile — faster convergence, above all for metals in TM">
          <input className="nodrag" type="checkbox" checked={!!data.asr} onChange={(e) => set({ asr: e.target.checked || undefined })} />
          ASR
        </label>
        {data.asr && (
          <label className="radio" title="Strength η of the mapping (0 = none; 0.9 typical; close to 1 = strong squeezing at the edges)">
            η <NumInput className="tiny" value={data.eta ?? 0.9} min={0} step={0.05} onChange={(eta) => set({ eta })} />
          </label>
        )}
        {data.asr && info?.asrMinN !== undefined && <span className="muted">N ≥ {info.asrMinN} recommended</span>}
      </div>
      )}
      <div className="hint">
        {ordersSwept ? `Every step of the N sweep is computed at its own N; the time grows as (2N + 1)³${info?.orderCost ? `: the whole sweep ≈ ${info.orderCost.toFixed(0)}× the time of its smallest N alone` : ''}.` : `${2 * data.orders + 1} harmonics. “Check convergence” compares N, 1.5 N and 2 N${data.asr ? ' (with ASR)' : ''}.`}
        {!ordersSwept && data.orders > 60 && ' Above 60 orders each point takes seconds (the time grows as N³: ~1 s at N = 100, ~7 s at 200, ~26 s at 300).'}
      </div>
      <div className="row wrap">
        {job?.state === 'running' ? (
          <button className="nodrag btn-stop" onClick={() => control.stop(job.requester)} title="Stop the computation (the previous result stays)">■ Stop</button>
        ) : (
          <button
            className="nodrag btn-run"
            disabled={!job || job.state === 'done'}
            onClick={() => job && control.run(job.requester, job.key)}
            title="Compute (Compute RCWA does not start by itself)"
          >
            ▶ Run
          </button>
        )}
        {info?.size !== undefined && <span className="val muted">{info.dims} · {info.size.toLocaleString('en')} pts</span>}
      </div>
      {job?.state === 'running' && (
        <div className="msg busy">
          Computing… {Math.round((progress?.p ?? 0) * 100)}%{progress && ` · ${progress.seconds.toFixed(1)} s`}
          {eta !== undefined && ` · ~${eta < 60 ? `${eta.toFixed(0)} s` : `${(eta / 60).toFixed(1)} min`} left`}
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(progress?.p ?? 0) * 100}%` }} />
          </div>
        </div>
      )}
      {job?.state === 'idle' && !result?.errors.length && <div className="msg info">Not computed yet: press Run.</div>}
      <Messages result={result} />
      {ready && job?.state === 'done' && <ComputationDone ds={out.dataset!} />}
      {ready && info?.gdNote && <div className="hint">{info.gdNote}</div>}
      <Convergence id={id} info={info} dataset={out?.type === 'data' && job?.state === 'done' ? out.dataset : null} orders={data.orders} onUse={(orders) => set({ orders })} />
      <OutPort label="data" port="data" />
    </div>
  );
}

// ---- Convergence check: N, 1.5 N and 2 N orders at a sample of the grid (R dip / peak included) ----

const TOLS = [1e-2, 1e-3, 1e-4];

function Convergence(props: { id: string; info?: ComputeInfo; dataset: Dataset | null; orders: number; onUse: (n: number) => void }) {
  const { id, info, dataset, orders, onUse } = props;
  const run = useConvRun(id);
  const [tol, setTol] = useState(1e-3);
  const job = info?.job;
  // (a swept N is its own convergence study)
  if (!info?.spec || !job || !info.gratings || info.ordersSwept) return null;
  const Ns = convergenceOrders(Math.max(orders, 2));
  const start = () => {
    const size = info.size ?? 0;
    // the R dip and peak of the current result are the most sensitive points
    const extra: number[] = [];
    const R = dataset?.fields.R;
    if (R && R.length === size) {
      let lo = 0;
      let hi = 0;
      for (let k = 1; k < R.length; k++) {
        if (R[k] < R[lo]) lo = k;
        if (R[k] > R[hi]) hi = k;
      }
      extra.push(lo, hi);
    }
    runConvergence(id, job.key, { spec: info.spec!, points: convergencePoints(size, 16, extra), Ns });
  };
  const fresh = run && run.key === job.key;
  const rows = fresh && run.status === 'done' ? run.rows! : null;
  const dev = rows ? convDeviation(rows) : [];
  const enough = rows ? rows.slice(0, -1).find((_, i) => dev[i] < tol) : undefined;
  const fmt = (v: number) => (v === 0 ? '0' : v.toExponential(1));
  return (
    <div className="conv">
      <div className="row wrap">
        {run?.status === 'running' ? (
          <button className="nodrag btn-stop" onClick={() => stopConvergence(id)}>■ Stop check</button>
        ) : (
          <button className="nodrag" onClick={start} title={`R and T at up to 18 grid points (the R dip and peak included) with N = ${Ns.join(', ')} orders`}>
            Check convergence
          </button>
        )}
        <label className="radio" title="Largest acceptable change of R or T against the reference">
          tolerance
          <select className="nodrag" value={tol} onChange={(e) => setTol(Number(e.target.value))}>
            {TOLS.map((t) => (
              <option key={t} value={t}>{t.toExponential(0)}</option>
            ))}
          </select>
        </label>
      </div>
      {run?.status === 'running' && (
        <div className="msg busy">
          Checking N = {Ns.join(', ')} at {run.points} points… {Math.round(run.progress * 100)}% · {run.seconds.toFixed(1)} s
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${run.progress * 100}%` }} />
          </div>
        </div>
      )}
      {run?.status === 'error' && fresh && <div className="msg err">{run.message}</div>}
      {run && !fresh && run.status !== 'running' && <div className="hint">The inputs changed since the last convergence check.</div>}
      {rows && (
        <div className="stack-rows results">
          {rows.map((r, i) => (
            <div key={r.N} className="val">
              N = {r.N}: {i === rows.length - 1 ? 'reference' : `max |ΔR|, |ΔT| = ${fmt(dev[i])}`} · {r.msPerPoint.toFixed(1)} ms / point
            </div>
          ))}
          <div className="val">
            {enough ? (
              <>
                N = {enough.N} is within {tol.toExponential(0)} of N = {rows[rows.length - 1].N} ({run!.points} points){' '}
                {enough.N !== orders && (
                  <button className="nodrag" onClick={() => onUse(enough.N)}>use N = {enough.N}</button>
                )}
              </>
            ) : (
              <>
                Not converged to {tol.toExponential(0)}: increase N{' '}
                <button className="nodrag" onClick={() => onUse(Math.min(60, rows[rows.length - 1].N))}>use N = {Math.min(60, rows[rows.length - 1].N)}</button> and check again.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- View Grating: the unit cell(s) as computed; pixel map editor ----

const H = 240;

export function DrawGratingNodeView({ id, data }: NodeProps<DrawGratingNode>) {
  const { updateNodeData, getNode } = useReactFlow<AppNode>();
  const set = (patch: Partial<DrawGratingData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as DrawGratingInfo | undefined;
  const layers = info?.layers ?? [];
  const li = Math.min(layers.length - 1, Math.max(0, data.layer));
  const L = layers[li];
  const g = L?.grating;
  const src = info?.source && li === 0 ? getNode(info.source) : undefined;
  const editable = !!g && g.profile === 'pixel' && src?.type === 'grating';
  const [painting, setPainting] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const slices = useMemo(() => (g ? gratingSlices(g) : []), [g]);
  const W = CHART_W;
  const periods = Math.min(6, Math.max(1, Math.round(data.periods)));
  const pad = { l: 34, r: 8, t: 8, b: 26 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const cellW = pw / periods;
  const nx = g ? Math.max(1, Math.round(g.nx)) : 1;
  const rows = g?.profile === 'pixel' ? Math.max(1, Math.round(g.pixels.length / nx)) : 1;

  const paint = (e: PointerEvent<SVGSVGElement>) => {
    if (!editable || !g || !svg.current || !src) return;
    const r = svg.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - pad.l;
    const y = ((e.clientY - r.top) / r.height) * H - pad.t;
    if (x < 0 || y < 0 || x >= pw || y >= ph) return;
    const i = Math.floor((((x % cellW) + cellW) % cellW / cellW) * nx);
    const j = Math.floor((y / ph) * rows);
    const row = g.flip ? rows - 1 - j : j;
    const k = row * nx + i;
    // the node's current data (not the one of the last render: a profile change may have just replaced the map)
    const fresh = getNode(src.id);
    const px = fresh ? (fresh.data as GratingData).pixels : [];
    if (px.length !== nx * rows || px[k] === data.brush) return;
    const next = px.slice();
    next[k] = data.brush;
    updateNodeData(src.id, { pixels: next });
  };
  const pixelsNow = () => (src ? ((getNode(src.id)?.data as GratingData | undefined)?.pixels ?? []) : []);
  const fillAll = (v: number) => src && updateNodeData(src.id, { pixels: pixelsNow().map(() => v) });
  const invert = () => src && updateNodeData(src.id, { pixels: pixelsNow().map((v) => (v === 0 ? 1 : v === 1 ? 0 : v)) });
  const nMats = g?.mats.length ?? 2;

  return (
    <div className="node node-drawgrating">
      <div className="port-row">
        <Port kind="target" id="in" port="layer" />
        <span className="muted">layer / stack</span>
      </div>
      <div className="row wrap">
        {layers.length > 1 && (
          <select className="nodrag" value={li} onChange={(e) => set({ layer: Number(e.target.value) })}>
            {layers.map((x, k) => (
              <option key={k} value={k}>{x.label || `grating ${k + 1}`}</option>
            ))}
          </select>
        )}
        <label className="radio">periods <NumInput className="tiny" value={data.periods} min={1} step={1} onChange={(periods) => set({ periods })} /></label>
        <label className="radio">
          <input className="nodrag" type="checkbox" checked={data.grid} onChange={(e) => set({ grid: e.target.checked })} />
          Nx grid
        </label>
      </div>
      {g && L ? (
        <div className="nodrag nowheel chart">
          <svg
            ref={svg}
            className={`plot${editable ? ' paint' : ''}`}
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            onPointerDown={(e) => {
              if (!editable) return;
              setPainting(true);
              (e.target as Element).setPointerCapture?.(e.pointerId);
              paint(e);
            }}
            onPointerMove={(e) => painting && paint(e)}
            onPointerUp={() => setPainting(false)}
          >
            {(() => {
              let z = 0;
              return slices.map((s, k) => {
                const h = s.h * ph;
                const y = pad.t + z;
                z += h;
                return Array.from({ length: periods }, (_, p) =>
                  s.segs.map((seg, j) => (
                    <rect
                      key={`${k}-${p}-${j}`}
                      x={pad.l + (p + seg.from) * cellW}
                      y={y}
                      width={(seg.to - seg.from) * cellW}
                      height={h}
                      fill={(g.mats[seg.m] as MaterialValue | undefined)?.color ?? '#999'}
                      stroke="rgba(0,0,0,0.25)"
                      strokeWidth={0.5}
                    />
                  )),
                );
              });
            })()}
            {/* grid lines over the material colours: a dark line on a light halo, visible on any material and theme */}
            {data.grid && nx <= 200 && (
              <g className="px-grid">
                {Array.from({ length: periods * nx + 1 }, (_, i) => {
                  const x = pad.l + (i * cellW) / nx;
                  const major = i % nx === 0;
                  return (
                    <g key={`g${i}`}>
                      <line x1={x} x2={x} y1={pad.t} y2={pad.t + ph} className="halo" strokeWidth={major ? 2.5 : 1.6} />
                      <line x1={x} x2={x} y1={pad.t} y2={pad.t + ph} className={major ? 'major' : 'minor'} />
                    </g>
                  );
                })}
                {g.profile === 'pixel' &&
                  Array.from({ length: rows + 1 }, (_, j) => {
                    const y = pad.t + (j * ph) / rows;
                    return (
                      <g key={`h${j}`}>
                        <line x1={pad.l} x2={pad.l + pw} y1={y} y2={y} className="halo" strokeWidth={1.6} />
                        <line x1={pad.l} x2={pad.l + pw} y1={y} y2={y} className="minor" />
                      </g>
                    );
                  })}
              </g>
            )}
            <rect x={pad.l} y={pad.t} width={pw} height={ph} className="frame" />
            {Array.from({ length: periods + 1 }, (_, p) => (
              <text key={`t${p}`} x={pad.l + p * cellW} y={pad.t + ph + 16} className="tick" textAnchor="middle">{`${p}Λ`}</text>
            ))}
            <text x={pad.l - 6} y={pad.t + 10} className="tick" textAnchor="end">0</text>
            <text x={pad.l - 6} y={pad.t + ph} className="tick" textAnchor="end">{+L.d.toFixed(0)}</text>
            <text transform={`translate(10 ${pad.t + ph / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">z [nm]</text>
          </svg>
        </div>
      ) : (
        <div className="empty small">{result?.errors.length || result?.warnings.length ? 'No grating (see the message below).' : 'Connect a Grating layer (or a stack containing one).'}</div>
      )}
      {g && (
        <div className="legend">
          {g.mats.map((m, k) => (
            <span key={k}>
              <i style={{ background: (m as MaterialValue).color }} />
              {LETTERS[k]}: {(m as MaterialValue).name}
            </span>
          ))}
          <span className="muted">
            {L.rough ? 'cell' : 'Λ'} = {+g.period.toFixed(1)} nm · {slices.length} slice{slices.length === 1 ? '' : 's'} · Nx = {nx}
          </span>
        </div>
      )}
      {editable && (
        <div className="row wrap">
          <span className="muted">paint:</span>
          {Array.from({ length: nMats }, (_, k) => (
            <button key={k} className={`nodrag${data.brush === k ? ' active' : ''}`} onClick={() => set({ brush: k })}>
              <i className="swatch" style={{ background: (g.mats[k] as MaterialValue).color }} /> {LETTERS[k]}
            </button>
          ))}
          <button className="nodrag" onClick={() => fillAll(data.brush)}>fill all</button>
          <button className="nodrag" onClick={invert}>swap A ↔ B</button>
        </div>
      )}
      {L?.rough && <div className="hint">The rough zone as the RCWA computes it: {slices.length} slices of {nx} points (Compute TMM: an effective medium per slice).</div>}
      {g && g.profile === 'pixel' && !editable && !L?.rough && <div className="hint">To draw the cells, connect the Grating layer node directly.</div>}
      {info?.stack && <LayerListView stack={info.stack} name={L?.label || 'grating'} />}
      <Messages result={result} />
    </div>
  );
}

