// Help: getting started, the nodes by section, keyboard and mouse, the examples and the validation of the physics.
import { GETTING_STARTED, NODE_HELP, SHORTCUTS, VALIDATION } from './help.ts';
import { GROUP_COLORS, NODE_SECTION, NODE_TITLES } from './nodeColors.ts';
import type { AppNode } from './types.ts';

export function HelpPanel({ onClose, onWelcome, examples }: { onClose: () => void; onWelcome: () => void; examples: { group: string; name: string }[] }) {
  const groups = [...new Set(examples.map((e) => e.group))];
  const sections = Object.keys(GROUP_COLORS) as (keyof typeof GROUP_COLORS)[];
  return (
    <aside className="library help-panel">
      <header>
        <strong>Help — SPR Forge</strong>
        <span className="row">
          <button onClick={onWelcome} title="The welcome window">Welcome</button>
          <button onClick={onClose}>✕</button>
        </span>
      </header>
      <h4>Getting started</h4>
      <ol>
        {GETTING_STARTED.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <h4>Nodes</h4>
      {sections.map((s) => (
        <details key={s}>
          <summary style={{ color: GROUP_COLORS[s] }}>{s}</summary>
          <dl>
            {(Object.keys(NODE_SECTION) as AppNode['type'][])
              .filter((t) => NODE_SECTION[t] === s)
              .map((t) => (
                <div key={t}>
                  <dt>{NODE_TITLES[t]}</dt>
                  <dd>{NODE_HELP[t]}</dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
      <h4>Mouse and keyboard</h4>
      <table className="help-table">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Examples</h4>
      {examples.length ? (
        groups.map((g) => (
          <details key={g}>
            <summary>{g}</summary>
            <ul className="help-examples">
              {examples
                .filter((e) => e.group === g)
                .map((e) => (
                  <li key={e.name}>{e.name}</li>
                ))}
            </ul>
          </details>
        ))
      ) : (
        <div className="hint">loading…</div>
      )}
      <h4>Validation</h4>
      {/* a list (title, then its text), not a table: the texts are long for the width of the panel */}
      <dl className="help-validation">
        {VALIDATION.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="hint">All the checks run with every change of the code (npm run check:tmm).</div>
    </aside>
  );
}
