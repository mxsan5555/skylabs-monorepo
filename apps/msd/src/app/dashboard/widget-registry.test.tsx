import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY } from './widget-registry';

/**
 * WIDGET_REGISTRY is a plain lookup map keyed by `WidgetConfig.key`; the "unknown
 * key renders nothing" contract actually lives one level up, in
 * pages/account/dashboard.tsx's `const Widget = WIDGET_REGISTRY[key]; if (!Widget)
 * return null;` — exercised here directly against the registry, since that's the
 * exact lookup pattern the dashboard page uses.
 */
function renderFromRegistry(key: string) {
  const Widget = WIDGET_REGISTRY[key];
  if (!Widget) return null;
  return <Widget title={`Title for ${key}`} />;
}

describe('WIDGET_REGISTRY', () => {
  it('maps every documented widget key to a component', () => {
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual(['customers-count', 'orders-recent', 'revenue-summary']);
  });

  it('renders the component for a known widget key ("customers-count")', () => {
    render(<>{renderFromRegistry('customers-count')}</>);
    expect(screen.getByRole('heading', { name: 'Title for customers-count' })).toBeTruthy();
    expect(screen.getByText('1,284')).toBeTruthy();
  });

  it('renders the component for a known widget key ("orders-recent")', () => {
    render(<>{renderFromRegistry('orders-recent')}</>);
    expect(screen.getByText(/Deep tissue massage/)).toBeTruthy();
  });

  it('renders the component for a known widget key ("revenue-summary")', () => {
    render(<>{renderFromRegistry('revenue-summary')}</>);
    expect(screen.getByText('₹4.2L')).toBeTruthy();
  });

  // Edge cases
  it('has no entry (undefined) for an unknown widget key', () => {
    expect(WIDGET_REGISTRY['not-a-real-widget']).toBeUndefined();
  });

  it('renders nothing for an unknown widget key, following the dashboard page lookup pattern', () => {
    const { container } = render(<>{renderFromRegistry('not-a-real-widget')}</>);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an empty-string widget key', () => {
    const { container } = render(<>{renderFromRegistry('')}</>);
    expect(container.innerHTML).toBe('');
  });
});
