/** Real server-side road distance/duration via Google's Routes API — closes the gap where
 *  `quoteBooking` previously trusted whatever `distanceKm`/`durationMinutes` the client sent.
 *  Google supplies distance/time only; the existing FareRule formula still computes the
 *  fare (see `quoteBooking`) — this never becomes a second source of pricing. Returns `null`
 *  (never throws) when unconfigured or the provider call fails, so callers can fall back to
 *  the client-submitted estimate rather than hard-failing a booking over a Maps outage. */
export async function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (!key) return null;
  let response: Response;
  try {
    response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'DRIVE',
      }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let payload: any;
  try { payload = await response.json(); } catch { return null; }
  const route = payload?.routes?.[0];
  const meters = route?.distanceMeters;
  const durationSeconds = typeof route?.duration === 'string' ? Number(route.duration.replace(/s$/, '')) : null;
  if (!Number.isFinite(meters) || meters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds! <= 0) return null;
  return { distanceKm: meters / 1000, durationMinutes: durationSeconds! / 60 };
}
