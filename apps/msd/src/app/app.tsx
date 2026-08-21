import { AuthProvider } from '@skylabs-monorepo/shared-auth/react';
import { WishlistProvider } from '../wishlist/wishlist-context';
import { ToastProvider } from '../toast/toast-context';
import { AppRoutes } from './routes';

/**
 * Root component: app-wide providers wrap the route tree. `appPrefix="msd"` is
 * this app's own localStorage namespace (`msd_auth_token` / `msd_auth_real_token`)
 * — there is no separate admin app to namespace against. Add more providers
 * (query client, theme switcher, error boundary) here as the app grows.
 *
 * `WishlistProvider` must sit *inside* `AuthProvider` because it calls `useAuth()` to load the
 * signed-in customer's real wishlist from the API and to reload it on sign-in/sign-out. There is
 * deliberately no `CartProvider` here at all — the cart is real, backend-driven state
 * (`api/cart.ts`/`api/bookings.ts`, read directly via `getCart`/`listBookings` wherever needed,
 * with a lightweight pub/sub so the header badge refetches on every mutation — see
 * `subscribeCartUpdated`/`subscribeBookingsUpdated`), never a second client-side store.
 * `ToastProvider` doesn't need auth, but sits innermost anyway so its fixed-position stack
 * always mounts closest to the route tree that calls `useToast()`.
 */
export function App() {
  return (
    <AuthProvider appPrefix="msd" apiBaseUrl={import.meta.env.VITE_API_URL}>
      <WishlistProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </WishlistProvider>
    </AuthProvider>
  );
}

export default App;
