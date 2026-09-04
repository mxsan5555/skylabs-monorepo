/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import dts from 'vite-plugin-dts';
import * as path from 'path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/shared-auth',
  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
    }),
  ],
  build: {
    outDir: '../../dist/packages/shared-auth',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        react: 'src/react.ts',
        angular: 'src/angular.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Keep both frameworks external — each app supplies its own copy, and a given
      // app only ever imports one of ./react or ./angular, never both.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-router-dom',
        /^@angular\//,
        'rxjs',
      ],
    },
  },
  test: {
    name: 'shared-auth',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/shared-auth',
      provider: 'v8' as const,
    },
  },
}));
