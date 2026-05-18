// Bridge between non-React modules / list-row click handlers and the active
// maplibre Map instance. The Map lives inside MapView's ref; exposing it
// through a module-level handle is the smallest viable interface to let
// BuildingList trigger a flyTo without dragging Maplibre types through a
// React context or duplicating the camera state in the store.

import { type Building, polygonCentroidLngLat } from '@nza-pv/shared';
import type maplibregl from 'maplibre-gl';

let active: maplibregl.Map | null = null;

export function setActiveMap(map: maplibregl.Map | null): void {
  active = map;
}

/** Centre the camera on a building. Keeps the user's current pitch / bearing
 *  so a campus walkthrough doesn't jolt between top-down and oblique views —
 *  pitch and bearing have to be passed EXPLICITLY because maplibre's flyTo
 *  silently resets unspecified angles when a `center` change is also part
 *  of the animation (the "preserves current pitch" contract only holds for
 *  pure zoom moves). Bumps zoom to 19 if currently zoomed out further so
 *  the target building fills the viewport. */
export function flyToBuilding(building: Building): void {
  if (!active) return;
  const center = polygonCentroidLngLat(building.footprint);
  active.flyTo({
    center: [center[0], center[1]],
    zoom: Math.max(active.getZoom(), 19),
    pitch: active.getPitch(),
    bearing: active.getBearing(),
    duration: 800,
    essential: true,
  });
}
