import { prisma } from '../lib/prisma';
import { VendorApplicationCreateSchema } from '../schemas/vendor.schema';
import type { z } from 'zod';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';

export type VendorApplicationInput = z.infer<typeof VendorApplicationCreateSchema>;

const APPLICATION_SUCCESS_MESSAGE =
  'Your application has been submitted successfully. Our team will review it and contact you.';

export async function createVendorApplication(input: VendorApplicationInput) {
  const data = {
    businessName: input.businessName.trim(),
    businessEmail: input.businessEmail.trim().toLowerCase(),
    businessPhone: normalizeIdentifier(input.businessPhone),
    ownerFirstName: input.ownerFirstName.trim(),
    ownerLastName: input.ownerLastName.trim(),
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    ownerMobile: normalizeIdentifier(input.ownerMobile),
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    pincode: input.pincode.trim(),
  };

  const application = await prisma.vendorApplication.create({
    data,
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    id: application.id,
    status: application.status,
    message: APPLICATION_SUCCESS_MESSAGE,
    createdAt: application.createdAt.toISOString(),
  };
}
