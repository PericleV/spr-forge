import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { applyMark, SHOW_FORMATTING, type Mark } from '../notes/markup.ts';
import { NoteText } from '../notes/NoteText.tsx';
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { FormulaInfo } from '../engine/evaluate.ts';
import { FUNCTION_NAMES } from '../engine/expr.ts';
import type { FormulaStat } from '../engine/objectives.ts';
import type { AppNode, FormulaData, FormulaNode, FormulaTerm, InfoData, InfoNode } from '../types.ts';
import { AutoText, Messages, NumInput, OutPort, Port, Radios, SliceControls } from './ui.tsx';

const fmt = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? `${+v.toPrecision(5)}` : '—');

// Free-text note: what this part of the graph does. Formatted text (markup.ts): edited as text with a small toolbar,
// shown formatted when not edited; its output goes to Combine notes.
const MARK_BUTTONS: [Mark, string, string, CSSProperties][] = [
  ['b', 'B', 'Bold: **text**', { fontWeight: 700 }],
  ['i', 'I', 'Italic: *text*', { fontStyle: 'italic' }],
  ['s', 'S', 'Strikethrough: ~~text~~', { textDecoration: 'line-through' }],
  ['u', 'U', 'Underline: <u>text</u>', { textDecoration: 'underline' }],
];
export function InfoNodeView({ id, data, selected }: NodeProps<InfoNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<InfoData>) => updateNodeData(id, patch);
  const [editing, setEditing] = useState(false);
  const [textColor, setTextColor] = useState('#c00000');
  const area = useRef<HTMLTextAreaElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const sel = useRef<[number, number]>([0, 0]);
  const pending = useRef<{ text: string; start: number; end: number } | null>(null);
  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);
  // restore the selection once the new text is in the text box (the node data updates a render later)
  useEffect(() => {
    const p = pending.current;
    if (p && area.current && area.current.value === p.text) {
      area.current.setSelectionRange(p.start, p.end);
      pending.current = null;
    }
  });
  const mark = (m: Mark, color?: string) => {
    const t = area.current;
    const [s, e] = pending.current ? [pending.current.start, pending.current.end] : t && document.activeElement === t ? [t.selectionStart, t.selectionEnd] : sel.current;
    const r = applyMark(pending.current?.text ?? data.text, s, e, m, color);
    pending.current = r;
    sel.current = [r.start, r.end];
    set({ text: r.text });
    t?.focus();
  };
  // while dragging, the size stays local: writing the node data then would race the resizer's own position change
  // (dragging the left or top edge moved the note without resizing it)
  const [live, setLive] = useState<{ width: number; height: number } | null>(null);
  const size = (p: { width: number; height: number }) => ({ width: p.width, height: Math.max(60, p.height - 32) });
  const frame = { width: live?.width ?? data.width, height: live?.height ?? data.height, ...(data.color ? { '--node-color': data.color } : {}) } as CSSProperties;
  const resizer = (
    <NodeResizer
      isVisible={selected}
      minWidth={180}
      minHeight={90}
      onResize={(_, p) => setLive(size(p))}
      onResizeEnd={(_, p) => {
        setLive(null);
        set(size(p));
      }}
    />
  );
  // formatting hidden: a plain text box, as written
  if (!SHOW_FORMATTING)
    return (
      <div className="node node-info" style={frame}>
        {resizer}
        <div className="row port-row">
          <AutoText className="title-input" value={data.title} placeholder="Title" onChange={(title) => set({ title })} />
          <input className="nodrag" type="color" value={data.color || '#8a93a6'} title="colour of the note" onChange={(e) => set({ color: e.target.value })} />
          <Port kind="source" id="out" port="note" />
        </div>
        <textarea className="nodrag nowheel" value={data.text} placeholder="Notes: what this part of the graph does, assumptions, results…" onChange={(e) => set({ text: e.target.value })} />
      </div>
    );
  return (
    <div className="node node-info" style={frame}>
      {resizer}
      {/* a port row: the note's output handle sits on the node's right edge, level with the title */}
      <div className="row port-row">
        <AutoText className="title-input" value={data.title} placeholder="Title" onChange={(title) => set({ title })} />
        <input className="nodrag" type="color" value={data.color || '#8a93a6'} title="colour of the note" onChange={(e) => set({ color: e.target.value })} />
        <Port kind="source" id="out" port="note" />
      </div>
      {editing && (
        <div className="row note-bar" ref={bar}>
          {MARK_BUTTONS.map(([m, label, title, style]) => (
            <button key={m} className="nodrag" title={title} style={style} onMouseDown={(e) => e.preventDefault()} onClick={() => mark(m)}>
              {label}
            </button>
          ))}
          <button className="nodrag" title="Text colour: <span style=&quot;color:…&quot;>text</span> (again with the same colour: removed)" onMouseDown={(e) => e.preventDefault()} onClick={() => mark('color', textColor)}>
            <span style={{ color: textColor, fontWeight: 700 }}>A</span>
          </button>
          <input className="nodrag" type="color" value={textColor} title="Text colour to apply" onChange={(e) => {
            setTextColor(e.target.value);
            mark('color', e.target.value);
          }} />
        </div>
      )}
      {editing ? (
        <textarea
          ref={area}
          className="nodrag nowheel"
          value={data.text}
          placeholder="Notes: what this part of the graph does, assumptions, results…"
          onChange={(e) => {
            pending.current = null;
            set({ text: e.target.value });
          }}
          onSelect={(e) => (sel.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          onBlur={(e) => {
            // the toolbar (its colour picker) keeps the editing on
            if (!(e.relatedTarget && bar.current?.contains(e.relatedTarget as Node))) setEditing(false);
          }}
        />
      ) : (
        <div className="note-view nowheel" title="Click to edit" onClick={() => setEditing(true)}>
          {data.text ? <NoteText text={data.text} /> : <span className="muted">Notes: what this part of the graph does, assumptions, results… (click to edit)</span>}
        </div>
      )}
    </div>
  );
}

const STATS: [FormulaStat, string][] = [
  ['mean', 'mean'],
  ['min', 'min'],
  ['max', 'max'],
  ['rms', 'RMS'],
  ['at', 'value at'],
  ['fge', 'fraction ≥'],
  ['fle', 'fraction ≤'],
];

// Where a term takes its values: along an axis of its source inside an interval (or at one point), in a slice
// (polarization, angle); the level of a fraction ≥ / ≤ and its smoothing.
function TermDetails({ term: t, source, onChange }: { term: FormulaTerm; source?: FormulaInfo['sources'][number]; onChange: (patch: Partial<FormulaTerm>) => void }) {
  const axes = source?.axes ?? [];
  const along = t.along ?? '';
  if (!axes.length && !along && t.stat !== 'fge' && t.stat !== 'fle' && t.stat !== 'at') return null;
  return (
    <div className="zone-row sub">
      {(axes.length > 0 || along) && (
        <select className="nodrag" value={along} title="Values along an axis of the source (inside an interval), or every value" onChange={(e) => onChange({ along: e.target.value || undefined })}>
          <option value="">all values</option>
          {axes.map((a) => (
            <option key={a.id} value={a.id}>{t.stat === 'at' ? `at ${a.label} =` : `${a.label} in`}</option>
          ))}
        </select>
      )}
      {along && <NumInput className="tiny" value={t.lo ?? NaN} placeholder={t.stat === 'at' ? 'x' : 'min'} onChange={(lo) => onChange({ lo })} />}
      {along && t.stat !== 'at' && (
        <>
          – <NumInput className="tiny" value={t.hi ?? NaN} placeholder="max" onChange={(hi) => onChange({ hi })} />
        </>
      )}
      <SliceControls slice={source?.slice} pol={t.pol} angle={t.angle} onChange={onChange} compact />
      {(t.stat === 'fge' || t.stat === 'fle') && (
        <>
          <span className="radio" title="Level of the fraction">level <NumInput className="tiny" value={t.level ?? 0} step={0.01} onChange={(level) => onChange({ level })} /></span>
          <span className="radio" title="Smoothing (logistic step width, in units of the quantity; 0 = exact count). A smooth step lets gradient methods work.">
            soft <NumInput className="tiny" value={t.soft ?? 0} step={0.001} onChange={(soft) => onChange({ soft })} />
          </span>
        </>
      )}
    </div>
  );
}

// Objective from an expression of analysis results (FWHM, sensitivity, FOM, minima…).
export function FormulaNodeView({ id, data }: NodeProps<FormulaNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<FormulaData>) => updateNodeData(id, patch);
  const result = useNodeResult(id);
  const info = result?.info as FormulaInfo | undefined;
  const options = (info?.sources ?? []).flatMap((s) => s.fields.map((f) => ({ value: `${s.key}|${f.key}`, label: `${s.label} · ${f.short}${f.unit ? ` [${f.unit}]` : ''}` })));
  const setTerm = (i: number, patch: Partial<FormulaTerm>) => set({ terms: data.terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTerm = () => {
    const used = new Set(data.terms.map((t) => t.name));
    const name = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !used.has(c)) ?? `v${data.terms.length + 1}`;
    const [source, field] = (options[data.terms.length % Math.max(1, options.length)]?.value ?? '|').split('|');
    set({ terms: [...data.terms, { name, source, field, stat: 'mean' }] });
  };
  return (
    <div className="node node-formula">
      <div className="port-row">
        <Port kind="target" id="in" port="data" />
        <span className="muted">data (several)</span>
      </div>
      <label>
        Name
        <input className="nodrag" value={data.name} placeholder="auto" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="hint">Connect analysis outputs or spectra (several allowed): FWHM, Sensitivity (S, FOM), Min / Max, Fit parameters, Compute TMM (e.g. Ts / Tp at a wavelength, the fraction of points with R ≥ 0.99)…</div>
      <div className="zones">
        {data.terms.flatMap((t, i) => [
          <div className="zone-row" key={i}>
            <input className="nodrag var-name" value={t.name} onChange={(e) => setTerm(i, { name: e.target.value.replace(/[^\w]/g, '') })} />
            <span>=</span>
            <select className="nodrag" value={t.stat} onChange={(e) => setTerm(i, { stat: e.target.value as FormulaStat })}>
              {STATS.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <select
              className="nodrag source"
              value={`${t.source}|${t.field}`}
              onChange={(e) => {
                const [source, field] = e.target.value.split('|');
                setTerm(i, { source, field });
              }}
            >
              {!options.some((o) => o.value === `${t.source}|${t.field}`) && <option value={`${t.source}|${t.field}`}>{t.field || '(choose)'} — not connected</option>}
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="val">{fmt(info?.values[t.name])}</span>
            <button className="nodrag" title="remove" onClick={() => set({ terms: data.terms.filter((_, j) => j !== i) })}>×</button>
          </div>,
          <TermDetails key={`d${i}`} term={t} source={info?.sources.find((x) => x.key === t.source)} onChange={(patch) => setTerm(i, patch)} />,
        ])}
        <button className="nodrag" onClick={addTerm} disabled={!options.length}>+ variable</button>
      </div>
      <label>
        Expression
        <textarea
          className="nodrag nowheel mono expr"
          rows={Math.min(6, Math.max(2, Math.ceil(data.expr.length / 55)))}
          value={data.expr}
          spellCheck={false}
          placeholder="e.g. 0.5*a + 0.25*b/10 - 0.25*c/100"
          onChange={(e) => set({ expr: e.target.value })}
        />
      </label>
      <div className="hint">+ − * / ^, parentheses, {FUNCTION_NAMES.join(', ')}. Divide by a typical value to put terms on the same scale.</div>
      <div className="row wrap">
        <Radios<FormulaData['goal']>
          name={`${id}-goal`}
          value={data.goal}
          options={[
            ['min', 'minimize'],
            ['max', 'maximize'],
          ]}
          onChange={(goal) => set({ goal })}
        />
        <label className="radio">weight <NumInput className="tiny" value={data.weight} step={0.1} onChange={(weight) => set({ weight })} /></label>
      </div>
      <div className="stack-rows results">
        <div className="val">value = {fmt(info?.value)} · cost = {fmt(info?.cost)}</div>
      </div>
      <Messages result={result} />
      <OutPort label="objective" port="objective" />
    </div>
  );
}
