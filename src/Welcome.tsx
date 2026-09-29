// The welcome window: shown at the first start (until "Don't show this again" is kept), and from Help.
import { useEffect, useState } from 'react';
import { Logo } from './Logo.tsx';
import { rememberWelcome } from './welcomeState.ts';

type Props = { onClose: () => void; onExamples: () => void; onEmpty: () => void; onHelp: () => void };
export function Welcome({ onClose, onExamples, onEmpty, onHelp }: Props) {
  const [dontShow, setDontShow] = useState(true);
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
          <button className="primary" onClick={() => close(onExamples)}>
            Open an example
          </button>
          <button onClick={() => close(onEmpty)}>Start an empty project</button>
          <button onClick={() => close(onHelp)}>Help</button>
        </div>
        <label className="radio welcome-check">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Don’t show this again (it stays in Help)
        </label>
      </div>
    </div>
  );
}
