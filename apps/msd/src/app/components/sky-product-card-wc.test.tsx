import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SkyProductCardWC } from './sky-product-card-wc';

describe('SkyProductCardWC', () => {
  it('forwards string and boolean props as the kebab-case attributes Lit maps', () => {
    const { container } = render(
      <SkyProductCardWC
        imageAlt="x"
        eyebrowHref="/v"
        originalPrice="₹999"
        priceNote="60 min"
        pricePrefix="From"
        tagIcon="bolt"
        scoreLabel="Great"
        favoriteActive
        heading="H"
      />,
    );
    const card = container.querySelector('sky-product-card') as Element;
    expect(card.getAttribute('image-alt')).toBe('x');
    expect(card.getAttribute('eyebrow-href')).toBe('/v');
    expect(card.getAttribute('original-price')).toBe('₹999');
    expect(card.getAttribute('price-note')).toBe('60 min');
    expect(card.getAttribute('price-prefix')).toBe('From');
    expect(card.getAttribute('tag-icon')).toBe('bolt');
    expect(card.getAttribute('score-label')).toBe('Great');
    expect(card.getAttribute('favorite-active')).toBe('');
    expect(card.getAttribute('heading')).toBe('H');
  });

  it('omits a false boolean attribute', () => {
    const { container } = render(<SkyProductCardWC favoriteActive={false} />);
    expect(container.querySelector('sky-product-card')?.hasAttribute('favorite-active')).toBe(false);
  });

  it('serializes kebab-case attributes under renderToString', () => {
    const html = renderToString(<SkyProductCardWC imageAlt="x" />);
    expect(html).toContain('image-alt="x"');
    expect(html).not.toContain('imagealt');
  });
});
