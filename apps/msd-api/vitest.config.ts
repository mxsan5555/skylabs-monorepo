/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// msd-api itself builds with webpack (see webpack.config.js) — this config exists
// solely so @nx/vitest can infer a `test` target; it never builds the app.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/msd-api',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'msd-api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/msd-api',
      provider: 'v8' as const,
    },
  },
}));
