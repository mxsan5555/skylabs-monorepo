import { AuthProvider } from '@skylabs-monorepo/shared-auth/react';
import { WishlistProvider } from '../wishlist/wishlist-context';
import { AppRoutes } from './routes';

/**
 * Root component: app-wide providers wrap the route tree. `appPrefix="msd"` is
 * this app's own localStorage namespace (`msd_auth_token` / `msd_auth_real_token`)
 * — there is no separate admin app to namespace against. Add more providers
 * (query client, theme switcher, error boundary) here as the app grows.
 *
 * `WishlistProvider` must sit *inside* `AuthProvider` (unlike the mock `CartProvider`, which
 * stays in `main.tsx`) because it calls `useAuth()` to load the signed-in customer's real
 * wishlist from the API and to reload it on sign-in/sign-out.
 */
export function App() {
  return (
    <AuthProvider appPrefix="msd" apiBaseUrl={import.meta.env.VITE_API_URL}>
      <WishlistProvider>
        <AppRoutes />
      </WishlistProvider>
    </AuthProvider>
  );
}

export default App;
