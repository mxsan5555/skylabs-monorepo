/** SSR bundle input for prerender.ts: the server render and loaders plus the pure prerender
 *  helpers. They go through Vite because app modules read `import.meta.env` at import time,
 *  which plain Node (tsx) does not provide. */
export * from '../src/entry-server';
export { buildRoutes, isEmptyCityPage, STATIC_PUBLIC_PATHS, type PrerenderRoute } from './routes';
export { assembleHtml } from './html';
export { llmsTxt, robotsTxt, sitemapXml } from './crawler-files';
export { categoryDataKey } from '../src/prerender-data/prerender-data';
