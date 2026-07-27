import {
    GoogleMap,
    useJsApiLoader,
    OverlayView,
} from "@react-google-maps/api";
import "./map.css";
import type { Deal } from "../../../types";
import { formatINR } from "../../../utils/format";
import { useNavigate } from "react-router-dom";
import { useCallback } from "react";
interface MapProps {
    deals: Deal[];
}

export function Map({ deals }: MapProps) {
    const navigate = useNavigate();
    const center = {
        lat: deals.reduce((sum, deal) => sum + deal.lat, 0) / deals.length,
        lng: deals.reduce((sum, deal) => sum + deal.lng, 0) / deals.length,
    };
   const onLoad = useCallback((map: google.maps.Map) => {
  const bounds = new google.maps.LatLngBounds();

  deals.forEach((deal) => {
    bounds.extend({
      lat: deal.lat,
      lng: deal.lng,
    });
  });

  map.fitBounds(bounds, {
    top: 80,
    bottom: 80,
    left: 80,
    right: 80,
  });
}, [deals]);
    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    });
    // console.log(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
    if (!isLoaded) {
        return <p>Loading map...</p>;
    }
    return (
        <GoogleMap
            onLoad={onLoad}
            zoom={11}
            center={center}
            mapContainerStyle={{
                width: "100%",
                height: "100%",
            }}
            options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                clickableIcons: false,
            }}
        >
           {deals.map((deal, index) => (
  <OverlayView
    key={deal.id}
    position={{
      lat: deal.lat + ((index % 4) - 1.5) * 0.0012,
      lng: deal.lng + (Math.floor(index / 4) % 4 - 1.5) * 0.0012,
    }}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
  >
    <button
      className="price-marker"
      onClick={() => navigate(`/deal/${deal.id}`)}
    >
      {formatINR(deal.price)}
    </button>
  </OverlayView>
))}
        </GoogleMap>
    );
}

export default Map;