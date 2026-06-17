import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Sidebar } from '../../admin/sidebar/sidebar';
import { findMenuItem } from '../../admin/menu';

/**
 * Console shell shown after login / "My account": role-filtered sidebar + a
 * main column with a collapsible-sidebar toggle, breadcrumb, and centered
 * content (router-outlet).
 */
@Component({
  selector: 'md-admin-layout',
  imports: [RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdminLayout {
  private readonly router = inject(Router);

  protected readonly collapsed = signal(false);
  protected readonly currentLabel = signal<string | undefined>(
    findMenuItem(this.router.url)?.label,
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) =>
        this.currentLabel.set(findMenuItem(e.urlAfterRedirects)?.label),
      );
  }

  protected toggle(): void {
    this.collapsed.update((c) => !c);
  }
}
