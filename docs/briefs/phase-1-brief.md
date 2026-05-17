# NZA-PV — Phase 1 brief: 3D building & roof workbench

**Phase:** 1
**Status:** Ready to build
**Estimated duration:** 10 build days
**Author:** Claude Chat (architect), with Chris
**Date drafted:** 15 May 2026

---

## Why this phase exists first

The visual core of NZA-PV is where the tool succeeds or fails. We're doing it
first so that:

1. We de-risk the hardest, most uncertain piece of the build before stacking
   anything on top of it.
2. If the roof builder turns out to be harder than expected, we find out in
   week one with nothing else dependent on it.
3. The resulting geometry foundation is portable to NZA-Sim, heat-loss tools,
   daylighting, and anything else where buildings need representing.

No data scraping in this phase. No PVGIS, no Google Solar API, no OSM
auto-import, no PV yield calcs. Pure geometry tool, with placeholder panel
counts to validate the per-face inspector pattern.

---

## Outcome

By the end of Phase 1, a user can:

- Open NZA-PV in a browser
- Navigate the map to Hartpury University
- Draw rectangles and L-shaped polygons representing roughly 10 campus buildings
- Set per-building heights (storeys × storey height, or total metres)
- Push-pull walls to adjust footprints
- Apply roof presets (12 of them — see the preset library section)
- Adjust pitch, ridge orientation, and other roof parameters with live 3D preview
- Click any roof face to inspect its area, tilt, azimuth, and placeholder
  PV panel count
- Use "apply to similar" to bulk-fill repeated building types
- Save the scene as a `.nzapv` file
- Close the tab, reopen, load the file, see exactly the same scene
- Take a screenshot that's recognisably Hartpury at a glance

The screenshot is the acceptance test. If it looks like Hartpury, Phase 1 is done.

---

## Scope — what's in

### Drawing tools
- **Rectangle tool** — click-drag-release to create. Drag handle to rotate after
  placement.
- **Polygon tool** — click vertices, double-click to close. Right-angle snap on
  by default. Hold shift to disable snap. Self-intersecting polygons rejected
  with a clear error toast.
- **Push-pull editing** — in 2D plan view, drag any edge perpendicular to its
  normal to extend/contract. In 3D view, click a wall face and drag to push or
  pull. Roof regenerates live. Cannot push past another wall (clamped).
- **Vertex drag** — shift-drag a vertex in 2D plan view for free-form reshape.
- **Snap-to-edge** — when drawing a new building, snap to existing building edges
  so adjacent buildings sit flush with no gap.

### Building data
- **Per-building heights** — user enters either total height in metres OR
  storeys × storey height (default 3m). Stored as eave height.
- **Name** — auto-generated ("Building 1", "Building 2"…) but inline-editable.
- **Building list** — collapsible side panel listing all buildings with name,
  height, and roof style. Click to select.

### Roof calc engine
Three underlying primitives:

1. **Extrude polygon to height** (flat roofs, parapets)
2. **Straight skeleton** (hip roofs on any simple polygon, including L-shapes)
3. **Ridge-line + faces** (gables, monos, mansards, gambrels, all parameterised
   variations)

Library: `StrandedKitty/straight-skeleton` (TypeScript + WASM) for the
skeleton work. Wrap with our own validation layer for winding-order and
near-collinear vertex cleanup.

### Roof preset library (12 presets)

**Tier 1 — workhorses (must work flawlessly):**
- **Flat** — parapet height: none / low (300mm) / high (1m)
- **Mono-pitch** — pitch angle, high-side direction (N/E/S/W or custom)
- **Gable** — pitch angle, ridge axis (longest edge / shortest edge / custom angle)
- **Hip** — pitch angle (uniform skeleton)

**Tier 2 — campus essentials:**
- **Dutch hip** — gable with hipped upper ends. Pitch, ridge axis, hip ratio.
- **Gambrel (barn-style)** — two pitches per side. Lower/upper pitch, break height.
- **Mansard** — four-sided gambrel. Lower/upper pitch, break height, ridge axis.
- **Saltbox** — gable with unequal pitches. Front pitch, back pitch, ridge offset.

**Tier 3 — stretch presets (target for v1, acceptable to defer to v1.1 if time
runs out):**
- **Sawtooth (north-light)** — pitch count, pitch angle, glazing strip width.
- **Butterfly** — inverted V, pitch angle, valley depth.
- **Pyramid** — single apex (auto-detected for near-square footprints).
- **Cross-gabled** — explicit gables on L-shape arms.

Each preset is a wrapper that sets parameters on the three primitives. The
calc engine outputs a list of `RoofFace` objects (see schema below).

### Roof builder UI
- **Preset gallery** — 12 presets shown as small 3D thumbnails (not a
  dropdown). Click to apply.
- **Pitch slider** — 0–60°, live numeric input alongside. Updates 3D scene
  in real time.
- **Ridge orientation control** — rotation dial OR draggable handle on a 2D
  plan inset OR cardinal preset (N-S / E-W / longest edge).
- **Plan-view inset** — small 2D top-down panel showing footprint and ridge
  lines as you adjust. Lets users precisely set ridge orientation by dragging
  on a flat plan rather than guessing in 3D.
- **Eave height slider** — defaults to building height, overridable.
- **Style-specific controls** — parapet height for flat, break height for
  mansard, etc. Appear contextually based on selected style.

### Per-face inspector
- **Click-to-select** — first click selects whole building, second click on a
  specific roof face selects that face. Hover highlights. Cursor changes
  (pointer over faces, grab over edges).
- **Selected face shown in accent colour**, other faces slightly dimmed.
- **Side panel inspector** showing:
  - Face role and cardinal orientation (e.g. "South-facing main face")
  - Area (m²)
  - Tilt (degrees)
  - Azimuth (degrees + cardinal)
  - PV inclusion toggle (default: any face with tilt 0–60° is eligible)
  - Max coverage slider (default 70%)
  - Panel size dropdown (Standard 1.95m², Commercial 2.0m², Half-cut 1.75m²,
    Custom)
  - Calculated usable area, panel count, nominal kWp
- **Right-click context menu** on a face — Toggle PV eligibility, Reset to
  defaults, Inspect details.
- **Selection persistence** — toggles preserved across compatible roof
  preset changes (matched by `role + cardinal`). Incompatible changes reset
  affected toggles with a toast notification.

### Bulk operations
- **Apply to similar** — select a building, click "apply roof to similar".
  Finds buildings with footprint similarity (aspect ratio within 20%, area
  within 30%, orientation within 15°). Shows preview list of matches. User
  confirms before applying.
- **Match heights** — select 2+ buildings, set them all to the same eave
  height.
- **Roof copy** — select source building, click target, copy roof config.
- **Multi-select** — shift-click or lasso-select multiple buildings. Bulk
  operations available on the multi-selection.

### Materials and lighting
- Slightly warm off-white walls (e.g. `#f0ebe5`)
- Dark grey roofs with subtle texture (e.g. `#3a3a3a` with a low-frequency
  noise normal map)
- Satellite imagery as ground texture (MapTiler tiles via MapLibre, locked at
  zoom 19)
- One directional light at a fixed sensible angle (azimuth ~135°, elevation
  ~50° — equivalent to ~11am south-east light for a UK site)
- Soft shadows via PCF shadow map
- Ambient occlusion (SSAO or baked) on building corners and roof intersections
- **No sun position slider in this phase** — fixed lighting. Sun controls
  come in a later polish phase.

### Save / load
- **Save** — downloads a `.nzapv` JSON file containing project metadata,
  optional perimeter, and the array of buildings (with footprints, heights,
  and roof configs).
- **Load** — uploads a `.nzapv` file. Restores the scene exactly.
- **Autosave** — current state written to browser `localStorage` after every
  meaningful change. Survives tab reload.
- **Schema is locked** at the end of Phase 1. Phase 2+ migrates from v1
  schema, not modifies it.

### Workspace shell
- Top bar with project name (editable inline) and Save button
- Left rail with step navigation (only "Buildings" step active in Phase 1;
  others greyed out)
- Status bar at the bottom showing project name, last-saved time, current step,
  building count
- Keyboard shortcuts: `Ctrl+S` save, `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo,
  `Escape` deselect, arrow keys step between adjacent faces when one is
  selected.

---

## Scope — what's out

Explicitly **not in Phase 1**:

- OSM building footprint auto-import (Phase 2)
- LiDAR height auto-fill (Phase 5)
- Google Solar API integration (Phase 5)
- PVGIS yield calculations (Phase 5)
- Real PV generation numbers (kWh/year) — Phase 1 shows nominal kWp from
  geometry only
- Sun position slider / shadow animation (Phase 7 polish)
- Time-of-year controls
- PDF report or CSV export (Phase 6)
- Site perimeter drawing as a workflow step (Phase 2)
- PV rule engine (eligibility defaults beyond "tilt 0–60°", coverage logic) — Phase 4
- Account system, cloud sync, sharing
- Photorealistic 3D Tiles (v2)
- Custom roof shape editor (v1.1)
- Per-panel placement and dragging (Phase 6+)
- Building-to-building joining / boolean unions

---

## Schema (locked at end of Phase 1)

Lives in `packages/shared/src/schema.ts`. Any change after Phase 1 needs a
migration.

```typescript
const SCHEMA_VERSION = "1.0";

type ProjectFile = {
  schema_version: "1.0";
  project: {
    id: string;
    name: string;
    created_at: string;     // ISO 8601
    last_modified: string;  // ISO 8601
    notes?: string;
  };
  site?: {                  // optional in Phase 1
    perimeter?: GeoJSON.Polygon;
    centroid?: [number, number];
    country?: string;
  };
  buildings: Building[];
};

type Building = {
  id: string;
  name: string;
  footprint: GeoJSON.Polygon;
  storeys: number;
  storey_height_m: number;       // default 3
  eave_height_m: number;          // = storeys × storey_height, overridable
  roof: Roof;
  faces: RoofFace[];              // generated; cached for performance
};

type Roof =
  | { style: "flat"; parapet_height_m: number }
  | { style: "mono"; pitch_deg: number; high_side: "N" | "E" | "S" | "W" | number }
  | { style: "gable"; pitch_deg: number; ridge_axis: "longest" | "shortest" | "custom"; ridge_rotation_deg?: number }
  | { style: "hip"; pitch_deg: number }
  | { style: "dutch_hip"; pitch_deg: number; ridge_axis: "longest" | "shortest" | "custom"; ridge_rotation_deg?: number; hip_ratio: number }
  | { style: "gambrel"; lower_pitch_deg: number; upper_pitch_deg: number; break_height_m: number; ridge_axis: "longest" | "shortest" | "custom"; ridge_rotation_deg?: number }
  | { style: "mansard"; lower_pitch_deg: number; upper_pitch_deg: number; break_height_m: number; ridge_axis: "longest" | "shortest" | "custom"; ridge_rotation_deg?: number }
  | { style: "saltbox"; front_pitch_deg: number; back_pitch_deg: number; ridge_offset_pct: number; ridge_axis: "longest" | "shortest" | "custom"; ridge_rotation_deg?: number }
  | { style: "sawtooth"; pitch_count: number; pitch_deg: number; glazing_strip_width_m: number }
  | { style: "butterfly"; pitch_deg: number; valley_depth_m: number }
  | { style: "pyramid"; pitch_deg: number }
  | { style: "cross_gabled"; pitch_deg: number };

type RoofFace = {
  id: string;
  role: "main" | "hip_end" | "gable_end_wall" | "dormer" | "sawtooth_pitch" | "sawtooth_glazing" | "mansard_lower" | "mansard_upper" | "gambrel_lower" | "gambrel_upper";
  cardinal: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "flat";
  geometry: GeoJSON.Polygon;     // 3D polygon (z coordinates)
  area_m2: number;
  tilt_deg: number;
  azimuth_deg: number;
  is_pv_eligible: boolean;       // default: tilt 0-60° → true
  max_coverage_pct: number;       // default 70
  panel_size_m2: number;          // default 1.95
};
```

The `faces` array on `Building` is generated by the roof calc engine. We
cache it in the saved file for performance (large campus = lots of geometry),
but regenerate on load if the calc engine version has changed.

---

## Build order

### Day 1 — repo + shell
- Initialise `nza-pv` monorepo at `C:\Users\ChrisScott\Dev\nza-pv`
- pnpm workspaces with `apps/web` (React + Vite + TS) and `packages/shared`
  (the schema)
- Biome for lint/format, Vitest for unit, Playwright for e2e
- Basic React shell with top bar, left rail, status bar
- MapLibre map with MapTiler satellite basemap
- "New Project" / "Open Project" UI on landing
- localStorage autosave + `.nzapv` download/upload roundtrip working with an
  empty project (no buildings yet)
- `go.bat` and `update.bat` launchers
- `.env.example` with `MAPTILER_API_KEY` placeholder
- README, `CLAUDE.md` (already drafted), empty `STATUS.md`

### Day 2 — drawing tools and building list
- Terra Draw integration on top of MapLibre
- Rectangle tool with rotation handle
- Polygon tool with right-angle snap (shift to disable)
- Self-intersection validation
- Snap-to-edge when drawing near existing buildings
- Building list panel with names, heights, roof style preview
- Click building → select → inline rename
- Push-pull edge editing in 2D plan view
- Vertex drag (shift-drag)
- Storeys × storey-height OR total metres input for heights

### Days 3–4 — roof calc engine
- Three primitive functions: extrude, straight-skeleton wrap, ridge-faces
- Integrate `StrandedKitty/straight-skeleton` via npm + WASM
- All 12 preset wrappers
- `RoofFace` generation with `role`, `cardinal`, geometry, area, tilt, azimuth
- Unit tests against known inputs:
  - 10m × 5m rectangle, hip at 30° → 4 faces with expected areas/tilts
  - 10m × 5m rectangle, gable at 30° on long axis → 2 trapezoid main faces,
    2 triangular gable walls
  - L-shape (10m × 5m + 5m × 5m), hip at 30° → 6 faces with intersecting
    ridges

### Days 5–6 — roof builder UI
- Preset gallery component (12 thumbnail buttons)
- Pitch slider + numeric input
- Ridge orientation control (dial + plan inset)
- Style-specific control panels (parapet for flat, break height for mansard, etc.)
- Live 3D preview wired up
- Push-pull editing in 3D view (face raycast + perpendicular drag)
- Multi-building scene rendering with materials and lighting
- Three.js scene setup: directional light, shadow map, SSAO, materials

### Day 7 — per-face inspector
- Click-to-select state machine (whole-building → face → deselect)
- Hover highlighting (face raycasting)
- Cursor change based on hover target
- Inspector side panel with all fields from spec above
- Placeholder PV calc (geometric panel count, nominal kWp)
- Right-click context menu
- Selection persistence across roof preset changes
- Toast notification on incompatible preset change
- Arrow-key navigation between adjacent faces

### Day 8 — bulk operations
- "Apply to similar" with similarity algorithm and preview list
- "Match heights" multi-select operation
- "Roof copy" source-and-target click pattern
- Shift-click multi-select
- Lasso multi-select
- Bulk operations panel when multi-selection active

### Day 9 — visual polish
- Materials tuning (wall colour, roof colour, edge contrast)
- SSAO calibration
- Shadow softness
- Building footprint subtle outline on the ground
- Selection visual feedback refinement
- Loading states / empty states
- Smooth camera controls (orbit, pan, zoom limits)

### Day 10 — Hartpury demo, verification, buffer
- Build out a 10-building Hartpury scene end-to-end
- Run all verification scenarios (see below)
- Fix any issues
- Update `STATUS.md`
- Commit, push, raise PR

---

## Verification scenarios

All scenarios run at 1440×900 viewport minimum. Real data only — empty
states and loading spinners are FAIL.

### Scenario 1: Create, save, reload roundtrip
**Do:**
1. Open NZA-PV at `http://localhost:5173`
2. Click "New Project", name it "Test 1"
3. Navigate the map to Hartpury (search "Hartpury University" or paste
   coordinates 51.9213, -2.3013)
4. Draw a rectangle building, set height to 8m
5. Apply hip roof at 30° pitch
6. Click Save → file downloads as `Test 1.nzapv`
7. Close the browser tab
8. Reopen `http://localhost:5173`
9. Click "Open Project" → select the downloaded `Test 1.nzapv`

**Check:**
- Building appears in the same map location
- Same height, same roof style, same pitch
- Same name
- Scene viewport is the same as when saved

**PASS:** Identical scene loads with all parameters preserved.
**FAIL:** Any difference in building position, geometry, or roof.

### Scenario 2: All 12 roof presets render correctly
**Do:**
For each of the 12 presets, on a fresh 10m × 6m rectangle building at 8m
eave height:
1. Apply the preset with default parameters
2. Take a screenshot
3. Click the south-facing face (or whichever is the largest sloped face)
4. Verify the inspector shows non-zero area, sensible tilt, sensible azimuth

**Check:**
- Roof geometry is visually correct (no flipped normals, no missing faces,
  no z-fighting)
- Inspector values match the preset's parameters (e.g. hip at 30° → tilt ≈ 30°)
- Switching between presets is smooth, no crashes

**PASS:** All 12 presets produce valid, recognisable geometry with sensible
face data.
**FAIL:** Any preset crashes, produces visibly wrong geometry, or returns
invalid face data.

### Scenario 3: L-shape with hip roof
**Do:**
1. Use polygon tool with right-angle snap to draw an L-shape (10m × 6m main
   block, 5m × 4m wing at 90°)
2. Apply hip roof at 30°

**Check:**
- Straight skeleton produces correctly intersecting ridges
- All 6 (or however many — depends on the L proportions) faces are present
  in the inspector
- Areas sum to within 0.5m² of the manually calculated total
- No degenerate (zero-area) faces

**PASS:** L-shape hip roof renders with valid intersecting ridges and all
faces accessible.
**FAIL:** Crash, broken geometry, or missing faces.

### Scenario 4: Push-pull editing
**Do:**
1. Draw a 10m × 6m rectangle, apply gable roof at 30°
2. In 2D plan view, drag the north edge 2m further north
3. In 3D view, click the south wall and drag it 1m further south

**Check:**
- Footprint updates live during drag
- Roof regenerates correctly (gable extends to match new footprint)
- Face inspector values update (south face area changes)
- Cannot drag a wall past another wall (clamped)

**PASS:** Push-pull works in both views, roof regenerates correctly, no
crashes on edge cases.
**FAIL:** Geometry breaks, walls cross, or roof fails to regenerate.

### Scenario 5: Per-face inspector and selection persistence
**Do:**
1. Create a 10m × 6m rectangle, apply hip roof at 30°
2. Click the building → check inspector shows building-level info
3. Click the south-facing trapezoid → check inspector shows face info
4. Note the panel count and nominal kWp
5. Adjust max coverage slider from 70% to 50% → numbers update live
6. Change roof preset to gable at 30° (long axis)
7. Check that the south-facing main face is still selected
8. Check that max coverage is still 50%

**Check:**
- All inspector fields update live as parameters change
- Selection persists from hip to gable (south-facing main → south-facing main)
- Face-level overrides (max coverage 50%) persist across the change

**PASS:** Selection follows via `role + cardinal`, overrides preserved
where the equivalent face exists.
**FAIL:** Selection lost on every preset change, or overrides reset
unexpectedly.

### Scenario 6: Apply to similar
**Do:**
1. Draw 6 rectangle buildings of similar size at Hartpury
2. Make 4 of them roughly the same dimensions (say 12m × 6m), make 2
   noticeably different (say 8m × 8m)
3. Apply hip roof at 35° to one of the 12m × 6m buildings
4. Click "Apply to similar"

**Check:**
- Preview list shows the 3 other similar buildings
- Does NOT include the 2 different-sized ones
- Clicking confirm applies the roof to all 4

**PASS:** Similarity matching identifies the right buildings; bulk apply
works.
**FAIL:** Wrong buildings matched, or apply doesn't work.

### Scenario 7: Full Hartpury build
**Do:**
1. Open NZA-PV, new project "Hartpury Demo"
2. Navigate to Hartpury
3. Draw approximately 10 campus buildings using a mix of rectangles and
   L-shapes
4. Set heights between 5m and 12m
5. Apply a mix of roof presets (use at least 6 different presets across
   the 10 buildings)
6. Use "apply to similar" at least once
7. Adjust pitches and ridge orientations
8. Click on at least 5 different roof faces, check inspector data is sensible
9. Save as `Hartpury Demo.nzapv`
10. Take an oblique 3D screenshot at 1440×900

**Check the screenshot:**
- Buildings recognisably resemble a campus
- Roof shapes look credible (no broken geometry)
- Materials, lighting, and shadows produce a presentable image
- Could plausibly appear in a board pack alongside professional renders

**PASS:** Screenshot looks the part. Chris would put it in a pre-feasibility
report.
**FAIL:** Anything visually broken, or so plain that it doesn't pass the
board-pack test.

### Scenario 8: Performance
**Do:**
With the 10-building Hartpury Demo scene loaded:
1. Drag the pitch slider rapidly on one building
2. Orbit the camera around the scene
3. Open the per-face inspector on each of 5 different buildings in
   sequence

**Check:**
- Frame rate stays above 30fps throughout
- Slider drag has no perceptible lag in the 3D preview
- No memory leaks visible in browser dev tools after 5 minutes of
  interaction

**PASS:** Tool feels responsive at 10-building scale.
**FAIL:** Lag, dropped frames, or memory growth.

---

## Things to flag mid-build

If any of these come up, escalate to Chris before continuing past 3 attempts:

- Straight-skeleton WASM library produces broken geometry on a common case
  (L-shapes, T-shapes, polygons with near-collinear vertices)
- Three.js shadow map performance can't sustain 30fps at 10 buildings
- Selection persistence proves materially harder than the `role + cardinal`
  approach suggests
- Any of the Tier 3 presets (sawtooth, butterfly, pyramid, cross-gabled)
  proves disproportionately difficult — acceptable to defer these to v1.1
  with Chris's sign-off
- Push-pull editing in 3D view has unresolvable raycasting ambiguity at
  building corners

---

## Done means

- All 8 verification scenarios pass
- Screenshot from Scenario 7 (full Hartpury) is saved to `briefs/archive/`
  alongside this brief
- `STATUS.md` updated with phase completion
- All post-task safety checks pass (pnpm test, typecheck, lint, no node_modules
  pushed, no .env in commits)
- Schema v1.0 is locked — `packages/shared/src/schema.ts` carries a comment
  declaring this
- PR opened and reviewed
- Chris has tested manually and signed off

---

*End of Phase 1 brief.*
