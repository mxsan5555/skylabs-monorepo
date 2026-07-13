import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/public-layout';
import { AuthLayout } from './layouts/auth-layout';
import { AdminLayout } from './layouts/admin-layout';
import { RequireAuth } from '../auth/require-auth';
import { RequireRole } from '../auth/require-role';
import Home from './pages/home/home';
import NotFound from './pages/not-found/not-found';
import Showcase from './pages/showcase/showcase';
import Blog from './pages/blog/blog';
import BlogDetail from './pages/blog-detail/blog-detail';
import SignIn from './pages/sign-in/sign-in';
import Otp from './pages/otp/otp';
import AuthCallback from './pages/auth-callback/auth-callback';
import Profile from './pages/account/profile';
import { Dashboard, Deals, Promotions, Sales } from './pages/account/role-pages';

/**
 * Central route table. Public pages use PublicLayout, auth screens use
 * AuthLayout, and the signed-in console uses AdminLayout (role-filtered).
 * Role-specific pages are wrapped in <RequireRole>.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogDetail />} />
        <Route path="/showcase" element={<Showcase />} />
        {/* Catch-all 404, inside the shell so it keeps header/footer. */}
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Auth screens use a minimal centered shell (no header/footer). */}
      <Route element={<AuthLayout />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/otp" element={<Otp />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Route>

      {/* Authenticated console (after login / "My account"). */}
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/account" element={<Navigate to="/account/profile" replace />} />
        <Route path="/account/dashboard" element={<Dashboard />} />
        <Route path="/account/profile" element={<Profile />} />
        <Route
          path="/account/deals"
          element={
            <RequireRole roles={['admin']}>
              <Deals />
            </RequireRole>
          }
        />
        <Route
          path="/account/promotions"
          element={
            <RequireRole roles={['marketing']}>
              <Promotions />
            </RequireRole>
          }
        />
        <Route
          path="/account/sales"
          element={
            <RequireRole roles={['sales']}>
              <Sales />
            </RequireRole>
          }
        />
      </Route>
    </Routes>
  );
}
