import { useEffect, useState } from "react";

export function useCurrentLocation() {
    const [location, setLocation] = useState<string | null>(null);
    useEffect(() => {
        if (!navigator.geolocation) {
            setLocation("Location unavailable");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                const { latitude, longitude } = coords;
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
    return { location };
}