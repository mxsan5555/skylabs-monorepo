import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DashboardWidgetRecord, PermissionCatalogRow, Role, RoleWidgetRow } from '../../../../api/rbac/roles';
import { RoleManagement } from './roles';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: () => true,
  }),
}));

const listRolesMock = vi.fn();
const getPermissionCatalogMock = vi.fn();
const getRolePermissionsMock = vi.fn();
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
    getRolePermissions: (...args: unknown[]) => getRolePermissionsMock(...args),
    getRoleWidgets: (...args: unknown[]) => getRoleWidgetsMock(...args),
    listDashboardWidgetsCatalog: (...args: unknown[]) => listDashboardWidgetsCatalogMock(...args),
    setRolePermissions: (...args: unknown[]) => setRolePermissionsMock(...args),
    setRoleWidgets: (...args: unknown[]) => setRoleWidgetsMock(...args),
  };
});

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
    actions: [
      { action: 'view', key: 'dashboard:view', permissionId: DASHBOARD_PERMISSION_ID, label: 'Dashboard — view' },
    ],
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
  getRolePermissionsMock.mockResolvedValue({ data: [] });
  listDashboardWidgetsCatalogMock.mockResolvedValue({ data: WIDGETS_CATALOG });
  getRoleWidgetsMock.mockResolvedValue({ data: [] });
  setRolePermissionsMock.mockResolvedValue({ data: [] });
  setRoleWidgetsMock.mockResolvedValue({ data: [] });
});

function renderRoles() {
  return render(
    <RoleManagement />
  );
}

function widgetCheckbox(title: string): HTMLInputElement {
  const label = screen.getByText(title).closest('label');
  if (!label) throw new Error(`No label found for widget "${title}"`);
  return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function permissionSelect(title: string): HTMLSelectElement {
  return screen.getByRole('combobox', { name: title }) as HTMLSelectElement;
}

function findButton(text: string): HTMLElement {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find(
    (el) => el.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button "${text}" not found`);
  return button as HTMLElement;
}

async function waitForFullySettled(): Promise<void> {
  await waitFor(() => {
    expect(listRolesMock).toHaveBeenCalled();
    expect(getPermissionCatalogMock).toHaveBeenCalled();
    expect(getRolePermissionsMock).toHaveBeenCalled();
    expect(getRoleWidgetsMock).toHaveBeenCalled();
  });
  await waitFor(() => expect(screen.getByText('Total Orders')).toBeTruthy());
  await waitFor(() => expect(findButton('Save widgets')).toBeTruthy());
}

/** R1 / P2-15: the seven roles are fixed, so the page offers no New role, Clone or Delete, even
 *  to a viewer holding every rbac.roles permission, and says where to change a role instead. */
describe('RoleManagement — roles are fixed (R1, P2-15)', () => {
  it('offers no New role, Clone or Delete and explains the matrix is the place to change a role', async () => {
    renderRoles();
    await waitFor(() => expect(getRoleWidgetsMock).toHaveBeenCalledWith('test-token', VENDOR_ROLE.id));
    expect(screen.queryByText('New role')).toBeNull();
    expect(screen.queryByText('Clone')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getByText('Roles are fixed. Change what a role can do in the permission matrix.')).toBeTruthy();
  });
});

describe('RoleManagement — Dashboard widgets persistence (Vendor role)', () => {
  it("loads the Vendor role's previously-saved widget grants via getRoleWidgets and shows them pre-checked", async () => {
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
    getRolePermissionsMock.mockResolvedValue({ data: [] });
    renderRoles();
    await waitForFullySettled();

    const dashboardViewSelect = permissionSelect('Dashboard — view');
    expect(dashboardViewSelect.value).toBe('');

    const totalOrdersCheckbox = widgetCheckbox('Total Orders');
    fireEvent.click(totalOrdersCheckbox);
    expect(totalOrdersCheckbox.checked).toBe(true);
    expect(dashboardViewSelect.value).toBe('');

    fireEvent.change(dashboardViewSelect, { target: { value: 'ALL' } });
    expect(dashboardViewSelect.value).toBe('ALL');
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

    await waitFor(() =>
      expect(setRoleWidgetsMock).toHaveBeenCalledWith('test-token', VENDOR_ROLE.id, [
        { widgetId: 'widget-orders', order: 0 },
      ]),
    );
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
