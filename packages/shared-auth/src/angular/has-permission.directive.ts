import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
} from '@angular/core';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { AuthService } from './auth.service';

/**
 * Structural directive gating a single element on a permission, e.g.
 * `<button *appHasPermission="{ menuKey: 'orders', action: 'create' }">`.
 * Replaces inline `*ngIf="hasRole(['admin'])"` checks.
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  private permission: { menuKey: string; action?: PermissionAction } | null = null;
  private hasView = false;

  @Input() set appHasPermission(value: { menuKey: string; action?: PermissionAction } | string) {
    this.permission = typeof value === 'string' ? parsePermissionString(value) : value;
  }

  constructor() {
    effect(() => {
      const granted = this.permission
        ? this.auth.can(this.permission.menuKey, this.permission.action ?? 'view')
        : false;
      if (granted && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      } else if (!granted && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }
}

function parsePermissionString(value: string): { menuKey: string; action?: PermissionAction } {
  const [menuKey, action] = value.split(':');
  return { menuKey, action: action as PermissionAction | undefined };
}
