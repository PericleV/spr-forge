// Per-browser display preferences: colour theme (system / light / dark) and canvas options.
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'spr-flow:theme';

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
}

// Canvas: snap nodes to a grid (step in px), arrows on the connections, curved or right-angle connections.
export type CanvasPrefs = { snap: boolean; step: number; arrows: boolean; shape: 'curved' | 'orthogonal' };
export const STEPS = [10, 20, 40];
const PREFS = 'spr-flow:canvas';
const DEFAULT_PREFS: CanvasPrefs = { snap: false, step: 20, arrows: false, shape: 'curved' };

export function loadPrefs(): CanvasPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<CanvasPrefs>;
    return { ...DEFAULT_PREFS, ...p, step: STEPS.includes(p.step ?? 0) ? p.step! : DEFAULT_PREFS.step };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: CanvasPrefs): CanvasPrefs {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    // storage unavailable: kept for this session
  }
  return p;
}
