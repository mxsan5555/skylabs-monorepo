import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Generic master list items (driver-types, education, eye-visions, health-docs,
// personal-docs, police-docs, source-types, statuses) — one shape, `category`
// baked in server-side per mount, never taken from the request body.
// ---------------------------------------------------------------------------

export const CreateMasterListItemSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(['Active', 'Inactive']).optional(),
  })
  .openapi('CreateMasterListItem');

export const UpdateMasterListItemSchema = CreateMasterListItemSchema.partial().openapi('UpdateMasterListItem');

// ---------------------------------------------------------------------------
// Vehicle types
// ---------------------------------------------------------------------------

export const CreateVehicleTypeSchema = z
  .object({
    name: z.string().min(1),
    code: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
  })
  .openapi('CreateVehicleType');

export const UpdateVehicleTypeSchema = CreateVehicleTypeSchema.partial().openapi('UpdateVehicleType');

// ---------------------------------------------------------------------------
// Service zones
// ---------------------------------------------------------------------------

export const CreateServiceZoneSchema = z
  .object({
    zoneName: z.string().min(1),
    zoneCode: z.string().min(1),
    stateId: z.number().int().optional(),
    cityId: z.number().int().optional(),
    areaName: z.string().optional(),
    pincode: z.string().optional(),
    zoneType: z.enum(['City', 'Area', 'Pincode', 'Custom']).optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    radiusKm: z.number().optional(),
    boundaryData: z.string().optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    notes: z.string().optional(),
  })
  .openapi('CreateServiceZone');

export const UpdateServiceZoneSchema = CreateServiceZoneSchema.partial().openapi('UpdateServiceZone');
