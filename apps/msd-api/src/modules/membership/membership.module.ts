import {
  CreateMembershipSchema,
  UpdateMembershipSchema,
  MembershipParamsSchema,
  MembershipQuerySchema,
  MembershipResponseSchema,
  MembershipListResponseSchema,
  DeleteMembershipResponseSchema,
} from "./membership.schema";

export const membershipModule = {
  tag: "Membership",

  basePath: "/memberships",

  singular: "Membership",

  plural: "Memberships",

  createSchema: CreateMembershipSchema,

  updateSchema: UpdateMembershipSchema,

  paramsSchema: MembershipParamsSchema,

  querySchema: MembershipQuerySchema,

  responseSchema: MembershipResponseSchema,

  listResponseSchema: MembershipListResponseSchema,

  deleteResponseSchema:
    DeleteMembershipResponseSchema,
} as const;