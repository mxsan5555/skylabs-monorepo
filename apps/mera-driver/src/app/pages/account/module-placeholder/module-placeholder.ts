import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';

/**
 * One reusable "module coming soon" screen for every business route reachable
 * from the sidebar (drivers, vehicles, trips, attendance, payments, reports,
 * masters/*, settings) that doesn't have real content yet. The title/subtitle
 * come from the route's static `data`, so this single component backs every
 * one of those routes in `app.routes.ts` instead of near-duplicate files.
 */
@Component({
  selector: 'md-module-placeholder',
  imports: [AdminPage],
  template: `<md-admin-page [title]="title()" [subtitle]="subtitle()">
    <sky-card>
      <p>This module's screens are being built. Your access to it is already
      permission-gated — reach out if you expected to see something here.</p>
    </sky-card>
  </md-admin-page>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ModulePlaceholder {
  private readonly route = inject(ActivatedRoute);

  protected readonly title = computed(
    () => (this.route.snapshot.data['title'] as string | undefined) ?? 'Coming soon',
  );
  protected readonly subtitle = computed(
    () => (this.route.snapshot.data['subtitle'] as string | undefined) ?? 'This module is under construction.',
  );
}
