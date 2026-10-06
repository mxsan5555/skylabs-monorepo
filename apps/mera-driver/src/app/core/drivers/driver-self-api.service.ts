import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface DriverSelfDocument {
  id: string;
  category: 'personal' | 'health' | 'education' | 'police';
  type: string;
  regNo: string | null;
  fileName: string | null;
  version?: number;
  archivedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
}

export interface DriverSelf {
  id: string;
  firstName: string;
  lastName: string | null;
  fatherName: string | null;
  motherName: string | null;
  email: string | null;
  phone: string | null;
  emergencyNumber: string | null;
  dob: string | null;
  maritalStatus: string | null;
  gender: string | null;
  passportNumber: string | null;
  religion: string | null;
  color: string | null;
  age: string | null;
  height: string | null;
  weight: string | null;
  country: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  education: string | null;
  trainingStatus: string | null;
  trainingCertificate: string | null;
  eyeVision: string | null;
  healthInsurance: string | null;
  bloodGroup: string | null;
  licenseDetails: string | null;
  vehicleType: string | null;
  dlNo: string | null;
  dlIssueDate: string | null;
  dlExpiryDate: string | null;
  preferredPaymentMode: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  branchName: string | null;
  upiIdOrChequeNo: string | null;
  languages: string[];
  city: string | null;
  accountPaymentMethod: string | null;
  completedSubSteps: number[];
  currentStep: number;
  currentSubStep: number;
  completionPercentage: number;
  /** Read-only — the driver portal never sends this back; only staff can change it. */
  status: string;
  /** Read-only — staff-set reason for the current `status`. */
  verificationNotes: string | null;
  documents: DriverSelfDocument[];
}

/** The self-editable subset — everything in `DriverSelf` minus the read-only fields. */
export type DriverSelfUpdate = Partial<Omit<DriverSelf, 'id' | 'status' | 'verificationNotes' | 'documents' | 'completedSubSteps' | 'currentStep' | 'currentSubStep' | 'completionPercentage'>>;

@Injectable({ providedIn: 'root' })
export class DriverSelfApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/drivers/me`;

  get(): Observable<DriverSelf> {
    return this.http.get<ApiEnvelope<DriverSelf>>(this.base).pipe(map(unwrap));
  }

  update(input: DriverSelfUpdate): Observable<DriverSelf> {
    return this.http.patch<ApiEnvelope<DriverSelf>>(this.base, input).pipe(map(unwrap));
  }

  savePill(tab: number, pill: number, complete: boolean, fields: DriverSelfUpdate): Observable<DriverSelf> {
    return this.http.patch<ApiEnvelope<DriverSelf>>(`${this.base}/pill`, { tab, pill, complete, fields }).pipe(map(unwrap));
  }

  listDocuments(): Observable<DriverSelfDocument[]> {
    return this.http.get<ApiEnvelope<DriverSelfDocument[]>>(`${this.base}/documents`).pipe(map(unwrap));
  }

  uploadDocument(
    category: DriverSelfDocument['category'],
    type: string,
    regNo: string,
    file: File,
    expiresAt?: string,
  ): Observable<DriverSelfDocument> {
    const form = new FormData();
    form.append('category', category);
    form.append('type', type);
    if (regNo) form.append('regNo', regNo);
    if (expiresAt) form.append('expiresAt', expiresAt);
    form.append('file', file);
    return this.http.post<ApiEnvelope<DriverSelfDocument>>(`${this.base}/documents`, form).pipe(map(unwrap));
  }

  deleteDocument(docId: string): Observable<{ id: string }> {
    return this.http.delete<ApiEnvelope<{ id: string }>>(`${this.base}/documents/${docId}`).pipe(map(unwrap));
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
