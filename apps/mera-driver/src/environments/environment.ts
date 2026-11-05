/**
 * Development environment. mera-driver-api is mounted at its root — no `/api/v1`
 * prefix (unlike msd-api) — so every RBAC/auth call is `${apiUrl}/rbac/...` etc.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3334',
  // Browser-restricted Google Maps JS API key (Maps JavaScript API, Places, Directions,
  // Geocoding must be enabled) — reused from the previously-unused `.env` value for local
  // dev. Google Maps keys are designed to be client-visible; protect via HTTP-referrer
  // restriction in the Cloud Console, not secrecy. Production must set its own key below.
  googleMapsApiKey: 'AIzaSyCc0KQ40uWG_mnZOcmqYw324z9MXCjm28c',
};
