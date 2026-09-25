import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { VendorList } from './vendor-list';

const ADMIN_VENDOR: Vendor = {
  id: 'vendor-admin',
  businessName: 'Admin Created Spa',
  slug: 'admin-created-spa',
  ownerUserId: 'owner-1',
  kycStatus: 'PENDING',
  kycRejectionReason: null,
  status: 'PENDING_VERIFICATION',
  statusReason: null,
  createdByUserId: 'admin-1', // created by an admin -> Source: ADMIN
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: false,
  offersProduct: false,
  offersTherapy: false,
  owner: { id: 'owner-1', name: 'Owner One', status: 'active', roles: [] },
};

const WEBSITE_VENDOR: Vendor = {
  ...ADMIN_VENDOR,
  id: 'vendor-public',
  businessName: 'Self Registered Spa',
  slug: 'self-registered-spa',
  createdByUserId: null, // arrived via public "Become a Vendor" -> Source: WEBSITE
};

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

/**
 * Feature: Vendor list "Source" column
 * Scenario: `Vendor.createdByUserId` is the Source signal — ADMIN when an admin created the
 * vendor via "Add Vendor", WEBSITE when it arrived through the public "Become a Vendor"
 * self-registration (`createdByUserId: null`).
 *
 * Given: a mix of admin-created and self-registered vendors
 * When: VendorList renders
 * Then: each row's Source cell reflects createdByUserId correctly, and the column is declared
 *       with the right ADMIN/WEBSITE status-map colors
 *
 * Edge cases:
 * - a row-action 'select' still resolves the right vendor id via 'Vendor ID', unaffected by the
 *   new column
 */
describe('VendorList — Source column', () => {
  it('renders ADMIN for a vendor with createdByUserId set, and WEBSITE for one with it null', () => {
    render(
      <VendorList
        vendors={[ADMIN_VENDOR, WEBSITE_VENDOR]}
        selectedId={null}
        onSelect={vi.fn()}
        total={2}
        page={1}
        pageSize={10}
        loading={false}
        onParamsChange={vi.fn()}
      />,
    );
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as { Source: string; 'Business Name': string }[];
    expect(rows.find((r) => r['Business Name'] === 'Admin Created Spa')?.Source).toBe('ADMIN');
    expect(rows.find((r) => r['Business Name'] === 'Self Registered Spa')?.Source).toBe('WEBSITE');
  });

  it('declares the Source column with the ADMIN/WEBSITE status-map colors', () => {
    render(
      <VendorList
        vendors={[]}
        selectedId={null}
        onSelect={vi.fn()}
        total={0}
        page={1}
        pageSize={10}
        loading={false}
        onParamsChange={vi.fn()}
      />,
    );
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { key: string; statusMap?: Record<string, string> }[];
    const sourceColumn = columns.find((c) => c.key === 'Source');
    expect(sourceColumn?.statusMap).toEqual({ ADMIN: 'info', WEBSITE: 'success' });
  });

  it('a select row action still resolves the right vendor id (unaffected by the new column)', () => {
    const onSelect = vi.fn();
    render(
      <VendorList
        vendors={[ADMIN_VENDOR]}
        selectedId={null}
        onSelect={onSelect}
        total={1}
        page={1}
        pageSize={10}
        loading={false}
        onParamsChange={vi.fn()}
      />,
    );
    fireEvent(
      table(),
      new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'Vendor ID': 'vendor-admin' } } }),
    );
    expect(onSelect).toHaveBeenCalledWith('vendor-admin');
  });
});
