import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface FareRule {
  id?: string;
  vehicle_category_name: string;
  trip_type_name: string;
  zone_name: string;
  base_fare: number;
  per_km_rate: number;
  per_min_rate: number;
  waiting_charge_per_min: number;
  min_fare: number;
  driver_allowance: number;
  toll_included: boolean;
  surge_multiplier: number;
  effective_from: string;
  is_active: boolean;
}

interface FareRuleDto {
  id: string;
  vehicleCategoryName: string;
  tripTypeName: string;
  zoneName: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  waitingChargePerMin: number;
  minFare: number;
  driverAllowance: number;
  tollIncluded: boolean;
  surgeMultiplier: number;
  effectiveFrom: string;
  isActive: boolean;
}

function fromDto(dto: FareRuleDto): FareRule {
  return {
    id: dto.id,
    vehicle_category_name: dto.vehicleCategoryName,
    trip_type_name: dto.tripTypeName,
    zone_name: dto.zoneName,
    base_fare: dto.baseFare,
    per_km_rate: dto.perKmRate,
    per_min_rate: dto.perMinRate,
    waiting_charge_per_min: dto.waitingChargePerMin,
    min_fare: dto.minFare,
    driver_allowance: dto.driverAllowance,
    toll_included: dto.tollIncluded,
    surge_multiplier: dto.surgeMultiplier,
    effective_from: dto.effectiveFrom,
    is_active: dto.isActive,
  };
}

function toPayload(input: FareRule): Record<string, unknown> {
  return {
    vehicleCategoryName: input.vehicle_category_name,
    tripTypeName: input.trip_type_name,
    zoneName: input.zone_name,
    baseFare: input.base_fare,
    perKmRate: input.per_km_rate,
    perMinRate: input.per_min_rate,
    waitingChargePerMin: input.waiting_charge_per_min,
    minFare: input.min_fare,
    driverAllowance: input.driver_allowance,
    tollIncluded: input.toll_included,
    surgeMultiplier: input.surge_multiplier,
    effectiveFrom: input.effective_from,
    isActive: input.is_active,
  };
}

@Injectable({ providedIn: 'root' })
export class PricingApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/trips/pricing`;

  list(): Observable<FareRule[]> {
    return this.http.get<ApiEnvelope<FareRuleDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: FareRule): Observable<FareRule> {
    return this.http.post<ApiEnvelope<FareRuleDto>>(this.base, toPayload(input)).pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: FareRule): Observable<FareRule> {
    return this.http
      .patch<ApiEnvelope<FareRuleDto>>(`${this.base}/${id}`, toPayload(input))
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
