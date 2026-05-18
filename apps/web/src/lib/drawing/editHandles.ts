// Per-building edit handles for rectangles.
//
//   - 4 green square markers at edge midpoints  → push-pull along edge normal
//   - 4 yellow corner markers with curved arrow → rotate around centroid
//
// Both drag in real time: the footprint, the roof faces, and the *other*
// markers update on every tick. The marker currently being dragged is left
// alone so its position doesn't fight the user's pointer.

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

type XY = [number, number];

const ROTATE_ARROW_SVG = `
<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
  <path d='M5 8a7 7 0 0 1 12-2.5l2-2v6h-6l2.5-2.5A5 5 0 0 0 7 8z' fill='currentColor'/>
  <path d='M19 16a7 7 0 0 1-12 2.5l-2 2v-6h6l-2.5 2.5A5 5 0 0 0 17 16z' fill='currentColor'/>
</svg>`.trim();

const MOVE_ARROWS_SVG = `
<svg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
  <path d='M12 2 L8 6 L10.5 6 L10.5 10.5 L6 10.5 L6 8 L2 12 L6 16 L6 13.5 L10.5 13.5 L10.5 18 L8 18 L12 22 L16 18 L13.5 18 L13.5 13.5 L18 13.5 L18 16 L22 12 L18 8 L18 10.5 L13.5 10.5 L13.5 6 L16 6 Z' fill='currentColor'/>
</svg>`.trim();

function makeEdgeEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'edit-handle edge';
  return el;
}

function makeCornerEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'edit-handle corner';
  el.innerHTML = ROTATE_ARROW_SVG;
  return el;
}

function makeMoveEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'edit-handle move';
  el.innerHTML = MOVE_ARROWS_SVG;
  return el;
}

function makeStretchEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'edit-handle stretch';
  return el;
}

/** How far (in metres) the rotation handle sits outside the corner so that
 *  the stretch handle ON the corner can be grabbed cleanly. */
const ROTATE_OFFSET_M = 4.5;
/** Additional pixel offset stacked on top of the metres offset so the
 *  rotation handle stays clear of the corner even at low zoom (where 4.5m
 *  is only a handful of pixels). */
const ROTATE_OFFSET_PX = 18;

/** Mount all edit handles for `building`. Returns a teardown function. */
export function mountEditHandles(map: maplibregl.Map, building: Building): () => void {
  const ring = (building.footprint.coordinates[0] ?? []) as LngLat[];
  const vertCount =
    ring.length > 0 && sameLngLat(ring[0]!, ring[ring.length - 1]!)
      ? ring.length - 1
      : ring.length;
  if (vertCount !== 4) return () => {};

  // Anchor lng/lat is captured once at mount; we only round-trip through this
  // frame, so the centroid of the building moving doesn't break the maths.
  const anchor = polygonCentroidLngLat(building.footprint);

  // Track which marker (if any) the user is currently dragging so syncs skip it.
  let activeIndex:
    | { kind: 'edge' | 'corner' | 'stretch' | 'move'; index: number }
    | null = null;

  // ---- Edge midpoint markers (push-pull) -----------------------------------
  const edgeMarkers: maplibregl.Marker[] = [];
  for (let i = 0; i < 4; i++) {
    const el = makeEdgeEl();
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([0, 0])
      .addTo(map);
    edgeMarkers.push(marker);

    marker.on('dragstart', () => {
      activeIndex = { kind: 'edge', index: i };
      map.getCanvas().style.cursor = 'grabbing';
    });
    marker.on('drag', () => {
      const here = marker.getLngLat();
      const hereM = lngLatToMeters([here.lng, here.lat], anchor);
      pushPullEdge(building.id, anchor, i, hereM);
      commitFaceRegen(building.id);
      syncMarkers();
    });
    marker.on('dragend', () => {
      // Final snap to a clean rectangle to clean up floating-point drift.
      snapBuildingToRectangle(building.id, anchor);
      commitFaceRegen(building.id);
      activeIndex = null;
      map.getCanvas().style.cursor = '';
      syncMarkers();
    });
  }

  // ---- Stretch markers (corners, resize) -----------------------------------
  const stretchMarkers: maplibregl.Marker[] = [];
  let stretchInitialVerts: XY[] = [];
  for (let i = 0; i < 4; i++) {
    const el = makeStretchEl();
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([0, 0])
      .addTo(map);
    stretchMarkers.push(marker);

    marker.on('dragstart', () => {
      activeIndex = { kind: 'stretch', index: i };
      map.getCanvas().style.cursor = 'nwse-resize';
      const b = currentBuilding(building.id);
      if (!b) return;
      stretchInitialVerts = polygonRingToMeters(b.footprint, anchor);
    });
    marker.on('drag', () => {
      const here = marker.getLngLat();
      const hereM = lngLatToMeters([here.lng, here.lat], anchor);
      stretchCorner(building.id, anchor, stretchInitialVerts, i, hereM);
      commitFaceRegen(building.id);
      syncMarkers();
    });
    marker.on('dragend', () => {
      snapBuildingToRectangle(building.id, anchor);
      commitFaceRegen(building.id);
      activeIndex = null;
      map.getCanvas().style.cursor = '';
      syncMarkers();
    });
  }

  // ---- Corner rotation markers (offset OUTSIDE the corner) ----------------
  const cornerMarkers: maplibregl.Marker[] = [];
  let initialVerts: XY[] = [];
  let initialAngle = 0;
  for (let i = 0; i < 4; i++) {
    const el = makeCornerEl();
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([0, 0])
      .addTo(map);
    cornerMarkers.push(marker);

    // Rotation pivot is just the centroid of the building snapshot taken at
    // drag start. (We dropped the standalone draggable pivot marker because
    // it sat on top of the move handle and was the only thing the user could
    // grab there.)
    let cornerPivotM: XY = [0, 0];
    marker.on('dragstart', () => {
      activeIndex = { kind: 'corner', index: i };
      map.getCanvas().style.cursor = 'grabbing';
      const b = currentBuilding(building.id);
      if (!b) return;
      initialVerts = polygonRingToMeters(b.footprint, anchor);
      cornerPivotM = [
        avg(initialVerts.map((v) => v[0])),
        avg(initialVerts.map((v) => v[1])),
      ];
      const here = marker.getLngLat();
      const hereM = lngLatToMeters([here.lng, here.lat], anchor);
      initialAngle = Math.atan2(hereM[1] - cornerPivotM[1], hereM[0] - cornerPivotM[0]);
    });
    marker.on('drag', () => {
      const b = currentBuilding(building.id);
      if (!b) return;
      const here = marker.getLngLat();
      const hereM = lngLatToMeters([here.lng, here.lat], anchor);
      const angle = Math.atan2(hereM[1] - cornerPivotM[1], hereM[0] - cornerPivotM[0]);
      const delta = angle - initialAngle;
      rotateBuildingAround(building.id, anchor, initialVerts, cornerPivotM, delta);
      commitFaceRegen(building.id);
      syncMarkers();
    });
    marker.on('dragend', () => {
      snapBuildingToRectangle(building.id, anchor);
      commitFaceRegen(building.id);
      activeIndex = null;
      map.getCanvas().style.cursor = '';
      syncMarkers();
    });
  }

  // ---- Move handle (centre of building) ------------------------------------
  const moveEl = makeMoveEl();
  const moveMarker = new maplibregl.Marker({ element: moveEl, draggable: true, anchor: 'center' })
    .setLngLat([0, 0])
    .addTo(map);

  let moveInitialVerts: XY[] = [];
  let moveInitialMarkerM: XY = [0, 0];
  moveMarker.on('dragstart', () => {
    activeIndex = { kind: 'move', index: 0 };
    map.getCanvas().style.cursor = 'grabbing';
    const b = currentBuilding(building.id);
    if (!b) return;
    moveInitialVerts = polygonRingToMeters(b.footprint, anchor);
    const here = moveMarker.getLngLat();
    moveInitialMarkerM = lngLatToMeters([here.lng, here.lat], anchor);
  });
  moveMarker.on('drag', () => {
    const here = moveMarker.getLngLat();
    const hereM = lngLatToMeters([here.lng, here.lat], anchor);
    const dx = hereM[0] - moveInitialMarkerM[0];
    const dy = hereM[1] - moveInitialMarkerM[1];
    const translated = moveInitialVerts.map(([x, y]) => [x + dx, y + dy] as XY);
    setFootprintFromMetres(building.id, translated, anchor);
    commitFaceRegen(building.id);
    syncMarkers();
  });
  moveMarker.on('dragend', () => {
    commitFaceRegen(building.id);
    activeIndex = null;
    map.getCanvas().style.cursor = '';
    syncMarkers();
  });

  /** Reposition every marker except the one the user is dragging. */
  function syncMarkers(): void {
    const b = currentBuilding(building.id);
    if (!b) return;
    const verts = polygonRingToMeters(b.footprint, anchor);
    if (verts.length < 4) return;
    const cx = avg(verts.map((v) => v[0]));
    const cy = avg(verts.map((v) => v[1]));
    for (let i = 0; i < 4; i++) {
      const v = verts[i]!;
      if (!(activeIndex?.kind === 'stretch' && activeIndex.index === i)) {
        stretchMarkers[i]?.setLngLat(metersToLngLat(v, anchor));
      }
      if (!(activeIndex?.kind === 'corner' && activeIndex.index === i)) {
        const dx = v[0] - cx;
        const dy = v[1] - cy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const offsetM: XY = [v[0] + nx * ROTATE_OFFSET_M, v[1] + ny * ROTATE_OFFSET_M];
        cornerMarkers[i]?.setLngLat(metersToLngLat(offsetM, anchor));
        cornerMarkers[i]?.setOffset([nx * ROTATE_OFFSET_PX, -ny * ROTATE_OFFSET_PX]);
      }
      const a = v;
      const c = verts[(i + 1) % 4]!;
      const mid: XY = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      if (!(activeIndex?.kind === 'edge' && activeIndex.index === i)) {
        edgeMarkers[i]?.setLngLat(metersToLngLat(mid, anchor));
      }
    }
    if (activeIndex?.kind !== 'move') {
      moveMarker.setLngLat(metersToLngLat([cx, cy], anchor));
    }
  }

  syncMarkers();

  return () => {
    for (const m of edgeMarkers) m.remove();
    for (const m of cornerMarkers) m.remove();
    for (const m of stretchMarkers) m.remove();
    moveMarker.remove();
  };
}

// ----- Store mutations ------------------------------------------------------

function currentBuilding(id: string): Building | null {
  return useProject.getState().project?.buildings.find((b) => b.id === id) ?? null;
}

function pushPullEdge(
  buildingId: string,
  anchor: LngLat,
  edgeIndex: number,
  newMidM: XY,
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
  // Edge normal (rotated 90° CCW from the edge direction).
  const nx = -ey / eLen;
  const ny = ex / eLen;
  const curMid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Project the marker's drag onto the edge normal.
  const dx = newMidM[0] - curMid[0];
  const dy = newMidM[1] - curMid[1];
  const along = dx * nx + dy * ny;
  if (Math.abs(along) < 1e-6) return;
  // Move both vertices of this edge by `along` along the normal.
  const moved = ringM.slice();
  moved[edgeIndex] = [a[0] + along * nx, a[1] + along * ny];
  moved[(edgeIndex + 1) % 4] = [b[0] + along * nx, b[1] + along * ny];
  // Reject moves that would collapse the rectangle (opposite edge crossed).
  const opp1 = moved[(edgeIndex + 2) % 4]!;
  const opp2 = moved[(edgeIndex + 3) % 4]!;
  const newWidth = Math.hypot(
    moved[edgeIndex]![0] - opp2[0],
    moved[edgeIndex]![1] - opp2[1],
  );
  if (newWidth < 1) return;
  setFootprintFromMetres(buildingId, moved, anchor);
}

/** Resize the rectangle by dragging one corner, keeping the diagonally-
 *  opposite corner fixed and the rectangle's orientation unchanged. */
function stretchCorner(
  buildingId: string,
  anchor: LngLat,
  initialVertsM: XY[],
  cornerIndex: number,
  newCornerM: XY,
): void {
  if (initialVertsM.length < 4) return;
  const oppIdx = (cornerIndex + 2) % 4;
  const opp = initialVertsM[oppIdx]!;
  // Use the two edges meeting at the opposite corner as the rectangle's local
  // axes. They stay fixed in direction; only their lengths change.
  const aRaw: XY = [
    initialVertsM[(oppIdx + 1) % 4]![0] - opp[0],
    initialVertsM[(oppIdx + 1) % 4]![1] - opp[1],
  ];
  const bRaw: XY = [
    initialVertsM[(oppIdx + 3) % 4]![0] - opp[0],
    initialVertsM[(oppIdx + 3) % 4]![1] - opp[1],
  ];
  const aLen = Math.hypot(aRaw[0], aRaw[1]);
  const bLen = Math.hypot(bRaw[0], bRaw[1]);
  if (aLen < 0.01 || bLen < 0.01) return;
  const aAxis: XY = [aRaw[0] / aLen, aRaw[1] / aLen];
  const bAxis: XY = [bRaw[0] / bLen, bRaw[1] / bLen];
  // Project drag offset from the opposite corner onto the two axes.
  const dx = newCornerM[0] - opp[0];
  const dy = newCornerM[1] - opp[1];
  const tA = dx * aAxis[0] + dy * aAxis[1];
  const tB = dx * bAxis[0] + dy * bAxis[1];
  // Reject a flip / collapse — keep the rectangle at least 1m on each side.
  if (Math.abs(tA) < 1 || Math.abs(tB) < 1) return;
  // Reconstruct corners in their original CCW slot order.
  const corners: XY[] = new Array(4) as XY[];
  corners[oppIdx] = opp;
  corners[(oppIdx + 1) % 4] = [opp[0] + tA * aAxis[0], opp[1] + tA * aAxis[1]];
  corners[(oppIdx + 2) % 4] = [
    opp[0] + tA * aAxis[0] + tB * bAxis[0],
    opp[1] + tA * aAxis[1] + tB * bAxis[1],
  ];
  corners[(oppIdx + 3) % 4] = [opp[0] + tB * bAxis[0], opp[1] + tB * bAxis[1]];
  setFootprintFromMetres(buildingId, corners, anchor);
}

function rotateBuildingAround(
  buildingId: string,
  anchor: LngLat,
  initialVertsM: XY[],
  pivot: XY,
  deltaRad: number,
): void {
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  const rotated = initialVertsM.map(([x, y]) => {
    const dx = x - pivot[0];
    const dy = y - pivot[1];
    return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c] as XY;
  });
  setFootprintFromMetres(buildingId, rotated, anchor);
}

/** Replace the polygon with a clean rectangle fitted to its current corners.
 *  Eliminates accumulated floating-point drift after a drag session. */
function snapBuildingToRectangle(buildingId: string, anchor: LngLat): void {
  const b = currentBuilding(buildingId);
  if (!b) return;
  const verts = polygonRingToMeters(b.footprint, anchor);
  if (verts.length !== 4) return;
  const cleaned = fitRectangle(verts);
  setFootprintFromMetres(buildingId, cleaned, anchor);
}

/** Reconstruct a perfect rectangle that matches the input's centroid, average
 *  side lengths, and orientation. Keeps vertices in the original CCW order. */
function fitRectangle(verts: XY[]): XY[] {
  const v0 = verts[0]!;
  const v1 = verts[1]!;
  const v2 = verts[2]!;
  const v3 = verts[3]!;
  // Centre = midpoint of either diagonal (average them for safety).
  const cx = (v0[0] + v1[0] + v2[0] + v3[0]) / 4;
  const cy = (v0[1] + v1[1] + v2[1] + v3[1]) / 4;
  // Average length of the two opposite edges 0-1 and 2-3.
  const len01 = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]);
  const len23 = Math.hypot(v3[0] - v2[0], v3[1] - v2[1]);
  const sideA = (len01 + len23) / 2;
  // Average length of edges 1-2 and 3-0.
  const len12 = Math.hypot(v2[0] - v1[0], v2[1] - v1[1]);
  const len30 = Math.hypot(v0[0] - v3[0], v0[1] - v3[1]);
  const sideB = (len12 + len30) / 2;
  // Orientation of edge 0-1.
  const theta = Math.atan2(v1[1] - v0[1], v1[0] - v0[0]);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ha = sideA / 2;
  const hb = sideB / 2;
  // Build corners in CCW order starting from "BL" relative to the edge0-1
  // direction (so vertex 0 stays roughly where it was).
  const local: XY[] = [
    [-ha, -hb],
    [+ha, -hb],
    [+ha, +hb],
    [-ha, +hb],
  ];
  return local.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as XY);
}

function setFootprintFromMetres(buildingId: string, verticesM: XY[], anchor: LngLat): void {
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

function avg(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function sameLngLat(a: LngLat | number[], b: LngLat | number[]): boolean {
  return (a[0] ?? 0) === (b[0] ?? 0) && (a[1] ?? 0) === (b[1] ?? 0);
}
