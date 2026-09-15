import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface ServiceZone {
  zone_uid: string;
  zone_name: string;
  zone_code: string;
  state_id: number | null;
  city_id: number | null;
  area_name: string;
  pincode: string;
  zone_type: 'City' | 'Area' | 'Pincode' | 'Custom';
  latitude: number | null;
  longitude: number | null;
  radius_km: number | null;
  boundary_data: string;
  status: 'Active' | 'Inactive';
  notes: string;
}

interface ServiceZoneDto {
  id: string;
  zoneName: string;
  zoneCode: string;
  stateId: number | null;
  cityId: number | null;
  areaName: string | null;
  pincode: string | null;
  zoneType: 'City' | 'Area' | 'Pincode' | 'Custom';
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  boundaryData: string | null;
  status: 'Active' | 'Inactive';
  notes: string | null;
}

function fromDto(dto: ServiceZoneDto): ServiceZone {
  return {
    zone_uid: dto.id,
    zone_name: dto.zoneName,
    zone_code: dto.zoneCode,
    state_id: dto.stateId,
    city_id: dto.cityId,
    area_name: dto.areaName ?? '',
    pincode: dto.pincode ?? '',
    zone_type: dto.zoneType,
    latitude: dto.latitude,
    longitude: dto.longitude,
    radius_km: dto.radiusKm,
    boundary_data: dto.boundaryData ?? '',
    status: dto.status,
    notes: dto.notes ?? '',
  };
}

function toPayload(input: Omit<ServiceZone, 'zone_uid'>): Record<string, unknown> {
  return {
    zoneName: input.zone_name,
    zoneCode: input.zone_code,
    stateId: input.state_id,
    cityId: input.city_id,
    areaName: input.area_name,
    pincode: input.pincode,
    zoneType: input.zone_type,
    latitude: input.latitude,
    longitude: input.longitude,
    radiusKm: input.radius_km,
    boundaryData: input.boundary_data,
    status: input.status,
    notes: input.notes,
  };
}

@Injectable({ providedIn: 'root' })
export class ZonesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/masters/zones`;

  list(): Observable<ServiceZone[]> {
    return this.http.get<ApiEnvelope<ServiceZoneDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: Omit<ServiceZone, 'zone_uid'>): Observable<ServiceZone> {
    return this.http.post<ApiEnvelope<ServiceZoneDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: Omit<ServiceZone, 'zone_uid'>): Observable<ServiceZone> {
    return this.http
      .patch<ApiEnvelope<ServiceZoneDto>>(`${this.base}/${id}`, toPayload(input))
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
