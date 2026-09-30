// The welcome window: at every start (until "Don't show this again" is kept) and from Help. It continues the last project,
// starts an empty one, or opens an example from the gallery (the examples by subject, each with one line).
import { useEffect, useState } from 'react';
import { Logo } from './Logo.tsx';
import { rememberWelcome } from './welcomeState.ts';

export type WelcomeExample = { group: string; name: string; desc: string };
type Props = {
  onClose: () => void;
  onEmpty: () => void;
  onHelp: () => void;
  examples: WelcomeExample[];
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
  const groups = [...new Set(examples.map((e) => e.group))];
  return (
    <div className="welcome-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <button className="welcome-x" onClick={() => close()} aria-label="Close">
          ✕
        </button>
        <Logo height={72} />
        <h2 id="welcome-title">Welcome to SPR Forge</h2>
        <p>
          A free, node-based simulator for thin films and 1D gratings, running entirely in your browser. Build a structure from Material, Layer and stack
          nodes, compute its reflectance, transmittance and fields — transfer matrices, RCWA for gratings, Berreman 4×4 for anisotropic layers and liquid
          crystals — then analyse, fit, optimize, design filters or estimate tolerances. Every result follows the parameters as you change them.
        </p>
        <p className="muted">Nothing is uploaded: your projects stay in this browser and in the files you save.</p>
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
            groups.map((g) => (
              <section key={g}>
                <h4>{g}</h4>
                <div className="welcome-cards">
                  {examples.map((ex, i) =>
                    ex.group === g ? (
                      <button key={ex.name} className="welcome-card" onClick={() => close(() => onExample(i))}>
                        <b>{ex.name}</b>
                        <span>{ex.desc}</span>
                      </button>
                    ) : null,
                  )}
                </div>
              </section>
            ))
          ) : (
            <div className="hint">loading the examples…</div>
          )}
        </div>
        <label className="radio welcome-check">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Don’t show this at start (it stays in Help; the page then opens an empty project)
        </label>
      </div>
    </div>
  );
}
