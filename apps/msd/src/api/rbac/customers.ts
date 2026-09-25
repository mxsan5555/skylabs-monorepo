import { apiGet, apiPatch } from './client';

/**
 * SuperAdmin/staff customer directory (`customers:view`) — apps/msd-api/src/routes/customers.routes.ts.
 * Mostly read-only: a customer's own data is only ever editable by the customer themself via the
 * storefront `/my-account` flow, never here — the one exception is status (Active/Inactive/
 * Suspended), gated on its own `customers:status_change` permission (a different permission from
 * the RBAC Users screen's `rbac.users:status_change` — unrelated, do not conflate).
 */

export type CustomerStatus = 'active' | 'inactive' | 'blocked';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  createdAt: string;
  _count: { orders: number };
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listCustomers(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; status?: CustomerStatus } = {},
) {
  return apiGet<Customer[]>(`/customers${toQuery(opts)}`, token);
}

export function getCustomer(token: string | null, id: string) {
  return apiGet<Customer>(`/customers/${id}`, token);
}

/** `customers:status_change` — the DB enum literal stays `active | inactive | blocked`; the UI
 *  displays `blocked` as "Suspended" (see `customerStatusLabel` in `customer-list.tsx`), but the
 *  value sent here must always be the raw enum literal. */
export function setCustomerStatus(token: string | null, id: string, status: CustomerStatus) {
  return apiPatch<Customer>(`/customers/${id}/status`, token, { status });
}
