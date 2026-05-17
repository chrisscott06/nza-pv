import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { useMapTools } from '../lib/drawing/useMapTools.js';
import { useProject } from '../store/projectStore.js';

const ESRI_SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
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
    });
    map.on('error', (e) => {
      // If the initial style fails (offline / blocked), swap to OSM raster.
      if (!map.isStyleLoaded()) map.setStyle(fallbackStyle);
      // Silence noisy tile load errors.
      if (e?.error && typeof e.error === 'object' && 'message' in e.error) return;
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

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

    map.on('load', () => {
      mapRef.current = map;
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
