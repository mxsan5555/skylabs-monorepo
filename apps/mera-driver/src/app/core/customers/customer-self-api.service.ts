import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface CustomerSelfBooking {
  id: string;
  bookingCode: string;
  driverName: string | null;
  vehicleName: string | null;
  tripTypeName: string | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  scheduledAt: string | null;
  status: string;
  paymentStatus: string;
  finalFare: number | null;
  estimatedFare: number | null;
}

export interface CustomerSelf {
  id: string;
  firstName: string;
  lastName: string | null;
  profileImage: string | null;
  mobileNumber: string;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  stateId: number | null;
  cityId: number | null;
  pincode: string | null;
  alternatePhone: string | null;
  customerType: string | null;
  /** Read-only — the customer portal never sends this back; only staff can change it. */
  verificationStatus: string;
  /** Read-only — the portal login gate; only staff can change it (`PATCH /customers/:id`
   *  is not used for this today — mirrors Driver's `accountStatus` model). */
  accountStatus: string;
}

/** The self-editable subset — everything in `CustomerSelf` minus the read-only fields. */
export type CustomerSelfUpdate = Partial<Omit<CustomerSelf, 'id' | 'verificationStatus' | 'accountStatus'>>;

@Injectable({ providedIn: 'root' })
export class CustomerSelfApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/customers/me`;

  get(): Observable<CustomerSelf> {
    return this.http.get<ApiEnvelope<CustomerSelf>>(this.base).pipe(map(unwrap));
  }

  update(input: CustomerSelfUpdate): Observable<CustomerSelf> {
    return this.http.patch<ApiEnvelope<CustomerSelf>>(this.base, input).pipe(map(unwrap));
  }

  listBookings(): Observable<CustomerSelfBooking[]> {
    return this.http.get<ApiEnvelope<CustomerSelfBooking[]>>(`${this.base}/bookings`).pipe(map(unwrap));
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
