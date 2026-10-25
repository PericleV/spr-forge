import { useEffect, useRef, useState } from 'react';
import { SWATCHES } from './theme.ts';

// A colour square of the top bar (the selection, the accent): opens the list of colours, “Custom” (any colour) and,
// for the accent, “Same as selection”. The square shows the colour in use (its dark shade in the dark theme).
export function ColorChoice({ value, shown, label, title, same, onChange }: { value: string; shown: string; label: string; title: string; same?: boolean; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (c: string) => {
    onChange(c);
    setOpen(false);
  };
  const hex = value === 'same' ? null : value.toLowerCase();
  return (
    <span className="color-choice" ref={box}>
      <button className={open ? 'active' : ''} onClick={() => setOpen(!open)} title={title} aria-expanded={open}>
        <i style={{ background: shown }} />
        <span className="tb-label">{label}</span>
      </button>
      {open && (
        <div className="color-menu">
          <b>{title}</b>
          {same && (
            <button className={value === 'same' ? 'on' : ''} onClick={() => pick('same')}>
              Same as selection
            </button>
          )}
          <div className="color-grid">
            {SWATCHES.map((s) => (
              <button key={s.name} className={hex === s.light ? 'on' : ''} title={s.name} aria-label={s.name} style={{ background: s.light }} onClick={() => pick(s.light)} />
            ))}
          </div>
          <label className="color-custom">
            Custom
            <input type="color" value={hex ?? SWATCHES[0].light} onChange={(e) => onChange(e.target.value)} />
          </label>
        </div>
      )}
    </span>
  );
}
