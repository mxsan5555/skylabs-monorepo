/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Build/serve for msd-api are still handled by webpack (see webpack.config.js) — this
// config only exists so the @nx/vite plugin can infer a `test` target for Vitest+Supertest,
// the same pattern used by shared-permissions/shared-menu.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/msd-api',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'msd-api',
    watch: false,
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/msd_test',
      JWT_SECRET: 'test-only-jwt-secret-not-used-outside-vitest',
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}', 'prisma/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/msd-api',
      provider: 'v8' as const,
    },
  },
}));
