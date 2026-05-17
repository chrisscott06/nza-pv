import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { installLayers, updateBuildings } from '../lib/drawing/mapLayers.js';
import { useMapTools } from '../lib/drawing/useMapTools.js';
import { useProject } from '../store/projectStore.js';

const ESRI_SAT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function makeRasterStyle(tileUrl: string, attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution,
        maxzoom: 19,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

// Hartpury University, Gloucestershire — default landing location.
const DEFAULT_CENTER: [number, number] = [-2.3013, 51.9213];
const DEFAULT_ZOOM = 17;

export function MapView(): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialView = useProject((s) => s.project?.view?.map ?? null);
  const setCamera = useProject((s) => s.setCamera);
  // Used to re-fire useMapTools' building sync once the map style has actually
  // finished loading — without this, a fresh map mount can race the project
  // load and the initial buildings render with empty source data.
  const [, setStyleLoadedTick] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY;
    const style: StyleSpecification | string = maptilerKey
      ? `https://api.maptiler.com/maps/satellite/style.json?key=${maptilerKey}`
      : makeRasterStyle(ESRI_SAT_URL, 'Esri World Imagery · OSM');
    const fallbackStyle = makeRasterStyle(OSM_URL, '© OpenStreetMap contributors');

    const map = new maplibregl.Map({
      container: container.current,
      style,
      center: (initialView?.center ?? DEFAULT_CENTER) as [number, number],
      zoom: initialView?.zoom ?? DEFAULT_ZOOM,
      bearing: initialView?.bearing ?? 0,
      pitch: initialView?.pitch ?? 0,
      maxZoom: 21,
      attributionControl: { compact: true },
      // 2D-only: no right-click rotation, no shift-drag pitch.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // Disable right-click context-menu hijack while we're at it; otherwise
      // a stray right-click in select mode triggers the maplibre rotation
      // gesture which we've also disabled, but the menu still flickers.
    });
    map.touchZoomRotate.disableRotation();
    map.on('error', (e) => {
      // If the initial style fails (offline / blocked), swap to OSM raster.
      if (!map.isStyleLoaded()) map.setStyle(fallbackStyle);
      // Silence noisy tile load errors.
      if (e?.error && typeof e.error === 'object' && 'message' in e.error) return;
    });
    // Controls live in the bottom-left so the buildings/inspector panel in
    // the top-right has room. Compass stays on so users have a one-click
    // "reset to north" — there's no mouse-wheel equivalent for that.
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false, showZoom: true }),
      'bottom-left',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    // Swallow the right-click context menu over the canvas — `dragRotate` is
    // off so the gesture does nothing useful, and the browser menu obscures
    // the map.
    map.getCanvas().addEventListener('contextmenu', (e) => e.preventDefault());

    map.on('moveend', () => {
      setCamera({
        map: {
          center: [map.getCenter().lng, map.getCenter().lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
      });
    });

    // The Map instance is usable for markers, popups, and event listeners as
    // soon as it's constructed — `load` only matters for `addSource` /
    // `addLayer`. Expose the ref straight away so edit handles can mount even
    // if a slow tile server delays `load`.
    mapRef.current = map;

    // Install layers + push current store state when the map's style is
    // ready. The `load` event is the authoritative signal here — `addSource`
    // throws before it, and `isStyleLoaded()` lies after it for raster
    // styles, so we just wait for the event.
    function onStyleReady(): void {
      if (!map.getSource('buildings')) installLayers(map);
      const project = useProject.getState().project;
      const buildings = project?.buildings ?? [];
      const sel = useProject.getState().selection;
      const selectedIds = new Set<string>();
      if (sel.kind === 'building' || sel.kind === 'face') selectedIds.add(sel.buildingId);
      if (sel.kind === 'multi') sel.buildingIds.forEach((id) => selectedIds.add(id));
      updateBuildings(map, buildings, selectedIds);
      // Bump local state so `useMapTools`' building-sync effect re-evaluates
      // against the now-existing source.
      setStyleLoadedTick((n) => n + 1);
    }
    map.once('load', onStyleReady);
    // If 'load' has already fired by the time we register (unlikely but
    // possible during hot reload), `once` swallows the call silently — fall
    // back to 'idle' which fires repeatedly until the map is idle.
    map.once('idle', () => {
      if (!map.getSource('buildings')) onStyleReady();
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapTools(mapRef);

  return <div ref={container} className="map-root" data-testid="map-root" />;
}
