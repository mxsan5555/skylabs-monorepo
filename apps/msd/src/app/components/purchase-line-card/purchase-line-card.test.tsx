import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { PurchaseLine } from '../../../utils/cart-items';
import { PurchaseLineCard } from './purchase-line-card';

const LINE: PurchaseLine = {
  id: 'l1',
  kind: 'Deal',
  title: 'Repair Hair Treatment',
  duration: '90 min',
  memberId: 'm1',
  memberName: 'UrbanGlow Beauty & Care',
  branchName: 'Connaught Place',
  image: 'https://img.example/hair.jpg',
  href: '/deal/repair-hair-treatment',
  quantity: 2,
  total: 6160,
};

const renderCard = (line: PurchaseLine = LINE, extra: Partial<Parameters<typeof PurchaseLineCard>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ul>
        <PurchaseLineCard line={line} {...extra} />
      </ul>
    </MemoryRouter>,
  );

/** Item 2: one card per line in the cart and at checkout, the member's name inside it. */
describe('PurchaseLineCard', () => {
  it('shows the type, title, member, branch, duration, quantity and price in one card', () => {
    renderCard();
    const card = screen.getByRole('listitem');
    expect(card.textContent).toContain('Deal');
    expect(card.textContent).toContain('Repair Hair Treatment');
    expect(card.textContent).toContain('UrbanGlow Beauty & Care');
    expect(card.textContent).toContain('Connaught Place');
    expect(card.textContent).toContain('90 min');
    expect(card.textContent).toContain('× 2');
    expect(card.textContent).toContain('₹6,160');
  });

  it('opens the detail page in a new tab from the title and the image, and says so', () => {
    renderCard();
    const title = screen.getByRole('link', { name: /Repair Hair Treatment/ });
    expect(title.getAttribute('href')).toBe('/deal/repair-hair-treatment');
    expect(title.getAttribute('target')).toBe('_blank');
    expect(title.getAttribute('rel')).toBe('noopener noreferrer');
    expect(title.textContent).toContain('(opens in a new tab)');
    const imageLink = document.querySelector('a.purchase-line__media') as HTMLAnchorElement;
    expect(imageLink.getAttribute('href')).toBe('/deal/repair-hair-treatment');
    expect(imageLink.getAttribute('tabindex')).toBe('-1');
    expect(imageLink.getAttribute('aria-hidden')).toBe('true');
  });

  it('is plain text without a detail page and without an image', () => {
    renderCard({ ...LINE, href: null, image: null });
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders the slots for the cart: selection, quantity and actions', () => {
    renderCard(LINE, {
      select: <input type="checkbox" aria-label="Select Repair Hair Treatment" />,
      quantity: <span>qty</span>,
      actions: <button type="button">Move to wishlist</button>,
    });
    expect(screen.getByRole('checkbox', { name: 'Select Repair Hair Treatment' })).toBeTruthy();
    expect(screen.getByText('qty')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move to wishlist' })).toBeTruthy();
    expect(screen.getByRole('listitem').textContent).not.toContain('× 2');
  });
});
