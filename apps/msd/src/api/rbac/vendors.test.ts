import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGetMock(...args),
    apiPost: (...args: unknown[]) => apiPostMock(...args),
  };
});

import { registerPublicVendor, getVendorOwnerAvailability } from './vendors';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Vendor owner identity — frontend API layer
 * Scenario: `registerPublicVendor`/`getVendorOwnerAvailability` are thin wrappers, but the ONE
 * thing worth unit-testing directly (rather than only through a rendered component) is that the
 * public registration call genuinely never attaches a token — the whole point of the "Become a
 * Vendor" feature being reachable by an anonymous visitor.
 *
 * Given: the "Become a Vendor" form / "Add Vendor" owner-identity availability check
 * When: registerPublicVendor / getVendorOwnerAvailability is called
 * Then: registerPublicVendor always calls apiPost with `token: null`; getVendorOwnerAvailability
 *       passes the caller's token straight through to apiGet, and builds the right query string
 *
 * Edge cases:
 * - omitting mobile/email from the lookup opts still builds a valid (partial) query string
 */
describe('registerPublicVendor', () => {
  it('calls apiPost with token: null — never attaches an Authorization token', async () => {
    apiPostMock.mockResolvedValue({ data: { id: 'vendor-1' } });
    await registerPublicVendor({ businessName: 'Sunrise Spa', ownerEmail: 'a@example.com' });
    expect(apiPostMock).toHaveBeenCalledWith('/vendors/public/register', null, { businessName: 'Sunrise Spa', ownerEmail: 'a@example.com' });
  });
});

describe('getVendorOwnerAvailability', () => {
  it('passes the caller token through and builds the query string from email+mobile', async () => {
    apiGetMock.mockResolvedValue({ data: { available: true, conflicts: [] } });
    await getVendorOwnerAvailability('admin-token', { email: 'a@example.com', mobile: '9876543210' });
    expect(apiGetMock).toHaveBeenCalledWith('/vendors/users/lookup?email=a%40example.com&mobile=9876543210', 'admin-token');
  });

  it('omits an unset opt from the query string entirely rather than sending it empty', async () => {
    apiGetMock.mockResolvedValue({ data: { available: true, conflicts: [] } });
    await getVendorOwnerAvailability('admin-token', { email: 'a@example.com' });
    expect(apiGetMock).toHaveBeenCalledWith('/vendors/users/lookup?email=a%40example.com', 'admin-token');
  });
});
