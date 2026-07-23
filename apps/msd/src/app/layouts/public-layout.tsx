import { Outlet } from 'react-router-dom';
import { Header } from '../components/header';
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
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
