import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/site-header/site-header';
import { MobileTabBar } from '../components/mobile-tab-bar/mobile-tab-bar';
import { Footer } from '../components/footer';

/**
 * Public app shell: header, routed content, footer, and the phone tab bar. `main#main-content`
 * is the skip-link target. The footer is replaced in plan 2.
 */
export function PublicLayout() {
  return (
    <div className="app-shell public-layout">
      <SiteHeader />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}
