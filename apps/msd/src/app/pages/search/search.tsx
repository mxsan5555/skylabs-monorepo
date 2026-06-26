import { useSearchParams } from 'react-router-dom';
import { SkyProductCardReact } from '@skylabs-monorepo/shared-ui/react';
import { spas } from '../../data/spas';
import {
    FilledTonalButton,
    OutlinedButton,
    Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useEffect, useMemo, useState } from 'react';
import './search.css';

function getDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
) {
    const R = 6371;

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}
export function Search() {
    const [userLocation, setUserLocation] = useState<{
        lat: number;
        lng: number;
    } | null>(null);
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') ?? '';
    const [view, setView] = useState<'grid' | 'list'>('grid');
    const nearMe = searchParams.get("nearMe");
    const [loading, setLoading] = useState(false);
    const SEARCH_RADIUS = 30; // km

    const handleSearch = async () => {
        if (!query.trim()) return;

        try {
            setLoading(true);

            const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
                    query
                )}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
            );

            const data = await response.json();
            console.log("Full Response:", data);
            if (data.results?.length) {
                const location = data.results[0].geometry.location;
                console.log("Latitude:", location.lat);
                console.log("Longitude:", location.lng);
                setUserLocation({
                    lat: location.lat,
                    lng: location.lng,
                });
            }

        } catch (error) {
            console.error(error);
            alert("Unable to search location.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (nearMe === "true") {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (error) => {
                    console.error(error);
                    alert("Location permission denied.");
                }
            );

            return;
        }

        if (!query) return;

        const latLngPattern =
            /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

        if (latLngPattern.test(query)) {
            const [lat, lng] = query.split(",");

            setUserLocation({
                lat: Number(lat),
                lng: Number(lng),
            });

            return;
        }

        handleSearch();
    }, [query, nearMe]);
    console.log("User Location", userLocation);

    useEffect(() => {
        if (!userLocation) return;

        spas.forEach((spa) => {
            const d = getDistance(
                userLocation.lat,
                userLocation.lng,
                spa.lat,
                spa.lng
            );

            console.log(
                spa.eyebrow,
                spa.lat,
                spa.lng,
                d.toFixed(2),
                "km"
            );
        });
    }, [userLocation]);
    const filteredSpas = useMemo(() => {
        if (!userLocation) {
            if (!query && nearMe !== "true") {
                return spas;
            }

            return [];
        }

        return spas
            .map((spa) => {
                const distance = getDistance(
                    userLocation.lat,
                    userLocation.lng,
                    spa.lat,
                    spa.lng
                );
                console.log(spa.eyebrow, "Distance:", distance.toFixed(2));
                return {
                    ...spa,
                    distance: `${distance.toFixed(1)} km`,
                    distanceValue: distance,
                };
            })
            .filter((spa) => spa.distanceValue <= SEARCH_RADIUS)
            .sort((a, b) => a.distanceValue - b.distanceValue);

    }, [userLocation, query, nearMe]);

    function viewButton(mode: 'grid' | 'list', icon: string, label: string) {
        const active = view === mode;
        const Btn = active ? FilledTonalButton : OutlinedButton;
        return (
            <Btn aria-pressed={active} onClick={() => setView(mode)}>
                <Icon slot="icon" aria-hidden="true">{icon}</Icon>
                {label}
            </Btn>
        );
    }

    if (loading) {
        return <p>Searching nearby spas...</p>;
    }

    return (

        <>

            <div className="search-page">
                <div className="search__toolbar">
                    <div className="search-page__header">
                        {/* <h1>{query}</h1>
                <p>{filteredSpas.length} spas found</p> */}
                    </div>
                    <div className="search-view-toggle" role="group" aria-label="View">
                        {viewButton('grid', 'grid_view', 'Grid')}
                        {viewButton('list', 'view_list', 'List')}
                    </div>
                </div>

                {filteredSpas.length === 0 ? (
                    <div className="search-empty">
                        <h2>No spas found</h2>
                        <p>Try another city or spa name.</p>
                    </div>
                ) : (
                    <div className="home">
                        <section className="showcase__card">
                            <div className={`cards-grid cards--${view}`}>
                                {filteredSpas.map((spa) => (
                                    <SkyProductCardReact
                                        key={spa.id}
                                        image={spa.image}
                                        imageAlt={spa.imageAlt}
                                        badge={spa.badge}
                                        favorite
                                        eyebrow={spa.eyebrow}
                                        heading={spa.heading}
                                        location={spa.location}
                                        distance={spa.distance}
                                        rating={spa.rating}
                                        reviews={spa.reviews}
                                        originalPrice={spa.originalPrice}
                                        price={spa.price}
                                        discount={spa.discount}
                                        priceNote={spa.priceNote}
                                    />
                                ))}
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </>
    );
}

export default Search;
