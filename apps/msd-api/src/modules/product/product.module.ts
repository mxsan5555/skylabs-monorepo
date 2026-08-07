import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductParamsSchema,
  ProductQuerySchema,
  ProductResponseSchema,
  ProductListResponseSchema,
  DeleteProductResponseSchema,
} from "./product.schema";

export const productModule = {
  tag: "Product",

  basePath: "/products",

  singular: "Product",

  plural: "Products",

  createSchema: CreateProductSchema,

  updateSchema: UpdateProductSchema,

  paramsSchema: ProductParamsSchema,

  querySchema: ProductQuerySchema,

  responseSchema: ProductResponseSchema,

  listResponseSchema: ProductListResponseSchema,

  deleteResponseSchema:
    DeleteProductResponseSchema,
} as const;