import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface Vehicle {
  id?: string;
  vehicle_uid: string;
  customer_id: number;
  vehicle_number: string;
  vehicle_type_id: number;
  make?: string;
  model?: string;
  variant?: string;
  manufacturing_year?: string;
  fuel_type?: string;
  transmission?: string;
  color?: string;
  rc_number?: string;
  rc_expiry_date?: string;
  insurance_number?: string;
  insurance_expiry_date?: string;
  status: string;
  notes?: string;
}

interface VehicleDto {
  id: string;
  vehicleUid: string;
  customerId: number | null;
  vehicleNumber: string;
  vehicleTypeId: number;
  make: string | null;
  model: string | null;
  variant: string | null;
  manufacturingYear: string | null;
  fuelType: string | null;
  transmission: string | null;
  color: string | null;
  rcNumber: string | null;
  rcExpiryDate: string | null;
  insuranceNumber: string | null;
  insuranceExpiryDate: string | null;
  status: string;
  notes: string | null;
}

function fromDto(dto: VehicleDto): Vehicle {
  return {
    id: dto.id,
    vehicle_uid: dto.vehicleUid,
    customer_id: dto.customerId ?? 0,
    vehicle_number: dto.vehicleNumber,
    vehicle_type_id: dto.vehicleTypeId,
    make: dto.make ?? undefined,
    model: dto.model ?? undefined,
    variant: dto.variant ?? undefined,
    manufacturing_year: dto.manufacturingYear ?? undefined,
    fuel_type: dto.fuelType ?? undefined,
    transmission: dto.transmission ?? undefined,
    color: dto.color ?? undefined,
    rc_number: dto.rcNumber ?? undefined,
    rc_expiry_date: dto.rcExpiryDate ?? undefined,
    insurance_number: dto.insuranceNumber ?? undefined,
    insurance_expiry_date: dto.insuranceExpiryDate ?? undefined,
    status: dto.status,
    notes: dto.notes ?? undefined,
  };
}

function toPayload(input: Vehicle): Record<string, unknown> {
  return {
    vehicleUid: input.vehicle_uid,
    customerId: input.customer_id,
    vehicleNumber: input.vehicle_number,
    vehicleTypeId: input.vehicle_type_id,
    make: input.make,
    model: input.model,
    variant: input.variant,
    manufacturingYear: input.manufacturing_year,
    fuelType: input.fuel_type,
    transmission: input.transmission,
    color: input.color,
    rcNumber: input.rc_number,
    rcExpiryDate: input.rc_expiry_date,
    insuranceNumber: input.insurance_number,
    insuranceExpiryDate: input.insurance_expiry_date,
    status: input.status,
    notes: input.notes,
  };
}

@Injectable({ providedIn: 'root' })
export class VehiclesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/vehicles`;

  list(): Observable<Vehicle[]> {
    return this.http.get<ApiEnvelope<VehicleDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: Vehicle): Observable<Vehicle> {
    return this.http.post<ApiEnvelope<VehicleDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: Vehicle): Observable<Vehicle> {
    return this.http
      .patch<ApiEnvelope<VehicleDto>>(`${this.base}/${id}`, toPayload(input))
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
