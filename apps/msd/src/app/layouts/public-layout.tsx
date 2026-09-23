import { Outlet } from 'react-router-dom';
import { HeaderV3 as Header } from '../components/header-v2';
import { Footer } from '../components/footer';

/**
 * Public app shell: header + routed content + footer. Use for marketing/content
 * pages (home, blog, contact). Auth and admin can get their own layouts later
 * (auth-layout for sign-in/otp, admin-layout with a sidebar).
 */
export function PublicLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
