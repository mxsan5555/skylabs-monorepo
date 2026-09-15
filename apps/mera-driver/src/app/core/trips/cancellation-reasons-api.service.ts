import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface CancellationReason {
  id?: string;
  code: string;
  reason_text: string;
  applies_to: 'Customer' | 'Driver' | 'Both';
  penalty_applicable: 'Yes' | 'No';
  status: 'Active' | 'Inactive';
}

interface CancellationReasonDto {
  id: string;
  code: string;
  reasonText: string;
  appliesTo: 'Customer' | 'Driver' | 'Both';
  penaltyApplicable: 'Yes' | 'No';
  status: 'Active' | 'Inactive';
}

function fromDto(dto: CancellationReasonDto): CancellationReason {
  return {
    id: dto.id,
    code: dto.code,
    reason_text: dto.reasonText,
    applies_to: dto.appliesTo,
    penalty_applicable: dto.penaltyApplicable,
    status: dto.status,
  };
}

function toPayload(input: CancellationReason): Record<string, unknown> {
  return {
    code: input.code,
    reasonText: input.reason_text,
    appliesTo: input.applies_to,
    penaltyApplicable: input.penalty_applicable,
    status: input.status,
  };
}

@Injectable({ providedIn: 'root' })
export class CancellationReasonsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/trips/cancellation-reasons`;

  list(): Observable<CancellationReason[]> {
    return this.http
      .get<ApiEnvelope<CancellationReasonDto[]>>(this.base)
      .pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: CancellationReason): Observable<CancellationReason> {
    return this.http
      .post<ApiEnvelope<CancellationReasonDto>>(this.base, toPayload(input))
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: CancellationReason): Observable<CancellationReason> {
    return this.http
      .patch<ApiEnvelope<CancellationReasonDto>>(`${this.base}/${id}`, toPayload(input))
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
