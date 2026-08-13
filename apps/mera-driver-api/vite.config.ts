/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Test-only Vite config — mera-driver-api is built via webpack (see project.json's
// `build` target), not Vite. This file exists solely so `@nx/vite`'s inferred `test`
// target picks up the project and runs its Vitest + Supertest suite.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/mera-driver-api',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'mera-driver-api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/mera-driver-api',
      provider: 'v8' as const,
    },
  },
}));
