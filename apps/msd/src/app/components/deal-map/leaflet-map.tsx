import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { markerHtml } from './marker-html';
import type { DealMapPoint } from './types';

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Marker box; the pill inside is centred on the point. */
const MARKER_SIZE: L.PointTuple = [96, 40];

/** Leaflet + OpenStreetMap engine (free, no key). Attribution stays visible per the OSM tile policy. */
export default function LeafletMap({ points }: { points: DealMapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const resizeObserver = new ResizeObserver(() => {
  map.invalidateSize({ pan: false });
});

resizeObserver.observe(el);
    // Marker links navigate in-app (plain clicks only; modified clicks open normally).
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element).closest<HTMLAnchorElement>('a.deal-map__marker');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigateRef.current(link.getAttribute('href') ?? '/');
    };
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('click', onClick);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!map || !layer) return;

    layer.clearLayers();

    // Validate coordinates before adding markers or calculating bounds.
    const validPoints = points.filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        point.lat >= -90 &&
        point.lat <= 90 &&
        point.lng >= -180 &&
        point.lng <= 180,
    );

    if (validPoints.length === 0) return;

    // Add markers only for valid locations.
    for (const point of validPoints) {
      const icon = L.divIcon({
        className: 'deal-map__marker-host',
        html: markerHtml(point),
        iconSize: MARKER_SIZE,
      });

      L.marker([point.lat, point.lng], {
        icon,
        keyboard: false,
        riseOnHover: true,
      }).addTo(layer);
    }

    const bounds = L.latLngBounds(
      validPoints.map(
        (point) => [point.lat, point.lng] as L.LatLngTuple,
      ),
    );

    // One location: use a useful street-level zoom.
    if (validPoints.length === 1) {
      map.setView(
        [validPoints[0].lat, validPoints[0].lng],
        15,
      );
      return;
    }

    // Multiple locations: fit all deals into the visible map.
    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 15,
      animate: true,
    });
  }, [points]);

  return <div ref={container} className="deal-map__canvas" />;
}
