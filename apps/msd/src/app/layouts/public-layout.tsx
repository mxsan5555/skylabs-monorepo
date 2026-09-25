import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/site-header/site-header';
import { MobileTabBar } from '../components/mobile-tab-bar/mobile-tab-bar';
import { SiteFooter } from '../components/site-footer/site-footer';
import { SiteJsonLd } from '../seo/site-json-ld';

/**
 * Public app shell: header, routed content, footer, and the phone tab bar. `main#main-content`
 * is the skip-link target. Organization/WebSite JSON-LD is emitted once here.
 */
export function PublicLayout() {
  return (
    <div className="app-shell public-layout">
      <SiteJsonLd />
      <SiteHeader />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
