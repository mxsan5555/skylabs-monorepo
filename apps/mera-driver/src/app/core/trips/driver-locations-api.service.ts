import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface DriverLocation {
  id?: string;
  driver_name: string;
  phone: string;
  vehicle: string;
  city: string;
  latitude: number;
  longitude: number;
  status: string;
  recorded_at: string;
}

interface DriverLocationDto {
  id: string;
  driverName: string;
  phone: string | null;
  vehicle: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  status: string;
  recordedAt: string | null;
}

function fromDto(dto: DriverLocationDto): DriverLocation {
  return {
    id: dto.id,
    driver_name: dto.driverName,
    phone: dto.phone ?? '',
    vehicle: dto.vehicle ?? '',
    city: dto.city ?? '',
    latitude: dto.latitude,
    longitude: dto.longitude,
    status: dto.status,
    recorded_at: dto.recordedAt ?? '',
  };
}

function toPayload(input: DriverLocation): Record<string, unknown> {
  return {
    driverName: input.driver_name,
    phone: input.phone,
    vehicle: input.vehicle,
    city: input.city,
    latitude: input.latitude,
    longitude: input.longitude,
    status: input.status,
    recordedAt: input.recorded_at,
  };
}

@Injectable({ providedIn: 'root' })
export class DriverLocationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/trips/driver-locations`;

  list(): Observable<DriverLocation[]> {
    return this.http.get<ApiEnvelope<DriverLocationDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: DriverLocation): Observable<DriverLocation> {
    return this.http
      .post<ApiEnvelope<DriverLocationDto>>(this.base, toPayload(input))
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: DriverLocation): Observable<DriverLocation> {
    return this.http
      .patch<ApiEnvelope<DriverLocationDto>>(`${this.base}/${id}`, toPayload(input))
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
