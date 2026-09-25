import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PriceFilterDialog } from './price-filter-dialog';

const copy = {
  title: 'Filters', price: 'Price', priceValue: '{min} to {max}', minLabel: 'Minimum price', maxLabel: 'Maximum price',
  reset: 'Reset', cancel: 'Cancel', apply: 'Apply',
};
const bounds = { min: 0, max: 10000, step: 100 };
const buttonText = (text: string) =>
  Array.from(document.querySelectorAll('md-text-button, md-filled-button')).find((b) => b.textContent === text) as HTMLElement;

describe('PriceFilterDialog', () => {
  it('applies the slider range and drops values at the bounds', () => {
    const onApply = vi.fn();
    render(<PriceFilterDialog range={{}} bounds={bounds} copy={copy} onApply={onApply} onClose={vi.fn()} />);
    const slider = document.querySelector('md-slider') as HTMLElement & { valueStart: number; valueEnd: number };
    slider.valueStart = 500;
    slider.valueEnd = 2000;
    fireEvent(slider, new Event('input', { bubbles: true }));
    expect(screen.getByText('₹500 to ₹2,000')).toBeTruthy();
    fireEvent.click(buttonText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ min: 500, max: 2000 });
  });

  it('reset returns to the full range', () => {
    const onApply = vi.fn();
    render(<PriceFilterDialog range={{ min: 500, max: 2000 }} bounds={bounds} copy={copy} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.click(buttonText('Reset'));
    fireEvent.click(buttonText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ min: undefined, max: undefined });
  });
});
