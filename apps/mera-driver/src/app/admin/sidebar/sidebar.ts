import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
import { accountPath } from '../menu';

/**
 * Console sidebar: brand, search, and navigation rendered straight from
 * `authService.bootstrap()?.menu` — the server already filtered this tree down to
 * what the signed-in user's permissions allow (see `Sidebar`).
 */
@Component({
  selector: 'md-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  // The host element wraps the .admin-sidebar grid item; display:contents lets
  // the <aside> itself be the grid item so it stretches to full height.
  styles: ':host { display: contents; }',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly accountPath = accountPath;

  // Track the current active URL for auto-expansion of active submenus
  protected readonly currentUrl = signal<string>('');

  // Keeps track of user clicked expand/collapse states (groupId -> boolean)
  private readonly userToggled = signal<Record<string, boolean>>({});

  constructor() {
    this.currentUrl.set(this.router.url);
    this.router.events.subscribe(() => {
      this.currentUrl.set(this.router.url);
    });
  }

  protected readonly menu = computed<MenuNode[]>(() => {
    const nodes = this.auth.bootstrap()?.menu ?? [];
    return this.auth.isPreviewing() ? nodes.filter((n) => n.id !== 'administration') : nodes;
  });

  protected readonly user = computed(() => this.auth.bootstrap()?.user);

  protected readonly initial = computed(() => (this.user()?.name ?? '?').charAt(0).toUpperCase());

  protected isGroupExpanded(node: MenuNode): boolean {
    // 1. If any child route is currently active, ALWAYS keep group expanded so active item is visible
    if (node.children) {
      const current = this.currentUrl();
      const hasActiveChild = node.children.some((child) => {
        const path = accountPath(child);
        return path ? (current === path || current.startsWith(path + '/') || current.startsWith(path + '?')) : false;
      });
      if (hasActiveChild) {
        return true;
      }
    }

    // 2. If user manually toggled this group, honor user preference
    const toggled = this.userToggled();
    if (toggled[node.id] !== undefined) {
      return toggled[node.id];
    }

    // 3. Default: Non-active groups remain collapsed to keep sidebar clean & organized
    return false;
  }

  protected toggleGroup(node: MenuNode): void {
    const isExpanded = this.isGroupExpanded(node);
    this.userToggled.update((prev) => ({
      ...prev,
      [node.id]: !isExpanded,
    }));
  }
}
