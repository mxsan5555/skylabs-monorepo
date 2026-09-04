import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withInMemoryScrolling,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideSharedAuth } from '@skylabs-monorepo/shared-auth/angular';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      // Enable `[fragment]` anchor scrolling (e.g. the header "Safety & Trust"
      // link → landing `#safety`) and restore scroll position on navigation.
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideSharedAuth({ appPrefix: 'mera_driver', apiBaseUrl: environment.apiUrl }),
  ],
};
