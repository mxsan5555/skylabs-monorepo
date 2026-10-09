/**
 * Development environment. mera-driver-api is mounted at its root — no `/api/v1`
 * prefix (unlike msd-api) — so every RBAC/auth call is `${apiUrl}/rbac/...` etc.
 */
export const environment = {
  production: false,
  apiUrl: 'https://mera-driver-api-production.up.railway.app',
};
