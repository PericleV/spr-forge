// The welcome window: at every start (until "Don't show this again" is kept) and from Help. It continues the last project,
// starts an empty one, or opens an example from the gallery (the examples by subject and heading, each with one line).
import { useEffect, useState } from 'react';
import { sectionsOf, type ExampleInfo } from './exampleSections.ts';
import { Logo } from './Logo.tsx';
import { rememberWelcome } from './welcomeState.ts';

type Props = {
  onClose: () => void;
  onEmpty: () => void;
  onHelp: () => void;
  examples: ExampleInfo[];
  onExample: (index: number) => void;
  last?: { name: string; saved: number; open: () => void }; // the project open when the page was left
};

export function Welcome({ onClose, onEmpty, onHelp, examples, onExample, last }: Props) {
  const [dontShow, setDontShow] = useState(false);
  const close = (then?: () => void) => {
    rememberWelcome(dontShow);
    onClose();
    then?.();
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  const sections = sectionsOf(examples);
  return (
    <div className="welcome-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <button className="welcome-x" onClick={() => close()} aria-label="Close">
          ✕
        </button>
        <Logo height={72} />
        <h2 id="welcome-title">Welcome to SPR Forge</h2>
        <p>
          SPR Forge simulates thin films and 1D gratings, free and in your browser. You build a structure out of Material, Layer and stack nodes, then
          compute its reflectance, transmittance and fields: transfer matrices for films, RCWA for gratings, Berreman 4×4 for anisotropic layers and
          liquid crystals. From there you can analyse, fit, optimize, design filters or estimate tolerances. Change a parameter and every result after it
          updates.
        </p>
        <p className="muted">Nothing is uploaded. Your projects stay in this browser and in the files you save.</p>
        <div className="welcome-actions">
          {last && (
            <button className="primary" onClick={() => close(last.open)} title={`Saved ${new Date(last.saved).toLocaleString()}`}>
              Continue “{last.name || 'untitled'}”
            </button>
          )}
          <button className={last ? '' : 'primary'} onClick={() => close(onEmpty)}>
            Start an empty project
          </button>
          <button onClick={() => close(onHelp)}>Help</button>
        </div>
        <h3 className="welcome-sub">Examples</h3>
        <div className="welcome-gallery">
          {examples.length ? (
            sections.map((s) => (
              <section key={s.group}>
                <h4>{s.group}</h4>
                {s.subs.map((b) => (
                  <div key={b.sub}>
                    {b.sub && <h5>{b.sub}</h5>}
                    <div className="welcome-cards">
                      {b.items.map(({ ex, i }) => (
                        <button key={i} className="welcome-card" onClick={() => close(() => onExample(i))}>
                          <b>{ex.name}</b>
                          <span>{ex.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))
          ) : (
            <div className="hint">Loading the examples</div>
          )}
        </div>
        <label className="radio welcome-check">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Don’t show this at start. You can still open it from Help, and the page will start with an empty project.
        </label>
      </div>
    </div>
  );
}
