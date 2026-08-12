/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import dts from 'vite-plugin-dts';
import * as path from 'path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/shared-menu',
  plugins: [
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md', 'src/*.json']),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
    }),
  ],
  build: {
    outDir: '../../dist/packages/shared-menu',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      entry: { index: 'src/index.ts' },
      formats: ['es'],
    },
  },
  test: {
    name: 'shared-menu',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/shared-menu',
      provider: 'v8' as const,
    },
  },
}));
