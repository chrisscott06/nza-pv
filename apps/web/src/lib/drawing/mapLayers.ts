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
  // `addSource` throws if the style isn't loaded yet. Defer the whole install
  // until then, so callers don't need to know about load timing.
  if (!map.isStyleLoaded()) {
    map.once('load', () => installLayers(map));
    return;
  }
  if (map.getSource(BUILDINGS_SRC)) return;
  map.addSource(BUILDINGS_SRC, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addSource(DRAFT_SRC, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'buildings-fill',
    type: 'fill',
    source: BUILDINGS_SRC,
    paint: {
      'fill-color': ['case', ['boolean', ['get', 'selected'], false], '#a3e6ad', '#e7ddc6'],
      'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.45, 0.32],
    },
  });
  map.addLayer({
    id: 'buildings-line',
    type: 'line',
    source: BUILDINGS_SRC,
    paint: {
      'line-color': ['case', ['boolean', ['get', 'selected'], false], '#7ec98a', '#1f6f4f'],
      'line-width': ['case', ['boolean', ['get', 'selected'], false], 2.5, 1.5],
    },
  });

  map.addLayer({
    id: 'draft-fill',
    type: 'fill',
    source: DRAFT_SRC,
    paint: { 'fill-color': '#7ec98a', 'fill-opacity': 0.22 },
  });
  map.addLayer({
    id: 'draft-line',
    type: 'line',
    source: DRAFT_SRC,
    paint: { 'line-color': '#7ec98a', 'line-width': 2, 'line-dasharray': [2, 2] },
  });
}

export function updateBuildings(
  map: maplibregl.Map,
  buildings: Building[],
  selectedIds: Set<string>,
): void {
  if (!map.isStyleLoaded()) {
    map.once('load', () => updateBuildings(map, buildings, selectedIds));
    return;
  }
  const src = map.getSource(BUILDINGS_SRC) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
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
