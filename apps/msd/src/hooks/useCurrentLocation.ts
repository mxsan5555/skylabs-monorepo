import { useEffect, useState } from "react";

export interface CurrentCoordinates {
    latitude: number;
    longitude: number;
}

/**
 * Reverse-geocoded city string (for greeting-style copy, e.g. home.tsx's "Deals near you in
 * {city}") AND the raw browser coordinates (for distance-based catalog queries — see
 * `catalog.service.ts`'s Haversine distance param). Both come from the same single
 * `getCurrentPosition()` call — no separate permission prompt for each. `coords` stays `null`
 * when geolocation is unsupported/denied/fails; every catalog fetch call treats that exactly
 * like "no coordinates were ever provided" (existing, unchanged behavior — see this app's own
 * "no unnecessary new location architecture" rule), never a hard error.
 */
export function useCurrentLocation() {
    const [location, setLocation] = useState<string | null>(null);
    const [coords, setCoords] = useState<CurrentCoordinates | null>(null);
    useEffect(() => {
        if (!navigator.geolocation) {
            setLocation("Location unavailable");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async ({ coords: position }) => {
                const { latitude, longitude } = position;
                setCoords({ latitude, longitude });
                try {
                    const response = await fetch(
                        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
                    );
                    const data = await response.json();
                    const components = data.results?.[0]?.address_components ?? [];
                    const city =
                        components.find(
                            (component: {
                                long_name: string; types: string[];
                            }) => component.types.includes("locality")
                        )?.long_name ||
                        components.find(
                            (component: {
                                long_name: string; types: string[];
                            }) => component.types.includes("administrative_area_level_2")
                        )?.long_name;
                    setLocation(city ?? "Unknown location");
                } catch {
                    setLocation("Unable to fetch location");
                }
            },
            () => {
                setLocation("Location permission denied");
            }
        );
    }, []);
    return { location, coords };
}
