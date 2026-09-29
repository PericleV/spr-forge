import { createContext, useContext } from 'react';
import { BUILTINS, type Library } from '../physics/library.ts';
import type { MaterialDef } from '../physics/materials.ts';

export type LibraryState = {
  lib: Library;
  list: MaterialDef[]; // built-ins first, then user materials
  setUser: (update: (user: MaterialDef[]) => MaterialDef[]) => void;
};

export const LibraryContext = createContext<LibraryState>({
  lib: new Map(BUILTINS.map((m) => [m.id, m])),
  list: BUILTINS,
  setUser: () => {},
});

export const useLibrary = () => useContext(LibraryContext);
