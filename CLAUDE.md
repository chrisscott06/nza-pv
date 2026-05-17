# CLAUDE.md — NZA-PV

This file is loaded into every Claude Code session in this repo. Keep it short and load-bearing.

## What this project is

NZA-PV is a 3D building and roof workbench. A user draws building footprints on a satellite basemap, raises them to height, applies parametric roof shapes, then inspects each roof face for area, tilt, azimuth, and PV-panel capacity. Output is a portable `.nzapv` JSON file.

The single acceptance test for Phase 1 is the "Hartpury screenshot": a 10-building campus scene that looks credible enough to drop into a pre-feasibility board pack.

## Working agreements

- **The brief is the plan.** [`docs/briefs/phase-1-brief.md`](docs/briefs/phase-1-brief.md) is the source of truth for Phase 1 scope, schema, and verification. If something here disagrees with the brief, the brief wins.
- **Schema is locked at v1.0 at the end of Phase 1.** Any change after that needs a migration, not an edit to [`packages/shared/src/schema.ts`](packages/shared/src/schema.ts).
- **No data scraping in Phase 1.** No PVGIS, no Google Solar API, no OSM auto-import. Pure geometry tool with placeholder PV counts.
- **No new features beyond the brief without checking in first.** "Apply roof presets" is in scope; "add a custom shape editor" is not.

## Tech stack

- React 18 + Vite + TypeScript (`apps/web`)
- Locked schema in `packages/shared`
- MapLibre GL JS for the 2D basemap (OSM raster tiles fallback; MapTiler satellite if a key is set)
- Terra Draw for the drawing tools (Day 2+)
- Three.js + @react-three/fiber + @react-three/drei for 3D (Day 5+)
- `straight-skeleton` (WASM) for hip-roof geometry (Day 3+)
- Zustand for state, Immer for safe updates
- Biome for lint/format, Vitest for unit, Playwright for e2e

## Repo conventions

- pnpm workspaces. Always run scripts from the repo root: `pnpm dev`, `pnpm test`, `pnpm typecheck`.
- No commits of `node_modules`, `dist`, `.env`, or `test-results`.
- One Biome config rules everything. Don't add ESLint or Prettier.
- Imports use the `@nza-pv/shared` workspace alias, not relative `../../packages/shared` paths.

## Before declaring a task done

- `pnpm typecheck` clean
- `pnpm test` clean
- `pnpm lint` clean
- No `.env` or large binaries in the commit
- `STATUS.md` updated if a Day or scenario moved state

## Working directory

The canonical local path is `C:\Users\ChrisScott\Dev\nza-pv` on Windows. Use PowerShell for shell commands.
