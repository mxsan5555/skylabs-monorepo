import { categoryHref } from '../src/catalog/catalog-shell';
import content from '../src/content.json';
import type { ShellData } from '../src/prerender-data/loaders';

const PRIVATE_PATHS = ['/account', '/my-account', '/cart', '/checkout', '/orders', '/sign-in', '/otp', '/wishlist', '/choose-experience'];

export function robotsTxt(siteUrl: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** `lastmod` is a W3C date, e.g. 2026-09-24. */
export function sitemapXml(siteUrl: string, paths: readonly string[], lastmod: string): string {
  const urls = paths.map((p) => `  <url><loc>${xmlEscape(siteUrl + p)}</loc><lastmod>${lastmod}</lastmod></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

const LLMS_PAGES: [string, string][] = [
  ['Home', '/'],
  ['Explore deals', '/explore'],
  ['How it works', '/how-it-works'],
  ['About', '/about'],
  ['Contact', '/contact'],
  ['Become a vendor', '/become-vendor'],
];

/** llms.txt (https://llmstxt.org): name, summary, then link lists. */
export function llmsTxt(siteUrl: string, shell: ShellData): string {
  const { fullName, tagline, description } = content.site;
  return [
    `# ${fullName}`,
    '',
    `> ${fullName}, ${tagline}. ${description}`,
    '',
    ...(shell.categories.length
      ? ['## Categories', '', ...shell.categories.map((c) => `- [${c.name}](${siteUrl}${categoryHref(c.slug)})`), '']
      : []),
    '## Pages',
    '',
    ...LLMS_PAGES.map(([name, path]) => `- [${name}](${siteUrl}${path})`),
    '',
  ].join('\n');
}
