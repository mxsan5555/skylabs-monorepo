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

                    // const components = data.results?.[0]?.address_components ?? [];

                    // const city =
                    //     components.find((c: any) =>
                    //         c.types.includes("locality")
                    //     )?.long_name;

                    // const state =
                    //     components.find((c: any) =>
                    //         c.types.includes("administrative_area_level_1")
                    //     )?.long_name;

                    // setLocation(
                    //     city && state
                    //         ? `${city}, ${state}`
                    //         : city || state || "Unknown location"
                    // );
                    const fullAddress = data.results?.[0]?.formatted_address;

                    setLocation(fullAddress ?? "Unknown location");
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