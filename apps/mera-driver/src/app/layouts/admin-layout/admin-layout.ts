import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, computed, inject, signal, HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { Sidebar } from '../../admin/sidebar/sidebar';
import { RbacApiService } from '../../core/rbac/rbac-api.service';
import { accountPath, flattenMenu, findMenuNodeByUrl } from '../../admin/menu';

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
  private readonly rbac = inject(RbacApiService);
  private readonly route = inject(ActivatedRoute);
  private authorizationTimer?: ReturnType<typeof setInterval>;
  private readonly onFocus = () => { void this.refreshAuthorization(); };

  private async refreshAuthorization(): Promise<void> {
    try { await this.rbac.refreshAuthorization(); } catch { return; }
    if(!this.auth.isAuthenticated()) { void this.router.navigate(['/sign-in']);return; }
    let active=this.route.snapshot;while(active.firstChild)active=active.firstChild;
    const permission=active.data['permission'];
    if(permission&&!this.auth.can(permission.menuKey,permission.action??'view')) {
      const first=flattenMenu(this.auth.bootstrap()?.menu??[]).find(node=>node.route);
      void this.router.navigateByUrl(first?accountPath(first)!:'/account/profile');
    }
  }


  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
    this.authorizationTimer=setInterval(()=>{void this.refreshAuthorization();},30000);
    window.addEventListener('focus',this.onFocus);
  }

  ngOnDestroy(): void {
    clearInterval(this.authorizationTimer);window.removeEventListener('focus',this.onFocus);
    this.meta.removeTag("name='robots'");
  }

  protected readonly authorizationConflicts = computed(() => (this.auth.bootstrap() as unknown as {authorizationConflicts?: string[]} | null)?.authorizationConflicts ?? []);
  protected readonly collapsed = signal(typeof window !== 'undefined' && window.innerWidth < 768);
  private readonly viewportWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1200);
  protected readonly mobileMenuOpen = computed(()=>this.viewportWidth()<768 && !this.collapsed());
  @HostListener('window:resize') onResize(): void {
    const before=this.viewportWidth();this.viewportWidth.set(window.innerWidth);
    if(before>=768&&window.innerWidth<768)this.collapsed.set(true);
    if(before<768&&window.innerWidth>=768)this.collapsed.set(false);
  }
  @HostListener('document:keydown.escape') onEscape(): void { if(this.mobileMenuOpen())this.closeSidebar(); }
  protected closeSidebar(): void {
    this.collapsed.set(true);
    document.querySelector<HTMLElement>('.admin-topbar md-icon-button')?.focus();
  }
  private readonly url = signal(this.router.url);

  protected readonly currentLabel = computed(
    () => {
      const path=this.url().split('?')[0];
      if(path.startsWith('/account/accounts/')) return ({overview:'Accounts Overview','booking-payments':'Booking Payments',commissions:'Commissions','driver-payouts':'Driver Payouts','registration-fees':'Registration Fees','refunds-adjustments':'Refunds & Adjustments',reports:'Accounts Reports'} as Record<string,string>)[path.split('/')[3]]??'Accounts';
      return findMenuNodeByUrl(this.auth.bootstrap()?.menu, this.url())?.title;
    },
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {this.url.set(e.urlAfterRedirects);if(this.viewportWidth()<768)this.collapsed.set(true);void this.refreshAuthorization();});
  }

  protected toggle(): void {
    this.collapsed.update((c) => !c);
    if(this.mobileMenuOpen())setTimeout(()=>document.querySelector<HTMLInputElement>('.admin-sidebar__search')?.focus(),0);
  }

  protected async returnToSuperAdmin(): Promise<void> {
    await this.auth.returnToSuperAdmin();
    this.router.navigate(['/account/dashboard']);
  }
}
