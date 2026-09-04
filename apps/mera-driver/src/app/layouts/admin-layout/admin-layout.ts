import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { Sidebar } from '../../admin/sidebar/sidebar';
import { findMenuNodeByUrl } from '../../admin/menu';

/**
 * Console shell shown after login / "My account": permission-filtered sidebar +
 * a main column with a collapsible-sidebar toggle, breadcrumb, and centered
 * content (router-outlet). Shows a "Login As" preview banner whenever the
 * current session is an impersonation token. Marks every `/account/*` page
 * noindex while mounted (see `skylabs-seo.md`'s account-page robots rule).
 */
@Component({
  selector: 'md-admin-layout',
  imports: [RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdminLayout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  protected readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='robots'");
  }

  protected readonly collapsed = signal(false);
  private readonly url = signal(this.router.url);

  protected readonly currentLabel = computed(
    () => findMenuNodeByUrl(this.auth.bootstrap()?.menu, this.url())?.title,
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  protected toggle(): void {
    this.collapsed.update((c) => !c);
  }

  protected async returnToSuperAdmin(): Promise<void> {
    await this.auth.returnToSuperAdmin();
    this.router.navigate(['/account/dashboard']);
  }
}
