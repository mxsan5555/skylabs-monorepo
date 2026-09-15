import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Trip types
// ---------------------------------------------------------------------------

export const CreateTripTypeSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('CreateTripType');

export const UpdateTripTypeSchema = CreateTripTypeSchema.partial().openapi('UpdateTripType');

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const CreateBookingSchema = z
  .object({
    bookingCode: z.string().min(1),
    customerName: z.string().min(1),
    driverName: z.string().optional(),
    vehicleName: z.string().optional(),
    vehicleCategory: z.string().optional(),
    tripTypeName: z.string().optional(),
    pickupAddress: z.string().optional(),
    pickupLat: z.number().optional(),
    pickupLng: z.number().optional(),
    dropAddress: z.string().optional(),
    dropLat: z.number().optional(),
    dropLng: z.number().optional(),
    scheduledAt: z.string().optional(),
    estimatedDistanceKm: z.number().optional(),
    estimatedDurationMin: z.number().optional(),
    estimatedFare: z.number().optional(),
    finalFare: z.number().optional(),
    status: z.enum(['requested', 'accepted', 'driver_arrived', 'ongoing', 'completed', 'cancelled']).optional(),
    paymentStatus: z.enum(['pending', 'paid', 'refunded', 'failed']).optional(),
    paymentMode: z.enum(['cash', 'upi', 'card', 'wallet']).optional(),
    otp: z.string().optional(),
    requestedAt: z.string().optional(),
    acceptedAt: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
  })
  .openapi('CreateBooking');

export const UpdateBookingSchema = CreateBookingSchema.partial().openapi('UpdateBooking');

// ---------------------------------------------------------------------------
// Driver locations
// ---------------------------------------------------------------------------

export const CreateDriverLocationSchema = z
  .object({
    driverName: z.string().min(1),
    phone: z.string().optional(),
    vehicle: z.string().optional(),
    city: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    status: z.enum(['Online', 'On Trip', 'Offline']).optional(),
    recordedAt: z.string().optional(),
  })
  .openapi('CreateDriverLocation');

export const UpdateDriverLocationSchema = CreateDriverLocationSchema.partial().openapi('UpdateDriverLocation');

// ---------------------------------------------------------------------------
// Cancellation reasons
// ---------------------------------------------------------------------------

export const CreateCancellationReasonSchema = z
  .object({
    code: z.string().min(1),
    reasonText: z.string().min(1),
    appliesTo: z.enum(['Customer', 'Driver', 'Both']).optional(),
    penaltyApplicable: z.enum(['Yes', 'No']).optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
  })
  .openapi('CreateCancellationReason');

export const UpdateCancellationReasonSchema = CreateCancellationReasonSchema.partial().openapi(
  'UpdateCancellationReason',
);

// ---------------------------------------------------------------------------
// Fare rules (Pricing)
// ---------------------------------------------------------------------------

export const CreateFareRuleSchema = z
  .object({
    vehicleCategoryName: z.string().min(1),
    tripTypeName: z.string().min(1),
    zoneName: z.string().min(1),
    baseFare: z.number(),
    perKmRate: z.number(),
    perMinRate: z.number(),
    waitingChargePerMin: z.number(),
    minFare: z.number(),
    driverAllowance: z.number(),
    tollIncluded: z.boolean().optional(),
    surgeMultiplier: z.number().optional(),
    effectiveFrom: z.string().min(1),
    isActive: z.boolean().optional(),
  })
  .openapi('CreateFareRule');

export const UpdateFareRuleSchema = CreateFareRuleSchema.partial().openapi('UpdateFareRule');
