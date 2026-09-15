import { calculateProfileCompletion } from './profile-completion';
import type { DriverSelf } from '../../core/drivers/driver-self-api.service';

const EMPTY: DriverSelf = {
  id: 'driver-1',
  firstName: '',
  lastName: null,
  fatherName: null,
  motherName: null,
  email: null,
  phone: null,
  emergencyNumber: null,
  dob: null,
  maritalStatus: null,
  gender: null,
  passportNumber: null,
  religion: null,
  color: null,
  age: null,
  height: null,
  weight: null,
  country: null,
  state: null,
  pincode: null,
  address: null,
  education: null,
  trainingStatus: null,
  trainingCertificate: null,
  eyeVision: null,
  healthInsurance: null,
  bloodGroup: null,
  licenseDetails: null,
  vehicleType: null,
  dlNo: null,
  dlIssueDate: null,
  dlExpiryDate: null,
  preferredPaymentMode: null,
  bankName: null,
  bankAccountNo: null,
  ifscCode: null,
  branchName: null,
  upiIdOrChequeNo: null,
  languages: [],
  status: 'Non-Verified',
  verificationNotes: null,
  documents: [],
};

describe('calculateProfileCompletion', () => {
  it('is 0% / incomplete when nothing is filled in', () => {
    const result = calculateProfileCompletion(EMPTY);
    expect(result.percentage).toBe(0);
    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(4);
    expect(result.status).toBe('incomplete');
    expect(result.incompleteSections.map((s) => s.key)).toEqual(['basic', 'kyc', 'languages', 'bank']);
  });

  it('counts only fully-filled sections — a partially-filled section stays incomplete', () => {
    const driver: DriverSelf = { ...EMPTY, firstName: 'Ravi', phone: '9000000000' }; // missing dob/gender/address
    const result = calculateProfileCompletion(driver);
    expect(result.sections.find((s) => s.key === 'basic')?.complete).toBe(false);
    expect(result.percentage).toBe(0);
  });

  it('marks Basic Information complete once all its fields are present, raising the percentage to 25%', () => {
    const driver: DriverSelf = {
      ...EMPTY,
      firstName: 'Ravi',
      phone: '9000000000',
      dob: '1990-01-01',
      gender: 'Male',
      address: '123 Main St',
    };
    const result = calculateProfileCompletion(driver);
    expect(result.sections.find((s) => s.key === 'basic')?.complete).toBe(true);
    expect(result.percentage).toBe(25);
    expect(result.completedCount).toBe(1);
    expect(result.status).toBe('incomplete');
  });

  it('counts languages as complete once at least one is selected', () => {
    const driver: DriverSelf = { ...EMPTY, languages: ['Hindi'] };
    const result = calculateProfileCompletion(driver);
    expect(result.sections.find((s) => s.key === 'languages')?.complete).toBe(true);
  });

  it('requires an uploaded document (not just DL fields) for the KYC section to count', () => {
    const driver: DriverSelf = { ...EMPTY, dlNo: 'DL123', licenseDetails: 'LMV', documents: [] };
    const result = calculateProfileCompletion(driver);
    expect(result.sections.find((s) => s.key === 'kyc')?.complete).toBe(false);

    const withDoc: DriverSelf = {
      ...driver,
      documents: [{ id: 'doc-1', category: 'personal', type: 'Aadhaar', regNo: null, fileName: 'a.pdf' }],
    };
    expect(calculateProfileCompletion(withDoc).sections.find((s) => s.key === 'kyc')?.complete).toBe(true);
  });

  it('requires bankName + bankAccountNo + ifscCode together for the bank section', () => {
    const partial: DriverSelf = { ...EMPTY, bankName: 'SBI', bankAccountNo: '12345' }; // missing ifscCode
    expect(calculateProfileCompletion(partial).sections.find((s) => s.key === 'bank')?.complete).toBe(false);

    const full: DriverSelf = { ...partial, ifscCode: 'SBIN0001234' };
    expect(calculateProfileCompletion(full).sections.find((s) => s.key === 'bank')?.complete).toBe(true);
  });

  it('is 100% and status "complete" only when every section is filled', () => {
    const driver: DriverSelf = {
      ...EMPTY,
      firstName: 'Ravi',
      phone: '9000000000',
      dob: '1990-01-01',
      gender: 'Male',
      address: '123 Main St',
      dlNo: 'DL123',
      licenseDetails: 'LMV',
      documents: [{ id: 'doc-1', category: 'personal', type: 'Aadhaar', regNo: null, fileName: 'a.pdf' }],
      languages: ['Hindi'],
      bankName: 'SBI',
      bankAccountNo: '12345',
      ifscCode: 'SBIN0001234',
    };
    const result = calculateProfileCompletion(driver);
    expect(result.percentage).toBe(100);
    expect(result.status).toBe('complete');
    expect(result.incompleteSections).toEqual([]);
  });

  it('never reads a staff-only field (status/verificationNotes are absent from every section definition)', () => {
    const verified: DriverSelf = { ...EMPTY, status: 'Verified' };
    const nonVerified: DriverSelf = { ...EMPTY, status: 'Non-Verified' };
    // Changing only `status` must not change the completion result.
    expect(calculateProfileCompletion(verified)).toEqual(calculateProfileCompletion(nonVerified));
  });
});
