import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { setActiveMap, setActiveRoofLayer } from '../lib/drawing/mapBridge.js';
import {
  installLayers,
  setExtrusionVisible,
  setFootprintFillVisible,
  updateBuildings,
} from '../lib/drawing/mapLayers.js';
import { RoofLayer } from '../lib/drawing/roofLayer.js';
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
  const roofLayerRef = useRef<RoofLayer | null>(null);
  const initialView = useProject((s) => s.project?.view?.map ?? null);
  const setCamera = useProject((s) => s.setCamera);
  const view = useProject((s) => s.view);
  const buildings = useProject((s) => s.project?.buildings ?? []);
  const selection = useProject((s) => s.selection);
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
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    // Rotation + pitch are toggled by view mode (see effect below). Start
    // off in 2D-locked mode; the effect will enable them when the user
    // switches to 3D.
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
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
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: false,
        showZoom: true,
      }),
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
    setActiveMap(map);

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
      setActiveMap(null);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapTools(mapRef);

  // React to the global 2D / 3D toggle. In 3D the map tilts to ~60°, shows
  // the building-extrusion layer (walls), and mounts a custom 3D layer for
  // the actual sloped roof faces. In 2D it all reverses to a north-up plan
  // view with just the coral outlines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = (): void => {
      if (view === '3d') {
        map.easeTo({ pitch: 60, duration: 700 });
        map.dragRotate.enable();
        map.touchPitch.enable();
        // Walls now render inside RoofLayer (Three.js) so they share the
        // roof's lighting; keeping the maplibre extrusion visible would
        // double-draw flat-shaded cream on top of the Three.js mesh.
        setExtrusionVisible(map, false);
        // Hide the 2D coral fill + line so they don't bleed through the
        // Three.js building (visible inside open roof shapes / under the
        // silhouette stroke at ground level). Opacity-0 instead of layer
        // hide so click-to-select still works via `queryRenderedFeatures`.
        setFootprintFillVisible(map, false);
        // Mount the custom roof-faces layer on top of the extrusion layer
        // (added last → renders last → sits on top).
        if (!roofLayerRef.current) {
          const layer = new RoofLayer();
          roofLayerRef.current = layer;
          setActiveRoofLayer(layer);
          if (!map.getLayer(layer.id)) {
            // The maplibre type for `addLayer` doesn't strictly include the
            // CustomLayerInterface shape; the runtime supports it fine.
            map.addLayer(layer as unknown as maplibregl.AddLayerObject);
          }
          layer.setBuildings(
            useProject.getState().project?.buildings ?? [],
            selection.kind === 'building' || selection.kind === 'face'
              ? selection.buildingId
              : null,
            selection.kind === 'face' ? selection.faceId : null,
          );
        }
      } else {
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
        map.dragRotate.disable();
        map.touchPitch.disable();
        setExtrusionVisible(map, false);
        setFootprintFillVisible(map, true);
        if (roofLayerRef.current && map.getLayer(roofLayerRef.current.id)) {
          map.removeLayer(roofLayerRef.current.id);
        }
        roofLayerRef.current = null;
        setActiveRoofLayer(null);
      }
    };
    if (map.getLayer('buildings-extrusion')) apply();
    else map.once('load', apply);
    // `selection` intentionally omitted — the building-update effect below
    // handles re-styling the roof faces when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Push fresh roof geometry into the custom layer whenever the buildings or
  // selection change while we're in 3D. Cheap to call when there is no layer
  // (it just no-ops). Face selection has to drive a rebuild too so the
  // RoofLayer can dim non-selected faces and outline the selected one.
  useEffect(() => {
    const layer = roofLayerRef.current;
    if (!layer) return;
    const selectedId =
      selection.kind === 'building' || selection.kind === 'face' ? selection.buildingId : null;
    const selectedFaceId = selection.kind === 'face' ? selection.faceId : null;
    layer.setBuildings(buildings, selectedId, selectedFaceId);
  }, [buildings, selection]);

  return <div ref={container} className="map-root" data-testid="map-root" />;
}
