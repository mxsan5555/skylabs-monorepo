// IMPORTANT: Zod OpenAPI extension must be loaded first.
import "./zod";

import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "../docs/registry";

// This executes module.openapi.ts.
// module.openapi.ts registers Category + SubCategory.
import "../docs/module.openapi";

const generator = new OpenApiGeneratorV3(
  registry.definitions
);

export const openApiDocument = generator.generateDocument({
  openapi: "3.0.0",

  info: {
    title: "MySpa Deal API",
    version: "1.0.0",
    description: "API Documentation for MySpa Deal",
  },

  servers: [
    {
      url: "http://localhost:3333",
      description: "Development Server",
    },
  ],
});