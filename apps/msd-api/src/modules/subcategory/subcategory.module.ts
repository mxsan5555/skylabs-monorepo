import {
  CreateSubCategorySchema,
  UpdateSubCategorySchema,
  SubCategoryParamsSchema,
  SubCategoryQuerySchema,
  SubCategoryResponseSchema,
  SubCategoryListResponseSchema,
  DeleteSubCategoryResponseSchema,
} from "./subcategory.schema";

export const subcategoryModule = {
  tag: "SubCategory",

  basePath: "/subcategories",

  singular: "SubCategory",

  plural: "SubCategories",

  createSchema: CreateSubCategorySchema,

  updateSchema: UpdateSubCategorySchema,

  paramsSchema: SubCategoryParamsSchema,

  querySchema: SubCategoryQuerySchema,

  responseSchema: SubCategoryResponseSchema,

  listResponseSchema: SubCategoryListResponseSchema,

  deleteResponseSchema: DeleteSubCategoryResponseSchema,
} as const;
