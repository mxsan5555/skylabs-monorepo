import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DealCard } from './deal-card';

describe('DealCard', () => {
  it('loads the first gallery image at once and the rest lazily, all decoded async', () => {
    render(
      <DealCard
        deal={{ id: 'd1', title: 'Hot Stone', image: 'a.jpg', imageAlt: 'Hot Stone', gallery: ['a.jpg', 'b.jpg'], price: 999 }}
        favoriteActive={false}
        onFavorite={() => undefined}
      />,
    );
    const imgs = Array.from(document.querySelectorAll('img'));
    expect(imgs).toHaveLength(2);
    // The first slide is the card face, so it loads eagerly; later slides wait until shown.
    expect(imgs.map((img) => img.getAttribute('loading'))).toEqual(['eager', 'lazy']);
    for (const img of imgs) expect(img.getAttribute('decoding')).toBe('async');
  });
});
