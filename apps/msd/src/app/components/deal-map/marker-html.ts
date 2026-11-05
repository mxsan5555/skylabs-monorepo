import type { DealMapPoint } from './types';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Marker markup for Leaflet's divIcon (an HTML string): one real link per deal, or plain text
 *  when the point has no `href`. */
export function markerHtml(point: DealMapPoint): string {
  const label = escapeHtml(point.label);
  if (!point.href) return `<span class="deal-map__marker deal-map__marker--static label-large">${label}</span>`;
  return `<a class="deal-map__marker label-large" href="${escapeHtml(point.href)}" aria-label="${escapeHtml(point.title)}, ${label}">${label}</a>`;
}
