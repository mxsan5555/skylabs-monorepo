export const environment = {
  production: true,
  // Same-origin in production (mera-driver-api reverse-proxied under /api);
  // override at build time via fileReplacements if the API is on another origin.
  apiUrl: '/api',
};
