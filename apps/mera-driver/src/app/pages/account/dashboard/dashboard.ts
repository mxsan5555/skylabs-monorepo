import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject } from '@angular/core';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import type { WidgetConfig } from '@skylabs-monorepo/shared-types';
import { AdminPage } from '../../../admin/admin-page/admin-page';

/**
 * Maps a `WidgetConfig.key` (from `authService.bootstrap()?.dashboardWidgets`,
 * already resolved server-side for the caller's roles) to what this app knows
 * how to render. Unknown keys render nothing rather than throwing — a role
 * granted a widget this build doesn't recognise yet shouldn't break the page.
 * Values here are presentational placeholders; wire real metrics endpoints
 * (drivers/trips/payments) when those modules exist.
 */
interface WidgetDef {
  icon: string;
  value: string;
  hint: string;
}

const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  'drivers-active': { icon: 'sports_motorsports', value: '—', hint: 'Drivers currently online' },
  'trips-today': { icon: 'route', value: '—', hint: 'Trips started or completed today' },
  'payments-summary': { icon: 'payments', value: '—', hint: 'Revenue collected this period' },
};

@Component({
  selector: 'md-account-dashboard',
  imports: [AdminPage],
  templateUrl: './dashboard.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Dashboard {
  private readonly auth = inject(AuthService);

  protected readonly loading = this.auth.loading;

  protected readonly widgets = computed<(WidgetConfig & WidgetDef)[]>(() => {
    const configs = this.auth.bootstrap()?.dashboardWidgets ?? [];
    return [...configs]
      .sort((a, b) => a.order - b.order)
      .flatMap((cfg) => {
        const def = WIDGET_REGISTRY[cfg.key];
        return def ? [{ ...cfg, ...def }] : [];
      });
  });

  protected readonly userName = computed(() => this.auth.bootstrap()?.user?.name);
}
