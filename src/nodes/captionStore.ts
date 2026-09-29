// Which node's label (the free text above it) is being edited: set by a double click on the title bar or by the
// context menu.
import { useSyncExternalStore } from 'react';

let editing: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function editCaption(id: string | null) {
  editing = id;
  listeners.forEach((l) => l());
}
export const useEditingCaption = () => useSyncExternalStore(subscribe, () => editing);
