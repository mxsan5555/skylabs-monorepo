import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPanel } from './status-panel';

describe('StatusPanel', () => {
  it('renders an h1 with its id, the text, and a decorative icon in the tone’s badge', () => {
    render(<StatusPanel id="result" icon="check_circle" tone="success" heading="Order confirmed" text="We emailed you." />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Order confirmed' });
    expect(h1.id).toBe('result');
    expect(screen.getByText('We emailed you.').tagName).toBe('P');
    expect(document.querySelector('.status-panel--success .status-panel__icon md-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lists facts as a description list, and leaves out empty facts, actions and footer', () => {
    const { unmount } = render(
      <StatusPanel id="r" icon="error" tone="error" heading="Failed" text="Pay again." facts={[{ label: 'Order number', value: 'ORD-1' }]} />,
    );
    const dl = document.querySelector('dl.status-panel__facts');
    expect(dl?.querySelector('dt')?.textContent).toBe('Order number');
    expect(dl?.querySelector('dd')?.textContent).toBe('ORD-1');
    expect(document.querySelector('.status-panel__actions')).toBeNull();
    unmount();
    render(<StatusPanel id="r" icon="error" tone="error" heading="Failed" text="Pay again." facts={[]} />);
    expect(document.querySelector('dl')).toBeNull();
  });

  it('renders actions and footer, and an h2 when asked', () => {
    render(
      <StatusPanel id="r" as="h2" icon="schedule" tone="neutral" heading="Waiting" text="Not paid." actions={<button type="button">Pay now</button>} footer={<a href="/contact">Help</a>} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Waiting' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay now' }).closest('.status-panel__actions')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Help' }).closest('.status-panel__footer')).not.toBeNull();
  });

  it('has a compact size for notices inside a page, with a smaller heading', () => {
    render(<StatusPanel id="n" as="h2" compact icon="info" tone="neutral" heading="Refund on its way" text="5 to 7 days." />);
    expect(document.querySelector('.status-panel')?.classList.contains('status-panel--compact')).toBe(true);
    expect(screen.getByRole('heading', { level: 2 }).className).toContain('title-large');
  });
});
