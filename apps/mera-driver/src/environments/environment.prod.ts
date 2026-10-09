/**
 * Production environment. Swap `apiUrl` for the deployed mera-driver-api origin
 * via the build's `fileReplacements` (see project.json) — never hardcode secrets
 * here, only the public API base URL.
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.mera-driver.example.com',
  // Set via the production `fileReplacements` build — a production Google Cloud project's
  // own HTTP-referrer-restricted key, never the dev key above. Empty disables the map/
  // autocomplete/route features gracefully (see google-maps-loader.service.ts).
  googleMapsApiKey: '',
};
