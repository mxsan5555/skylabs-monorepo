import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, OverlayView, useJsApiLoader } from '@react-google-maps/api';
import type { DealMapPoint } from './types';

/** Google Maps engine (needs VITE_GOOGLE_MAPS_API_KEY). */
export default function GoogleDealMap({ points }: { points: DealMapPoint[] }) {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY });
  const onLoad = useCallback(
    (map: google.maps.Map) => {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
    },
    [points],
  );
  if (!isLoaded || points.length === 0) return null;
  return (
    <GoogleMap
      onLoad={onLoad}
      center={{ lat: points[0].lat, lng: points[0].lng }}
      zoom={11}
      mapContainerClassName="deal-map__canvas"
      options={{ fullscreenControl: false, streetViewControl: false, mapTypeControl: false, clickableIcons: false }}
    >
      {points.map((p) => (
        <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <a
            className="deal-map__marker label-large"
            href={p.href}
            aria-label={`${p.title}, ${p.label}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(p.href);
            }}
          >
            {p.label}
          </a>
        </OverlayView>
      ))}
    </GoogleMap>
  );
}
