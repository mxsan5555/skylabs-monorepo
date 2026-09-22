import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface Booking {
  id?: string;
  booking_code: string;
  customer_name: string;
  driver_name: string;
  vehicle_name: string;
  vehicle_category: string;
  trip_type_name: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  scheduled_at: string;
  estimated_distance_km: number;
  estimated_duration_min: number;
  estimated_fare: number;
  final_fare: number;
  status: string;
  payment_status: string;
  payment_mode: string;
  otp: string;
  requested_at: string;
  accepted_at: string;
  started_at: string;
  completed_at: string;
}

interface BookingDto {
  id: string;
  bookingCode: string;
  customerName: string;
  driverName: string | null;
  vehicleName: string | null;
  vehicleCategory: string | null;
  tripTypeName: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropAddress: string | null;
  dropLat: number | null;
  dropLng: number | null;
  scheduledAt: string | null;
  estimatedDistanceKm: number | null;
  estimatedDurationMin: number | null;
  estimatedFare: number | null;
  finalFare: number | null;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  otp: string | null;
  requestedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

function fromDto(dto: BookingDto): Booking {
  return {
    id: dto.id,
    booking_code: dto.bookingCode,
    customer_name: dto.customerName,
    driver_name: dto.driverName ?? '',
    vehicle_name: dto.vehicleName ?? '',
    vehicle_category: dto.vehicleCategory ?? '',
    trip_type_name: dto.tripTypeName ?? '',
    pickup_address: dto.pickupAddress ?? '',
    pickup_lat: dto.pickupLat ?? 0,
    pickup_lng: dto.pickupLng ?? 0,
    drop_address: dto.dropAddress ?? '',
    drop_lat: dto.dropLat ?? 0,
    drop_lng: dto.dropLng ?? 0,
    scheduled_at: dto.scheduledAt ?? '',
    estimated_distance_km: dto.estimatedDistanceKm ?? 0,
    estimated_duration_min: dto.estimatedDurationMin ?? 0,
    estimated_fare: dto.estimatedFare ?? 0,
    final_fare: dto.finalFare ?? 0,
    status: dto.status,
    payment_status: dto.paymentStatus,
    payment_mode: dto.paymentMode,
    otp: dto.otp ?? '',
    requested_at: dto.requestedAt ?? '',
    accepted_at: dto.acceptedAt ?? '',
    started_at: dto.startedAt ?? '',
    completed_at: dto.completedAt ?? '',
  };
}

function toPayload(input: Booking): Record<string, unknown> {
  return {
    bookingCode: input.booking_code,
    customerName: input.customer_name,
    driverName: input.driver_name,
    vehicleName: input.vehicle_name,
    vehicleCategory: input.vehicle_category,
    tripTypeName: input.trip_type_name,
    pickupAddress: input.pickup_address,
    pickupLat: input.pickup_lat,
    pickupLng: input.pickup_lng,
    dropAddress: input.drop_address,
    dropLat: input.drop_lat,
    dropLng: input.drop_lng,
    scheduledAt: input.scheduled_at,
    estimatedDistanceKm: input.estimated_distance_km,
    estimatedDurationMin: input.estimated_duration_min,
    estimatedFare: input.estimated_fare,
    finalFare: input.final_fare,
    status: input.status,
    paymentStatus: input.payment_status,
    paymentMode: input.payment_mode,
    otp: input.otp,
    requestedAt: input.requested_at,
    acceptedAt: input.accepted_at,
    startedAt: input.started_at,
    completedAt: input.completed_at,
  };
}

@Injectable({ providedIn: 'root' })
export class BookingsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/trips/bookings`;

  list(): Observable<Booking[]> {
    return this.http.get<ApiEnvelope<BookingDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: Booking): Observable<Booking> {
    return this.http.post<ApiEnvelope<BookingDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: Booking): Observable<Booking> {
    return this.http
      .patch<ApiEnvelope<BookingDto>>(`${this.base}/${id}`, toPayload(input))
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
