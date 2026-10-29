import { apiGet, apiPut } from './client';

/**
 * Super-Admin "Accounts" console — Overview totals, Customer Payments ledger, and Finance
 * Settings (commission/hold-period/completion-OTP config). Mirrors `apps/msd-api`'s
 * `accounts.routes.ts` exactly. Finance Settings reuses the existing `system-settings` menu/
 * permission node (no new menu node); everything else is gated on the new `accounts.*` keys.
 */

export interface AccountsOverview {
  collections: string;
  commission: string;
  memberLiability: string;
  pendingFulfilment: string;
  onHold: string;
  readyForPayout: string;
  paid: string;
  /** Distinct vendors currently eligible for payout — alongside the `readyForPayout` amount
   *  above, for the "Ready for Payout" strip's member count. */
  readyForPayoutMemberCount: number;
  /** Open disputes + the amount they're currently blocking — `blockedAmount` is already counted
   *  inside `onHold` above, never a second, separate total (see msd-api's
   *  `getDisputeAttentionSummary` doc comment). */
  disputeAttention: {
    openCount: number;
    blockedAmount: string;
  };
}

export function getAccountsOverview(token: string | null) {
  return apiGet<AccountsOverview>('/accounts/overview', token);
}

export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';
export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface CustomerPaymentRow {
  id: string;
  orderNumber: string;
  customerName: string;
  vendorNameSnapshot: string;
  total: string;
  status: OrderStatus;
  latestPayment: { provider: string; status: PaymentStatus; amount: string; createdAt: string } | null;
  createdAt: string;
}

export interface CustomerPaymentsOpts {
  page?: number;
  pageSize?: number;
  vendorId?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  [key: string]: string | number | undefined;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listCustomerPayments(token: string | null, opts: CustomerPaymentsOpts = {}) {
  return apiGet<CustomerPaymentRow[]>(`/accounts/customer-payments${toQuery(opts)}`, token);
}

/** Streams a CSV — not JSON — so this bypasses the `apiGet` envelope wrapper and hits `fetch`
 *  directly, same reasoning as any other file-download action in this app. */
export async function exportCustomerPayments(
  token: string | null,
  opts: Omit<CustomerPaymentsOpts, 'page' | 'pageSize'> = {},
): Promise<Blob> {
  const API_BASE_URL = import.meta.env.VITE_API_URL;
  const res = await fetch(`${API_BASE_URL}/accounts/customer-payments/export${toQuery(opts)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed with status ${res.status}`);
  return res.blob();
}

export interface FinanceSettings {
  id: string;
  defaultCommissionRatePercent: string;
  serviceHoldHours: number;
  productReturnHoldHours: number;
  completionOtpExpiryMinutes: number;
  completionOtpMaxAttempts: number;
  completionOtpResendCooldownSeconds: number;
  updatedByUserId: string | null;
  updatedAt: string;
}

export interface FinanceSettingsUpdateInput {
  defaultCommissionRatePercent?: number;
  serviceHoldHours?: number;
  productReturnHoldHours?: number;
  completionOtpExpiryMinutes?: number;
  completionOtpMaxAttempts?: number;
  completionOtpResendCooldownSeconds?: number;
}

export function getFinanceSettings(token: string | null) {
  return apiGet<FinanceSettings>('/accounts/finance-settings', token);
}

export function updateFinanceSettings(token: string | null, input: FinanceSettingsUpdateInput) {
  return apiPut<FinanceSettings>('/accounts/finance-settings', token, input);
}
