import { AuthProvider } from '../auth/auth-context';
import { CartProvider } from '../cart/cart-context';
import { WishlistProvider } from '../wishlist/wishlist-context';
import { AppRoutes } from './routes';

/**
 * Root component: every app-wide provider wraps the route tree here (not in
 * main.tsx) so App is self-contained for tests that render <App/> directly.
 * CartProvider must be inside AuthProvider — it reads useAuth() to re-fetch
 * the cart on sign-in/out (guest cart vs. account cart).
 */
export function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <AppRoutes />
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
