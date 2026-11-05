import { apiGet, apiPatch, apiPost } from './client';

/**
 * Purchase disputes — customer-raised (`POST /`, `authenticate` only, ownership checked server-
 * side), admin-reviewed (`accounts.refunds-disputes:{view,status_change,approve,reject}`).
 * Mirrors `apps/msd-api`'s `disputes.routes.ts` exactly.
 */

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
export type DisputeResolutionType = 'NO_ACTION' | 'REFUNDED' | 'OTHER';

export interface DisputeListRow {
  id: string;
  orderItemId: string;
  entitlementId: string | null;
  customerId: string;
  status: DisputeStatus;
  reason: string;
  description: string | null;
  evidenceStorageKey: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNotes: string | null;
  resolutionType: DisputeResolutionType | null;
  createdAt: string;
  updatedAt: string;
  entitlement: { voucherCode: string; vendorId: string; grossAmount: string } | null;
  customer: { id: string; name: string | null };
}

export interface DisputeDetail extends Omit<DisputeListRow, 'entitlement' | 'customer'> {
  entitlement: {
    id: string;
    voucherCode: string;
    vendorId: string;
    grossAmount: string;
    memberShareAmount: string;
    settlementStatus: string;
    preDisputeStatus: string | null;
  } | null;
  customer: { id: string; name: string | null; phone: string | null; email: string | null };
  refunds: { id: string; amount: string; type: 'FULL' | 'PARTIAL'; status: string; createdAt: string }[];
}

export interface RaiseDisputeInput {
  entitlementId: string;
  reason: string;
  description?: string;
  evidenceStorageKey?: string;
}

/** Customer self-service — ownership of `entitlementId` is checked server-side (404, never 403,
 *  on a mismatch). */
export function raiseDispute(token: string | null, input: RaiseDisputeInput) {
  return apiPost<DisputeListRow>('/disputes', token, input);
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listDisputes(
  token: string | null,
  opts: { page?: number; pageSize?: number; status?: DisputeStatus; vendorId?: string } = {},
) {
  return apiGet<DisputeListRow[]>(`/disputes${toQuery(opts)}`, token);
}

export function getDispute(token: string | null, id: string) {
  return apiGet<DisputeDetail>(`/disputes/${id}`, token);
}

/** OPEN → UNDER_REVIEW only (the one transition this route allows). */
export function markDisputeUnderReview(token: string | null, id: string) {
  return apiPatch<DisputeListRow>(`/disputes/${id}/status`, token);
}

export interface ResolveDisputeInput {
  resolutionType: DisputeResolutionType;
  resolutionNotes?: string;
}

/** `resolutionType: REFUNDED` requires `accounts.refunds-disputes:approve`; `NO_ACTION`/`OTHER`
 *  require `:reject` — checked server-side based on the body, so gate the UI the same way. */
export function resolveDispute(token: string | null, id: string, input: ResolveDisputeInput) {
  return apiPost<DisputeListRow>(`/disputes/${id}/resolve`, token, input);
}
