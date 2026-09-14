import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Loaded once, first thing, before any other module reads process.env. Mirrors msd-api's
// config/env.ts loader: apps/mera-driver-api/.env.local is never committed (see .gitignore);
// .env.example documents the shape.
//
// Try a couple of likely locations rather than trusting __dirname alone — under the Nx/webpack
// production build everything is bundled into a single dist/apps/mera-driver-api/main.js, which
// changes __dirname's depth. Never override already-set process.env vars: real deploys inject
// secrets via the platform (Railway), not this file.
if (process.env.NODE_ENV !== 'production') {
  const candidates = [
    path.join(__dirname, '../../.env.local'), // unbundled dev (src/config -> apps/mera-driver-api)
    path.join(process.cwd(), 'apps/mera-driver-api/.env.local'), // run from workspace root
    path.join(process.cwd(), '.env.local'), // run from apps/mera-driver-api itself
  ];
  const envFile = candidates.find((p) => fs.existsSync(p));
  if (envFile) dotenv.config({ path: envFile });
}
