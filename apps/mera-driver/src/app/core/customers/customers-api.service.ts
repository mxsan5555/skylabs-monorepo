import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface Customer {
  customer_uid: string;
  first_name: string;
  last_name: string | null;
  profile_image: string | null;
  mobile_number: string;
  email: string | null;
  password_hash: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  state_id: number | null;
  city_id: number | null;
  pincode: string | null;
  alternate_phone: string | null;
  customer_type: 'Individual' | 'Corporate' | null;
  registration_source: 'Website' | 'App' | 'Admin' | 'Referral' | null;
  verification_status: 'Pending' | 'Verified' | 'Rejected';
  account_status: 'Active' | 'Inactive' | 'Blocked';
  last_login_at: string | null;
  notes: string | null;
}

interface CustomerDto {
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
  customerType: 'Individual' | 'Corporate' | null;
  registrationSource: 'Website' | 'App' | 'Admin' | 'Referral' | null;
  verificationStatus: 'Pending' | 'Verified' | 'Rejected';
  accountStatus: 'Active' | 'Inactive' | 'Blocked';
  lastLoginAt: string | null;
  notes: string | null;
}

export type CustomerInput = Partial<
  Omit<Customer, 'customer_uid' | 'password_hash' | 'last_login_at' | 'verification_status' | 'account_status'>
> & {
  first_name: string;
  mobile_number: string;
  verification_status?: Customer['verification_status'];
  account_status?: Customer['account_status'];
};

function fromDto(dto: CustomerDto): Customer {
  return {
    customer_uid: dto.id,
    first_name: dto.firstName,
    last_name: dto.lastName,
    profile_image: dto.profileImage,
    mobile_number: dto.mobileNumber,
    email: dto.email,
    password_hash: null,
    date_of_birth: dto.dateOfBirth,
    gender: dto.gender,
    address_line_1: dto.addressLine1,
    address_line_2: dto.addressLine2,
    state_id: dto.stateId,
    city_id: dto.cityId,
    pincode: dto.pincode,
    alternate_phone: dto.alternatePhone,
    customer_type: dto.customerType,
    registration_source: dto.registrationSource,
    verification_status: dto.verificationStatus,
    account_status: dto.accountStatus,
    last_login_at: dto.lastLoginAt,
    notes: dto.notes,
  };
}

function toPayload(input: CustomerInput): Record<string, unknown> {
  return {
    firstName: input.first_name,
    lastName: input.last_name ?? undefined,
    profileImage: input.profile_image ?? undefined,
    mobileNumber: input.mobile_number,
    email: input.email ?? undefined,
    dateOfBirth: input.date_of_birth ?? undefined,
    gender: input.gender ?? undefined,
    addressLine1: input.address_line_1 ?? undefined,
    addressLine2: input.address_line_2 ?? undefined,
    stateId: input.state_id ?? undefined,
    cityId: input.city_id ?? undefined,
    pincode: input.pincode ?? undefined,
    alternatePhone: input.alternate_phone ?? undefined,
    customerType: input.customer_type ?? undefined,
    registrationSource: input.registration_source ?? undefined,
    verificationStatus: input.verification_status ?? undefined,
    accountStatus: input.account_status ?? undefined,
    notes: input.notes ?? undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class CustomersApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/customers`;

  list(): Observable<Customer[]> {
    return this.http.get<ApiEnvelope<CustomerDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: CustomerInput): Observable<Customer> {
    return this.http.post<ApiEnvelope<CustomerDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: CustomerInput): Observable<Customer> {
    return this.http
      .patch<ApiEnvelope<CustomerDto>>(`${this.base}/${id}`, toPayload(input))
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  delete(id: string): Observable<{ id: string }> {
    return this.http.delete<ApiEnvelope<{ id: string }>>(`${this.base}/${id}`).pipe(map(unwrap));
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
