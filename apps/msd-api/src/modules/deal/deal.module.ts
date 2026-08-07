import {
  CreateDealSchema,
  UpdateDealSchema,
  DealParamsSchema,
  DealQuerySchema,
  DealResponseSchema,
  DealListResponseSchema,
  DeleteDealResponseSchema,
} from "./deal.schema";

export const dealModule = {
  tag: "Deal",

  basePath: "/deals",

  singular: "Deal",

  plural: "Deals",

  createSchema: CreateDealSchema,

  updateSchema: UpdateDealSchema,

  paramsSchema: DealParamsSchema,

  querySchema: DealQuerySchema,

  responseSchema: DealResponseSchema,

  listResponseSchema: DealListResponseSchema,

  deleteResponseSchema:
    DeleteDealResponseSchema,
} as const;