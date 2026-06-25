import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { ALL_ROLES, type UserRole } from '../../models';
import { ADMIN_MENU } from '../menu';

/**
 * Console sidebar: brand, (dummy) search, role-filtered navigation, and the
 * signed-in user. The "View as" switcher previews each persona until the
 * backend supplies real roles.
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
  protected readonly account = inject(AccountService);
  protected readonly router = inject(Router);

  protected readonly roles = this.auth.roles;
  protected readonly allRoles = ALL_ROLES;
  protected masterOpen = false;

  constructor() {
    this.masterOpen = this.router.url.includes('/master/');
  }

  protected isDropdownActive(item: any): boolean {
    if (!item.children) return false;
    return item.children.some((child: any) => this.router.url === child.to);
  }

  protected readonly groups = computed(() =>
    ADMIN_MENU.map((g) => ({
      label: g.label,
      items: g.items.filter((i) =>
        i.roles.some((r) => this.roles().includes(r)),
      ),
    })).filter((g) => g.items.length > 0),
  );

  protected readonly initial = computed(() =>
    this.account.profile().name.charAt(0).toUpperCase(),
  );

  protected setRole(value: string): void {
    this.auth.setRoles([value as UserRole]);
  }
}
