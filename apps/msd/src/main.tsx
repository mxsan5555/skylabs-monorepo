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

initThemePreference();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
