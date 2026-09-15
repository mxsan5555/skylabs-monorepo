import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const CreateCustomerSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    profileImage: z.string().optional(),
    mobileNumber: z.string().min(3),
    email: z.string().email().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    stateId: z.number().int().optional(),
    cityId: z.number().int().optional(),
    pincode: z.string().optional(),
    alternatePhone: z.string().optional(),
    customerType: z.enum(['Individual', 'Corporate']).optional(),
    registrationSource: z.enum(['Website', 'App', 'Admin', 'Referral']).optional(),
    verificationStatus: z.enum(['Pending', 'Verified', 'Rejected']).optional(),
    accountStatus: z.enum(['Active', 'Inactive', 'Blocked']).optional(),
    notes: z.string().optional(),
  })
  .openapi('CreateCustomer');

export const UpdateCustomerSchema = CreateCustomerSchema.partial().openapi('UpdateCustomer');

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export const CreateDriverSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    fatherName: z.string().optional(),
    motherName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    emergencyNumber: z.string().optional(),
    dob: z.string().optional(),
    maritalStatus: z.string().optional(),
    gender: z.string().min(1),
    passportNumber: z.string().optional(),
    religion: z.string().optional(),
    color: z.string().optional(),
    language: z.string().optional(),
    age: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    address: z.string().optional(),
    driverType: z.string().optional(),
    status: z
      .enum([
        'Verified',
        'Partially Verified (P)',
        'Partially Verified (K)',
        'Non-Verified',
        'Blacklisted',
        'Closed',
        'Not Useful',
      ])
      .optional(),
    sourceType: z.string().optional(),
    vehicle: z.string().optional(),
    avatar: z.string().optional(),
    education: z.string().optional(),
    trainingStatus: z.string().optional(),
    trainingCertificate: z.string().optional(),
    eyeVision: z.string().optional(),
    healthInsurance: z.string().optional(),
    bloodGroup: z.string().optional(),
    licenseDetails: z.string().optional(),
    vehicleType: z.string().optional(),
    dlNo: z.string().optional(),
    dlIssueDate: z.string().optional(),
    dlExpiryDate: z.string().optional(),
    policeVerifiedStatus: z.string().optional(),
    policeVerifiedNo: z.string().optional(),
    jobType: z.string().optional(),
    experience: z.string().optional(),
    currentSalary: z.string().optional(),
    expectedSalary: z.string().optional(),
    preferredPaymentMode: z.string().optional(),
    amount: z.string().optional(),
    paymentReceiptDate: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNo: z.string().optional(),
    ifscCode: z.string().optional(),
    branchName: z.string().optional(),
    upiIdOrChequeNo: z.string().optional(),
  })
  .openapi('CreateDriver');

export const UpdateDriverSchema = CreateDriverSchema.partial().openapi('UpdateDriver');

export const CreateDriverDocumentSchema = z
  .object({
    category: z.enum(['personal', 'health', 'education', 'police']),
    type: z.string().min(1),
    regNo: z.string().optional(),
  })
  .openapi('CreateDriverDocument');

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export const CreateVehicleSchema = z
  .object({
    vehicleUid: z.string().min(1),
    customerId: z.number().int().optional(),
    vehicleNumber: z.string().min(1),
    vehicleTypeId: z.number().int(),
    make: z.string().optional(),
    model: z.string().optional(),
    variant: z.string().optional(),
    manufacturingYear: z.string().optional(),
    fuelType: z.string().optional(),
    transmission: z.string().optional(),
    color: z.string().optional(),
    rcNumber: z.string().optional(),
    rcExpiryDate: z.string().optional(),
    insuranceNumber: z.string().optional(),
    insuranceExpiryDate: z.string().optional(),
    status: z.enum(['Active', 'Inactive', 'Maintenance']).optional(),
    notes: z.string().optional(),
  })
  .openapi('CreateVehicle');

export const UpdateVehicleSchema = CreateVehicleSchema.partial().openapi('UpdateVehicle');

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const CreateAttendanceSchema = z
  .object({
    driverId: z.string().min(1),
    attendanceDate: z.string().min(1),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
    checkInLatitude: z.number().optional(),
    checkInLongitude: z.number().optional(),
    checkOutLatitude: z.number().optional(),
    checkOutLongitude: z.number().optional(),
    status: z.enum(['Present', 'Half Day', 'Leave', 'Absent']).optional(),
    totalHours: z.number().optional(),
    assignedTripId: z.string().optional(),
    leaveType: z.string().optional(),
    leaveReason: z.string().optional(),
    remarks: z.string().optional(),
  })
  .openapi('CreateAttendance');

export const UpdateAttendanceSchema = CreateAttendanceSchema.partial().openapi('UpdateAttendance');

// ---------------------------------------------------------------------------
// Driver <-> User linkage (admin action, self-service portal access)
// ---------------------------------------------------------------------------

export const LinkDriverToUserSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .openapi('LinkDriverToUser');
