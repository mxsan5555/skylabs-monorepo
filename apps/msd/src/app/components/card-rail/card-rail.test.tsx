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
});
