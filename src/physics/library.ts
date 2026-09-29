import builtins from './builtins.json' with { type: 'json' };
import type { MaterialDef } from './materials.ts';

export const BUILTINS = builtins as MaterialDef[];

export type Library = Map<string, MaterialDef>;

export const makeLibrary = (user: MaterialDef[]): Library => new Map([...BUILTINS, ...user].map((m) => [m.id, m]));
