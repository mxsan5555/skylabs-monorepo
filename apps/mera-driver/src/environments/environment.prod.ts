/**
 * Production environment. Swap `apiUrl` for the deployed mera-driver-api origin
 * via the build's `fileReplacements` (see project.json) — never hardcode secrets
 * here, only the public API base URL.
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.mera-driver.example.com',
};
