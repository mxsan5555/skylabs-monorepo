import { ZodObject, ZodPipe, ZodTypeAny } from "zod";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

type CrudRouteSchema = ZodObject | ZodPipe;

export interface CrudOpenApiOptions {
  registry: OpenAPIRegistry;

  tag: string;

  basePath: string;

  singular: string;

  plural: string;

  createSchema: ZodTypeAny;

  updateSchema: ZodTypeAny;

  paramsSchema: CrudRouteSchema;

  querySchema: CrudRouteSchema;

  responseSchema: ZodTypeAny;

  listResponseSchema: ZodTypeAny;

  deleteResponseSchema: ZodTypeAny;
}

export function registerCrudOpenApi(
  options: CrudOpenApiOptions
) {
  const {
    registry,
    tag,
    basePath,
    singular,
    plural,
    createSchema,
    updateSchema,
    paramsSchema,
    querySchema,
    responseSchema,
    listResponseSchema,
    deleteResponseSchema,
  } = options;

  /**
   * ==========================================================
   * GET ALL
   * ==========================================================
   */

  registry.registerPath({
    method: "get",

    path: basePath,

    tags: [tag],

    summary: `Get ${plural}`,

    description:
      `Returns paginated list of ${plural.toLowerCase()}.`,

    request: {
      query: querySchema,
    },

    responses: {
      200: {
        description:
          `${plural} fetched successfully.`,

        content: {
          "application/json": {
            schema: listResponseSchema,
          },
        },
      },

      400: {
        description: "Bad Request",
      },

      500: {
        description: "Internal Server Error",
      },
    },
  });

  /**
   * ==========================================================
   * GET BY ID
   * ==========================================================
   */

  registry.registerPath({
    method: "get",

    path: `${basePath}/{id}`,

    tags: [tag],

    summary: `Get ${singular}`,

    description:
      `Returns a single ${singular.toLowerCase()}.`,

    request: {
      params: paramsSchema,
    },

    responses: {
      200: {
        description:
          `${singular} fetched successfully.`,

        content: {
          "application/json": {
            schema: responseSchema,
          },
        },
      },

      404: {
        description:
          `${singular} not found.`,
      },

      500: {
        description:
          "Internal Server Error",
      },
    },
  });

  /**
   * ==========================================================
   * CREATE
   * ==========================================================
   */

  registry.registerPath({
    method: "post",

    path: basePath,

    tags: [tag],

    summary: `Create ${singular}`,

    description:
      `Creates a new ${singular.toLowerCase()}.`,

    request: {
      body: {
        required: true,

        description:
          `${singular} payload`,

        content: {
          "application/json": {
            schema: createSchema,
          },
        },
      },
    },

    responses: {
      201: {
        description:
          `${singular} created successfully.`,

        content: {
          "application/json": {
            schema: responseSchema,
          },
        },
      },

      400: {
        description:
          "Validation failed.",
      },

      409: {
        description:
          `${singular} already exists.`,
      },

      500: {
        description:
          "Internal Server Error.",
      },
    },
  });

  /**
   * ==========================================================
   * UPDATE
   * ==========================================================
   */

  registry.registerPath({
    method: "put",

    path: `${basePath}/{id}`,

    tags: [tag],

    summary: `Update ${singular}`,

    description:
      `Updates an existing ${singular.toLowerCase()}.`,

    request: {
      params: paramsSchema,

      body: {
        required: true,

        description:
          `${singular} payload`,

        content: {
          "application/json": {
            schema: updateSchema,
          },
        },
      },
    },

    responses: {
      200: {
        description:
          `${singular} updated successfully.`,

        content: {
          "application/json": {
            schema: responseSchema,
          },
        },
      },

      400: {
        description:
          "Validation failed.",
      },

      404: {
        description:
          `${singular} not found.`,
      },

      500: {
        description:
          "Internal Server Error.",
      },
    },
  });

  /**
   * ==========================================================
   * DELETE
   * ==========================================================
   */

  registry.registerPath({
    method: "delete",

    path: `${basePath}/{id}`,

    tags: [tag],

    summary: `Delete ${singular}`,

    description:
      `Deletes an existing ${singular.toLowerCase()}.`,

    request: {
      params: paramsSchema,
    },

    responses: {
      200: {
        description:
          `${singular} deleted successfully.`,

        content: {
          "application/json": {
            schema: deleteResponseSchema,
          },
        },
      },

      404: {
        description:
          `${singular} not found.`,
      },

      500: {
        description:
          "Internal Server Error.",
      },
    },
  });
}