import { apiPost } from './rbac/client';
export interface CustomerSupportRequest {
  subject: string;
  message: string;
}
export interface CustomerSupportResponse {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}
export function createCustomerSupport(
  token: string | null,
  payload: CustomerSupportRequest,
) {
  return apiPost<CustomerSupportResponse>('/customer/support',token,payload,);
}