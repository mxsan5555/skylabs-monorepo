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
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: true,
  offersTherapy: true,
  owner: { id: 'owner-1', name: 'Arjun Malhotra', status: 'active', roles: [] },
  _count: { branches: 9, deals: 18, products: 18, therapists: 12 },
  liveCounts: { branches: 9, deals: 5, products: 18, therapists: 12 },
};

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderList(vendors: Vendor[], onSelect = vi.fn()) {
  render(
    <VendorList vendors={vendors} onSelect={onSelect} total={vendors.length} page={1} pageSize={10} loading={false} onParamsChange={vi.fn()} />,
  );
}

/**
 * Feature: Member list
 * Scenario: Each row shows how many branches, deals, therapists and products the member has,
 * as "live of total" when some are not live, and the row action opens that member's page.
 */
describe('VendorList', () => {
  it('declares plain-language columns including a Therapists count', () => {
    renderList([]);
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { label: string }[];
    expect(columns.map((c) => c.label)).toEqual(['Business', 'Owner', 'Status', 'Branches', 'Deals', 'Therapists', 'Products']);
  });

  it('shows "live of total" only where some items are not live', () => {
    renderList([VENDOR]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row['Branch Count']).toBe('9');
    expect(row['Deal Count']).toBe('5 of 18');
    expect(row['Therapist Count']).toBe('12');
    expect(row['Product Count']).toBe('18');
  });

  it('falls back to the plain total when the API sent no live counts', () => {
    renderList([{ ...VENDOR, liveCounts: undefined }]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row['Deal Count']).toBe('18');
  });

  it('shows a readable status instead of the raw enum', () => {
    renderList([{ ...VENDOR, status: 'PENDING_VERIFICATION' }]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row.Status).toBe('Waiting for approval');
  });

  it('a select row action resolves the vendor id and hands it to onSelect', () => {
    const onSelect = vi.fn();
    renderList([VENDOR], onSelect);
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'Vendor ID': 'vendor-1' } } }));
    expect(onSelect).toHaveBeenCalledWith('vendor-1');
  });

  it('ignores row actions other than select', () => {
    const onSelect = vi.fn();
    renderList([VENDOR], onSelect);
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'delete', row: { 'Vendor ID': 'vendor-1' } } }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
