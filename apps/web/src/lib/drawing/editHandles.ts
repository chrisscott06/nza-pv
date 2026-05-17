// Per-building edit handles on the 2D map. When a rectangle is selected we
// drop a draggable HTML marker at each edge midpoint (for push-pull) and one
// rotation handle offset from the centroid. Edits go straight back into the
// store and trigger a face regen.

import {
  lngLatToMeters,
  metersToLngLat,
  polygonCentroidLngLat,
  polygonRingToMeters,
  type Building,
  type LngLat,
} from '@nza-pv/shared';
import maplibregl from 'maplibre-gl';
import { regenerateFaces } from '../roof/regenerate.js';
import { useProject } from '../../store/projectStore.js';

type HandleKind = 'edge' | 'rotate';

function makeEl(kind: HandleKind): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `edit-handle ${kind}`;
  return el;
}

/** Mount all edit handles for `building`. Returns a teardown function. */
export function mountEditHandles(map: maplibregl.Map, building: Building): () => void {
  // Only rectangles (4-vertex polygons) get the rotation + push-pull treatment
  // for Phase 1. Other shapes show no handles (vertex-drag is deferred).
  const ring = (building.footprint.coordinates[0] ?? []) as LngLat[];
  const vertCount = ring.length > 0 && sameLngLat(ring[0]!, ring[ring.length - 1]!) ? ring.length - 1 : ring.length;
  if (vertCount !== 4) return () => {};

  const anchor = polygonCentroidLngLat(building.footprint);
  const verticesM = polygonRingToMeters(building.footprint, anchor); // 4 entries
  const markers: maplibregl.Marker[] = [];

  // ---- Edge midpoint markers (push-pull) ----
  for (let i = 0; i < 4; i++) {
    const a = verticesM[i]!;
    const b = verticesM[(i + 1) % 4]!;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const midLngLat = metersToLngLat(mid, anchor);
    const el = makeEl('edge');
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat(midLngLat)
      .addTo(map);

    let dragging = false;
    marker.on('dragstart', () => {
      dragging = true;
      map.getCanvas().style.cursor = 'grabbing';
    });
    marker.on('drag', () => {
      if (!dragging) return;
      const here = marker.getLngLat();
      const hereM = lngLatToMeters([here.lng, here.lat], anchor);
      pushPullEdge(building, anchor, i, hereM);
    });
    marker.on('dragend', () => {
      dragging = false;
      map.getCanvas().style.cursor = '';
      commitFaceRegen(building.id);
    });
    markers.push(marker);
  }

  // ---- Rotation handle ----
  // Place it offset 12m "north" from the centroid in local metres.
  const rotEl = makeEl('rotate');
  const rotStart: [number, number] = [0, 12];
  const rotStartLngLat = metersToLngLat(rotStart, anchor);
  const rotMarker = new maplibregl.Marker({ element: rotEl, draggable: true, anchor: 'center' })
    .setLngLat(rotStartLngLat)
    .addTo(map);

  let rotating = false;
  let initialAngleRad = Math.atan2(rotStart[0], rotStart[1]);
  let initialVerts: Array<[number, number]> = [];
  rotMarker.on('dragstart', () => {
    rotating = true;
    map.getCanvas().style.cursor = 'grabbing';
    // Snapshot the *current* footprint so each tick rotates from the same
    // starting point, not compounding.
    const b = currentBuilding(building.id);
    if (!b) return;
    const a = polygonCentroidLngLat(b.footprint);
    initialVerts = polygonRingToMeters(b.footprint, a);
    const here = rotMarker.getLngLat();
    const hereM = lngLatToMeters([here.lng, here.lat], a);
    initialAngleRad = Math.atan2(hereM[0], hereM[1]);
  });
  rotMarker.on('drag', () => {
    if (!rotating) return;
    const b = currentBuilding(building.id);
    if (!b) return;
    const a = polygonCentroidLngLat(b.footprint);
    const here = rotMarker.getLngLat();
    const hereM = lngLatToMeters([here.lng, here.lat], a);
    const angle = Math.atan2(hereM[0], hereM[1]);
    const delta = angle - initialAngleRad;
    rotateBuilding(b, a, initialVerts, delta);
  });
  rotMarker.on('dragend', () => {
    rotating = false;
    map.getCanvas().style.cursor = '';
    commitFaceRegen(building.id);
  });
  markers.push(rotMarker);

  return () => {
    for (const m of markers) m.remove();
  };
}

function currentBuilding(id: string): Building | null {
  return useProject.getState().project?.buildings.find((b) => b.id === id) ?? null;
}

function pushPullEdge(
  initial: Building,
  anchor: LngLat,
  edgeIndex: number,
  newMidM: [number, number],
): void {
  const current = currentBuilding(initial.id);
  if (!current) return;
  const ringM = polygonRingToMeters(current.footprint, anchor);
  if (ringM.length < 4) return;
  const a = ringM[edgeIndex]!;
  const b = ringM[(edgeIndex + 1) % 4]!;
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const eLen = Math.hypot(ex, ey);
  if (eLen < 0.01) return;
  // Edge normal (outward-ish — sign matters for sliding direction but not here).
  const nx = -ey / eLen;
  const ny = ex / eLen;
  // Original midpoint of this edge.
  const oldMid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Project the marker movement onto the edge normal.
  const dx = newMidM[0] - oldMid[0];
  const dy = newMidM[1] - oldMid[1];
  const along = dx * nx + dy * ny;
  // Move the edge's two vertices along the normal by `along` metres.
  const moved = ringM.slice();
  moved[edgeIndex] = [a[0] + along * nx, a[1] + along * ny];
  moved[(edgeIndex + 1) % 4] = [b[0] + along * nx, b[1] + along * ny];
  setFootprintFromMetres(initial.id, moved, anchor);
}

function rotateBuilding(
  current: Building,
  anchor: LngLat,
  initialVertsM: Array<[number, number]>,
  deltaRad: number,
): void {
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  // Rotate around the OBB centre of the snapshot (use polygon centroid in metres).
  let cx = 0;
  let cy = 0;
  for (const v of initialVertsM) {
    cx += v[0];
    cy += v[1];
  }
  cx /= initialVertsM.length;
  cy /= initialVertsM.length;
  const rotated = initialVertsM.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as [number, number];
  });
  setFootprintFromMetres(current.id, rotated, anchor);
}

function setFootprintFromMetres(
  buildingId: string,
  verticesM: Array<[number, number]>,
  anchor: LngLat,
): void {
  const ll = verticesM.map((v) => metersToLngLat(v, anchor));
  const coordinates = [[...ll, ll[0]!]];
  useProject.getState().updateBuilding(buildingId, (b) => {
    b.footprint = { type: 'Polygon', coordinates: coordinates as number[][][] };
  });
}

function commitFaceRegen(buildingId: string): void {
  const b = currentBuilding(buildingId);
  if (!b) return;
  useProject.getState().setFaces(buildingId, regenerateFaces(b));
}

function sameLngLat(a: LngLat | number[], b: LngLat | number[]): boolean {
  return (a[0] ?? 0) === (b[0] ?? 0) && (a[1] ?? 0) === (b[1] ?? 0);
}
