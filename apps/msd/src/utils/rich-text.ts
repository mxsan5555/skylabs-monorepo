/**
 * Plain-text extraction from a `<sky-rich-text-editor>` HTML value — for anything that must
 * never render markup (meta description, JSON-LD `description`, breadcrumb schema). The real
 * on-page content still renders the HTML directly (`dangerouslySetInnerHTML`): the value already
 * passed through msd-api's `sanitizeRichText` allow-list at save time (see that module's own
 * doc comment), so this is plain-text derivation for a different consumer, not a trust
 * boundary — this file never needs its own HTML sanitizer.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
