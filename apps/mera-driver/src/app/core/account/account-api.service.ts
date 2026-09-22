import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';
import type { AccountProfile } from '../../models';

interface UserDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

function fromDto(dto: UserDto): AccountProfile {
  return { name: dto.name, email: dto.email ?? '', phone: dto.phone ?? '' };
}

/**
 * The one place `GET`/`PATCH /rbac/users/me` is called from — every authenticated role
 * (Super Admin down to Driver) shares the same `User` row for name/email/phone, so this
 * single self-service surface covers all of them. Ownership is resolved server-side from
 * the JWT subject (see `rbac.routes.ts`); nothing here ever sends a user id.
 */
@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/rbac/users/me`;

  get(): Observable<AccountProfile> {
    return this.http.get<ApiEnvelope<UserDto>>(this.base).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(patch: Partial<AccountProfile>): Observable<AccountProfile> {
    return this.http.patch<ApiEnvelope<UserDto>>(this.base, patch).pipe(map((res) => fromDto(unwrap(res))));
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
