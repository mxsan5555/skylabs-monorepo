/**
 * Build-time prerender for the msd storefront (`npx nx run msd:prerender`, after `msd:build`).
 *
 * Builds an SSR bundle of `server-entry.ts`, fetches catalog data from PRERENDER_API_URL, renders
 * `/`, every `/category/<slug>` and every deal-category `/category/<slug>/<city>` into
 * `dist/apps/msd/<route>/index.html`, keeps the untouched template as `spa.html` (served at `/spa` under vercel.json's
 * `cleanUrls`, which is the SPA rewrite's destination) for the SPA
 * rewrite, and writes sitemap.xml, robots.txt and llms.txt. An unreachable API skips the
 * prerender (the SPA still serves every route) and exits 0, except on a Vercel production build
 * (`VERCEL_ENV=production`), which exits 1 when the API is down or nothing rendered unless
 * `PRERENDER_ALLOW_EMPTY=1` (see `./build-policy.ts`). Every data load is bounded by
 * `PRERENDER_TIMEOUT_MS` (default 15000ms, see `withTimeout` in `./timeout.ts`): a timed-out
 * shell load counts as "API unreachable" (crawler files still get written); a timed-out route
 * is skipped with a warning and the rest of the run continues.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrerenderPayload } from '../src/prerender-data/prerender-data';
import { withTimeout } from './timeout';
import { shouldFailBuild } from './build-policy';

type ServerBundle = typeof import('./server-entry');

const ROOT = process.cwd(); // nx run-commands runs from the workspace root
const APP_DIR = resolve(ROOT, 'apps/msd');
const OUT_DIR = resolve(ROOT, 'dist/apps/msd');
const SSR_DIR = resolve(ROOT, 'dist/apps/msd-ssr');

// Per-route data-load budget: a hanging PRERENDER_API_URL must not stall the Vercel build.
const DEFAULT_TIMEOUT_MS = 15000;
const timeoutMs = (() => {
  const raw = Number(process.env.PRERENDER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
})();

const log = (msg: string) => console.log(`[prerender] ${msg}`);
const warn = (msg: string) => console.warn(`[prerender] WARN ${msg}`);

/** `/` -> index.html, `/category/a/b` -> category/a/b/index.html. */
const outFile = (path: string) => join(OUT_DIR, ...path.split('/').filter(Boolean), 'index.html');

function write(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

async function main() {
  const { build, loadEnv } = await import('vite');
  const env = { ...loadEnv('production', APP_DIR, ''), ...process.env };
  const apiUrl = env.PRERENDER_API_URL || env.VITE_API_URL || '';
  const siteUrl = (env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
  if (!existsSync(join(OUT_DIR, 'index.html'))) throw new Error(`missing ${OUT_DIR}/index.html; run msd:build first`);

  // The template is the client build's index.html; spa.html keeps an untouched copy for the SPA
  // rewrite (and is the template on a re-run, when index.html is already prerendered).
  const spaFile = join(OUT_DIR, 'spa.html');
  const indexHtml = readFileSync(join(OUT_DIR, 'index.html'), 'utf8');
  if (!indexHtml.includes('data-prerendered')) copyFileSync(join(OUT_DIR, 'index.html'), spaFile);
  const template = readFileSync(spaFile, 'utf8');

  // Vite inlines import.meta.env at build time, so the API and site URLs go in before the build.
  process.env.VITE_API_URL = apiUrl;
  process.env.VITE_SITE_URL = siteUrl;
  log(`SSR build (api ${apiUrl || '(none)'}, site ${siteUrl || '(none)'}, timeout ${timeoutMs}ms)`);
  await build({
    configFile: join(APP_DIR, 'vite.config.mts'),
    mode: 'production',
    logLevel: 'warn',
    ssr: { noExternal: true },
    build: {
      ssr: 'prerender/server-entry.ts',
      outDir: '../../dist/apps/msd-ssr', // relative to the app root (nx copy-assets joins it)
      emptyOutDir: true,
      rollupOptions: { output: { format: 'es', entryFileNames: '[name].mjs' } },
    },
  });
  const bundle = (await import(pathToFileURL(join(SSR_DIR, 'server-entry.mjs')).href)) as ServerBundle;

  let shell: Awaited<ReturnType<typeof bundle.loadShellData>> = { categories: [], locations: [], socialLinks: [] };
  let apiDown: boolean;
  try {
    shell = await withTimeout(bundle.loadShellData(), timeoutMs, 'shell');
    apiDown = !shell.categories.length && !shell.locations.length && !shell.socialLinks.length;
  } catch (err) {
    apiDown = true;
    warn(`shell data load failed (${(err as Error).message}) from ${apiUrl || '(no API URL)'}`);
  }
  const rendered: string[] = [];
  let homeHtml: string | undefined;

  if (apiDown) {
    warn(`no catalog data from ${apiUrl || '(no API URL)'}; skipping prerender, the SPA serves every route`);
  } else {
    for (const route of bundle.buildRoutes(shell)) {
      let payload: PrerenderPayload;
      try {
        if (!route.slug) {
          payload = { shell, home: await withTimeout(bundle.loadHomeData(), timeoutMs, route.path) };
        } else {
          const data = await withTimeout(bundle.loadCategoryData(route.slug, route.city, route.state), timeoutMs, route.path);
          if (!data.category) {
            warn(`${route.path}: category not found, skipped`);
            continue;
          }
          payload = { shell, [bundle.categoryDataKey(route.slug, route.city)]: data };
        }
      } catch (err) {
        warn(`${route.path}: data load failed (${(err as Error).message}), skipped`);
        continue;
      }
      let appHtml: string;
      try {
        appHtml = bundle.render(route.path, payload);
      } catch (err) {
        console.error(`[prerender] render failed for ${route.path}`);
        throw err;
      }
      const html = bundle.assembleHtml(template, { appHtml, payload });
      if (route.path === '/') homeHtml = html;
      else write(outFile(route.path), html);
      rendered.push(route.path);
    }
    // The home page replaces index.html only once every other route has been written.
    if (homeHtml) write(outFile('/'), homeHtml);
  }

  if (siteUrl) {
    const paths = [...new Set<string>([...bundle.STATIC_PUBLIC_PATHS, ...rendered])];
    write(join(OUT_DIR, 'sitemap.xml'), bundle.sitemapXml(siteUrl, paths, new Date().toISOString().slice(0, 10)));
    write(join(OUT_DIR, 'robots.txt'), bundle.robotsTxt(siteUrl));
    write(join(OUT_DIR, 'llms.txt'), bundle.llmsTxt(siteUrl, shell));
    log(`wrote sitemap.xml (${paths.length} URLs), robots.txt, llms.txt`);
  } else {
    warn('VITE_SITE_URL is not set; sitemap.xml, robots.txt and llms.txt need absolute URLs and were skipped');
  }
  log(`prerendered ${rendered.length} routes`);

  const failure = shouldFailBuild({
    vercelEnv: env.VERCEL_ENV,
    rendered: rendered.length,
    apiDown,
    allowEmpty: env.PRERENDER_ALLOW_EMPTY === '1',
  });
  if (failure) throw new Error(`[prerender] ${failure}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
