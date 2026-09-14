const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

// Keep the generated Prisma client (and its native query-engine `.node` binary) OUT of the webpack
// bundle. Webpack can't bundle the native engine, and Prisma locates that engine relative to the
// client's OWN folder at query time — bundling makes that resolution depend on the source tree
// sitting beside the artifact. Instead we rewrite every `../generated/prisma-client` import to a
// runtime `require('./generated/prisma-client')` (resolved next to the emitted main.js) and copy
// that whole folder there via `assets`, so `node dist/apps/msd-api/main.js` is self-contained.
//
// This runs as a plugin (not a top-level `externals` key) because NxAppWebpackPlugin overwrites
// `externals` for the node target; appending in a later plugin's apply() survives that.
class ExternalizePrismaClientPlugin {
  apply(compiler) {
    const mine = ({ request }, callback) =>
      request && /generated[\\/]prisma-client/.test(request)
        ? callback(null, 'commonjs ./generated/prisma-client')
        : callback();
    const existing = compiler.options.externals;
    compiler.options.externals = Array.isArray(existing)
      ? [...existing, mine]
      : existing
        ? [existing, mine]
        : [mine];
  }
}

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/msd-api'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [
        './src/assets',
        {
          input: 'apps/msd-api/src/generated/prisma-client',
          glob: '**/*',
          output: 'generated/prisma-client',
        },
      ],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
    new ExternalizePrismaClientPlugin(),
  ],
};
