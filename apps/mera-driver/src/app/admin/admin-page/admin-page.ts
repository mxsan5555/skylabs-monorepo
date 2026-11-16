import { Component, input } from '@angular/core';

/**
 * Centered console page: a title + subtitle header over projected content.
 * Reused by every console page (profile, dashboard, role areas).
 */
@Component({
  selector: 'md-admin-page',
  template: `<div class="admin-page">
    <header class="admin-page__head flex flex-wrap items-center justify-between gap-3">
      <div>
      <h1 class="admin-page__title">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="admin-page__subtitle">{{ subtitle() }}</p>
      }
      </div>
      <ng-content select="[page-actions]"></ng-content>
    </header>
    <ng-content></ng-content>
  </div>`,
})
export class AdminPage {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
