import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface WorkflowBooking {
  id: string;
  bookingCode: string;
  status: string;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  tripTypeName?: string | null;
  vehicleCategory?: string | null;
  farePaise?: number | null;
  driverSharePaise?: number | null;
  paymentStatus?: string | null;
  paymentMode?: string | null;
  otp?: string | null;
  events?: { id: string; status: string; reason?: string | null; createdAt: string }[];
}

export interface WorkflowOffer {
  id: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  booking: WorkflowBooking;
}

export interface MoneyMovement {
  id: string;
  reference: string;
  kind: string;
  amountPaise: number;
  method: string;
  reason: string;
  createdAt: string;
  bookingId?: string | null;
  driverId?: string | null;
}

export interface PortalMessage {
  id: string;
  kind: 'notification' | 'support';
  subject: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
}

export interface DriverWorkflowOverview {
  driver: {
    id: string;
    online: boolean;
    registrationFeeRequired: boolean;
    registrationFeePaise: number;
    driverType?: string | null;
    experience?: string | null;
  };
  fee: 'Paid' | 'Waived' | 'Refunded' | 'Unpaid' | 'Pending' | 'Failed';
  reasons: string[];
  trips: WorkflowBooking[];
  offers: WorkflowOffer[];
  movements: MoneyMovement[];
  /** Sum of `bookingBalances().payable` across the driver's own trips — the server's own
   *  accounting math (`accounts.service.ts`), not re-derived client-side. */
  pendingPayoutPaise: number;
}

export interface RazorpayOrder {
  orderId: string;
  keyId: string;
  amountPaise: number;
}

/** Typed wrapper for the real driver-self trip/fee/notification endpoints under
 * `/workflow/driver/*` and `/workflow/messages|support` — the same endpoints the
 * generic `Workflow` component (shared with the customer/admin portals) already
 * calls ad hoc. Dedicated driver-portal pages (Fee/Availability/Requests/Trips/
 * Earnings/Notifications/Support) use this instead of raw HttpClient calls. */
@Injectable({ providedIn: 'root' })
export class DriverWorkflowApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/workflow`;

  overview(): Observable<DriverWorkflowOverview> {
    return this.http.get<ApiEnvelope<DriverWorkflowOverview>>(`${this.base}/driver/overview`).pipe(map(unwrap));
  }

  setAvailability(online: boolean): Observable<Pick<DriverWorkflowOverview, 'reasons'> & { ready?: boolean }> {
    return this.http.patch<ApiEnvelope<any>>(`${this.base}/driver/availability`, { online }).pipe(map(unwrap));
  }

  respondOffer(offerId: string, accept: boolean): Observable<unknown> {
    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/driver/offers/${offerId}`, { accept }).pipe(map(unwrap));
  }

  transitionTripStatus(bookingId: string, input: { status: string; otp?: string; reason?: string }): Observable<WorkflowBooking> {
    return this.http.post<ApiEnvelope<WorkflowBooking>>(`${this.base}/driver/trips/${bookingId}/status`, input).pipe(map(unwrap));
  }

  paymentOrder(): Observable<RazorpayOrder> {
    return this.http.post<ApiEnvelope<RazorpayOrder>>(`${this.base}/driver/payment-order`, {}).pipe(map(unwrap));
  }

  paymentConfirm(input: { paymentId: string; orderId: string; signature: string }): Observable<unknown> {
    return this.http.post<ApiEnvelope<unknown>>(`${this.base}/payment-confirm`, input).pipe(map(unwrap));
  }

  messages(): Observable<PortalMessage[]> {
    return this.http.get<ApiEnvelope<PortalMessage[]>>(`${this.base}/messages`).pipe(map(unwrap));
  }

  support(subject: string, body: string): Observable<PortalMessage> {
    return this.http.post<ApiEnvelope<PortalMessage>>(`${this.base}/support`, { subject, body }).pipe(map(unwrap));
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
