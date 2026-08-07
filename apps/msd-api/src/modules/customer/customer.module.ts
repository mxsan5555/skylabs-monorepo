import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
  CustomerParamsSchema,
  CustomerQuerySchema,
  CustomerResponseSchema,
  CustomerListResponseSchema,
  DeleteCustomerResponseSchema,
} from "./customer.schema";

export const customerModule = {
  tag: "Customer",

  basePath: "/customers",

  singular: "Customer",

  plural: "Customers",

  createSchema: CreateCustomerSchema,

  updateSchema: UpdateCustomerSchema,

  paramsSchema: CustomerParamsSchema,

  querySchema: CustomerQuerySchema,

  responseSchema: CustomerResponseSchema,

  listResponseSchema: CustomerListResponseSchema,

  deleteResponseSchema:
    DeleteCustomerResponseSchema,
} as const;

