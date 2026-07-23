/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import dts from 'vite-plugin-dts';
import * as path from 'path';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/shared-ui',
  plugins: [
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
    }),
  ],
  build: {
    outDir: '../../dist/packages/shared-ui',
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        react: 'src/react.ts',
        carousel: 'src/carousel.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Keep frameworks/peer deps external so each app supplies its own copy.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        /^lit($|\/)/,
        /^@lit\//,
        /^@material\/web($|\/)/,
        /^swiper($|\/)/,
      ],
    },
  },
  test: {
    name: 'shared-ui',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/shared-ui',
      provider: 'v8' as const,
    },
  },
}));
