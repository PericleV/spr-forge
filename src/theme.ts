// Per-browser display preferences: colour theme (system / light / dark), interface colours and canvas options.
import { textOn } from './nodeColors.ts';

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

// The two colours of the interface, chosen in the top bar: the selection (around the selected nodes, groups and
// connections) and the accent (the active buttons, checks, progress) — 'same' = as the selection. Each has a light and a
// dark shade (a colour of the list its own, any other one lighter in the dark theme) and the text written on it, black or
// white. Kept in this browser, never in a project.
export type Swatch = { name: string; light: string; dark: string };
export const SWATCHES: Swatch[] = [
  { name: 'Teal', light: '#14b8a6', dark: '#2dd4bf' },
  { name: 'Blue', light: '#2f6fd6', dark: '#6ea0f0' },
  { name: 'Purple', light: '#7b5bd6', dark: '#a590f3' },
  { name: 'Green', light: '#2e9e4f', dark: '#5cc77a' },
  { name: 'Orange', light: '#e07a10', dark: '#f5a04a' },
  { name: 'Red', light: '#d64545', dark: '#f07a75' },
  { name: 'Pink', light: '#d0479a', dark: '#ef7fc0' },
  { name: 'Grey', light: '#6b7385', dark: '#a3abbd' },
];
export type UiColors = { select: string; accent: string };
export const DEFAULT_COLORS: UiColors = { select: SWATCHES[0].light, accent: 'same' };
const COLORS = 'spr-flow:colors';
const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export function loadColors(): UiColors {
  try {
    const c = JSON.parse(localStorage.getItem(COLORS) ?? '{}') as Partial<UiColors>;
    return { select: isHex(c.select) ? c.select : DEFAULT_COLORS.select, accent: isHex(c.accent) ? c.accent : 'same' };
  } catch {
    return DEFAULT_COLORS;
  }
}

// the dark shade: the list's own, else the colour mixed with 30 % white
export function darkShade(hex: string): string {
  const own = SWATCHES.find((s) => s.light.toLowerCase() === hex.toLowerCase());
  if (own) return own.dark;
  const v = parseInt(hex.slice(1), 16);
  const up = (c: number) => Math.round(c + (255 - c) * 0.3).toString(16).padStart(2, '0');
  return `#${up((v >> 16) & 255)}${up((v >> 8) & 255)}${up(v & 255)}`;
}

export function applyColors(c: UiColors) {
  const s = document.documentElement.style;
  const accent = c.accent === 'same' ? c.select : c.accent;
  const shades: [string, string][] = [
    ['--select-l', c.select],
    ['--select-d', darkShade(c.select)],
    ['--accent-l', accent],
    ['--accent-d', darkShade(accent)],
  ];
  for (const [name, hex] of shades) s.setProperty(name, hex);
  s.setProperty('--on-accent-l', textOn(accent));
  s.setProperty('--on-accent-d', textOn(darkShade(accent)));
  try {
    localStorage.setItem(COLORS, JSON.stringify(c));
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
}

// Canvas: snap nodes to a grid (step in px), arrows on the connections, curved or right-angle connections.
export type CanvasPrefs = { snap: boolean; step: number; arrows: boolean; shape: 'curved' | 'orthogonal'; minimap: boolean };
export const STEPS = [10, 20, 40];
const PREFS = 'spr-flow:canvas';
const DEFAULT_PREFS: CanvasPrefs = { snap: false, step: 20, arrows: false, shape: 'curved', minimap: true };

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
