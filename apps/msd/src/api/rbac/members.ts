import { apiGet, apiPatch, apiPost, apiDelete, apiPostForm } from './client';
import type { Vendor, VendorDocumentType, MemberStatus, MemberDocumentStatus } from './vendors';

export type { MemberStatus, MemberDocumentStatus };

export interface MemberCreateInput {
  businessName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerMobile: string;
}

export interface MemberListFilter {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: MemberStatus;
  documents?: 'incomplete';
  reviewFlag?: 'true';
  sort?: 'businessName' | 'status' | 'documentsDueAt';
  dir?: 'asc' | 'desc';
}

export interface MemberDocumentRow {
  id: string;
  documentType: VendorDocumentType;
  status: MemberDocumentStatus;
  /** Present only for viewers holding members:edit or members:approve. */
  numberMasked?: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  uploadedOnBehalf: boolean;
  uploadedByUserId: string | null;
  /** Staff member who uploaded it for the member (P5-15); null for the member's own upload. */
  uploadedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only for roles that may open files: a signed link that expires after 5 minutes. */
  fileUrl?: string | null;
  originalFilename?: string | null;
}

/** One row of `GET /members/:id/activity`. `detail` is the reason for status and document items,
 *  the documents asked for on reminders. The structured fields (P3-24) are what the console
 *  reads; `summary` is the server's plain sentence, kept as the fallback. */
export interface ActivityItem {
  kind: 'status' | 'document' | 'reminder' | 'review';
  at: string;
  summary: string;
  detail: string | null;
  /** status */
  fromStatus?: string;
  toStatus?: string;
  /** status and reminder: who acted (null for the system). */
  actorId?: string | null;
  actorName?: string | null;
  /** document */
  documentType?: string;
  event?: 'uploaded' | 'approved' | 'rejected';
  byStaff?: boolean;
  /** reminder: 1..n, null for a manual reminder; the channels that delivered. */
  sequence?: number | null;
  channels?: ('email' | 'sms')[];
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function listMembers(token: string | null, filter: MemberListFilter = {}) {
  return apiGet<Vendor[]>(`/members${toQuery({ ...filter })}`, token);
}

export function getMember(token: string | null, id: string) {
  return apiGet<Vendor>(`/members/${id}`, token);
}

export function createMember(token: string | null, input: MemberCreateInput) {
  return apiPost<Vendor>('/members', token, input);
}

export function changeMemberStatus(token: string | null, id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason: string) {
  return apiPatch<Vendor>(`/members/${id}/status`, token, { status, reason });
}

export function deleteMember(token: string | null, id: string, reason: string) {
  // Delete always archives the member (item 6); nothing is erased.
  return apiDelete<{ outcome: 'ARCHIVED' }>(`/members/${id}`, token, { reason });
}

/** Per channel: SENT, FAILED, or null when the member has no email or phone on record. */
export type ReminderDelivery = 'SENT' | 'FAILED' | null;

export interface ReminderResult {
  emailStatus: ReminderDelivery;
  smsStatus: ReminderDelivery;
  /** Set when at least one channel delivered. */
  sentAt: string | null;
}

/** "Remind now". 429 inside the server's cooldown, 409 when the member cannot be reminded. */
export function sendMemberReminder(token: string | null, id: string) {
  return apiPost<ReminderResult>(`/members/${id}/documents/reminders`, token);
}

export function getMemberActivity(token: string | null, id: string) {
  return apiGet<ActivityItem[]>(`/members/${id}/activity`, token);
}

export function listMemberDocuments(token: string | null, id: string) {
  return apiGet<MemberDocumentRow[]>(`/members/${id}/documents`, token);
}

export function uploadMemberDocument(
  token: string | null,
  id: string,
  documentType: VendorDocumentType,
  file: Blob,
  filename: string,
  number?: string,
) {
  const form = new FormData();
  form.append('file', file, filename);
  if (number) form.append('number', number);
  return apiPostForm<{ id: string; documentType: VendorDocumentType; status: MemberDocumentStatus }>(
    `/members/${id}/documents/${documentType}`,
    token,
    form,
  );
}

export function deleteMemberDocument(token: string | null, id: string, documentType: VendorDocumentType) {
  return apiDelete<{ deleted: true }>(`/members/${id}/documents/${documentType}`, token);
}

export function reviewMemberDocument(
  token: string | null,
  id: string,
  documentType: VendorDocumentType,
  body: { decision: 'APPROVED' | 'REJECTED'; reason?: string },
) {
  return apiPatch<{ id: string; status: MemberDocumentStatus }>(`/members/${id}/documents/${documentType}/review`, token, body);
}
