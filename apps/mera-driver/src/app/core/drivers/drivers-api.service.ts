import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export interface Driver {
  id?: string;
  name: string;
  phone: string;
  vehicle: string;
  city?: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  motherName?: string;
  email?: string;
  emergencyNumber?: string;
  dob?: string;
  maritalStatus?: string;
  gender?: string;
  passportNumber?: string;
  religion?: string;
  color?: string;
  language?: string;
  age?: string;
  height?: string;
  weight?: string;
  country?: string;
  state?: string;
  pincode?: string;
  address?: string;
  driverType?: string;
  status?: string;
  sourceType?: string;
  avatar?: string;
  education?: string;
  trainingStatus?: string;
  trainingCertificate?: string;
  eyeVision?: string;
  healthInsurance?: string;
  bloodGroup?: string;
  licenseDetails?: string;
  vehicleType?: string;
  dlNo?: string;
  dlIssueDate?: string;
  dlExpiryDate?: string;
  policeVerifiedStatus?: string;
  policeVerifiedNo?: string;
  policeVerifiedUpload?: string;
  jobType?: string;
  experience?: string;
  currentSalary?: string;
  expectedSalary?: string;
  documentCategory?: string;
  documentUpload?: string;
  preferredPaymentMode?: string;
  amount?: string;
  paymentReceiptDate?: string;
  bankName?: string;
  bankAccountNo?: string;
  ifscCode?: string;
  branchName?: string;
  upiIdOrChequeNo?: string;
  personalDocs?: Array<{ type: string; regNo: string; file: string }>;
  healthDocs?: Array<{ type: string; regNo: string; file: string }>;
  educationDocs?: Array<{ type: string; regNo: string; file: string }>;
  policeDocs?: Array<{ type: string; regNo: string; file: string }>;
  /** The User account linked to this driver's self-service portal, if any. */
  linkedUser?: { id: string; name: string; email: string | null; phone: string | null } | null;
  /** Multi-step onboarding-form progress — set server-side, never trust/derive from the
   *  frontend beyond the `stepCompleted` number sent on each step save. */
  onboardingStatus?: 'in_progress' | 'completed';
  currentStep?: number;
  completedSteps?: number[];
  completionPercentage?: number;
}

interface DriverDocumentDto {
  id: string;
  driverId: string;
  category: 'personal' | 'health' | 'education' | 'police';
  type: string;
  regNo: string | null;
  fileName: string | null;
  filePath: string | null;
}

interface DriverDto {
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
  language: string | null;
  age: string | null;
  height: string | null;
  weight: string | null;
  country: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  driverType: string | null;
  status: string;
  sourceType: string | null;
  vehicle: string | null;
  avatar: string | null;
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
  policeVerifiedStatus: string | null;
  policeVerifiedNo: string | null;
  jobType: string | null;
  experience: string | null;
  currentSalary: string | null;
  expectedSalary: string | null;
  preferredPaymentMode: string | null;
  amount: string | null;
  paymentReceiptDate: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  branchName: string | null;
  upiIdOrChequeNo: string | null;
  documents: DriverDocumentDto[];
  user: { id: string; name: string; email: string | null; phone: string | null } | null;
  onboardingStatus: string;
  currentStep: number;
  completedSteps: number[];
  completionPercentage: number;
}

function docsByCategory(docs: DriverDocumentDto[], category: DriverDocumentDto['category']) {
  return docs
    .filter((d) => d.category === category)
    .map((d) => ({ type: d.type, regNo: d.regNo ?? '', file: d.fileName ?? '' }));
}

function fromDto(dto: DriverDto): Driver {
  const firstName = dto.firstName;
  const lastName = dto.lastName ?? '';
  return {
    id: dto.id,
    name: `${firstName} ${lastName}`.trim(),
    phone: dto.phone ?? '',
    vehicle: dto.vehicle ?? '',
    firstName,
    lastName: dto.lastName ?? undefined,
    fatherName: dto.fatherName ?? undefined,
    motherName: dto.motherName ?? undefined,
    email: dto.email ?? undefined,
    emergencyNumber: dto.emergencyNumber ?? undefined,
    dob: dto.dob ?? undefined,
    maritalStatus: dto.maritalStatus ?? undefined,
    gender: dto.gender ?? undefined,
    passportNumber: dto.passportNumber ?? undefined,
    religion: dto.religion ?? undefined,
    color: dto.color ?? undefined,
    language: dto.language ?? undefined,
    age: dto.age ?? undefined,
    height: dto.height ?? undefined,
    weight: dto.weight ?? undefined,
    country: dto.country ?? undefined,
    state: dto.state ?? undefined,
    pincode: dto.pincode ?? undefined,
    address: dto.address ?? undefined,
    driverType: dto.driverType ?? undefined,
    status: dto.status,
    sourceType: dto.sourceType ?? undefined,
    avatar: dto.avatar ?? undefined,
    education: dto.education ?? undefined,
    trainingStatus: dto.trainingStatus ?? undefined,
    trainingCertificate: dto.trainingCertificate ?? undefined,
    eyeVision: dto.eyeVision ?? undefined,
    healthInsurance: dto.healthInsurance ?? undefined,
    bloodGroup: dto.bloodGroup ?? undefined,
    licenseDetails: dto.licenseDetails ?? undefined,
    vehicleType: dto.vehicleType ?? undefined,
    dlNo: dto.dlNo ?? undefined,
    dlIssueDate: dto.dlIssueDate ?? undefined,
    dlExpiryDate: dto.dlExpiryDate ?? undefined,
    policeVerifiedStatus: dto.policeVerifiedStatus ?? undefined,
    policeVerifiedNo: dto.policeVerifiedNo ?? undefined,
    jobType: dto.jobType ?? undefined,
    experience: dto.experience ?? undefined,
    currentSalary: dto.currentSalary ?? undefined,
    expectedSalary: dto.expectedSalary ?? undefined,
    preferredPaymentMode: dto.preferredPaymentMode ?? undefined,
    amount: dto.amount ?? undefined,
    paymentReceiptDate: dto.paymentReceiptDate ?? undefined,
    bankName: dto.bankName ?? undefined,
    bankAccountNo: dto.bankAccountNo ?? undefined,
    ifscCode: dto.ifscCode ?? undefined,
    branchName: dto.branchName ?? undefined,
    upiIdOrChequeNo: dto.upiIdOrChequeNo ?? undefined,
    personalDocs: docsByCategory(dto.documents, 'personal'),
    healthDocs: docsByCategory(dto.documents, 'health'),
    educationDocs: docsByCategory(dto.documents, 'education'),
    policeDocs: docsByCategory(dto.documents, 'police'),
    linkedUser: dto.user,
    onboardingStatus: dto.onboardingStatus === 'completed' ? 'completed' : 'in_progress',
    currentStep: dto.currentStep,
    completedSteps: dto.completedSteps,
    completionPercentage: dto.completionPercentage,
  };
}

function toPayload(input: Driver, stepCompleted?: number): Record<string, unknown> {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    fatherName: input.fatherName,
    motherName: input.motherName,
    email: input.email,
    phone: input.phone,
    emergencyNumber: input.emergencyNumber,
    dob: input.dob,
    maritalStatus: input.maritalStatus,
    gender: input.gender,
    passportNumber: input.passportNumber,
    religion: input.religion,
    color: input.color,
    language: input.language,
    age: input.age,
    height: input.height,
    weight: input.weight,
    country: input.country,
    state: input.state,
    pincode: input.pincode,
    address: input.address,
    driverType: input.driverType,
    status: input.status,
    sourceType: input.sourceType,
    vehicle: input.vehicle,
    avatar: input.avatar,
    education: input.education,
    trainingStatus: input.trainingStatus,
    trainingCertificate: input.trainingCertificate,
    eyeVision: input.eyeVision,
    healthInsurance: input.healthInsurance,
    bloodGroup: input.bloodGroup,
    licenseDetails: input.licenseDetails,
    vehicleType: input.vehicleType,
    dlNo: input.dlNo,
    dlIssueDate: input.dlIssueDate,
    dlExpiryDate: input.dlExpiryDate,
    policeVerifiedStatus: input.policeVerifiedStatus,
    policeVerifiedNo: input.policeVerifiedNo,
    jobType: input.jobType,
    experience: input.experience,
    currentSalary: input.currentSalary,
    expectedSalary: input.expectedSalary,
    preferredPaymentMode: input.preferredPaymentMode,
    amount: input.amount,
    paymentReceiptDate: input.paymentReceiptDate,
    bankName: input.bankName,
    bankAccountNo: input.bankAccountNo,
    ifscCode: input.ifscCode,
    branchName: input.branchName,
    upiIdOrChequeNo: input.upiIdOrChequeNo,
    ...(stepCompleted != null ? { stepCompleted } : {}),
  };
}

@Injectable({ providedIn: 'root' })
export class DriversApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/drivers`;

  list(): Observable<Driver[]> {
    return this.http.get<ApiEnvelope<DriverDto[]>>(this.base).pipe(map((res) => unwrap(res).map(fromDto)));
  }

  /** `stepCompleted` (1-4), when passed, marks that onboarding-wizard step done server-side
   *  (see `driver.service.ts`'s `computeOnboardingUpdate`) — omit it for a plain full-form
   *  save (e.g. editing an already-completed driver) to leave onboarding progress alone. */
  create(input: Driver, stepCompleted?: number): Observable<Driver> {
    return this.http
      .post<ApiEnvelope<DriverDto>>(this.base, toPayload(input, stepCompleted))
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  update(id: string, input: Driver, stepCompleted?: number): Observable<Driver> {
    return this.http
      .patch<ApiEnvelope<DriverDto>>(`${this.base}/${id}`, toPayload(input, stepCompleted))
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  delete(id: string): Observable<{ id: string }> {
    return this.http.delete<ApiEnvelope<{ id: string }>>(`${this.base}/${id}`).pipe(map(unwrap));
  }

  /** Grants a User account access to this driver's self-service portal (auto-assigns the
   *  `driver` role). One User can be linked to at most one Driver — the backend 409s if the
   *  target user is already linked elsewhere. */
  linkToUser(driverId: string, userId: string): Observable<Driver> {
    return this.http
      .patch<ApiEnvelope<DriverDto>>(`${this.base}/${driverId}/link-user`, { userId })
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  unlinkUser(driverId: string): Observable<Driver> {
    return this.http
      .patch<ApiEnvelope<DriverDto>>(`${this.base}/${driverId}/unlink-user`, {})
      .pipe(map((res) => fromDto(unwrap(res))));
  }

  /** Uploads one KYC document for a driver (multipart/form-data). Returns the stored filename. */
  uploadDocument(
    driverId: string,
    category: 'personal' | 'health' | 'education' | 'police',
    type: string,
    regNo: string,
    file: File,
  ): Observable<{ type: string; regNo: string; file: string }> {
    const form = new FormData();
    form.append('category', category);
    form.append('type', type);
    if (regNo) form.append('regNo', regNo);
    form.append('file', file);
    return this.http
      .post<ApiEnvelope<DriverDocumentDto>>(`${this.base}/${driverId}/documents`, form)
      .pipe(
        map((res) => {
          const doc = unwrap(res);
          return { type: doc.type, regNo: doc.regNo ?? '', file: doc.fileName ?? '' };
        }),
      );
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
