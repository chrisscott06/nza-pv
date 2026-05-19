// =============================================================================
// Project store — single source of truth for the open ProjectFile, selection,
// tool state, view mode, and history.
// =============================================================================

import {
  type Building,
  type CameraState,
  DEFAULT_PANEL_SIZE_M2,
  DEFAULT_STOREY_HEIGHT_M,
  type ProjectFile,
  type Roof,
  type RoofFace,
  SCHEMA_VERSION,
} from '@nza-pv/shared';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { create } from 'zustand';

export type ToolMode =
  | { kind: 'select' }
  | { kind: 'draw-rect' }
  | { kind: 'draw-polygon' }
  | { kind: 'push-pull' }
  | { kind: 'vertex' };

export type ViewMode = '2d' | '3d' | 'split';

/** Which top-level workspace step the user is on. Drives the right-hand
 *  panel content (building edit vs. project-wide PV summary vs. future
 *  report). Maps to the LeftRail steps. */
export type WorkspaceView = 'buildings' | 'pv';

export type Selection =
  | { kind: 'none' }
  | { kind: 'building'; buildingId: string }
  | { kind: 'face'; buildingId: string; faceId: string }
  | { kind: 'multi'; buildingIds: string[] };

type FaceOverrides = {
  is_pv_eligible?: boolean;
  max_coverage_pct?: number;
  panel_size_m2?: number;
  array_count?: number;
};

type State = {
  project: ProjectFile | null;
  selection: Selection;
  tool: ToolMode;
  view: ViewMode;
  workspaceView: WorkspaceView;
  lastSavedAt: number | null;
  /** Stash of face-level overrides keyed by `${buildingId}|${role}|${cardinal}`
   *  so they persist across compatible roof preset changes. */
  faceOverrides: Record<string, FaceOverrides>;
  /** Undo/redo stacks store JSON snapshots of the ProjectFile. */
  past: string[];
  future: string[];
};

type Actions = {
  newProject: (name: string) => void;
  loadProject: (file: ProjectFile) => void;
  closeProject: () => void;
  renameProject: (name: string) => void;
  setCamera: (camera: Partial<CameraState>) => void;

  setTool: (tool: ToolMode) => void;
  setView: (view: ViewMode) => void;
  setWorkspaceView: (v: WorkspaceView) => void;
  select: (selection: Selection) => void;

  addBuilding: (
    b: Omit<Building, 'name' | 'id' | 'faces'> & { name?: string; id?: string; faces?: RoofFace[] },
  ) => string;
  updateBuilding: (id: string, mutate: (b: Building) => void) => void;
  removeBuilding: (id: string) => void;
  renameBuilding: (id: string, name: string) => void;
  setBuildingHeight: (
    id: string,
    opts: { storeys?: number; storey_height_m?: number; eave_height_m?: number },
  ) => void;
  setRoof: (id: string, roof: Roof) => void;
  setFaces: (id: string, faces: RoofFace[]) => void;
  applyRoofToAll: (sourceId: string, targetIds: string[]) => void;
  setBuildingsEaveHeight: (ids: string[], eave: number) => void;

  toggleFaceEligibility: (buildingId: string, faceId: string) => void;
  setFaceCoverage: (buildingId: string, faceId: string, pct: number) => void;
  setFacePanelSize: (buildingId: string, faceId: string, m2: number) => void;
  setFaceArrayCount: (buildingId: string, faceId: string, n: number) => void;
  resetFaceOverrides: (buildingId: string, faceId: string) => void;

  markSaved: () => void;
  undo: () => void;
  redo: () => void;
  /** Public action used by command-runners that batched up immer changes. */
  commit: (label?: string) => void;
};

export type ProjectStore = State & Actions;

const HISTORY_LIMIT = 40;

function emptyProject(name: string): ProjectFile {
  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    project: { id: nanoid(10), name, created_at: now, last_modified: now },
    buildings: [],
  };
}

function nextBuildingName(buildings: Building[]): string {
  const ns = buildings
    .map((b) => /^Building (\d+)$/.exec(b.name)?.[1])
    .filter((s): s is string => Boolean(s))
    .map((s) => Number.parseInt(s, 10));
  const next = ns.length ? Math.max(...ns) + 1 : 1;
  return `Building ${next}`;
}

function touch(project: ProjectFile): void {
  project.project.last_modified = new Date().toISOString();
}

function pushHistory(state: State): Partial<State> {
  if (!state.project) return {};
  const snap = JSON.stringify(state.project);
  const past = [...state.past, snap];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

export const useProject = create<ProjectStore>((set, get) => ({
  project: null,
  selection: { kind: 'none' },
  tool: { kind: 'select' },
  view: '2d',
  workspaceView: 'buildings',
  lastSavedAt: null,
  faceOverrides: {},
  past: [],
  future: [],

  newProject: (name) =>
    set({
      project: emptyProject(name || 'Untitled project'),
      selection: { kind: 'none' },
      tool: { kind: 'select' },
      view: '2d',
      workspaceView: 'buildings',
      lastSavedAt: null,
      faceOverrides: {},
      past: [],
      future: [],
    }),

  loadProject: (file) =>
    set({
      project: produce(file, (draft) => {
        if (!draft.project.id) draft.project.id = nanoid(10);
      }),
      selection: { kind: 'none' },
      tool: { kind: 'select' },
      view: '2d',
      workspaceView: 'buildings',
      lastSavedAt: Date.now(),
      faceOverrides: {},
      past: [],
      future: [],
    }),

  closeProject: () =>
    set({
      project: null,
      selection: { kind: 'none' },
      lastSavedAt: null,
      past: [],
      future: [],
    }),

  renameProject: (name) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          p.project.name = name;
          touch(p);
        }),
      };
    }),

  setCamera: (camera) =>
    set((s) => {
      if (!s.project) return s;
      return {
        project: produce(s.project, (p) => {
          p.view = { ...(p.view ?? {}), ...camera };
          touch(p);
        }),
      };
    }),

  setTool: (tool) => set({ tool }),
  setView: (view) => set({ view }),
  setWorkspaceView: (workspaceView) => set({ workspaceView }),
  select: (selection) => set({ selection }),

  addBuilding: (b) => {
    const id = b.id ?? nanoid(10);
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          const name = b.name ?? nextBuildingName(p.buildings);
          const eave = b.eave_height_m ?? b.storeys * b.storey_height_m;
          p.buildings.push({
            id,
            name,
            footprint: b.footprint,
            storeys: b.storeys,
            storey_height_m: b.storey_height_m,
            eave_height_m: eave,
            roof: b.roof,
            faces: b.faces ?? [],
          });
          touch(p);
        }),
      };
    });
    return id;
  },

  updateBuilding: (id, mutate) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          const b = p.buildings.find((x) => x.id === id);
          if (!b) return;
          mutate(b);
          touch(p);
        }),
      };
    }),

  removeBuilding: (id) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      const sel: Selection =
        s.selection.kind === 'building' && s.selection.buildingId === id
          ? { kind: 'none' }
          : s.selection.kind === 'face' && s.selection.buildingId === id
            ? { kind: 'none' }
            : s.selection;
      return {
        ...hist,
        selection: sel,
        project: produce(s.project, (p) => {
          p.buildings = p.buildings.filter((b) => b.id !== id);
          touch(p);
        }),
      };
    }),

  renameBuilding: (id, name) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          const b = p.buildings.find((x) => x.id === id);
          if (b) {
            b.name = name;
            touch(p);
          }
        }),
      };
    }),

  setBuildingHeight: (id, opts) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          const b = p.buildings.find((x) => x.id === id);
          if (!b) return;
          // Keep storeys × storey_height === eave_height as an invariant so
          // the three inputs never drift out of sync. Whichever value the user
          // just edited drives the other two:
          //   - storeys change      → eave = storeys × storey_height
          //   - storey_height change → eave = storeys × storey_height
          //   - eave change          → storeys = round(eave / storey_height),
          //                            then snap eave back to storeys × storey_height
          if (opts.eave_height_m != null) {
            const sh = b.storey_height_m || DEFAULT_STOREY_HEIGHT_M;
            const targetEave = Math.max(0.1, opts.eave_height_m);
            b.storeys = Math.max(1, Math.round(targetEave / sh));
            b.eave_height_m = b.storeys * sh;
          } else {
            if (opts.storeys != null) b.storeys = Math.max(1, Math.round(opts.storeys));
            if (opts.storey_height_m != null) {
              b.storey_height_m = Math.max(0.1, opts.storey_height_m);
            }
            b.eave_height_m = b.storeys * b.storey_height_m;
          }
          touch(p);
        }),
      };
    }),

  setRoof: (id, roof) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          const b = p.buildings.find((x) => x.id === id);
          if (b) {
            b.roof = roof;
            touch(p);
          }
        }),
      };
    }),

  setFaces: (id, faces) =>
    set((s) => {
      if (!s.project) return s;
      // Face regen is a derived update — don't pollute the undo stack with it.
      return {
        project: produce(s.project, (p) => {
          const b = p.buildings.find((x) => x.id === id);
          if (!b) return;
          // Re-apply any face-level overrides we kept around.
          const overrides = s.faceOverrides;
          b.faces = faces.map((f) => {
            const key = `${id}|${f.role}|${f.cardinal}`;
            const o = overrides[key];
            if (!o) return f;
            return {
              ...f,
              is_pv_eligible: o.is_pv_eligible ?? f.is_pv_eligible,
              max_coverage_pct: o.max_coverage_pct ?? f.max_coverage_pct,
              panel_size_m2: o.panel_size_m2 ?? f.panel_size_m2,
              array_count: o.array_count ?? f.array_count,
            };
          });
        }),
      };
    }),

  applyRoofToAll: (sourceId, targetIds) =>
    set((s) => {
      if (!s.project) return s;
      const src = s.project.buildings.find((b) => b.id === sourceId);
      if (!src) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          for (const t of p.buildings) {
            if (targetIds.includes(t.id)) {
              t.roof = JSON.parse(JSON.stringify(src.roof));
              // Faces will be regenerated by the calc engine downstream.
            }
          }
          touch(p);
        }),
      };
    }),

  setBuildingsEaveHeight: (ids, eave) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      return {
        ...hist,
        project: produce(s.project, (p) => {
          for (const b of p.buildings) {
            if (ids.includes(b.id)) {
              b.eave_height_m = eave;
              b.storeys = Math.max(
                1,
                Math.round(eave / (b.storey_height_m || DEFAULT_STOREY_HEIGHT_M)),
              );
            }
          }
          touch(p);
        }),
      };
    }),

  toggleFaceEligibility: (buildingId, faceId) =>
    set((s) => {
      if (!s.project) return s;
      const hist = pushHistory(s);
      const next = produce(s, (draft) => {
        const b = draft.project!.buildings.find((x) => x.id === buildingId);
        const f = b?.faces.find((x) => x.id === faceId);
        if (!f || !b) return;
        f.is_pv_eligible = !f.is_pv_eligible;
        const key = `${buildingId}|${f.role}|${f.cardinal}`;
        draft.faceOverrides[key] = {
          ...(draft.faceOverrides[key] ?? {}),
          is_pv_eligible: f.is_pv_eligible,
        };
        touch(draft.project!);
      });
      return { ...hist, project: next.project, faceOverrides: next.faceOverrides };
    }),

  setFaceCoverage: (buildingId, faceId, pct) =>
    set((s) => {
      if (!s.project) return s;
      const next = produce(s, (draft) => {
        const b = draft.project!.buildings.find((x) => x.id === buildingId);
        const f = b?.faces.find((x) => x.id === faceId);
        if (!f || !b) return;
        f.max_coverage_pct = pct;
        const key = `${buildingId}|${f.role}|${f.cardinal}`;
        draft.faceOverrides[key] = {
          ...(draft.faceOverrides[key] ?? {}),
          max_coverage_pct: pct,
        };
        touch(draft.project!);
      });
      return { project: next.project, faceOverrides: next.faceOverrides };
    }),

  setFacePanelSize: (buildingId, faceId, m2) =>
    set((s) => {
      if (!s.project) return s;
      const next = produce(s, (draft) => {
        const b = draft.project!.buildings.find((x) => x.id === buildingId);
        const f = b?.faces.find((x) => x.id === faceId);
        if (!f || !b) return;
        f.panel_size_m2 = m2;
        const key = `${buildingId}|${f.role}|${f.cardinal}`;
        draft.faceOverrides[key] = {
          ...(draft.faceOverrides[key] ?? {}),
          panel_size_m2: m2,
        };
        touch(draft.project!);
      });
      return { project: next.project, faceOverrides: next.faceOverrides };
    }),

  setFaceArrayCount: (buildingId, faceId, n) =>
    set((s) => {
      if (!s.project) return s;
      const next = produce(s, (draft) => {
        const b = draft.project!.buildings.find((x) => x.id === buildingId);
        const f = b?.faces.find((x) => x.id === faceId);
        if (!f || !b) return;
        const clamped = Math.max(1, Math.min(8, Math.floor(n)));
        f.array_count = clamped;
        const key = `${buildingId}|${f.role}|${f.cardinal}`;
        draft.faceOverrides[key] = {
          ...(draft.faceOverrides[key] ?? {}),
          array_count: clamped,
        };
        touch(draft.project!);
      });
      return { project: next.project, faceOverrides: next.faceOverrides };
    }),

  resetFaceOverrides: (buildingId, faceId) =>
    set((s) => {
      if (!s.project) return s;
      const next = produce(s, (draft) => {
        const b = draft.project!.buildings.find((x) => x.id === buildingId);
        const f = b?.faces.find((x) => x.id === faceId);
        if (!f || !b) return;
        f.max_coverage_pct = 70;
        f.panel_size_m2 = DEFAULT_PANEL_SIZE_M2;
        f.is_pv_eligible = f.tilt_deg >= 0 && f.tilt_deg <= 60;
        f.array_count = 1;
        const key = `${buildingId}|${f.role}|${f.cardinal}`;
        delete draft.faceOverrides[key];
        touch(draft.project!);
      });
      return { project: next.project, faceOverrides: next.faceOverrides };
    }),

  markSaved: () => set({ lastSavedAt: Date.now() }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0 || !s.project) return s;
      const previous = s.past[s.past.length - 1]!;
      const past = s.past.slice(0, -1);
      const future = [...s.future, JSON.stringify(s.project)];
      return { past, future, project: JSON.parse(previous) as ProjectFile };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0 || !s.project) return s;
      const next = s.future[s.future.length - 1]!;
      const future = s.future.slice(0, -1);
      const past = [...s.past, JSON.stringify(s.project)];
      return { past, future, project: JSON.parse(next) as ProjectFile };
    }),

  commit: () =>
    set((s) => {
      if (!s.project) return s;
      return pushHistory(s);
    }),
}));

/** Selector helpers. */
export const selectActiveBuilding = (s: ProjectStore): Building | null => {
  if (!s.project) return null;
  const sel = s.selection;
  if (sel.kind === 'building' || sel.kind === 'face') {
    return s.project.buildings.find((b) => b.id === sel.buildingId) ?? null;
  }
  return null;
};

export const selectActiveFace = (
  s: ProjectStore,
): { face: RoofFace; buildingId: string } | null => {
  if (!s.project) return null;
  const sel = s.selection;
  if (sel.kind !== 'face') return null;
  const b = s.project.buildings.find((x) => x.id === sel.buildingId);
  const f = b?.faces.find((x) => x.id === sel.faceId);
  return b && f ? { face: f, buildingId: b.id } : null;
};
