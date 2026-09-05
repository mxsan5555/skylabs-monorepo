import { apiGet } from './client';

/**
 * SuperAdmin/staff customer directory (`customers:view`) — apps/msd-api/src/routes/customers.routes.ts.
 * Read-only: a customer's own data is only ever editable by the customer themself via the
 * storefront `/my-account` flow, never here.
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
