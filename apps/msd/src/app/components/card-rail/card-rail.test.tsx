import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { CardRail } from './card-rail';

const renderRail = () =>
  render(
    <MemoryRouter>
      <CardRail id="rail-heading" heading="Deals near you" seeAll="See all deals" seeAllTo="/explore">
        <swiper-slide>one</swiper-slide>
      </CardRail>
    </MemoryRouter>,
  );

describe('CardRail', () => {
  it('renders an h2 with the given id and a See all link named with its heading', () => {
    renderRail();
    expect(screen.getByRole('heading', { level: 2, name: 'Deals near you' }).id).toBe('rail-heading');
    const link = screen.getByRole('link', { name: 'See all deals: Deals near you' });
    expect(link.getAttribute('href')).toBe('/explore');
    expect(link.textContent).toContain('See all deals');
  });

  it('names the previous/next buttons from content', () => {
    renderRail();
    expect(document.querySelector('[aria-label="Previous: Deals near you"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Next: Deals near you"]')).toBeTruthy();
  });

  it('enables Swiper A11y on the track so keyboard focus scrolls the slide into view', () => {
    renderRail();
    const track = document.querySelector('swiper-container') as (HTMLElement & { a11y?: unknown }) | null;
    // React 19 assigns single-word custom-element props (matching a property on the element's
    // prototype, e.g. Swiper's `a11y`) as a JS property rather than reflecting an HTML attribute
    // (unlike hyphenated ones such as `grab-cursor`, which have no matching property name).
    expect(track?.a11y === 'true' || track?.getAttribute('a11y') === 'true').toBe(true);
  });
});
