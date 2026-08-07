import { AuthProvider } from '@skylabs-monorepo/shared-auth/react';
import { AppRoutes } from './routes';

/**
 * Root component: app-wide providers wrap the route tree. `appPrefix="msd"` is
 * this app's own localStorage namespace (`msd_auth_token` / `msd_auth_real_token`)
 * — there is no separate admin app to namespace against. Add more providers
 * (query client, theme switcher, error boundary) here as the app grows.
 */
export function App() {
  return (
    <AuthProvider appPrefix="msd" apiBaseUrl={import.meta.env.VITE_API_URL}>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
