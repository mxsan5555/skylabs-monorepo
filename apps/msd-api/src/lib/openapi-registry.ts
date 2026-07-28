import { z } from 'zod';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export function mountDocs(app: Express): void {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const document = generator.generateDocument({
    openapi: '3.0.0',
    info: { title: 'msd-api', version: '1.0.0', description: 'Auth API for the msd (massage deals) frontend' },
    servers: [{ url: '/api' }],
  });

  app.get('/api/openapi.json', (_req, res) => res.json(document));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(document));
}
