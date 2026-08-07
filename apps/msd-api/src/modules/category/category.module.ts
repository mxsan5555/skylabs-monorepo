import {
  CreateCategorySchema,
  UpdateCategorySchema,
  CategoryParamsSchema,
  CategoryQuerySchema,
  CategoryResponseSchema,
  CategoryListResponseSchema,
  DeleteCategoryResponseSchema,
} from "./category.schema";

export const categoryModule = {
  tag: "Category",

  basePath: "/categories",

  singular: "Category",

  plural: "Categories",

  createSchema: CreateCategorySchema,

  updateSchema: UpdateCategorySchema,

  paramsSchema: CategoryParamsSchema,

  querySchema: CategoryQuerySchema,

  responseSchema: CategoryResponseSchema,

  listResponseSchema: CategoryListResponseSchema,

  deleteResponseSchema: DeleteCategoryResponseSchema,
} as const;