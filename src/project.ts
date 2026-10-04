// Project files: graph + user materials, saved as JSON and autosaved to the browser.
import type { Edge } from '@xyflow/react';
import type { MaterialDef } from './physics/materials.ts';
import type { AppNode } from './types.ts';
import { NODE_TITLES } from './nodeColors.ts';

// name: the project's title (an example's name, a file name or typed by the user); optional, format 3 unchanged.
// repaired: set when a damaged file was opened — what was left out (not saved: a note for the user).
export type Project = { app: 'spr-flow'; version: 3; nodes: AppNode[]; edges: Edge[]; materials: MaterialDef[]; name?: string; repaired?: string };

// The format of project files. Saved files must keep opening in later versions: a change of the format bumps this number
// together with its conversion in MIGRATIONS, and a file of the old format joins scripts/fixtures (checked by check:tmm).
// Within a format, node data only gain optional fields (the nodes read missing ones as their defaults).
export const PROJECT_VERSION = 3;
// MIGRATIONS[v] turns a file of format v into format v + 1 (none yet: format 3 is the first published one).
const MIGRATIONS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {};

const STORAGE_KEY = 'spr-flow:project';

export function toProject(nodes: AppNode[], edges: Edge[], materials: MaterialDef[], name?: string): Project {
  return {
    app: 'spr-flow',
    version: 3,
    ...(name ? { name } : {}),
    // group frames keep their size; grouped nodes their frame (positions relative to it)
    nodes: nodes.map(({ id, type, position, data, parentId, width, height }) =>
      ({ id, type, position, data, ...(parentId ? { parentId } : {}), ...(type === 'frame' ? { width, height } : {}) }) as AppNode,
    ),
    edges: edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle })),
    materials,
  };
}

// JSON has no NaN / ±Infinity (they would become null): numbers that are not finite are written as {"$num": "NaN"}.
const NONFINITE = '$num';
export const stringifyProject = (p: Project, indent?: number) =>
  JSON.stringify({ ...p, repaired: undefined }, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? { [NONFINITE]: String(v) } : v), indent);
const revive = (_: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && NONFINITE in v ? Number((v as Record<string, string>)[NONFINITE]) : v;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

// A damaged file must not stop the application: nodes without an id, a known type or data are left out (with their
// connections), a missing position becomes (0, 0), connections to missing nodes and unknown group frames are removed.
function checked(nodes: unknown[], edges: unknown[]): { nodes: AppNode[]; edges: Edge[]; repaired?: string } {
  const valid = nodes.filter((n): n is Record<string, unknown> & { id: string } => isObj(n) && typeof n.id === 'string' && typeof n.type === 'string' && n.type in NODE_TITLES && isObj(n.data));
  const ids = new Set(valid.map((n) => n.id));
  const kept = edges.filter((e): e is Edge => isObj(e) && typeof e.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string' && ids.has(e.source) && ids.has(e.target));
  // what was left out, for the user (a node of a type this version does not know, a broken connection)
  const unknown = [...new Set(nodes.filter((n) => isObj(n) && typeof n.type === 'string' && !(n.type in NODE_TITLES)).map((n) => (n as { type: string }).type))];
  const lostN = nodes.length - valid.length;
  const lostE = edges.length - kept.length;
  const repaired = lostN || lostE ? `The file was repaired: ${[lostN ? `${lostN} node${lostN > 1 ? 's' : ''} left out${unknown.length ? ` (unknown type${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')})` : ''}` : '', lostE ? `${lostE} connection${lostE > 1 ? 's' : ''} left out` : ''].filter(Boolean).join(', ')}.` : undefined;
  return {
    nodes: valid.map((n) => {
      const out: Record<string, unknown> = { ...n, position: isObj(n.position) && finite(n.position.x) && finite(n.position.y) ? n.position : { x: 0, y: 0 } };
      if (!(typeof n.parentId === 'string' && ids.has(n.parentId))) delete out.parentId;
      return out as AppNode;
    }),
    edges: kept,
    ...(repaired ? { repaired } : {}),
  };
}

export function parseProject(text: string): Project | string {
  try {
    let p = JSON.parse(text, revive) as Record<string, unknown>;
    if (!isObj(p) || p.app !== 'spr-flow') return 'Not an SPR Forge project file.';
    const v0 = p.version;
    if (typeof v0 !== 'number') return 'Not an SPR Forge project file (no format version).';
    if (v0 > PROJECT_VERSION) return `This project was saved by a newer version of SPR Forge (format ${v0}; this page reads up to ${PROJECT_VERSION}). Reload the page to get the latest version.`;
    for (let v = v0; v < PROJECT_VERSION; v++) {
      if (!MIGRATIONS[v]) return `This project was saved by an older version of SPR Forge (format ${v0}); it cannot be opened.`;
      p = { ...MIGRATIONS[v](p), version: v + 1 };
    }
    if (!Array.isArray(p.nodes) || !Array.isArray(p.edges)) return 'Not an SPR Forge project file.';
    return { app: 'spr-flow', version: 3, ...checked(p.nodes, p.edges), materials: Array.isArray(p.materials) ? (p.materials as MaterialDef[]) : [], ...(typeof p.name === 'string' && p.name ? { name: p.name } : {}) };
  } catch {
    return 'The file is not valid JSON.';
  }
}

export function loadAutosave(): Project | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    const p = text ? parseProject(text) : null;
    return typeof p === 'string' ? null : p;
  } catch {
    return null;
  }
}

// false: the browser storage is full or unavailable (the page tells the user: a reload would lose the changes)
export function autosave(p: Project): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, stringifyProject(p));
    return true;
  } catch {
    return false;
  }
}

// ---- The last session: the page starts with an empty project (or Welcome), so the project open when the page was
// left is kept aside at start — from the autosave, only when it has nodes (a reload of an empty page keeps the older one) ----
const LAST_KEY = 'spr-flow:last-session';
export type LastSession = { project: Project; saved: number };
export function keepLastSession(): LastSession | null {
  const p = loadAutosave();
  try {
    if (p && p.nodes.length) localStorage.setItem(LAST_KEY, JSON.stringify({ saved: Date.now(), text: stringifyProject(p) }));
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const { saved, text } = JSON.parse(raw) as { saved: number; text: string };
    const q = parseProject(text);
    return typeof q === 'string' ? null : { project: q, saved };
  } catch {
    return p && p.nodes.length ? { project: p, saved: Date.now() } : null;
  }
}

// ---- Share links: the project, compressed (deflate), in the URL fragment (#p=…) — nothing is sent to a server ----

const toBase64Url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (code: string) => {
  const s = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
};
const pipe = (bytes: Uint8Array, t: CompressionStream | DecompressionStream) => new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(t));

export async function encodeProject(p: Project): Promise<string> {
  const bytes = new TextEncoder().encode(stringifyProject(p));
  return toBase64Url(new Uint8Array(await pipe(bytes, new CompressionStream('deflate-raw')).arrayBuffer()));
}

export async function decodeProject(code: string): Promise<Project | string> {
  try {
    return parseProject(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')).text());
  } catch {
    return 'The link does not contain a valid SPR Forge project.';
  }
}

// ---- Projects kept in this browser (several, by name), besides the autosave of the current one ----

export type SavedEntry = { id: string; name: string; saved: number; size: number };
const INDEX_KEY = 'spr-flow:projects';
const entryKey = (id: string) => `spr-flow:saved:${id}`;

export function listSaved(): SavedEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as SavedEntry[];
    return Array.isArray(v) ? v.sort((a, b) => b.saved - a.saved) : [];
  } catch {
    return [];
  }
}

// Saves under `name` (replacing a project of the same name); returns an error message when the storage is full.
export function saveToBrowser(p: Project, name: string): SavedEntry | string {
  const list = listSaved();
  const old = list.find((e) => e.name === name);
  const entry: SavedEntry = { id: old?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, saved: Date.now(), size: 0 };
  const text = stringifyProject({ ...p, name });
  entry.size = text.length;
  try {
    localStorage.setItem(entryKey(entry.id), text);
    localStorage.setItem(INDEX_KEY, JSON.stringify([entry, ...list.filter((e) => e.id !== entry.id)]));
    return entry;
  } catch {
    return 'The browser storage is full: delete some saved projects, or use Save (a file).';
  }
}

export function loadFromBrowser(id: string): Project | string {
  try {
    const text = localStorage.getItem(entryKey(id));
    return text ? parseProject(text) : 'This saved project is missing.';
  } catch {
    return 'The browser storage is not available.';
  }
}

export function deleteFromBrowser(id: string) {
  try {
    localStorage.removeItem(entryKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(listSaved().filter((e) => e.id !== id)));
  } catch {
    // storage unavailable: nothing to delete
  }
}
