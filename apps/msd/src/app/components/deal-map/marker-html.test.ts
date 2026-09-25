import { describe, it, expect } from 'vitest';
import { markerHtml } from './marker-html';

describe('markerHtml', () => {
  it('renders an escaped, labelled link', () => {
    const html = markerHtml({ id: '1', lat: 0, lng: 0, label: '₹999', title: 'Spa <b>&</b> "Co"', href: '/deal/1' });
    expect(html).toBe(
      '<a class="deal-map__marker label-large" href="/deal/1" aria-label="Spa &lt;b&gt;&amp;&lt;/b&gt; &quot;Co&quot;, ₹999">₹999</a>',
    );
  });
});
