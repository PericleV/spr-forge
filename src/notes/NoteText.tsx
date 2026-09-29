// A formatted note as React elements (markup.ts): no HTML is injected, the markers become elements.
import type { CSSProperties } from 'react';
import { parseNote, type NoteDoc, type Span } from './markup.ts';

function SpanView({ s }: { s: Span }) {
  let el = <>{s.text}</>;
  if (s.style.b) el = <strong>{el}</strong>;
  if (s.style.i) el = <em>{el}</em>;
  if (s.style.s) el = <s>{el}</s>;
  if (s.style.u) el = <u>{el}</u>;
  return s.style.color ? <span style={{ color: s.style.color } as CSSProperties}>{el}</span> : el;
}

// A combined document as written (formatting hidden): the titles bold, a level smaller at each depth, the texts as typed.
export function DocPreview({ doc, depth = 1 }: { doc: NoteDoc; depth?: number }) {
  const t = doc.title.trim();
  return (
    <>
      {t && <div className={`note-h note-h${Math.min(depth, 3)}`}>{t}</div>}
      {doc.body.trim() && <div className="note-body">{doc.body.trimEnd()}</div>}
      {doc.children.map((c, i) => (
        <DocPreview key={i} doc={c} depth={t ? depth + 1 : depth} />
      ))}
    </>
  );
}

export function NoteText({ text }: { text: string }) {
  const lines = parseNote(text);
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className={l.heading ? `note-h note-h${Math.min(l.heading, 3)}` : 'note-line'}>
          {l.spans.length ? l.spans.map((s, j) => <SpanView key={j} s={s} />) : ' '}
        </div>
      ))}
    </>
  );
}
