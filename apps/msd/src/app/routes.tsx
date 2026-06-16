import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/public-layout';
import { AuthLayout } from './layouts/auth-layout';
import Home from './pages/home/home';
import NotFound from './pages/not-found/not-found';
import Showcase from './showcase';
import SignIn from './pages/sign-in/sign-in';
import Otp from './pages/otp/otp';

/**
 * Central route table. Pages added next (sign-in, otp, contact, blog,
 * blog-detail, blog-category, admin, profile) slot in here — public ones as
 * children of PublicLayout, protected ones wrapped in <RequireAuth>, and
 * sign-in/otp under a future AuthLayout.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/showcase" element={<Showcase />} />
        {/* Catch-all 404, inside the shell so it keeps header/footer. */}
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Auth screens use a minimal centered shell (no header/footer). */}
      <Route element={<AuthLayout />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/otp" element={<Otp />} />
      </Route>
    </Routes>
  );
}
