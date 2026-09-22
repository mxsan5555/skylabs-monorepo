import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface MasterOption {
  id: number | string;
  name: string;
  status: 'Active' | 'Inactive';
}

interface MasterListItemDto {
  id: string;
  name: string;
  status: 'Active' | 'Inactive';
}

function fromDto(dto: MasterListItemDto): MasterOption {
  return { id: dto.id, name: dto.name, status: dto.status };
}

/**
 * Shared client for the 8 structurally-identical Masters lookup lists (driver-types,
 * education, eye-visions, health-docs, personal-docs, police-docs, source-types,
 * statuses) — one category per instance, mirroring `makeMasterListRouter` server-side.
 */
@Injectable({ providedIn: 'root' })
export class MasterListApiService {
  private readonly http = inject(HttpClient);

  private base(category: string): string {
    return `${environment.apiUrl}/masters/${category}`;
  }

  list(category: string): Observable<MasterOption[]> {
    return this.http
      .get<ApiEnvelope<MasterListItemDto[]>>(this.base(category))
      .pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(category: string, input: { name: string; status: 'Active' | 'Inactive' }): Observable<MasterOption> {
    return this.http
      .post<ApiEnvelope<MasterListItemDto>>(this.base(category), input)
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  update(category: string, id: string | number, input: { name: string; status: 'Active' | 'Inactive' }): Observable<MasterOption> {
    return this.http
      .patch<ApiEnvelope<MasterListItemDto>>(`${this.base(category)}/${id}`, input)
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  delete(category: string, id: string | number): Observable<{ id: string }> {
    return this.http.delete<ApiEnvelope<{ id: string }>>(`${this.base(category)}/${id}`).pipe(map(unwrap));
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
