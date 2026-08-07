import {
  CreateVendorSchema,
  UpdateVendorSchema,
  VendorParamsSchema,
  VendorQuerySchema,
  VendorResponseSchema,
  VendorListResponseSchema,
  DeleteVendorResponseSchema,
} from "./vendor.schema";

export const vendorModule = {
  tag: "Vendor",

  basePath: "/vendors",

  singular: "Vendor",

  plural: "Vendors",

  createSchema: CreateVendorSchema,

  updateSchema: UpdateVendorSchema,

  paramsSchema: VendorParamsSchema,

  querySchema: VendorQuerySchema,

  responseSchema: VendorResponseSchema,

  listResponseSchema: VendorListResponseSchema,

  deleteResponseSchema:
    DeleteVendorResponseSchema,
} as const;