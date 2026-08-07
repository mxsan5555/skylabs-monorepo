import {
  CreateWishlistSchema,
  UpdateWishlistSchema,
  WishlistParamsSchema,
  WishlistQuerySchema,
  WishlistResponseSchema,
  WishlistListResponseSchema,
  DeleteWishlistResponseSchema,
} from "./wishlist.schema";

export const wishlistModule = {
  tag: "Wishlist",

  basePath: "/wishlists",

  singular: "Wishlist",

  plural: "Wishlists",

  createSchema: CreateWishlistSchema,

  updateSchema: UpdateWishlistSchema,

  paramsSchema: WishlistParamsSchema,

  querySchema: WishlistQuerySchema,

  responseSchema: WishlistResponseSchema,

  listResponseSchema: WishlistListResponseSchema,

  deleteResponseSchema:
    DeleteWishlistResponseSchema,
} as const;