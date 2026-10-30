import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryPanel } from './summary-panel';

describe('SummaryPanel', () => {
  it('is a region named by its h2 with rows and the total as a description list', () => {
    render(
      <SummaryPanel
        id="cart-summary"
        heading="Order Summary"
        meta="3 items"
        rows={[{ label: 'Subtotal (3 items)', value: '₹3,859' }]}
        total={{ label: 'Total', value: '₹3,859' }}
      />,
    );
    const region = screen.getByRole('region', { name: 'Order Summary' });
    const pairs = Array.from(region.querySelectorAll('dl > div')).map((row) => [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent]);
    expect(pairs).toEqual([
      ['Subtotal (3 items)', '₹3,859'],
      ['Total', '₹3,859'],
    ]);
    expect(region.querySelector('.summary-panel__total')).not.toBeNull();
    expect(region.querySelector('.summary-panel__meta')?.textContent).toBe('3 items');
  });

  it('renders the note and the actions, and leaves them out when not given', () => {
    const { unmount } = render(
      <SummaryPanel id="s" heading="Summary" total={{ label: 'Total', value: '₹1' }} note="Prices are checked at checkout." actions={<button type="button">Checkout</button>} />,
    );
    expect(screen.getByText('Prices are checked at checkout.').tagName).toBe('P');
    expect(screen.getByRole('button', { name: 'Checkout' }).closest('.summary-panel__actions')).not.toBeNull();
    unmount();
    render(<SummaryPanel id="s" heading="Summary" total={{ label: 'Total', value: '₹1' }} />);
    expect(document.querySelector('.summary-panel__note')).toBeNull();
    expect(document.querySelector('.summary-panel__actions')).toBeNull();
  });

  it('heads the region with an h3 when nested under a section heading', () => {
    render(<SummaryPanel id="o" as="h3" heading="Order ORD-1" total={{ label: 'Total', value: '₹1' }} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Order ORD-1' }).id).toBe('o');
    expect(screen.getByRole('region', { name: 'Order ORD-1' })).toBeTruthy();
  });
});
