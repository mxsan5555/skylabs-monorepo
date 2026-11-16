import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './quantity-stepper';

const labels = { decreaseLabel: 'Decrease quantity', increaseLabel: 'Increase quantity' };
const button = (name: string) => screen.getByLabelText(name) as HTMLElement & { disabled?: boolean };

describe('QuantityStepper', () => {
  it('is a named group with the value announced politely and an optional visible label', () => {
    render(<QuantityStepper value={2} onChange={vi.fn()} groupLabel="Quantity for Serum" label="Quantity" {...labels} />);
    const group = screen.getByRole('group', { name: 'Quantity for Serum' });
    expect(group.querySelector('output')?.textContent).toBe('2');
    expect(group.querySelector('output')?.getAttribute('aria-live')).toBe('polite');
    expect(group.textContent).toContain('Quantity');
  });

  it('steps down and up through onChange', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={2} onChange={onChange} groupLabel="Qty" {...labels} />);
    fireEvent.click(button('Decrease quantity'));
    fireEvent.click(button('Increase quantity'));
    expect(onChange.mock.calls).toEqual([[1], [3]]);
  });

  it('stops at the minimum and at the maximum', () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={1} onChange={onChange} groupLabel="Qty" {...labels} />);
    fireEvent.click(button('Decrease quantity'));
    rerender(<QuantityStepper value={3} max={3} onChange={onChange} groupLabel="Qty" {...labels} />);
    fireEvent.click(button('Increase quantity'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('can take its name from a visible element instead', () => {
    render(
      <>
        <span id="qty-label">Quantity</span>
        <QuantityStepper value={1} onChange={vi.fn()} labelledBy="qty-label" {...labels} />
      </>,
    );
    expect(screen.getByRole('group', { name: 'Quantity' })).toBeTruthy();
  });
});
