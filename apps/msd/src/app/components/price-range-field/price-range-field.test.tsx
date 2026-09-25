import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PriceRangeField } from './price-range-field';

const bounds = { min: 0, max: 5000, step: 100 };
const copy = { min: 'Min', max: 'Max', minLabel: 'Minimum price', maxLabel: 'Maximum price' };

describe('PriceRangeField', () => {
  it('renders Min/Max fields and a slider', () => {
    render(<PriceRangeField bounds={bounds} value={{}} onChange={vi.fn()} copy={copy} />);
    const fields = Array.from(document.querySelectorAll('md-outlined-text-field')) as (HTMLElement & { label: string })[];
    expect(fields.map((f) => f.label)).toEqual(['Min', 'Max']);
    expect(document.querySelector('md-slider')).toBeTruthy();
  });

  it('sets the slider start/end aria labels as properties, not raw aria- attributes', () => {
    render(<PriceRangeField bounds={bounds} value={{}} onChange={vi.fn()} copy={copy} />);
    const slider = document.querySelector('md-slider') as HTMLElement & { ariaLabelStart?: string; ariaLabelEnd?: string };
    expect(slider.ariaLabelStart).toBe('Minimum price');
    expect(slider.ariaLabelEnd).toBe('Maximum price');
    expect(slider.getAttribute('aria-label-start')).toBeNull();
    expect(slider.getAttribute('aria-label-end')).toBeNull();
  });

  it('reports a range when the slider changes', () => {
    const onChange = vi.fn();
    render(<PriceRangeField bounds={bounds} value={{}} onChange={onChange} copy={copy} />);
    const slider = document.querySelector('md-slider') as HTMLElement & { valueStart: number; valueEnd: number };
    slider.valueStart = 500;
    slider.valueEnd = 2000;
    fireEvent.change(slider);
    expect(onChange).toHaveBeenCalledWith({ min: 500, max: 2000 });
  });

  it('sends undefined for values at the bounds', () => {
    const onChange = vi.fn();
    render(<PriceRangeField bounds={bounds} value={{}} onChange={onChange} copy={copy} />);
    const slider = document.querySelector('md-slider') as HTMLElement & { valueStart: number; valueEnd: number };
    slider.valueStart = bounds.min;
    slider.valueEnd = bounds.max;
    fireEvent.change(slider);
    expect(onChange).toHaveBeenCalledWith({ min: undefined, max: undefined });
  });

  it('reports a range when the Min field changes', () => {
    const onChange = vi.fn();
    render(<PriceRangeField bounds={bounds} value={{ max: 3000 }} onChange={onChange} copy={copy} />);
    const minField = document.querySelectorAll('md-outlined-text-field')[0] as HTMLElement & { value: string };
    minField.value = '700';
    fireEvent.change(minField);
    expect(onChange).toHaveBeenCalledWith({ min: 700, max: 3000 });
  });

  it('clamps a Min above Max to Max', () => {
    const onChange = vi.fn();
    render(<PriceRangeField bounds={bounds} value={{ max: 1000 }} onChange={onChange} copy={copy} />);
    const minField = document.querySelectorAll('md-outlined-text-field')[0] as HTMLElement & { value: string };
    minField.value = '4000';
    fireEvent.change(minField);
    expect(onChange).toHaveBeenCalledWith({ min: 1000, max: 1000 });
  });

  it('treats an emptied field as no limit, not 0', () => {
    const onChange = vi.fn();
    render(<PriceRangeField bounds={{ min: 200, max: 3500, step: 100 }} value={{ min: 500, max: 2000 }} onChange={onChange} copy={copy} />);
    const [minField, maxField] = Array.from(document.querySelectorAll('md-outlined-text-field')) as (HTMLElement & { value: string })[];
    maxField.value = '';
    fireEvent.change(maxField);
    expect(onChange).toHaveBeenLastCalledWith({ min: 500, max: undefined });
    minField.value = '  ';
    fireEvent.change(minField);
    expect(onChange).toHaveBeenLastCalledWith({ min: undefined, max: 2000 });
  });
});
