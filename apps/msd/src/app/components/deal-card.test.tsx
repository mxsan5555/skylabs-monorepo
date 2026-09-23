import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DealCard } from './deal-card';

describe('DealCard', () => {
  it('lazy-loads and async-decodes every gallery image', () => {
    render(
      <DealCard
        deal={{ id: 'd1', title: 'Hot Stone', image: 'a.jpg', imageAlt: 'Hot Stone', gallery: ['a.jpg', 'b.jpg'], price: 999 }}
      />,
    );
    const imgs = Array.from(document.querySelectorAll('img'));
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
    }
  });
});
