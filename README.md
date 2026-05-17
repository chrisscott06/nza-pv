# NZA-PV

A 3D building & roof workbench for solar PV pre-feasibility studies. Draw building footprints on a satellite basemap, raise them to height, apply parametric roof shapes, then inspect each roof face for area, tilt, azimuth, and PV-panel capacity.

## Status

**Phase 1 — in build.** See [`docs/briefs/phase-1-brief.md`](docs/briefs/phase-1-brief.md) for the full scope. Current progress is tracked in [`STATUS.md`](STATUS.md).

## Quick start

Requires Node 20+ and pnpm 10+.

```
git clone https://github.com/chrisscott06/nza-pv.git
cd nza-pv
pnpm install
pnpm dev
```

Or on Windows, double-click `go.bat`. Open `http://localhost:5173`.

## Layout

```
apps/web         React + Vite + TypeScript front end
packages/shared  Locked v1 schema (ProjectFile, Building, Roof, RoofFace)
docs/briefs      Phase briefs (source of truth for scope)
```

## Maps

Phase 1 falls back to OpenStreetMap raster tiles if no MapTiler key is provided. To use the satellite basemap, copy `.env.example` to `.env` and paste a key:

```
cp .env.example .env
# then edit .env and set VITE_MAPTILER_API_KEY
```

## Scripts

- `pnpm dev` — run the web app
- `pnpm build` — production build of every package
- `pnpm test` — Vitest unit tests across the workspace
- `pnpm test:e2e` — Playwright tests (web app)
- `pnpm typecheck` — strict TS check
- `pnpm lint` — Biome lint + format check
- `pnpm fix` — Biome auto-fix

## Schema

The `.nzapv` file format is locked at v1.0 at the end of Phase 1 — see [`packages/shared/src/schema.ts`](packages/shared/src/schema.ts). Phase 2+ migrates from v1, never modifies it.
