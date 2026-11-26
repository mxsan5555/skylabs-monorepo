import { describe, it, expect } from 'vitest';
import { VENDORS_TRAIL, vendorTrail } from './vendor-crumbs';

/** P10-47: one source for the Vendors breadcrumbs, so the label can't drift between pages. */
describe('vendor breadcrumbs', () => {
  it('starts every vendor page with Vendors > All vendors', () => {
    expect(VENDORS_TRAIL).toEqual([{ label: 'Vendors' }, { label: 'All vendors', to: '/account/vendors' }]);
  });

  it('adds the vendor, linked to its page, and falls back to "Vendor" until the name loads', () => {
    expect(vendorTrail('v1', 'Vitality Wellness')).toEqual([
      ...VENDORS_TRAIL,
      { label: 'Vitality Wellness', to: '/account/vendors/v1' },
    ]);
    expect(vendorTrail('v1', null)[2]).toEqual({ label: 'Vendor', to: '/account/vendors/v1' });
  });
});
