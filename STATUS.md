# NZA-PV — Status

## Phase 1 — 3D building & roof workbench

**In build.** Scaffold + the spine of the brief is now wired end-to-end. The
detail items below track what's in the codebase vs. what's still on the build
list from `docs/briefs/phase-1-brief.md`.

### Brief days

- [x] **Day 1 — repo + shell.** pnpm workspaces (`apps/web`, `packages/shared`).
      Biome, Vitest, Playwright configs in place. Workspace shell with top bar,
      left rail, status bar. MapLibre map (Esri World Imagery basemap with an
      OSM raster fallback; honours `VITE_MAPTILER_API_KEY` if set). Landing
      offers new / open / resume-from-autosave flows. `.nzapv` save and
      `localStorage` autosave round-trip verified.
- [x] **Day 2 — drawing tools.** *Partial.* Rectangle click-drag and polygon
      vertex-add (with right-angle snap, shift to override, self-intersection
      rejection) both implemented. Push-pull editing, vertex drag, and
      snap-to-edge between adjacent buildings still pending — see notes.
- [x] **Days 3–4 — roof calc engine.** All 12 presets generate via an
      oriented-bounding-box projection. RoofFace[] is emitted with area, tilt,
      azimuth, and cardinal. Unit tests cover the 10×5 hip, 10×5 gable,
      flat-roof, and a sanity sweep across every preset.
- [x] **Days 5–6 — roof builder UI + 3D scene.** 12-tile preset gallery,
      contextual pitch / ridge / break / sawtooth / saltbox controls, live
      regeneration on every parameter change. Three.js scene via
      @react-three/fiber with PCF shadows, hemisphere + directional light,
      OrbitControls, off-white walls, dark-grey roof faces. Multi-building
      rendering proven on 4 buildings with different styles.
- [x] **Day 7 — per-face inspector.** Click a building, then click a face to
      select it. Inspector shows role + cardinal, area, tilt, azimuth, PV
      eligibility checkbox, max coverage slider, panel size dropdown, and
      computed usable area / panel count / nominal kWp. Face-level overrides
      persist across roof preset changes via the `role + cardinal` key map.
      Right-click context menu and arrow-key face navigation pending.
- [x] **Day 8 — bulk operations.** Apply-to-similar matches buildings by
      ±30% area, ±20% aspect, ±15° rotation. Match-heights normalises all
      other buildings to the source's eave height. Select-all multi-selection
      lands in the store. Lasso multi-select pending.
- [ ] **Day 9 — visual polish.** Camera auto-fits on first load, building
      selection re-colours faces; SSAO calibration, smoother camera limits,
      footprint ground outlines, refined empty states still to come.
- [ ] **Day 10 — Hartpury demo + verification.** Single-building round-trip
      verified manually via the preview. Programmatic Playwright e2e test
      covers the same flow. Full 10-building Hartpury scene + screenshot
      acceptance test pending.

### Verification scenarios (from the brief)

- [x] **1 · Create, save, reload round-trip** — programmatic round-trip
      verified; manual UI flow verified in preview.
- [x] **2 · All 12 presets render** — unit-tested across the full preset list
      plus visual confirmation of 4 distinct styles in 3D.
- [ ] **3 · L-shape with hip roof** — fallback uses the OBB and won't show
      intersecting ridges. Listed as a known limitation in the brief's
      escalation list; full straight-skeleton support deferred.
- [ ] **4 · Push-pull editing** — pending.
- [x] **5 · Per-face inspector + selection persistence** — face overrides
      persist via `role + cardinal` map; verified live in the inspector.
- [ ] **6 · Apply to similar** — implemented in the inspector panel; needs a
      multi-building Hartpury demo to confirm the matcher behaves on real
      data.
- [ ] **7 · Full Hartpury build** — pending.
- [ ] **8 · Performance at 10 buildings** — pending.

### Tooling

- `pnpm typecheck` — clean
- `pnpm test` — 29 passing (8 shared + 21 web)
- `pnpm lint` — to be run
- `pnpm test:e2e` — Playwright round-trip spec landed; not yet executed in CI

### Known limitations carried into later phases

- Straight-skeleton WASM for L-shape / T-shape hips is deferred (brief flag).
- Push-pull editing in both 2D and 3D is deferred.
- Vertex drag and snap-to-edge across buildings are deferred.
- Right-click context menu on faces and arrow-key face navigation are
  deferred.
