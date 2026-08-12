import { apiGet } from './client';

/**
 * Marketplace-wide counts backing the SuperAdmin/staff dashboard's stat widgets and the
 * business-process-flow section — matches `DashboardStats` in msd-api's
 * `services/dashboard.service.ts`. `revenue` is a decimal string (sum of `Payment.amount`
 * where `status === 'PAID'`) — never parse it with anything but `Number()`/`parseFloat`.
 */
export interface DashboardStats {
  vendors: number;
  customers: number;
  branches: number;
  categories: number;
  subCategories: number;
  services: number;
  products: number;
  deals: number;
  orders: number;
  bookings: number;
  revenue: string;
}

/** Gated `dashboard:view` server-side — the same permission every role already holds for the
 *  Dashboard menu node itself, so any caller who can reach `/account/dashboard` can call this. */
export function getDashboardStats(token: string | null) {
  return apiGet<DashboardStats>('/dashboard/stats', token);
}
