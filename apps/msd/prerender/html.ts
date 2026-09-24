import { PRERENDER_SCRIPT_ID, type PrerenderPayload } from '../src/prerender-data/prerender-data';

/** Head tags React 19 hoists to the start of `renderToString` output. JSON-LD scripts are not
 *  matched and stay in the body. */
const HEAD_TAG = /<title>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*\brel="canonical"[^>]*>/g;

/** Inline JSON safe inside <script>: no `</script>` or `<!--` can close or confuse it. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\u003c');

/** Fills the client build's index.html with one prerendered route. */
export function assembleHtml(template: string, { appHtml, payload }: { appHtml: string; payload: PrerenderPayload }): string {
  const headTags = appHtml.match(HEAD_TAG) ?? [];
  const body = appHtml.replace(HEAD_TAG, '');
  const data = `<script type="application/json" id="${PRERENDER_SCRIPT_ID}">${scriptJson(payload)}</script>`;
  // Function replacers: `$` in page content must not be read as a replacement pattern.
  return template
    .replace('</head>', () => `${headTags.join('')}</head>`)
    .replace('<div id="root"></div>', () => `<div id="root" data-prerendered>${body}</div>`)
    .replace('</body>', () => `${data}</body>`);
}
