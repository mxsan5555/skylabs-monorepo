import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface AttendanceRecord {
  id?: string;
  driver_id: number;
  driver_name?: string;
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  check_out_latitude?: number;
  check_out_longitude?: number;
  status: string;
  total_hours?: number;
  assigned_trip_id?: number;
  leave_type?: string;
  leave_reason?: string;
  remarks?: string;
}

interface AttendanceDto {
  id: string;
  driverId: string;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  status: string;
  totalHours: number | null;
  assignedTripId: string | null;
  leaveType: string | null;
  leaveReason: string | null;
  remarks: string | null;
}

function fromDto(dto: AttendanceDto): AttendanceRecord {
  return {
    id: dto.id,
    driver_id: Number(dto.driverId) || 0,
    attendance_date: dto.attendanceDate,
    check_in_time: dto.checkInTime ?? undefined,
    check_out_time: dto.checkOutTime ?? undefined,
    check_in_latitude: dto.checkInLatitude ?? undefined,
    check_in_longitude: dto.checkInLongitude ?? undefined,
    check_out_latitude: dto.checkOutLatitude ?? undefined,
    check_out_longitude: dto.checkOutLongitude ?? undefined,
    status: dto.status,
    total_hours: dto.totalHours ?? undefined,
    assigned_trip_id: dto.assignedTripId ? Number(dto.assignedTripId) : undefined,
    leave_type: dto.leaveType ?? undefined,
    leave_reason: dto.leaveReason ?? undefined,
    remarks: dto.remarks ?? undefined,
  };
}

function toPayload(input: AttendanceRecord): Record<string, unknown> {
  return {
    driverId: String(input.driver_id),
    attendanceDate: input.attendance_date,
    checkInTime: input.check_in_time,
    checkOutTime: input.check_out_time,
    checkInLatitude: input.check_in_latitude,
    checkInLongitude: input.check_in_longitude,
    checkOutLatitude: input.check_out_latitude,
    checkOutLongitude: input.check_out_longitude,
    status: input.status,
    totalHours: input.total_hours,
    assignedTripId: input.assigned_trip_id ? String(input.assigned_trip_id) : undefined,
    leaveType: input.leave_type,
    leaveReason: input.leave_reason,
    remarks: input.remarks,
  };
}

@Injectable({ providedIn: 'root' })
export class AttendanceApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/attendance`;

  list(): Observable<AttendanceRecord[]> {
    return this.http.get<ApiEnvelope<AttendanceDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  create(input: AttendanceRecord): Observable<AttendanceRecord> {
    return this.http
      .post<ApiEnvelope<AttendanceDto>>(this.base, toPayload(input))
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: AttendanceRecord): Observable<AttendanceRecord> {
    return this.http
      .patch<ApiEnvelope<AttendanceDto>>(`${this.base}/${id}`, toPayload(input))
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
