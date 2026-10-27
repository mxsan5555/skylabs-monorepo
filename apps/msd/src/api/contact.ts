import { apiPost } from './rbac/client';

export interface ContactMessagePayload {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

export interface ContactMessageResult {
  id: string;
  createdAt: string;
}

/** Public contact form submission. No auth required. */
export function submitContactMessage(payload: ContactMessagePayload) {
  return apiPost<ContactMessageResult>('/contact', null, payload);
}