import { apiGet } from './client';

/** Generic (rather than a fixed `Record<string, ...>` param) so a named interface like
 *  `ReportFilters` — which has no index signature of its own — can be passed directly without
 *  hitting TS's "index signature is missing" strictness gap (see `orders.ts`/`bookings.ts`'s
 *  own `toQuery`, which has exactly that pre-existing gap with their own named opts interfaces). */
function toQuery<T extends object>(params: T): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/** Date-only (`YYYY-MM-DD`) — see reports.schema.ts on the backend for the same shape. */
export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  vendorId?: string;
  branchId?: string;
  orderStatus?: 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus?: 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';
}

export interface OverallSummary {
  totalOrders: number;
  totalRevenue: string;
  paidRevenue: string;
  pendingAmount: string;
  cancelledOrders: number;
  completedOrders: number;
  totalProductsSold: number;
  totalServicesBooked: number;
}

export interface VendorReportRow {
  vendorId: string;
  vendorName: string;
  orders: number;
  revenue: string;
  paid: string;
  pending: string;
  cancelled: number;
}

export interface BranchReportRow {
  branchId: string;
  branchName: string;
  vendorId: string;
  vendorName: string;
  orders: number;
  revenue: string;
  services: number;
  products: number;
}

export interface MonthReportRow {
  month: string;
  orders: number;
  revenue: string;
  services: number;
  products: number;
}

export interface ServiceVsProductReport {
  servicesSold: number;
  productsSold: number;
  serviceRevenue: string;
  productRevenue: string;
}

export interface TopItemRow {
  dealId: string;
  itemName: string;
  vendorName: string;
  quantitySold: number;
  revenue: string;
}

export interface PaymentMethodRow {
  provider: 'RAZORPAY' | 'COD';
  orders: number;
  revenue: string;
  successful: number;
  pending: number;
  failed: number;
}

export function getOverallSummary(token: string | null, filters: ReportFilters) {
  return apiGet<OverallSummary>(`/reports/summary${toQuery(filters)}`, token);
}

export function getVendorWiseReport(token: string | null, filters: ReportFilters) {
  return apiGet<VendorReportRow[]>(`/reports/vendor-wise${toQuery(filters)}`, token);
}

export function getBranchWiseReport(token: string | null, filters: ReportFilters) {
  return apiGet<BranchReportRow[]>(`/reports/branch-wise${toQuery(filters)}`, token);
}

export function getMonthWiseReport(token: string | null, filters: ReportFilters) {
  return apiGet<MonthReportRow[]>(`/reports/month-wise${toQuery(filters)}`, token);
}

export function getServiceVsProductReport(token: string | null, filters: ReportFilters) {
  return apiGet<ServiceVsProductReport>(`/reports/service-vs-product${toQuery(filters)}`, token);
}

export function getTopVendors(token: string | null, filters: ReportFilters & { by?: 'revenue' | 'orders'; limit?: number }) {
  return apiGet<VendorReportRow[]>(`/reports/top-vendors${toQuery(filters)}`, token);
}

export function getTopProducts(token: string | null, filters: ReportFilters & { limit?: number }) {
  return apiGet<TopItemRow[]>(`/reports/top-products${toQuery(filters)}`, token);
}

export function getTopServices(token: string | null, filters: ReportFilters & { limit?: number }) {
  return apiGet<TopItemRow[]>(`/reports/top-services${toQuery(filters)}`, token);
}

export function getPaymentMethodReport(token: string | null, filters: ReportFilters) {
  return apiGet<PaymentMethodRow[]>(`/reports/payment-method${toQuery(filters)}`, token);
}
