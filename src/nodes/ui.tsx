import { Handle, Position, useNodeConnections, useNodeId, useNodesData } from '@xyflow/react';
import { nodeDisplayName } from '../nodeColors.ts';
import type { AppNode, MapView } from '../types.ts';
import { COLOR_MAPS, type ColorMapName } from '../plot/colors.ts';
import { isMultiInput, PORT_COLORS, type PortType } from '../engine/ports.ts';
import type { NodeResult } from '../engine/types.ts';
import { useLibrary } from '../library/context.ts';
import { groupOf, MATERIAL_GROUPS, USER_GROUP } from '../physics/library.ts';
import type { SliceInfo, SpecPol } from '../engine/spec.ts';

const num = (v: string) => (v === '' ? NaN : Number(v));

export function NumInput(props: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { value, onChange, step, min, disabled, placeholder, className } = props;
  return (
    <input
      className={`nodrag ${className ?? ''}`}
      type="number"
      step={step}
      min={min}
      disabled={disabled}
      placeholder={placeholder}
      value={disabled || value == null || Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(num(e.target.value))}
    />
  );
}

export function Radios<T extends string>(props: {
  name: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="radios">
      {props.options.map(([v, label]) => (
        <label key={v} className="radio">
          <input
            className="nodrag"
            type="radio"
            name={props.name}
            checked={props.value === v}
            onChange={() => props.onChange(v)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

const PORT_LABELS: Record<PortType, string> = {
  material: 'material',
  layer: 'layer',
  stack: 'stack',
  'param-theta': 'angle θ',
  'param-lambda': 'wavelength λ',
  'sweep-number': 'number sweep',
  'sweep-polarization': 'polarization sweep',
  data: 'data',
  objective: 'objective',
  note: 'note',
};

// A port; the tooltip names the type of value and where it comes from / goes to. Inputs that accept several
// connections are drawn as squares.
export function Port({ kind, id, port }: { kind: 'source' | 'target'; id: string; port: PortType }) {
  const conns = useNodeConnections({ handleType: kind, handleId: id });
  const others = useNodesData<AppNode>(conns.map((c) => (kind === 'target' ? c.source : c.target)));
  const self = useNodesData<AppNode>(useNodeId() ?? '');
  const multi = kind === 'target' && isMultiInput(self as AppNode | undefined, id);
  const names = others.map((n) => nodeDisplayName(n as AppNode));
  const title = `${PORT_LABELS[port]}${multi ? ' (several connections)' : ''} · ${names.length ? `${kind === 'target' ? 'from' : 'to'} ${names.join(', ')}` : 'not connected'}`;
  return <Handle type={kind} position={kind === 'target' ? Position.Left : Position.Right} id={id} className={multi ? 'multi' : undefined} style={{ background: PORT_COLORS[port] }} title={title} />;
}

export function OutPort({ label, port, id = 'out', title }: { label: string; port: PortType; id?: string; title?: string }) {
  return (
    <div className="port-row out" title={title}>
      {label}
      <Port kind="source" id={id} port={port} />
    </div>
  );
}

// Colour setting in the body of a node (never in the title bar, so every node header looks the same).
export function ColorField({ label, title, value, onChange }: { label: string; title?: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="radio color-field" title={title}>
      {label}
      <input className="nodrag color" type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Messages({ result }: { result?: NodeResult }) {
  if (!result) return null;
  return (
    <>
      {result.errors.map((e) => <div className="msg err" key={e}>{e}</div>)}
      {result.warnings.map((w) => <div className="msg warn" key={w}>{w}</div>)}
    </>
  );
}

// Library material picker; `none` adds an empty choice with that label.
export function MaterialSelect({ value, onChange, none }: { value: string; onChange: (id: string) => void; none?: string }) {
  const { list, lib } = useLibrary();
  return (
    <select className="nodrag" value={value} onChange={(e) => onChange(e.target.value)}>
      {none !== undefined && <option value="">{none}</option>}
      {value && !lib.has(value) && <option value={value}>{value} (missing)</option>}
      {/* the sections of the library, then the user's own materials */}
      {[...MATERIAL_GROUPS, USER_GROUP].map((g) => {
        const ms = list.filter((m) => groupOf(m) === g);
        return ms.length ? (
          <optgroup key={g} label={g}>
            {ms.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

// Display settings of a colour map: colour range (empty = automatic), log scale, smoothing, blur. Display only: the
// data (outputs, CSV, profiles) are not changed.
export function MapViewControls({ view, onChange }: { view?: MapView; onChange: (v: MapView | undefined) => void }) {
  const v = view ?? {};
  const z = v.zLim ?? [NaN, NaN];
  const set = (patch: Partial<MapView>) => {
    const next = { ...v, ...patch };
    const empty = !next.zLog && !next.smooth && !(next.blur! > 0) && !(next.zLim ?? []).some(Number.isFinite) && !Number.isFinite(next.cap ?? NaN) && !next.cmap;
    onChange(empty ? undefined : next);
  };
  const lim = (a: number, b: number) => ([a, b].some(Number.isFinite) ? ([a, b] as [number, number]) : undefined);
  return (
    // two fixed lines: the colour scale (map, range, log), then how the picture is drawn (cap, smooth, blur)
    <div className="map-view">
      <div className="row wrap">
        <label className="radio" title="Colour map (wave: diverging blue–white–red, its automatic range symmetric about 0 — for Re / Im of a field)">
          <select className="nodrag" value={v.cmap ?? 'viridis'} onChange={(e) => set({ cmap: e.target.value === 'viridis' ? undefined : (e.target.value as ColorMapName) })}>
            {(Object.keys(COLOR_MAPS) as ColorMapName[]).map((k) => (
              <option key={k} value={k}>{COLOR_MAPS[k].label}</option>
            ))}
          </select>
        </label>
        <span className="interval" title="Colour range (empty = automatic)">
          colours <NumInput className="short" value={z[0]} placeholder="auto" onChange={(a) => set({ zLim: lim(a, z[1]) })} />–
          <NumInput className="short" value={z[1]} placeholder="auto" onChange={(b) => set({ zLim: lim(z[0], b) })} />
        </span>
        <label className="radio" title="Logarithmic colour scale (values ≤ 0 are left empty)">
          <input className="nodrag" type="checkbox" checked={!!v.zLog} onChange={(e) => set({ zLog: e.target.checked || undefined })} />
          log
        </label>
      </div>
      <div className="row wrap">
        <span className="interval" title="Cap: the values above it are drawn in the colour of the cap (saturate) or not drawn (hide); the colour scale ends at the cap. The data are not changed.">
          cap <NumInput className="short" value={v.cap ?? NaN} placeholder="none" onChange={(c) => set({ cap: Number.isFinite(c) ? c : undefined })} />
          {Number.isFinite(v.cap ?? NaN) && (
            <select className="nodrag" value={v.capHide ? 'hide' : 'saturate'} onChange={(e) => set({ capHide: e.target.value === 'hide' || undefined })}>
              <option value="saturate">saturate above</option>
              <option value="hide">hide above</option>
            </select>
          )}
        </span>
        <label className="radio" title="Bilinear interpolation between the computed points">
          <input className="nodrag" type="checkbox" checked={!!v.smooth} onChange={(e) => set({ smooth: e.target.checked || undefined })} />
          smooth
        </label>
        <label className="radio" title="Gaussian blur of the picture (σ in grid cells; 0 = none). The data are not changed.">
          blur
          <select className="nodrag" value={v.blur ?? 0} onChange={(e) => set({ blur: Number(e.target.value) || undefined })}>
            {[0, 0.5, 1, 1.5, 2, 3].map((b) => (
              <option key={b} value={b}>{b === 0 ? 'off' : `σ ${b}`}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// Slice of the data (polarization, angle): the selects appear only when the data offers a choice (a polarization
// sweep, several angles). `always` shows them anyway (a target that does not see the data).
export function SliceControls(props: {
  slice?: SliceInfo;
  pol?: SpecPol;
  angle?: number;
  onChange: (patch: { pol?: SpecPol; angle?: number }) => void;
  always?: boolean;
  compact?: boolean;
}) {
  const { slice, pol = 'all', angle = NaN, onChange, always, compact } = props;
  const showPol = always || slice?.polAxis || pol !== 'all';
  const showAngle = always || (slice?.angles.length ?? 0) > 1 || Number.isFinite(angle);
  if (!showPol && !showAngle) return null;
  return (
    <>
      {showPol && (
        <select className="nodrag" value={pol} title="Polarization of the curves used" onChange={(e) => onChange({ pol: e.target.value as SpecPol })}>
          <option value="all">{compact ? 'each pol.' : 'each polarization'}</option>
          <option value="s">s (TE)</option>
          <option value="p">p (TM)</option>
          <option value="avg">{compact ? 'mean s,p' : 'mean of s and p'}</option>
        </select>
      )}
      {showAngle &&
        (slice && slice.angles.length > 1 && !always ? (
          <select className="nodrag" value={Number.isFinite(angle) ? String(angle) : ''} title="Angle of incidence of the curves used" onChange={(e) => onChange({ angle: e.target.value === '' ? NaN : Number(e.target.value) })}>
            <option value="">{compact ? 'every θ' : 'every angle'}</option>
            {slice.angles.slice(0, 200).map((a) => (
              <option key={a} value={String(a)}>θ = {+a.toPrecision(6)}°</option>
            ))}
          </select>
        ) : (
          <span className="radio" title="Angle of incidence (empty = every angle)">
            θ <NumInput className="tiny" value={angle} placeholder="all" onChange={(a) => onChange({ angle: a })} />
          </span>
        ))}
    </>
  );
}
