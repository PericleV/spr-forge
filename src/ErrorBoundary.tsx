// Error boundaries: an error while drawing a node shows a message in that node (the rest of the graph keeps working);
// an error in the application itself shows a page with the choice to save the project or reset the view.
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode; resetKey?: unknown };
type State = { error: Error | null; key: unknown };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  // a change of resetKey (e.g. the node's data) clears the error: the view is tried again
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View error', error, info.componentStack);
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children;
  }
}

// If the application itself fails, the autosaved project can still be downloaded before anything else is tried.
export function AppCrash({ error }: { error: Error }) {
  const saved = (() => {
    try {
      return localStorage.getItem('spr-flow:project');
    } catch {
      return null;
    }
  })();
  const download = () => {
    if (!saved) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([saved], { type: 'application/json' }));
    a.download = 'spr-forge-project.json';
    a.click();
  };
  return (
    <div className="crash">
      <h2>SPR Forge stopped because of an error</h2>
      <pre>{error.message}</pre>
      <p>Your project is kept in this browser. Download it first, then reload the page; if the error comes back with this project, start over.</p>
      <div className="row">
        <button onClick={download} disabled={!saved}>Download the project (JSON)</button>
        <button onClick={() => location.reload()}>Reload</button>
        <button
          onClick={() => {
            if (!confirm('Start over? The project kept in this browser is removed (download it first); SPR Forge opens with its first example.')) return;
            try {
              localStorage.removeItem('spr-flow:project');
            } catch {
              // storage unavailable: nothing to remove
            }
            location.reload();
          }}
        >
          Start over
        </button>
      </div>
    </div>
  );
}
