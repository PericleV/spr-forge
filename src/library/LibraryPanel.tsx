import { useMemo, useRef, useState } from 'react';
import { FORMULA_TEXT, refractiveIndex, validRange, type EmaMethod, type MaterialDef, type MaterialModel } from '../physics/materials.ts';
import { parseTable, type TableColumns, type TableUnit } from '../physics/importers.ts';
import { LinePlot } from '../plot/LinePlot.tsx';
import { useLibrary } from './context.ts';

const COLORS = ['#e07b39', '#59a14f', '#4e79a7', '#b07aa1', '#edc948', '#76b7b2', '#ff9da7', '#9c755f'];
const TYPES: [MaterialModel['type'], string][] = [
  ['constant', 'Constant n, k'],
  ['tabulated', 'Tabulated (CSV / list)'],
  ['formula', 'Dispersion formula'],
  ['drude-lorentz', 'Drude-Lorentz'],
  ['ema', 'Porous (effective medium)'],
  ['drude-carrier', 'Doped semiconductor (Drude, carrier density)'],
];

const newId = () => `user-${crypto.randomUUID().slice(0, 8)}`;
const num = (v: string) => (v === '' ? NaN : Number(v));

const defaultModel = (type: MaterialModel['type']): MaterialModel => {
  switch (type) {
    case 'constant':
      return { type, n: 1.5, k: 0 };
    case 'tabulated':
      return { type, table: { lambda: [0.4, 0.8], n: [1.5, 1.5], k: [0, 0] }, extrap: 'clamp' };
    case 'formula':
      return { type, formula: 2, coefficients: [0, 1.0, 0.01], k: 0 };
    case 'drude-lorentz':
      return { type, epsInf: 1, wp: 9, gamma: 0.07, osc: [] };
    case 'ema':
      return { type, method: 'bruggeman', host: 'Si', filler: 'Air', porosity: 0.5 };
    case 'drude-carrier':
      // CdO (J. R. Nolen et al., Phys. Rev. Mater. 4, 025202 (2020))
      return { type, epsInf: 5.1, N: 1, mStar0: 0.1, C: 0.5, mobility: 200 };
  }
};

export function LibraryPanel({ onClose }: { onClose: () => void }) {
  const { list, setUser } = useLibrary();
  const [sel, setSel] = useState<string>(list[0]?.id ?? '');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const current = list.find((m) => m.id === sel);

  const add = (m: Omit<MaterialDef, 'id' | 'color'> & { color?: string }) => {
    const def: MaterialDef = { color: COLORS[list.length % COLORS.length], ...m, id: newId() };
    setUser((u) => [...u, def]);
    setSel(def.id);
    return def;
  };
  const update = (patch: Partial<MaterialDef>) => setUser((u) => u.map((m) => (m.id === sel ? { ...m, ...patch } : m)));

  const importFile = async (f: File) => {
    const t = parseTable(await f.text(), 'nm', 'nk');
    if (typeof t === 'string') return setMsg(t);
    add({ name: f.name.replace(/\.[^.]+$/, ''), model: { type: 'tabulated', table: t.table, extrap: 'clamp' }, range: t.range, source: f.name });
    setMsg(`Imported ${f.name} as λ [nm], n, k. If the file uses µm, eV or ε₁, ε₂, reload it in the editor below with those settings.`);
  };

  return (
    <aside className="library">
      <header>
        <strong>Material library</strong>
        <button onClick={onClose}>✕</button>
      </header>
      <div className="row wrap">
        <button onClick={() => add({ name: 'New material', model: defaultModel('constant') })}>+ New</button>
        <button onClick={() => file.current?.click()}>Import CSV…</button>
        <input
          ref={file}
          type="file"
          accept=".csv,.txt,.dat,.tsv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {msg && <div className="hint">{msg}</div>}

      <div className="lib-list">
        {list.map((m) => (
          <button key={m.id} className={`lib-item ${m.id === sel ? 'active' : ''}`} onClick={() => setSel(m.id)}>
            <i className="swatch" style={{ background: m.color }} />
            <span>{m.name}</span>
            <span className="muted">{m.builtin ? 'built-in' : m.model.type}{m.monolayer ? ' · 2D' : ''}</span>
          </button>
        ))}
      </div>

      {current && (
        <MaterialEditor
          key={current.id}
          def={current}
          onChange={update}
          onDuplicate={() => add({ ...current, builtin: undefined, name: `${current.name} copy` })}
          onDelete={() => {
            setUser((u) => u.filter((m) => m.id !== current.id));
            setSel(list[0].id);
          }}
        />
      )}
    </aside>
  );
}

function MaterialEditor(props: { def: MaterialDef; onChange: (p: Partial<MaterialDef>) => void; onDuplicate: () => void; onDelete: () => void }) {
  const { def, onChange } = props;
  const { lib, list } = useLibrary();
  const ro = !!def.builtin;
  const m = def.model;
  const setModel = (patch: Partial<MaterialModel>) => onChange({ model: { ...m, ...patch } as MaterialModel });

  return (
    <div className="lib-editor">
      <div className="row">
        <input className="name" value={def.name} disabled={ro} onChange={(e) => onChange({ name: e.target.value })} />
        <input type="color" value={def.color} onChange={(e) => onChange({ color: e.target.value })} title="Drawing colour" disabled={ro} />
      </div>
      {def.source && <div className="hint source">{def.source}</div>}
      <label>
        Type
        <select value={m.type} disabled={ro} onChange={(e) => onChange({ model: defaultModel(e.target.value as MaterialModel['type']) })}>
          {TYPES.map(([t, label]) => (
            <option key={t} value={t}>{label}</option>
          ))}
        </select>
      </label>

      {m.type === 'constant' && (
        <div className="row">
          <label>n <input type="number" step={0.01} value={m.n} disabled={ro} onChange={(e) => setModel({ n: num(e.target.value) })} /></label>
          <label>k <input type="number" step={0.01} value={m.k} disabled={ro} onChange={(e) => setModel({ k: num(e.target.value) })} /></label>
        </div>
      )}
      {m.type === 'tabulated' && <TableEditor def={def} ro={ro} onChange={onChange} />}
      {m.type === 'formula' && (
        <>
          <label>
            Formula
            <select value={m.formula} disabled={ro} onChange={(e) => setModel({ formula: Number(e.target.value) })}>
              {Object.entries(FORMULA_TEXT).map(([f, t]) => (
                <option key={f} value={f}>{f}: {t}</option>
              ))}
            </select>
          </label>
          <label>
            Coefficients C1 C2 …
            <input
              defaultValue={m.coefficients.join(' ')}
              disabled={ro}
              onBlur={(e) => setModel({ coefficients: e.target.value.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite) })}
            />
          </label>
          <div className="hint">λ in µm, as on refractiveindex.info.{m.kTable ? ' k is tabulated.' : ''}</div>
          {!m.kTable && <label>k (constant) <input type="number" step={0.001} value={m.k} disabled={ro} onChange={(e) => setModel({ k: num(e.target.value) })} /></label>}
          <RangeEditor def={def} ro={ro} onChange={onChange} />
        </>
      )}
      {m.type === 'drude-lorentz' && (
        <>
          <div className="hint">ε(E) = ε∞ − ωp²/(E² + iγE) + Σ f·ω0²/(ω0² − E² − iγE), energies in eV</div>
          <div className="row">
            <label>ε∞ <input type="number" step={0.1} value={m.epsInf} disabled={ro} onChange={(e) => setModel({ epsInf: num(e.target.value) })} /></label>
            <label>ωp <input type="number" step={0.1} value={m.wp} disabled={ro} onChange={(e) => setModel({ wp: num(e.target.value) })} /></label>
            <label>γ <input type="number" step={0.01} value={m.gamma} disabled={ro} onChange={(e) => setModel({ gamma: num(e.target.value) })} /></label>
          </div>
          {m.osc.map((o, i) => (
            <div className="row" key={i}>
              <span className="muted">osc {i + 1}</span>
              {(['f', 'w0', 'g'] as const).map((k) => (
                <label key={k}>
                  {k === 'w0' ? 'ω0' : k === 'g' ? 'γ' : 'f'}
                  <input type="number" step={0.01} value={o[k]} disabled={ro} onChange={(e) => setModel({ osc: m.osc.map((x, j) => (j === i ? { ...x, [k]: num(e.target.value) } : x)) })} />
                </label>
              ))}
              {!ro && <button onClick={() => setModel({ osc: m.osc.filter((_, j) => j !== i) })}>×</button>}
            </div>
          ))}
          {!ro && <button onClick={() => setModel({ osc: [...m.osc, { f: 1, w0: 3, g: 0.2 }] })}>+ oscillator</button>}
          <RangeEditor def={def} ro={ro} onChange={onChange} />
        </>
      )}
      {m.type === 'drude-carrier' && (
        <>
          <div className="hint">
            ε = ε∞ − ωp²/(E² + iγE); ωp² = N e²/(ε₀ m*), γ = e/(μ m*), m* = m0*·√(1 + 2C·ħ²k_F²/m0*), k_F = (3π²N)^⅓ (Nolen et al. 2020). N can be set or swept
            (Design variable) in the Material node.
          </div>
          <div className="row">
            <label>ε∞ <input type="number" step={0.1} value={m.epsInf} disabled={ro} onChange={(e) => setModel({ epsInf: num(e.target.value) })} /></label>
            <label title="Carrier density, 10²⁰ cm⁻³">N <input type="number" step={0.1} value={m.N} disabled={ro} onChange={(e) => setModel({ N: num(e.target.value) })} /></label>
            <label title="Mobility, cm²/(V·s)">μ <input type="number" step={10} value={m.mobility} disabled={ro} onChange={(e) => setModel({ mobility: num(e.target.value) })} /></label>
          </div>
          <div className="row">
            <label title="Effective mass at the band bottom, in electron masses">m0* <input type="number" step={0.01} value={m.mStar0} disabled={ro} onChange={(e) => setModel({ mStar0: num(e.target.value) })} /></label>
            <label title="Non-parabolicity, eV⁻¹">C <input type="number" step={0.01} value={m.C} disabled={ro} onChange={(e) => setModel({ C: num(e.target.value) })} /></label>
          </div>
          <RangeEditor def={def} ro={ro} onChange={onChange} />
        </>
      )}
      {m.type === 'ema' && (
        <>
          <label>
            Method
            <select value={m.method} disabled={ro} onChange={(e) => setModel({ method: e.target.value as EmaMethod })}>
              <option value="bruggeman">Bruggeman</option>
              <option value="maxwell-garnett">Maxwell-Garnett</option>
              <option value="looyenga">Looyenga</option>
            </select>
          </label>
          <label>
            Host (skeleton)
            <select value={m.host} disabled={ro} onChange={(e) => setModel({ host: e.target.value })}>
              {list.filter((x) => x.id !== def.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>
            Pore filler
            <select value={m.filler} disabled={ro} onChange={(e) => setModel({ filler: e.target.value })}>
              {list.filter((x) => x.id !== def.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>
            Porosity (0–1)
            <input type="number" min={0} max={1} step={0.01} value={m.porosity} disabled={ro} onChange={(e) => setModel({ porosity: num(e.target.value) })} />
          </label>
          {(!lib.has(m.host) || !lib.has(m.filler)) && <div className="msg err">Host or filler is missing from the library.</div>}
          {!(m.porosity >= 0 && m.porosity <= 1) && <div className="msg err">Porosity must be between 0 and 1.</div>}
        </>
      )}

      <label className="radio">
        <input type="checkbox" checked={!!def.monolayer} disabled={ro} onChange={(e) => onChange({ monolayer: e.target.checked ? 0.335 : undefined })} />
        2D material
        {def.monolayer !== undefined && (
          <>
            , monolayer
            <input type="number" className="short" step={0.01} value={def.monolayer} disabled={ro} onChange={(e) => onChange({ monolayer: num(e.target.value) })} /> nm
          </>
        )}
      </label>
      <div className="hint">2D materials take a number of layers instead of a thickness in the Layer node.</div>

      <Preview def={def} />

      <div className="row">
        <button onClick={props.onDuplicate}>Duplicate</button>
        {!ro && <button className="danger" onClick={props.onDelete}>Delete</button>}
        {ro && <span className="hint">Built-in materials are read-only; duplicate to edit.</span>}
      </div>
    </div>
  );
}

function RangeEditor({ def, ro, onChange }: { def: MaterialDef; ro: boolean; onChange: (p: Partial<MaterialDef>) => void }) {
  const r = def.range ?? [NaN, NaN];
  const set = (i: 0 | 1, v: number) => {
    const next: [number, number] = [...r] as [number, number];
    next[i] = v;
    onChange({ range: next.every(Number.isFinite) ? next : undefined });
  };
  return (
    <div className="row">
      <span className="muted">Valid range [nm]</span>
      <input type="number" className="short" value={Number.isNaN(r[0]) ? '' : r[0]} disabled={ro} onChange={(e) => set(0, num(e.target.value))} />
      –
      <input type="number" className="short" value={Number.isNaN(r[1]) ? '' : r[1]} disabled={ro} onChange={(e) => set(1, num(e.target.value))} />
    </div>
  );
}

function TableEditor({ def, ro, onChange }: { def: MaterialDef; ro: boolean; onChange: (p: Partial<MaterialDef>) => void }) {
  const m = def.model as Extract<MaterialModel, { type: 'tabulated' }>;
  const [text, setText] = useState('');
  const [unit, setUnit] = useState<TableUnit>('nm');
  const [cols, setCols] = useState<TableColumns>('nk');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const apply = (src: string) => {
    const t = parseTable(src, unit, cols);
    if (typeof t === 'string') return setMsg(t);
    onChange({ model: { ...m, table: t.table }, range: t.range });
    setMsg(`Loaded ${t.table.lambda.length} points.`);
  };
  const t = m.table;
  return (
    <>
      <div className="hint">
        {t.lambda.length} points, {+(t.lambda[0] * 1000).toFixed(1)}–{+(t.lambda[t.lambda.length - 1] * 1000).toFixed(1)} nm
      </div>
      <label>
        Outside the data
        <select value={m.extrap} disabled={ro} onChange={(e) => onChange({ model: { ...m, extrap: e.target.value as 'clamp' | 'linear' } })}>
          <option value="clamp">hold end values</option>
          <option value="linear">extrapolate linearly</option>
        </select>
      </label>
      {!ro && (
        <>
          <div className="row">
            <select value={unit} onChange={(e) => setUnit(e.target.value as TableUnit)}>
              <option value="nm">x = λ [nm]</option>
              <option value="um">x = λ [µm]</option>
              <option value="eV">x = E [eV]</option>
            </select>
            <select value={cols} onChange={(e) => setCols(e.target.value as TableColumns)}>
              <option value="nk">columns x, n, k</option>
              <option value="n">columns x, n</option>
              <option value="eps">columns x, ε₁, ε₂</option>
            </select>
          </div>
          <textarea rows={5} value={text} placeholder={'Paste rows, e.g.\n400  1.47  0.001\n500  1.46  0.000\n(header lines are skipped; comma, tab or space separated)'} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button onClick={() => apply(text)}>Apply pasted data</button>
            <button onClick={() => file.current?.click()}>Load CSV…</button>
            <input ref={file} type="file" hidden accept=".csv,.txt,.dat,.tsv" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) apply(await f.text());
              e.target.value = '';
            }} />
          </div>
          {msg && <div className="hint">{msg}</div>}
        </>
      )}
    </>
  );
}

function Preview({ def }: { def: MaterialDef }) {
  const { lib } = useLibrary();
  const models = useMemo(() => Object.fromEntries([...lib].map(([id, d]) => [id, d.model])), [lib]);
  const data = useMemo(() => {
    const [lo, hi] = validRange(def.id, lib);
    const a = Number.isFinite(lo) && lo > 0 ? lo : 300;
    const b = Number.isFinite(hi) ? Math.min(hi, a * 20) : 1600;
    const xs = Array.from({ length: 301 }, (_, i) => a + ((b - a) * i) / 300);
    const nk = xs.map((l) => refractiveIndex(def.id, models, l));
    return { xs, n: nk.map((z) => z.re), k: nk.map((z) => z.im) };
  }, [def, lib, models]);
  return (
    <div className="chart">
      <LinePlot
        xAxis={{ id: 'lambda', label: 'λ', unit: 'nm', values: data.xs }}
        series={[
          { key: 'n', label: 'n', color: '#4e79a7', y: data.n },
          { key: 'k', label: 'k', color: '#e15759', y: data.k, dash: '6 3' },
        ]}
        yLabel="n, k"
        yUnit=""
        width={380}
        height={200}
      />
      <div className="legend">
        <span><i style={{ background: '#4e79a7' }} />n</span>
        <span><i style={{ background: '#e15759' }} />k</span>
      </div>
    </div>
  );
}
