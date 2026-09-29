// Project files: graph + user materials, saved as JSON and autosaved to the browser.
import type { Edge } from '@xyflow/react';
import type { MaterialDef } from './physics/materials.ts';
import type { AppNode } from './types.ts';
import { NODE_TITLES } from './nodeColors.ts';

// name: the project's title (an example's name, a file name or typed by the user); optional, format 3 unchanged.
export type Project = { app: 'spr-flow'; version: 3; nodes: AppNode[]; edges: Edge[]; materials: MaterialDef[]; name?: string };

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
  JSON.stringify(p, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? { [NONFINITE]: String(v) } : v), indent);
const revive = (_: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && NONFINITE in v ? Number((v as Record<string, string>)[NONFINITE]) : v;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

// A damaged file must not stop the application: nodes without an id, a known type or data are left out (with their
// connections), a missing position becomes (0, 0), connections to missing nodes and unknown group frames are removed.
function checked(nodes: unknown[], edges: unknown[]): { nodes: AppNode[]; edges: Edge[] } {
  const valid = nodes.filter((n): n is Record<string, unknown> & { id: string } => isObj(n) && typeof n.id === 'string' && typeof n.type === 'string' && n.type in NODE_TITLES && isObj(n.data));
  const ids = new Set(valid.map((n) => n.id));
  return {
    nodes: valid.map((n) => {
      const out: Record<string, unknown> = { ...n, position: isObj(n.position) && finite(n.position.x) && finite(n.position.y) ? n.position : { x: 0, y: 0 } };
      if (!(typeof n.parentId === 'string' && ids.has(n.parentId))) delete out.parentId;
      return out as AppNode;
    }),
    edges: edges.filter((e): e is Edge => isObj(e) && typeof e.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string' && ids.has(e.source) && ids.has(e.target)),
  };
}

export function parseProject(text: string): Project | string {
  try {
    const p = JSON.parse(text, revive) as Partial<Project>;
    if (p.app !== 'spr-flow' || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) return 'Not an SPR Forge project file.';
    if (p.version !== 3) return `This project was saved by an older version of SPR Forge (format ${p.version}); it cannot be opened.`;
    return { app: 'spr-flow', version: 3, ...checked(p.nodes, p.edges), materials: Array.isArray(p.materials) ? p.materials : [], ...(typeof p.name === 'string' && p.name ? { name: p.name } : {}) };
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

export function autosave(p: Project) {
  try {
    localStorage.setItem(STORAGE_KEY, stringifyProject(p));
  } catch {
    // storage full or unavailable: autosave is best effort
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
