import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Customer } from '../../../../api/rbac/customers';
import { CustomerList, customerStatusLabel } from './customer-list';

const ACTIVE_CUSTOMER: Customer = {
  id: 'customer-1',
  name: 'Priya Sharma',
  phone: '+919876543210',
  email: 'priya@example.com',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  _count: { orders: 3 },
};

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderList(overrides: Partial<React.ComponentProps<typeof CustomerList>> = {}) {
  return render(
    <CustomerList
      customers={[ACTIVE_CUSTOMER]}
      total={1}
      page={1}
      pageSize={10}
      loading={false}
      onSelect={vi.fn()}
      onParamsChange={vi.fn()}
      onStatusChange={vi.fn()}
      {...overrides}
    />,
  );
}

/**
 * Feature: Customer status management — CustomerList (presenter)
 * Scenario: a new actions column (Activate/Deactivate/Suspend) is gated on `canChangeStatus`;
 * clicking an action resolves it to a target status via the row's own current status and reports
 * it up — but only for a transition that actually changes something (clicking "Activate" on an
 * already-active row is a no-op, since sky-data-table renders all three actions on every row
 * regardless of current status).
 *
 * Given: a customer row and canChangeStatus true/false
 * When: CustomerList renders / a row action fires
 * Then: the Status cell always shows the display label ("Suspended", never "blocked"); the
 *       actions column appears only when canChangeStatus; a same-status action is a no-op; a
 *       different-status action reports (id, targetStatus) up; 'select' still resolves the id
 *
 * Edge cases:
 * - blocked always renders as "Suspended" in the Status cell, and 'Customer Status' carries the
 *   raw enum value for the no-op guard (never the display label)
 */
describe('CustomerList', () => {
  it('renders "Suspended" (never "blocked") for a blocked customer\'s Status cell', () => {
    renderList({ customers: [{ ...ACTIVE_CUSTOMER, status: 'blocked' }] });
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as { Status: string; 'Customer Status': string }[];
    expect(rows[0].Status).toBe('Suspended');
    expect(rows[0]['Customer Status']).toBe('blocked'); // raw enum, used only by the no-op guard
  });

  it('customerStatusLabel maps every enum value to its display label', () => {
    expect(customerStatusLabel('active')).toBe('Active');
    expect(customerStatusLabel('inactive')).toBe('Inactive');
    expect(customerStatusLabel('blocked')).toBe('Suspended');
  });

  it('hides the status-change actions entirely when canChangeStatus is false (default) — only "View" shows', () => {
    renderList();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['select']);
  });

  it('shows View + Activate/Deactivate/Suspend when canChangeStatus is true', () => {
    renderList({ canChangeStatus: true });
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['select', 'activate', 'deactivate', 'suspend']);
  });

  it('clicking "select" resolves the row id via onSelect', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'Customer ID': 'customer-1' } } }));
    expect(onSelect).toHaveBeenCalledWith('customer-1');
  });

  it('clicking "activate" on an already-active row is a no-op (current status matches target)', () => {
    const onStatusChange = vi.fn();
    renderList({ canChangeStatus: true, onStatusChange });
    fireEvent(
      table(),
      new CustomEvent('sky-dt-row-action', {
        detail: { action: 'activate', row: { 'Customer ID': 'customer-1', 'Customer Status': 'active' } },
      }),
    );
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('clicking "suspend" on an active row reports (id, "blocked") up', () => {
    const onStatusChange = vi.fn();
    renderList({ canChangeStatus: true, onStatusChange });
    fireEvent(
      table(),
      new CustomEvent('sky-dt-row-action', {
        detail: { action: 'suspend', row: { 'Customer ID': 'customer-1', 'Customer Status': 'active' } },
      }),
    );
    expect(onStatusChange).toHaveBeenCalledWith('customer-1', 'blocked');
  });

  it('clicking "deactivate" on a blocked row reports (id, "inactive") up — a genuine transition', () => {
    const onStatusChange = vi.fn();
    renderList({ canChangeStatus: true, onStatusChange });
    fireEvent(
      table(),
      new CustomEvent('sky-dt-row-action', {
        detail: { action: 'deactivate', row: { 'Customer ID': 'customer-1', 'Customer Status': 'blocked' } },
      }),
    );
    expect(onStatusChange).toHaveBeenCalledWith('customer-1', 'inactive');
  });
});
