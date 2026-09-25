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
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || points.length === 0) return;
    layer.clearLayers();
    for (const point of points) {
      const icon = L.divIcon({ className: 'deal-map__marker-host', html: markerHtml(point), iconSize: MARKER_SIZE });
      L.marker([point.lat, point.lng], { icon, keyboard: false, riseOnHover: true }).addTo(layer);
    }
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [48, 48] });
  }, [points]);

  return <div ref={container} className="deal-map__canvas" />;
}
