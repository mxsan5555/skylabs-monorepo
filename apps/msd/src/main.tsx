import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';

// Register all Material 3 web components + custom elements, and pull in the
// shared base styles and this app's brand theme. initThemePreference applies
// the visitor's saved light/dark/system choice (default light) and honours
// OS high contrast.
import '@skylabs-monorepo/shared-ui';
import { initThemePreference } from './theme/theme-preference';
import '@skylabs-monorepo/shared-ui/theme.css';
import '@skylabs-monorepo/shared-ui/layout.css';
import './assets/theme/index.css';

import App from './app/app';
import { PrerenderDataProvider, readPrerenderPayload } from './prerender-data/prerender-data';

initThemePreference();

// A prerendered page (see entry-server.tsx) marks its root and embeds its data; hydrate it from
// that same data so the first client render matches the server HTML. Every other route mounts fresh.
const container = document.getElementById('root') as HTMLElement;
const payload = readPrerenderPayload();
const app = (
  <StrictMode>
    <PrerenderDataProvider payload={payload}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrerenderDataProvider>
  </StrictMode>
);
if (container.hasAttribute('data-prerendered')) ReactDOM.hydrateRoot(container, app);
else ReactDOM.createRoot(container).render(app);
