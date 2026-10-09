import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
import { filter } from 'rxjs';
import { accountPath, accountQueryParams } from '../menu';

const PROFILE_PATH = '/account/profile';

/**
 * Console sidebar: brand, search, and navigation rendered straight from
 * `authService.bootstrap()?.menu` — the server already filtered this tree down to
 * what the signed-in user's permissions allow (see `Sidebar`).
 */
@Component({
  selector: 'md-sidebar',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './sidebar.html',
  // The host element wraps the .admin-sidebar grid item; display:contents lets
  // the <aside> itself be the grid item so it stretches to full height.
  styles: ':host { display: contents; }',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Sidebar {
  readonly open = input(true);
  readonly close = output<void>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly accountPath = accountPath;
  protected readonly queryParams = accountQueryParams;

  // Track the current active URL for auto-expansion of active submenus
  protected readonly currentUrl = signal<string>('');

  // Keeps track of user clicked expand/collapse states (groupId -> boolean)
  private readonly userToggled = signal<Record<string, boolean>>({});

  constructor() {
    this.currentUrl.set(this.router.url);
    this.router.events.pipe(filter(event=>event instanceof NavigationEnd),takeUntilDestroyed()).subscribe(() => {
      this.userToggled.set({});
      this.currentUrl.set(this.router.url);
    });
  }

  protected readonly search = signal('');
  protected readonly roleNames = computed(() => this.auth.bootstrap()?.roles.map(r => r.name).join(', ') ?? '');
  protected readonly menu = computed<MenuNode[]>(() => {
    const nodes = this.auth.bootstrap()?.menu ?? [];
    const visible = this.auth.isPreviewing() ? nodes.filter((n) => n.id !== 'administration') : nodes;
    const term = this.search().trim().toLowerCase();
    const prune = (items: MenuNode[]): MenuNode[] => items.flatMap(n => {
      if (!term || n.title.toLowerCase().includes(term)) return [n];
      const children = prune(n.children ?? []);
      return children.length ? [{ ...n, children }] : [];
    });
    return prune(visible);
  });

  protected readonly user = computed(() => this.auth.bootstrap()?.user);

  protected readonly initial = computed(() => (this.user()?.name ?? '?').charAt(0).toUpperCase());

  protected readonly isOnProfile = computed(() => this.currentUrl().split('?')[0] === PROFILE_PATH);

  /** Every authenticated role lands here via this same sidebar — Profile/Logout must be
   *  reachable regardless of which permissions the signed-in user holds. */
  protected goToProfile(): void {
    this.router.navigateByUrl(PROFILE_PATH);
  }

  protected signOut(): void {
    this.auth.signOut();
    this.router.navigateByUrl('/sign-in');
  }

  protected isGroupExpanded(node: MenuNode): boolean {
    if (this.search().trim()) return true;
    const containsActive = (items: MenuNode[]): boolean => items.some(child =>
      this.isActive(child) || containsActive(child.children ?? []));
    const toggled = this.userToggled();
    if (toggled[node.id] !== undefined) return toggled[node.id];
    if (containsActive(node.children ?? [])) return true;

    return false;
  }

  protected isActive(node: MenuNode): boolean {
    const path = accountPath(node);
    if (!path) return false;
    const current = this.currentUrl();
    if (path.includes('?')) {const expected=new URL(path,'http://sidebar.local');const actual=new URL(current,'http://sidebar.local');return expected.pathname===actual.pathname&&Array.from(expected.searchParams).every(([key,value])=>actual.searchParams.get(key)===value);}
    if(path==='/account/trips/bookings'&&new URL(current,'http://sidebar.local').searchParams.get('view')==='trips')return false;
    if (path === '/account/drivers' && current.includes('view=users')) return false;
    const pathname = current.split('?')[0];
    if(pathname.startsWith('/account/accounts/')) return path === '/account/accounts/overview';
    return pathname === path || pathname.startsWith(path + '/');
  }

  protected toggleGroup(node: MenuNode): void {
    const isExpanded = this.isGroupExpanded(node);
    this.userToggled.update((prev) => ({
      ...prev,
      [node.id]: !isExpanded,
    }));
  }
}
