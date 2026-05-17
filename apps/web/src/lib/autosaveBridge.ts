// Glue between the project store and localStorage autosave. Debounces writes.

import { useEffect, useRef } from 'react';
import { useProject } from '../store/projectStore.js';
import { writeAutosave, clearAutosave } from './persistence.js';

const DEBOUNCE_MS = 400;

export function useAutosave(): void {
  const project = useProject((s) => s.project);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!project) {
      clearAutosave();
      return;
    }
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      writeAutosave(project);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [project]);
}
