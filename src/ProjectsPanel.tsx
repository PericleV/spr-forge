// Projects kept in this browser (besides the autosave of the current one): save, open, delete.
import { useState } from 'react';
import { deleteFromBrowser, listSaved, loadFromBrowser, saveToBrowser, type LastSession, type Project } from './project.ts';

export function ProjectsPanel(props: { onClose: () => void; current: () => Project; name: string; onOpen: (p: Project, name: string) => void; last?: LastSession | null }) {
  const [list, setList] = useState(listSaved);
  const [msg, setMsg] = useState('');
  const save = () => {
    const name = props.name.trim() || prompt('Name of the project:', 'My project')?.trim();
    if (!name) return;
    const r = saveToBrowser(props.current(), name);
    if (typeof r === 'string') setMsg(r);
    else {
      setMsg(`Saved “${name}”.`);
      setList(listSaved());
    }
  };
  return (
    <aside className="library projects-panel">
      <header>
        <strong>Projects in this browser</strong>
        <button onClick={props.onClose}>✕</button>
      </header>
      <div className="row wrap">
        <button className="btn-run" onClick={save} title="Keep the current project in this browser, under its name (a project of the same name is replaced)">
          Save “{props.name.trim() || 'untitled'}” here
        </button>
      </div>
      {msg && <div className="msg warn">{msg}</div>}
      {props.last && (
        <div className="lib-list">
          <div className="project-item" title="The project open when the page was left (kept automatically)">
            <div>
              <b>Last session: {props.last.project.name || 'untitled'}</b>
              <div className="muted">
                {new Date(props.last.saved).toLocaleString()} · {props.last.project.nodes.length} nodes
              </div>
            </div>
            <button onClick={() => confirm('Open the last session? It replaces the current project.') && props.onOpen(props.last!.project, props.last!.project.name ?? '')}>Open</button>
          </div>
        </div>
      )}
      <div className="lib-list">
        {!list.length && <div className="muted">No saved projects yet.</div>}
        {list.map((e) => (
          <div className="project-item" key={e.id}>
            <div>
              <b>{e.name}</b>
              <div className="muted">
                {new Date(e.saved).toLocaleString()} · {(e.size / 1024).toFixed(0)} kB
              </div>
            </div>
            <button
              onClick={() => {
                const p = loadFromBrowser(e.id);
                if (typeof p === 'string') setMsg(p);
                else if (confirm(`Open “${e.name}”? It replaces the current project.`)) props.onOpen(p, e.name);
              }}
            >
              Open
            </button>
            <button
              className="btn-stop"
              onClick={() => {
                if (!confirm(`Delete “${e.name}” from this browser?`)) return;
                deleteFromBrowser(e.id);
                setList(listSaved());
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="hint">
        These projects stay only in this browser (clearing the site data removes them). To move a project, use Save (a JSON file) or Share link.
      </div>
    </aside>
  );
}
