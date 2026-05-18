// Manages the MapLibre source + layers showing buildings, the in-progress
// drawing, and the selection highlight.

import type { Building } from '@nza-pv/shared';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type maplibregl from 'maplibre-gl';

const BUILDINGS_SRC = 'buildings';
const DRAFT_SRC = 'draft';

export type BuildingFeature = Feature<
  Polygon,
  { id: string; selected: boolean; name: string; height: number }
>;

export function installLayers(map: maplibregl.Map): void {
  // Caller is expected to wait for the map's `load` event before invoking
  // us. `addSource` would throw if the style was still loading. We used to
  // defer via `map.once('load', …)` here, but the recursion produced a
  // deadlock with raster styles where `isStyleLoaded()` continues to return
  // false even after the load event has fired and the listener will never
  // re-fire (the `once` registration is consumed but its work was a no-op).
  if (map.getSource(BUILDINGS_SRC)) return;
  map.addSource(BUILDINGS_SRC, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addSource(DRAFT_SRC, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Hot coral palette — pops on satellite imagery (which is mostly green and
  // brown) so unselected buildings stay clearly visible. Selected buildings
  // switch to the cream/green palette for contrast against neighbouring coral
  // outlines.
  map.addLayer({
    id: 'buildings-fill',
    type: 'fill',
    source: BUILDINGS_SRC,
    paint: {
      'fill-color': ['case', ['boolean', ['get', 'selected'], false], '#fff1cf', '#ff5d57'],
      'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.55, 0.42],
    },
  });
  map.addLayer({
    id: 'buildings-line',
    type: 'line',
    source: BUILDINGS_SRC,
    paint: {
      'line-color': ['case', ['boolean', ['get', 'selected'], false], '#ffeb3b', '#ff3d35'],
      'line-width': ['case', ['boolean', ['get', 'selected'], false], 4, 3],
    },
  });

  // 3D extrusion layer — invisible by default. `MapView` toggles its
  // `visibility` to 'visible' when the user enters 3D mode so the buildings
  // pop up out of the satellite tiles à la Google Maps.
  map.addLayer({
    id: 'buildings-extrusion',
    type: 'fill-extrusion',
    source: BUILDINGS_SRC,
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['case', ['boolean', ['get', 'selected'], false], '#fff1cf', '#f0ebe5'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9,
    },
  });

  map.addLayer({
    id: 'draft-fill',
    type: 'fill',
    source: DRAFT_SRC,
    paint: { 'fill-color': '#ff5d57', 'fill-opacity': 0.22 },
  });
  map.addLayer({
    id: 'draft-line',
    type: 'line',
    source: DRAFT_SRC,
    paint: { 'line-color': '#ff5d57', 'line-width': 2.5, 'line-dasharray': [2, 2] },
  });
}

export function updateBuildings(
  map: maplibregl.Map,
  buildings: Building[],
  selectedIds: Set<string>,
): void {
  const src = map.getSource(BUILDINGS_SRC) as maplibregl.GeoJSONSource | undefined;
  if (!src) return; // MapView's `load` handler will retry with current state.
  const fc: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      geometry: b.footprint,
      properties: {
        id: b.id,
        name: b.name,
        height: b.eave_height_m,
        selected: selectedIds.has(b.id),
      },
    })),
  };
  src.setData(fc);
}

/** Show or hide the 3D extrusion layer. Called from MapView whenever the
 *  global view mode changes between '2d' and '3d'. */
export function setExtrusionVisible(map: maplibregl.Map, visible: boolean): void {
  if (!map.getLayer('buildings-extrusion')) return;
  map.setLayoutProperty('buildings-extrusion', 'visibility', visible ? 'visible' : 'none');
}

export function setDraft(map: maplibregl.Map, polygon: Polygon | null): void {
  const src = map.getSource(DRAFT_SRC) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: polygon ? [{ type: 'Feature', geometry: polygon, properties: {} }] : [],
  });
}

export function featureAtPoint(
  map: maplibregl.Map,
  point: maplibregl.Point,
): BuildingFeature | null {
  const hits = map.queryRenderedFeatures(point, { layers: ['buildings-fill'] });
  return (hits[0] as unknown as BuildingFeature | undefined) ?? null;
}
