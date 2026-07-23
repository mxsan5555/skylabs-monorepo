import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Register all Material 3 web components + custom elements once, and set the
// initial <html> theme class so components render in mera-driver's blue palette.
// The brand theme CSS is loaded via the build `styles` array in project.json.
import '@skylabs-monorepo/shared-ui';
import { applyTheme } from '@skylabs-monorepo/shared-ui';

applyTheme('light');

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
