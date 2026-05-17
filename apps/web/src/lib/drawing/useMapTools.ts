// Wires the active tool to MapLibre interactions: select-click, rectangle drag,
// polygon click-to-add. Lives as a hook so it can react to store changes.

import type maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { DEFAULT_STOREY_HEIGHT_M } from '@nza-pv/shared';
import { useProject } from '../../store/projectStore.js';
import { toast } from '../../store/toasts.js';
import { defaultRoofForStyle } from '../roof/presets.js';
import { regenerateFaces } from '../roof/regenerate.js';
import {
  featureAtPoint,
  installLayers,
  setDraft,
  updateBuildings,
} from './mapLayers.js';
import {
  type LngLat,
  isSelfIntersecting,
  polygonFromVertices,
  rectanglePolygon,
  snapRightAngle,
} from './geometry.js';

const DEFAULT_HEIGHT_M = 9;

export function useMapTools(mapRef: React.MutableRefObject<maplibregl.Map | null>): void {
  const tool = useProject((s) => s.tool);
  const setTool = useProject((s) => s.setTool);
  const buildings = useProject((s) => s.project?.buildings ?? []);
  const selection = useProject((s) => s.selection);
  const select = useProject((s) => s.select);
  const addBuilding = useProject((s) => s.addBuilding);
  const setFaces = useProject((s) => s.setFaces);
  const removeBuilding = useProject((s) => s.removeBuilding);

  // Refs so handlers always see the latest reactive bits without rebinding.
  const stateRef = useRef({ tool, buildings, selection });
  stateRef.current = { tool, buildings, selection };

  // Sync building features whenever the building list or selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource('buildings')) installLayers(map);
    const selectedIds = new Set<string>();
    if (selection.kind === 'building' || selection.kind === 'face') selectedIds.add(selection.buildingId);
    if (selection.kind === 'multi') selection.buildingIds.forEach((id) => selectedIds.add(id));
    updateBuildings(map, buildings, selectedIds);
  }, [mapRef, buildings, selection]);

  // Bind interaction handlers (once). We poll briefly because the map ref is
  // populated inside MapView's `load` callback, not synchronously on mount.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    const bind = (): void => {
      if (cancelled) return;
      const m = mapRef.current;
      if (!m) {
        window.setTimeout(bind, 50);
        return;
      }
      const map: maplibregl.Map = m;
      installLayers(map);

    // ---- Rectangle drag state ----
    let dragStart: LngLat | null = null;
    let dragging = false;

    // ---- Polygon click state ----
    let polyVerts: LngLat[] = [];
    let polyLast: LngLat | null = null;

    function clearDraft(): void {
      setDraft(map, null);
      dragStart = null;
      dragging = false;
      polyVerts = [];
      polyLast = null;
    }

    function commitBuilding(footprint: { type: 'Polygon'; coordinates: number[][][] }): void {
      if (isSelfIntersecting((footprint.coordinates[0] ?? []) as LngLat[])) {
        toast.error('That shape crosses itself — try again.');
        clearDraft();
        return;
      }
      const storeys = Math.round(DEFAULT_HEIGHT_M / DEFAULT_STOREY_HEIGHT_M);
      const newId = addBuilding({
        footprint,
        storeys,
        storey_height_m: DEFAULT_STOREY_HEIGHT_M,
        eave_height_m: DEFAULT_HEIGHT_M,
        roof: defaultRoofForStyle('hip'),
      });
      // Regenerate faces for the new building.
      const b = useProject.getState().project?.buildings.find((x) => x.id === newId);
      if (b) setFaces(newId, regenerateFaces(b));
      select({ kind: 'building', buildingId: newId });
      setTool({ kind: 'select' });
      clearDraft();
    }

    function onMouseDown(e: maplibregl.MapMouseEvent): void {
      const { tool: t } = stateRef.current;
      if (t.kind === 'draw-rect') {
        dragStart = [e.lngLat.lng, e.lngLat.lat];
        dragging = true;
        e.preventDefault();
        map.getCanvas().style.cursor = 'crosshair';
      }
    }

    function onMouseMove(e: maplibregl.MapMouseEvent): void {
      const { tool: t } = stateRef.current;
      if (t.kind === 'draw-rect' && dragging && dragStart) {
        const cur: LngLat = [e.lngLat.lng, e.lngLat.lat];
        setDraft(map, rectanglePolygon(dragStart, cur));
        return;
      }
      if (t.kind === 'draw-polygon' && polyVerts.length > 0) {
        const cur: LngLat = [e.lngLat.lng, e.lngLat.lat];
        const verts = [...polyVerts, cur];
        const snapped = e.originalEvent.shiftKey ? verts : snapRightAngle(verts);
        polyLast = snapped[snapped.length - 1] ?? cur;
        setDraft(map, polygonFromVertices(snapped));
      }
    }

    function onMouseUp(e: maplibregl.MapMouseEvent): void {
      const { tool: t } = stateRef.current;
      if (t.kind === 'draw-rect' && dragging && dragStart) {
        const end: LngLat = [e.lngLat.lng, e.lngLat.lat];
        // Reject zero-area drags (a stray click).
        if (Math.abs(end[0] - dragStart[0]) < 1e-6 || Math.abs(end[1] - dragStart[1]) < 1e-6) {
          clearDraft();
          map.getCanvas().style.cursor = '';
          return;
        }
        commitBuilding(rectanglePolygon(dragStart, end));
        map.getCanvas().style.cursor = '';
      }
    }

    function onClick(e: maplibregl.MapMouseEvent): void {
      const { tool: t } = stateRef.current;
      if (t.kind === 'select') {
        const hit = featureAtPoint(map, e.point);
        if (hit) {
          const id = hit.properties.id;
          select({ kind: 'building', buildingId: id });
        } else {
          select({ kind: 'none' });
        }
        return;
      }
      if (t.kind === 'draw-polygon') {
        const cur: LngLat = [e.lngLat.lng, e.lngLat.lat];
        polyVerts.push(cur);
        const snapped = e.originalEvent.shiftKey ? polyVerts : snapRightAngle(polyVerts);
        polyVerts = snapped;
        polyLast = snapped[snapped.length - 1] ?? cur;
        setDraft(map, polygonFromVertices(polyVerts));
      }
    }

    function onDoubleClick(e: maplibregl.MapMouseEvent): void {
      const { tool: t } = stateRef.current;
      if (t.kind === 'draw-polygon') {
        e.preventDefault();
        if (polyVerts.length >= 3) {
          commitBuilding(polygonFromVertices(polyVerts));
        } else {
          toast.warn('Need at least three vertices.');
          clearDraft();
        }
      }
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        clearDraft();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = stateRef.current.selection;
        if (sel.kind === 'building') {
          const target = e.target as HTMLElement | null;
          const editing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
          if (!editing) removeBuilding(sel.buildingId);
        }
      }
    }

      map.on('mousedown', onMouseDown);
      map.on('mousemove', onMouseMove);
      map.on('mouseup', onMouseUp);
      map.on('click', onClick);
      map.on('dblclick', onDoubleClick);
      window.addEventListener('keydown', onKey);

      const unsub = useProject.subscribe((s) => {
        const t = s.tool;
        if (t.kind === 'draw-polygon') map.doubleClickZoom.disable();
        else map.doubleClickZoom.enable();
        if (t.kind === 'draw-rect') map.dragPan.disable();
        else map.dragPan.enable();
      });

      cleanup = () => {
        map.off('mousedown', onMouseDown);
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);
        map.off('click', onClick);
        map.off('dblclick', onDoubleClick);
        window.removeEventListener('keydown', onKey);
        unsub();
        map.dragPan.enable();
        map.doubleClickZoom.enable();
      };
    };
    bind();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [mapRef, addBuilding, setFaces, select, setTool, removeBuilding]);
}
