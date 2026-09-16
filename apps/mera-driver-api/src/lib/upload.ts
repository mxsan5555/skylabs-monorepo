import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

// Resolved from process.cwd() (nx always runs the API from the workspace root), not
// __dirname — webpack bundles this file into a single dist output, which flattens
// __dirname to the bundle's location instead of this file's original source path.
export const UPLOAD_ROOT = path.join(process.cwd(), 'apps/mera-driver-api/uploads');

/** Disk storage for a given subfolder under `uploads/`, e.g. `drivers/<driverId>`. */
export function diskStorageFor(subfolderFromParams: (req: import('express').Request) => string) {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, subfolderFromParams(req));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}-${file.originalname}`);
    },
  });
}
