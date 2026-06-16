import { AuthProvider } from '../auth/auth-context';
import { AppRoutes } from './routes';

/**
 * Root component: app-wide providers wrap the route tree. Add more providers
 * (query client, theme switcher, error boundary) here as the app grows.
 */
export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
