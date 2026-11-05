import sanitizeHtml from 'sanitize-html';

/**
 * Server-side sanitization/plain-text extraction for `<sky-rich-text-editor>` (Quill-backed)
 * content — Deal/Product/Therapist long-form fields (description, notes, policy, terms). This
 * is the first place in this codebase that stores free-form HTML (CMS's `BlogBlockEditor` is
 * structured JSON rendered by trusted React components, never raw HTML, so it never needed
 * this) — `sanitize-html` is a new dependency for exactly that reason, not a second editor.
 *
 * The allow-list matches the editor's own toolbar exactly (see
 * `packages/shared-ui/src/components/sky-rich-text-editor/sky-rich-text-editor.ts`'s
 * INLINE_TOGGLES/BLOCK_TOGGLES/LIST_TOGGLES + link/image) — nothing the UI can't actually
 * produce is ever allowed through, so this can only ever strip an attack payload, never a
 * legitimate edit.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img'];
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt'],
};

/** Quill's own "empty" markup (`<p><br></p>`) — `sanitize-html` re-serializes `<br>` as
 *  `<br />`, so this matches either form — treated as no content. */
const EMPTY_HTML_PATTERN = /^(<p>(<br\s*\/?>)?<\/p>)?$/;

/** Strips any tag/attribute outside the editor's own toolbar (script/style/event handlers/
 *  unknown schemes included) and collapses Quill's "empty" markup to `null` — never stores
 *  `<p><br></p>` as if it were real content. Returns `null` (not `undefined`) for "no content",
 *  matching every other optional text field's DB representation in this schema. */
export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: { img: ['http', 'https'] },
  }).trim();
  return EMPTY_HTML_PATTERN.test(clean) ? null : clean;
}

/** Plain-text extraction (no tags at all) — for a length check against *meaningful* text rather
 *  than markup (a 300-char limit shouldn't be eaten by `<strong>`/`<p>` bytes), and for any
 *  consumer that must never render raw HTML (meta description, JSON-LD `description`, search
 *  snippets) — see this module's own doc comment. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    // Block-level tags (p/br/li/h2/h3) carry no visible whitespace of their own — without this,
    // "<p>A</p><p>B</p>" strips down to "AB", silently merging two lines into one word.
    textFilter: (text) => `${text} `,
  })
    .replace(/\s+/g, ' ')
    .trim();
}
