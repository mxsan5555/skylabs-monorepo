import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { DashboardWidgetRecord, PermissionCatalogRow, Role, RoleWidgetRow } from '../../../../api/rbac/roles';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: () => true,
  }),
}));

const listRolesMock = vi.fn();
const getPermissionCatalogMock = vi.fn();
const getRolePermissionIdsMock = vi.fn();
const getRoleWidgetsMock = vi.fn();
const listDashboardWidgetsCatalogMock = vi.fn();
const setRolePermissionsMock = vi.fn();
const setRoleWidgetsMock = vi.fn();

vi.mock('../../../../api/rbac/roles', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/roles')>('../../../../api/rbac/roles');
  return {
    ...actual,
    listRoles: (...args: unknown[]) => listRolesMock(...args),
    getPermissionCatalog: (...args: unknown[]) => getPermissionCatalogMock(...args),
    getRolePermissionIds: (...args: unknown[]) => getRolePermissionIdsMock(...args),
    getRoleWidgets: (...args: unknown[]) => getRoleWidgetsMock(...args),
    listDashboardWidgetsCatalog: (...args: unknown[]) => listDashboardWidgetsCatalogMock(...args),
    setRolePermissions: (...args: unknown[]) => setRolePermissionsMock(...args),
    setRoleWidgets: (...args: unknown[]) => setRoleWidgetsMock(...args),
  };
});

import { RoleManagement } from './roles';

/**
 * Regression suite for the real bug: the "Dashboard widgets" checkboxes correctly toggled and
 * even correctly reflected the just-saved state right after clicking Save, but a role switch or
 * a page reload always rendered every widget unchecked — because `roles.tsx` had no way to fetch
 * a role's actually-saved widget grants (only `PUT .../widgets`, write-only, existed) and simply
 * reset the selection to empty on every role (re)selection instead. `RoleDashboardWidget` itself
 * was never the problem — the grants were always correctly persisted; this was purely a missing
 * read path. These tests exercise the fixed `getRoleWidgets`-backed reload, mirroring how the
 * (already-correct) permission matrix reload is tested.
 */

const VENDOR_ROLE: Role = {
  id: 'role-vendor',
  key: 'vendor',
  name: 'Vendor',
  description: 'Company/vendor owner or manager.',
  isSystem: true,
  isSuperAdmin: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SALES_ROLE: Role = {
  id: 'role-sales',
  key: 'sales',
  name: 'Sales',
  description: 'Vendor accounts and reporting.',
  isSystem: true,
  isSuperAdmin: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const DASHBOARD_PERMISSION_ID = 'perm-dashboard-view';
const CATALOG: PermissionCatalogRow[] = [
  {
    id: 'menu-dashboard',
    menuKey: 'dashboard',
    title: 'Dashboard',
    actions: [{ action: 'view', key: 'dashboard:view', permissionId: DASHBOARD_PERMISSION_ID, label: 'Dashboard — view' }],
  },
];

const WIDGETS_CATALOG: DashboardWidgetRecord[] = [
  { id: 'widget-orders', key: 'orders-recent', title: 'Total Orders', module: 'orders' },
  { id: 'widget-vendor', key: 'vendor-profile', title: 'My Business', module: 'vendors' },
];

function widgetRow(roleId: string, widgetId: string, order: number): RoleWidgetRow {
  const catalogEntry = WIDGETS_CATALOG.find((w) => w.id === widgetId)!;
  return { roleId, widgetId, order, widget: catalogEntry };
}

beforeEach(() => {
  vi.clearAllMocks();
  listRolesMock.mockResolvedValue({ data: [VENDOR_ROLE, SALES_ROLE] });
  getPermissionCatalogMock.mockResolvedValue({ data: CATALOG });
  listDashboardWidgetsCatalogMock.mockResolvedValue({ data: WIDGETS_CATALOG });
  getRolePermissionIdsMock.mockResolvedValue({ data: { permissionIds: [] } });
  getRoleWidgetsMock.mockResolvedValue({ data: [] });
});

function renderRoles() {
  return render(
    <ToastProvider>
      <RoleManagement />
    </ToastProvider>,
  );
}

function widgetCheckbox(title: string): HTMLInputElement {
  const label = screen.getByText(title).closest('label');
  if (!label) throw new Error(`No label found for widget "${title}"`);
  return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

// `md-filled-button` is a custom element — `getByRole('button', ...)` doesn't reliably resolve
// it in this jsdom test environment (same documented gap `vendor-branches.test.tsx`'s own
// `findSaveButton()` works around), so query by tag + text content directly instead.
function findButton(text: string): HTMLElement {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.trim() === text);
  if (!button) throw new Error(`Button "${text}" not found`);
  return button as HTMLElement;
}

/** Waits for every one of the four initial data fetches (roles, permission catalog, this role's
 *  permissions, this role's widgets) to have resolved and both loading sections to have left
 *  their "Loading…" state, before any test interacts with the page — avoids a flaky race where
 *  an interaction lands between two of these promises settling. */
async function waitForFullySettled(): Promise<void> {
  await waitFor(() => {
    expect(listRolesMock).toHaveBeenCalled();
    expect(getPermissionCatalogMock).toHaveBeenCalled();
    expect(getRolePermissionIdsMock).toHaveBeenCalled();
    expect(getRoleWidgetsMock).toHaveBeenCalled();
  });
  await waitFor(() => expect(screen.getByText('Total Orders')).toBeTruthy());
  await waitFor(() => expect(findButton('Save widgets')).toBeTruthy());
}

describe('RoleManagement — Dashboard widgets persistence (Vendor role)', () => {
  it('loads the Vendor role\'s previously-saved widget grants via getRoleWidgets and shows them pre-checked', async () => {
    getRoleWidgetsMock.mockResolvedValue({ data: [widgetRow(VENDOR_ROLE.id, 'widget-vendor', 0)] });
    renderRoles();

    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalledWith('test-token', VENDOR_ROLE.id));
    await waitFor(() => expect(widgetCheckbox('My Business').checked).toBe(true));
    expect(widgetCheckbox('Total Orders').checked).toBe(false);
  });

  it('a role with zero saved widgets shows every checkbox unchecked, distinct from "still loading"', async () => {
    getRoleWidgetsMock.mockResolvedValue({ data: [] });
    renderRoles();

    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Total Orders')).toBeTruthy());
    expect(widgetCheckbox('Total Orders').checked).toBe(false);
    expect(widgetCheckbox('My Business').checked).toBe(false);
  });
});

describe('RoleManagement — Dashboard widgets persistence across a role switch (Vendor → Sales)', () => {
  it("switching from Vendor to Sales reloads the widget selection from Sales's own saved grants — never carries over Vendor's checked state", async () => {
    getRoleWidgetsMock.mockImplementation((_token: string | null, roleId: string) =>
      Promise.resolve({
        data: roleId === VENDOR_ROLE.id ? [widgetRow(VENDOR_ROLE.id, 'widget-vendor', 0)] : [widgetRow(SALES_ROLE.id, 'widget-orders', 0)],
      }),
    );
    renderRoles();

    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalledWith('test-token', VENDOR_ROLE.id));
    await waitFor(() => expect(widgetCheckbox('My Business').checked).toBe(true));

    fireEvent.click(screen.getByText('Sales'));

    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalledWith('test-token', SALES_ROLE.id));
    await waitFor(() => expect(widgetCheckbox('Total Orders').checked).toBe(true));
    // Vendor's own grant never leaks into Sales's checkbox state.
    expect(widgetCheckbox('My Business').checked).toBe(false);
  });

  it('re-selecting the same role after switching away and back reloads the same saved grants (the "page reload" scenario)', async () => {
    getRoleWidgetsMock.mockImplementation((_token: string | null, roleId: string) =>
      Promise.resolve({ data: roleId === VENDOR_ROLE.id ? [widgetRow(VENDOR_ROLE.id, 'widget-vendor', 0)] : [] }),
    );
    renderRoles();
    await waitFor(() => expect(widgetCheckbox('My Business').checked).toBe(true));

    fireEvent.click(screen.getByText('Sales'));
    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalledWith('test-token', SALES_ROLE.id));

    fireEvent.click(screen.getByText('Vendor'));
    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalledWith('test-token', VENDOR_ROLE.id));
    await waitFor(() => expect(widgetCheckbox('My Business').checked).toBe(true));
  });
});

describe('RoleManagement — widget and permission selection stay independent', () => {
  it('toggling a Dashboard widget checkbox never checks/unchecks the Permission Matrix, and vice versa', async () => {
    getRoleWidgetsMock.mockResolvedValue({ data: [] });
    getRolePermissionIdsMock.mockResolvedValue({ data: { permissionIds: [] } });
    renderRoles();
    await waitForFullySettled();

    const dashboardViewCheckbox = screen.getByRole('checkbox', { name: 'Dashboard — view' }) as HTMLInputElement;
    expect(dashboardViewCheckbox.checked).toBe(false);

    const totalOrdersCheckbox = widgetCheckbox('Total Orders');
    fireEvent.click(totalOrdersCheckbox);
    expect(totalOrdersCheckbox.checked).toBe(true);
    // The unrelated Dashboard permission checkbox is untouched by a widget toggle.
    expect(dashboardViewCheckbox.checked).toBe(false);

    fireEvent.click(dashboardViewCheckbox);
    expect(dashboardViewCheckbox.checked).toBe(true);
    // Toggling the permission likewise never touches the widget selection.
    expect(totalOrdersCheckbox.checked).toBe(true);
    expect(widgetCheckbox('My Business').checked).toBe(false);
  });

  it('saving widgets calls setRoleWidgets only, never setRolePermissions', async () => {
    getRoleWidgetsMock.mockResolvedValue({ data: [] });
    setRoleWidgetsMock.mockResolvedValue({ data: [widgetRow(VENDOR_ROLE.id, 'widget-orders', 0)] });
    renderRoles();
    await waitForFullySettled();

    const totalOrdersCheckbox = widgetCheckbox('Total Orders');
    fireEvent.click(totalOrdersCheckbox);
    expect(totalOrdersCheckbox.checked).toBe(true);
    fireEvent.click(findButton('Save widgets'));

    await waitFor(() => expect(setRoleWidgetsMock).toHaveBeenCalledWith('test-token', VENDOR_ROLE.id, [{ widgetId: 'widget-orders', order: 0 }]));
    expect(setRolePermissionsMock).not.toHaveBeenCalled();
  });

  it('saving widgets response drives the checked state back from the server — still checked immediately after Save', async () => {
    getRoleWidgetsMock.mockResolvedValue({ data: [] });
    setRoleWidgetsMock.mockResolvedValue({ data: [widgetRow(VENDOR_ROLE.id, 'widget-orders', 0)] });
    renderRoles();
    await waitForFullySettled();

    const totalOrdersCheckbox = widgetCheckbox('Total Orders');
    fireEvent.click(totalOrdersCheckbox);
    expect(totalOrdersCheckbox.checked).toBe(true);
    fireEvent.click(findButton('Save widgets'));

    await waitFor(() => expect(screen.getByText('Dashboard widgets saved.')).toBeTruthy());
    expect(widgetCheckbox('Total Orders').checked).toBe(true);
  });
});
