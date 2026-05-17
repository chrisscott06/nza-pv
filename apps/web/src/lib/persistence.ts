// Save/load .nzapv files + browser-localStorage autosave.

import { isProjectFile, SCHEMA_VERSION, type ProjectFile } from '@nza-pv/shared';

const AUTOSAVE_KEY = 'nza-pv:autosave:v1';

/** Validate, then return a ProjectFile from a raw object/string. Throws on
 *  schema mismatch with a human-readable message. */
export function parseProject(input: unknown): ProjectFile {
  const raw = typeof input === 'string' ? safeJsonParse(input) : input;
  if (raw === undefined) throw new Error('Could not parse JSON.');
  if (!raw || typeof raw !== 'object') throw new Error('File is not a project object.');
  const obj = raw as Partial<ProjectFile> & Record<string, unknown>;
  if (obj.schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version "${String(obj.schema_version)}" — this build expects "${SCHEMA_VERSION}".`,
    );
  }
  if (!isProjectFile(raw)) throw new Error('File is missing required project metadata.');
  return raw;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
}

/** Trigger a download of the current project as `<name>.nzapv`. */
export function downloadProject(project: ProjectFile, suggestedName?: string): void {
  const name = (suggestedName ?? project.project.name ?? 'project').replace(/[^\w.\- ]+/g, '_').trim();
  const text = JSON.stringify(project, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'project'}.nzapv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/** Open a file picker and return the parsed ProjectFile, or null if cancelled. */
export function pickProjectFromDisk(): Promise<ProjectFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.nzapv,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.onload = () => {
        try {
          resolve(parseProject(String(reader.result ?? '')));
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });
}

// --- Autosave ----------------------------------------------------------------

export function loadAutosave(): ProjectFile | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    return parseProject(text);
  } catch {
    return null;
  }
}

export function writeAutosave(project: ProjectFile): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // QuotaExceeded — ignore for Phase 1, surface in Phase 2.
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

// --- Recents ----------------------------------------------------------------

const RECENTS_KEY = 'nza-pv:recents:v1';

export type RecentProject = { id: string; name: string; last_modified: string };

export function loadRecents(): RecentProject[] {
  try {
    const text = localStorage.getItem(RECENTS_KEY);
    if (!text) return [];
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? (arr as RecentProject[]) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(project: ProjectFile): void {
  try {
    const existing = loadRecents().filter((r) => r.id !== project.project.id);
    const next = [
      { id: project.project.id, name: project.project.name, last_modified: project.project.last_modified },
      ...existing,
    ].slice(0, 6);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
