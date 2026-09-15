import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface TripType {
  id?: string;
  name: string;
  description: string;
  is_active: boolean;
}

interface TripTypeDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

function fromDto(dto: TripTypeDto): TripType {
  return { id: dto.id, name: dto.name, description: dto.description ?? '', is_active: dto.isActive };
}

function toPayload(input: TripType): Record<string, unknown> {
  return { name: input.name, description: input.description, isActive: input.is_active };
}

@Injectable({ providedIn: 'root' })
export class TripTypesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/trips/trip-types`;

  list(): Observable<TripType[]> {
    return this.http.get<ApiEnvelope<TripTypeDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: TripType): Observable<TripType> {
    return this.http.post<ApiEnvelope<TripTypeDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: TripType): Observable<TripType> {
    return this.http
      .patch<ApiEnvelope<TripTypeDto>>(`${this.base}/${id}`, toPayload(input))
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
