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
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/msd-api',
      provider: 'v8' as const,
    },
  },
}));
