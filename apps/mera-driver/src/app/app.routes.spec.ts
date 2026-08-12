/**
 * Route-table wiring checks. `authGuard`/`permissionGuard` themselves are covered
 * behaviorally in `core/auth/shared-auth-guards.spec.ts` — this file only asserts
 * that `app.routes.ts` actually attaches them (and the right `data.permission`) to
 * the routes that need them, since a route with the guard forgotten would only be
 * caught by an e2e test otherwise.
 */
import { authGuard, permissionGuard } from '@skylabs-monorepo/shared-auth/angular';
import type { Route, Routes } from '@angular/router';
import { appRoutes } from './app.routes';

function findRoute(routes: Routes, path: string): Route | undefined {
  for (const route of routes) {
    if (route.path === path) return route;
    if (route.children) {
      const found = findRoute(route.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

/** Like `findRoute`, but throws (rather than returning `undefined`) so callers get a
 *  non-nullable `Route` without resorting to a `!` non-null assertion. */
function mustFindRoute(routes: Routes, path: string): Route {
  const route = findRoute(routes, path);
  if (!route) throw new Error(`route "${path}" not found in appRoutes`);
  return route;
}

describe('appRoutes — RBAC wiring', () => {
  it('guards every /account/* route with authGuard', () => {
    const accountRoute = mustFindRoute(appRoutes, 'account');
    expect(accountRoute.canActivate).toContain(authGuard);
  });

  it.each([
    ['dashboard', 'dashboard', 'view'],
    ['drivers', 'drivers', 'view'],
    ['vehicles', 'vehicles', 'view'],
    ['trips', 'trips', 'view'],
    ['attendance', 'attendance', 'view'],
    ['payments', 'payments', 'view'],
    ['reports', 'reports', 'view'],
    ['masters/vehicle-types', 'masters.vehicle-types', 'view'],
    ['masters/zones', 'masters.zones', 'view'],
    ['settings', 'settings', 'view'],
    ['administration/roles', 'rbac.roles', 'view'],
    ['administration/users', 'rbac.users', 'view'],
    ['administration/audit-logs', 'rbac.audit-logs', 'view'],
  ])('%s carries permissionGuard with data.permission = { menuKey: %j, action: %j }', (path, menuKey, action) => {
    const route = mustFindRoute(appRoutes, path);
    expect(route.canActivate).toContain(permissionGuard);
    expect(route.data?.['permission']).toEqual({ menuKey, action });
  });

  it('does not gate the profile route behind an extra permission (any authenticated user may view it)', () => {
    const profileRoute = mustFindRoute(appRoutes, 'profile');
    expect(profileRoute.canActivate ?? []).not.toContain(permissionGuard);
  });
});
