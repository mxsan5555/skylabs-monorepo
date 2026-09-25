import { AuthProvider } from '@skylabs-monorepo/shared-auth/react';
import { CatalogShellProvider } from '../catalog/catalog-shell';
import { LocationProvider } from '../location/location-context';
import { WishlistProvider } from '../wishlist/wishlist-context';
import { CartCountProvider } from '../hooks/use-cart-count';
import { ToastProvider } from '../toast/toast-context';
import { ErrorBoundary } from './components/error-boundary';
import { AppRoutes } from './routes';

/**
 * Root component: app-wide providers wrap the route tree. `appPrefix="msd"` is
 * this app's own localStorage namespace (`msd_auth_token` / `msd_auth_real_token`)
 * — there is no separate admin app to namespace against. Add more providers
 * (query client, theme switcher) here as the app grows.
 *
 * `CatalogShellProvider` (categories + cities, fetched once) wraps `LocationProvider` because
 * the location lookup maps coordinates to the nearest catalog city.
 *
 * `WishlistProvider` must sit *inside* `AuthProvider` because it calls `useAuth()` to load the
 * signed-in customer's real wishlist from the API and to reload it on sign-in/sign-out. There is
 * deliberately no `CartProvider` here at all — the cart is real, backend-driven state
 * (`api/cart.ts`, read directly via `getCart` wherever needed, with a lightweight pub/sub so the
 * header badge refetches on every mutation — see `subscribeCartUpdated`), never a second
 * client-side store. `CartCountProvider` (also inside `AuthProvider`) holds only the item total
 * for the header and mobile tab bar badges, so both share one `getCart` call.
 * `ToastProvider` doesn't need auth, but sits innermost anyway so its fixed-position stack
 * always mounts closest to the route tree that calls `useToast()`. `ErrorBoundary` wraps only
 * `<AppRoutes />`, inside every provider, so a render-phase crash anywhere in the route tree
 * falls back to a friendly full-page message instead of unmounting the providers themselves
 * (auth state, toasts, wishlist) along with it — see `error-boundary.tsx`'s own doc comment.
 */
export function App() {
  return (
    <AuthProvider appPrefix="msd" apiBaseUrl={import.meta.env.VITE_API_URL}>
      <CatalogShellProvider>
        <LocationProvider>
          <WishlistProvider>
            <CartCountProvider>
              <ToastProvider>
                <ErrorBoundary>
                  <AppRoutes />
                </ErrorBoundary>
              </ToastProvider>
            </CartCountProvider>
          </WishlistProvider>
        </LocationProvider>
      </CatalogShellProvider>
    </AuthProvider>
  );
}

export default App;
