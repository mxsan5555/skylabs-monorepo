import {
  CreateServiceSchema,
  UpdateServiceSchema,
  ServiceParamsSchema,
  ServiceQuerySchema,
  ServiceResponseSchema,
  ServiceListResponseSchema,
  DeleteServiceResponseSchema,
} from "./service.schema";

export const serviceModule = {
  tag: "Service",

  basePath: "/services",

  singular: "Service",

  plural: "Services",

  createSchema: CreateServiceSchema,

  updateSchema: UpdateServiceSchema,

  paramsSchema: ServiceParamsSchema,

  querySchema: ServiceQuerySchema,

  responseSchema: ServiceResponseSchema,

  listResponseSchema: ServiceListResponseSchema,

  deleteResponseSchema:
    DeleteServiceResponseSchema,
} as const;