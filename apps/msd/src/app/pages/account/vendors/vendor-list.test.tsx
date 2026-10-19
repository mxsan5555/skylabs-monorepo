import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { VendorList } from './vendor-list';

const VENDOR: Vendor = {
  id: 'vendor-1',
  businessName: 'Vitality Wellness & Beauty',
  slug: 'vitality',
  ownerUserId: 'owner-1',
  kycStatus: 'VERIFIED',
  kycRejectionReason: null,
  status: 'ACTIVE',
  statusReason: null,
  createdByUserId: 'admin-1',
  createdByName: 'Priya Sharma',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: true,
  offersTherapy: true,
  businessPhone: '9876543210',
  city: 'Jaipur',
  owner: { id: 'owner-1', name: 'Arjun Malhotra', status: 'active', roles: [] },
  _count: { branches: 9, deals: 18, products: 18, therapists: 12 },
  liveCounts: { branches: 9, deals: 5, products: 18, therapists: 12 },
};

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderList(vendors: Vendor[], opts: { onSelect?: ReturnType<typeof vi.fn>; onEdit?: ReturnType<typeof vi.fn> } = {}) {
  const onSelect = opts.onSelect ?? vi.fn();
  render(
    <VendorList
      vendors={vendors}
      onSelect={onSelect}
      onEdit={opts.onEdit}
      total={vendors.length}
      page={1}
      pageSize={10}
      loading={false}
      onParamsChange={vi.fn()}
    />,
  );
  return onSelect;
}

/**
 * Feature: Member list
 * Scenario: Member/Contact and Status pack a secondary line (owner/mobile/city, KYC status);
 * Branches/Deals/Products/Therapists show "live of total"; Created By shows name + date; the
 * Edit action only appears when the caller is permitted to edit.
 */
describe('VendorList', () => {
  it('declares the spec column order, each composite column carrying its secondary key', () => {
    renderList([]);
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { label: string; secondaryKey?: string }[];
    expect(columns.map((c) => c.label)).toEqual([
      'Member / Contact',
      'Status',
      'Branches',
      'Deals',
      'Products',
      'Therapists',
      'Created By',
    ]);
    expect(columns.find((c) => c.label === 'Member / Contact')?.secondaryKey).toBe('Contact Detail');
    expect(columns.find((c) => c.label === 'Status')?.secondaryKey).toBe('KYC Status');
    expect(columns.find((c) => c.label === 'Created By')?.secondaryKey).toBe('Created Date');
  });

  it('packs owner, mobile and city into the Member/Contact row\'s secondary line', () => {
    renderList([VENDOR]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row['Contact Detail']).toBe('Arjun Malhotra · 9876543210 · Jaipur');
  });

  it('shows "live of total" only where some items are not live', () => {
    renderList([VENDOR]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row['Branch Count']).toBe('9');
    expect(row['Deal Count']).toBe('5 of 18');
    expect(row['Product Count']).toBe('18');
    expect(row['Therapist Count']).toBe('12');
  });

  it('shows a readable status, with KYC status underneath', () => {
    renderList([{ ...VENDOR, status: 'PENDING_VERIFICATION', kycStatus: 'PENDING' }]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row.Status).toBe('Waiting for approval');
    expect(row['KYC Status']).toBe('KYC: Not checked yet');
  });

  it('shows the creator\'s name and date, falling back to "Not recorded"', () => {
    renderList([VENDOR, { ...VENDOR, id: 'vendor-2', createdByUserId: null, createdByName: null }]);
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(rows[0]['Created By']).toBe('Priya Sharma');
    expect(rows[1]['Created By']).toBe('Not recorded');
  });

  it('a select row action resolves the vendor id and hands it to onSelect', () => {
    const onSelect = renderList([VENDOR]);
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'Vendor ID': 'vendor-1' } } }));
    expect(onSelect).toHaveBeenCalledWith('vendor-1');
  });

  it('omits the Edit action entirely when onEdit is not provided (no vendors:edit)', () => {
    renderList([VENDOR]);
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['select']);
  });

  it('includes a permission-controlled Edit action that resolves the vendor id', () => {
    const onEdit = vi.fn();
    renderList([VENDOR], { onEdit });
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['select', 'edit']);
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', row: { 'Vendor ID': 'vendor-1' } } }));
    expect(onEdit).toHaveBeenCalledWith('vendor-1');
  });

  it('declares the status filter from every known VendorStatus', () => {
    renderList([]);
    expect(table().getAttribute('filter-label')).toBe('Status');
    const options = JSON.parse(table().getAttribute('filter-options') ?? '[]') as { value: string }[];
    expect(options.map((o) => o.value)).toContain('ACTIVE');
  });
});
