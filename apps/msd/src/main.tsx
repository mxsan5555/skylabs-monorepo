import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';

// Register all Material 3 web components + custom elements, and pull in the
// shared base styles and this app's brand theme. applyTheme sets the initial
// <html> class so components render in msd's green palette.
import '@skylabs-monorepo/shared-ui';
import { applyTheme } from '@skylabs-monorepo/shared-ui';
import '@skylabs-monorepo/shared-ui/theme.css';
import './assets/theme/index.css';

import App from './app/app';

applyTheme('light');

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
