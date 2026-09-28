import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
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

  it('wraps the track in a tabpanel when given a panel', () => {
    render(
      <MemoryRouter>
        <CardRail id="rail-heading" heading="Deals" seeAll="See all" seeAllTo="/explore" panel={{ id: 'deals-panel', labelledBy: 'deals-tab-all' }}>
          <swiper-slide>one</swiper-slide>
        </CardRail>
      </MemoryRouter>,
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('deals-panel');
    expect(panel.getAttribute('aria-labelledby')).toBe('deals-tab-all');
    expect(panel.querySelector('swiper-container')).toBeTruthy();
  });

  it('renders no tabpanel without a panel', () => {
    renderRail();
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('moves the carousel with the previous/next buttons', () => {
    renderRail();
    const swiper = { slidePrev: vi.fn(), slideNext: vi.fn() };
    Object.assign(document.querySelector('swiper-container') as HTMLElement, { swiper });
    fireEvent.click(document.querySelector('[aria-label="Previous: Deals near you"]') as Element);
    fireEvent.click(document.querySelector('[aria-label="Next: Deals near you"]') as Element);
    expect(swiper.slidePrev).toHaveBeenCalledTimes(1);
    expect(swiper.slideNext).toHaveBeenCalledTimes(1);
  });
});
