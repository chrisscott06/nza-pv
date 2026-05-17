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
  const edgeMarkers: maplibregl.Marker[] = [];

  // ---- Edge midpoint markers (push-pull) ----
  for (let i = 0; i < 4; i++) {
    const el = makeEl('edge');
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([0, 0])
      .addTo(map);
    edgeMarkers.push(marker);

    let dragging = false;
    marker.on('dragstart', () => {
      dragging = true;
      map.getCanvas().style.cursor = 'grabbing';
    });
    marker.on('drag', () => {
      if (!dragging) return;
      const here = marker.getLngLat();
      const hereM = lngLatToMeters([here.lng, here.lat], anchor);
      pushPullEdge(building.id, anchor, i, hereM);
      // Live regen so the roof follows the wall as it moves, and re-anchor
      // every marker to the new footprint so they don't drift off the edges.
      commitFaceRegen(building.id);
      syncEdgeMarkers();
    });
    marker.on('dragend', () => {
      dragging = false;
      map.getCanvas().style.cursor = '';
      commitFaceRegen(building.id);
      syncEdgeMarkers();
      syncRotationHandle();
    });
  }

  // ---- Rotation handle ----
  const rotEl = makeEl('rotate');
  const rotMarker = new maplibregl.Marker({ element: rotEl, draggable: true, anchor: 'center' })
    .setLngLat([0, 0])
    .addTo(map);

  let rotating = false;
  let initialAngleRad = 0;
  let initialVerts: Array<[number, number]> = [];
  rotMarker.on('dragstart', () => {
    rotating = true;
    map.getCanvas().style.cursor = 'grabbing';
    const b = currentBuilding(building.id);
    if (!b) return;
    initialVerts = polygonRingToMeters(b.footprint, anchor);
    const here = rotMarker.getLngLat();
    const hereM = lngLatToMeters([here.lng, here.lat], anchor);
    initialAngleRad = Math.atan2(hereM[0], hereM[1]);
  });
  rotMarker.on('drag', () => {
    if (!rotating) return;
    const here = rotMarker.getLngLat();
    const hereM = lngLatToMeters([here.lng, here.lat], anchor);
    const angle = Math.atan2(hereM[0], hereM[1]);
    const delta = angle - initialAngleRad;
    rotateBuilding(building.id, anchor, initialVerts, delta);
    // Live regen + slide all 4 edge markers to track the rotated walls. The
    // rotation handle itself follows the user's pointer, so we don't move it.
    commitFaceRegen(building.id);
    syncEdgeMarkers();
  });
  rotMarker.on('dragend', () => {
    rotating = false;
    map.getCanvas().style.cursor = '';
    commitFaceRegen(building.id);
    syncEdgeMarkers();
    syncRotationHandle();
  });

  function syncEdgeMarkers(): void {
    const b = currentBuilding(building.id);
    if (!b) return;
    const verts = polygonRingToMeters(b.footprint, anchor);
    for (let i = 0; i < 4; i++) {
      const a = verts[i]!;
      const c = verts[(i + 1) % 4]!;
      const mid: [number, number] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      edgeMarkers[i]?.setLngLat(metersToLngLat(mid, anchor));
    }
  }

  function syncRotationHandle(): void {
    // Park the rotation handle 12m above the building centroid in the local
    // metric frame anchored at the building's *current* centroid, so it
    // travels with the building if a push-pull shifts the centre.
    const b = currentBuilding(building.id);
    if (!b) return;
    const c = polygonCentroidLngLat(b.footprint);
    rotMarker.setLngLat(metersToLngLat([0, 12], c));
  }

  // Initial placement.
  syncEdgeMarkers();
  syncRotationHandle();

  return () => {
    for (const m of edgeMarkers) m.remove();
    rotMarker.remove();
  };
}

function currentBuilding(id: string): Building | null {
  return useProject.getState().project?.buildings.find((b) => b.id === id) ?? null;
}

function pushPullEdge(
  buildingId: string,
  anchor: LngLat,
  edgeIndex: number,
  newMidM: [number, number],
): void {
  const current = currentBuilding(buildingId);
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
  setFootprintFromMetres(buildingId, moved, anchor);
}

function rotateBuilding(
  buildingId: string,
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
  setFootprintFromMetres(buildingId, rotated, anchor);
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
