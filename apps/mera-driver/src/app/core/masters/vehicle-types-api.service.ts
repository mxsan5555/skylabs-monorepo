import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface VehicleType {
  vehicle_type_uid: string;
  name: string;
  code: string;
  description: string;
  status: 'Active' | 'Inactive';
}

interface VehicleTypeDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: 'Active' | 'Inactive';
}

function fromDto(dto: VehicleTypeDto): VehicleType {
  return { vehicle_type_uid: dto.id, name: dto.name, code: dto.code, description: dto.description ?? '', status: dto.status };
}

function toPayload(input: Omit<VehicleType, 'vehicle_type_uid'>): Record<string, unknown> {
  return { name: input.name, code: input.code, description: input.description, status: input.status };
}

@Injectable({ providedIn: 'root' })
export class VehicleTypesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/masters/vehicle-types`;

  list(): Observable<VehicleType[]> {
    return this.http.get<ApiEnvelope<VehicleTypeDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: Omit<VehicleType, 'vehicle_type_uid'>): Observable<VehicleType> {
    return this.http.post<ApiEnvelope<VehicleTypeDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: Omit<VehicleType, 'vehicle_type_uid'>): Observable<VehicleType> {
    return this.http
      .patch<ApiEnvelope<VehicleTypeDto>>(`${this.base}/${id}`, toPayload(input))
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
