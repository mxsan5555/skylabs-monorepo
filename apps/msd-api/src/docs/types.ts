import { ZodTypeAny } from "zod";

export interface ModuleDefinition {
  tag: string;

  basePath: string;

  singular: string;

  plural: string;

  createSchema: ZodTypeAny;

  updateSchema: ZodTypeAny;

  paramsSchema: ZodTypeAny;

  querySchema: ZodTypeAny;

  responseSchema: ZodTypeAny;

  listResponseSchema: ZodTypeAny;

  deleteResponseSchema: ZodTypeAny;
}