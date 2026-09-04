import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/** Multipart file bodies (upload/replace image or video) are validated by multer +
 *  media-validation.service.ts, not Zod — this schema only covers the one JSON-body request in
 *  the media-upload system: reordering an entity's existing images. */
export const MediaReorderSchema = z
  .object({ imageIds: z.array(z.string().uuid()).min(1) })
  .openapi('MediaReorder');
