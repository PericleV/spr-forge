import { COMPONENTS, paramUnit, rangeFor, type ComponentType, type FitComponent, type FitParam, type ParamDef } from '../engine/fitmodels.ts';
import { paramId } from '../engine/fitrun.ts';
import { NumInput } from './ui.tsx';

export function ParamRow(props: {
  def: ParamDef;
  param: FitParam;
  unit: string;
  range: [number, number];
  sigma?: number;
  onChange: (p: FitParam) => void;
}) {
  const { def, param, unit, range, sigma, onChange } = props;
  const step = (range[1] - range[0]) / 1000 || 0.001;
  return (
    <div className="fit-param" title={def.hint}>
      <span className="name">{def.label}</span>
      <input
        className="nodrag nowheel"
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={Number.isFinite(param.value) ? param.value : range[0]}
        disabled={param.fixed}
        onChange={(e) => onChange({ ...param, value: Number(e.target.value) })}
      />
      <NumInput className="short" value={+param.value.toPrecision(6)} step={step} onChange={(value) => onChange({ ...param, value })} />
      <span className="unit">{unit}</span>
      <label className="radio lock" title="Keep fixed during the fit">
        <input className="nodrag" type="checkbox" checked={param.fixed} onChange={(e) => onChange({ ...param, fixed: e.target.checked })} />
        🔒
      </label>
      <span className="sigma val">{sigma !== undefined && Number.isFinite(sigma) ? `±${+sigma.toPrecision(2)}` : ''}</span>
    </div>
  );
}


// Editor of a list of model components: parameter sliders, lock, uncertainty, add/remove.
export function ComponentsEditor(props: {
  components: FitComponent[];
  onChange: (components: FitComponent[]) => void;
  onAdd: (type: ComponentType) => void;
  xRange: [number, number];
  yRange: [number, number];
  xUnit: string;
  yUnit: string;
  sigma?: (id: string) => number | undefined;
}) {
  const { components, onChange, xRange, yRange, xUnit, yUnit, sigma } = props;
  const setComponent = (ci: number, c: FitComponent) => onChange(components.map((k, j) => (j === ci ? c : k)));
  return (
    <>
      {components.map((c, ci) => {
        const def = COMPONENTS[c.type];
        return (
          <div className="fit-comp" key={c.id}>
            <div className="row">
              <b>{def.label} {ci + 1}</b>
              <span className="muted" title={def.note}>ⓘ</span>
              <button className="nodrag remove" title="remove" onClick={() => onChange(components.filter((_, j) => j !== ci))}>×</button>
            </div>
            {def.params.map((p) => (
              <ParamRow
                key={p.key}
                def={p}
                param={c.params[p.key]}
                unit={paramUnit(p.kind, xUnit, yUnit)}
                range={rangeFor(p.kind, c.params[p.key].value, xRange, yRange)}
                sigma={sigma?.(paramId(c.id, p.key))}
                onChange={(v) => setComponent(ci, { ...c, params: { ...c.params, [p.key]: v } })}
              />
            ))}
          </div>
        );
      })}
      <select className="nodrag" value="" onChange={(e) => e.target.value && props.onAdd(e.target.value as ComponentType)}>
        <option value="">+ add component…</option>
        {(Object.keys(COMPONENTS) as ComponentType[]).map((t) => (
          <option key={t} value={t}>{COMPONENTS[t].label}</option>
        ))}
      </select>
    </>
  );
}
