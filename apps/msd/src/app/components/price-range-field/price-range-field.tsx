import { createElement, type ChangeEvent } from 'react';
import '@skylabs-monorepo/shared-ui';
import './price-range-field.css';

export interface PriceRange {
  min?: number;
  max?: number;
}

export interface PriceRangeFieldProps {
  bounds: { min: number; max: number; step: number };
  value: PriceRange;
  onChange: (range: PriceRange) => void;
  copy: { min: string; max: string; minLabel: string; maxLabel: string };
}

/** Clamps into `bounds`, keeps min <= max (clamping min down to max, never raising max), and
 *  sends `undefined` for a value equal to its bound (an unset filter). */
function normalize(min: number, max: number, bounds: { min: number; max: number }): PriceRange {
  const clamp = (n: number) => Math.min(Math.max(n, bounds.min), bounds.max);
  let lo = clamp(min);
  const hi = clamp(max);
  if (lo > hi) lo = hi;
  return {
    min: lo === bounds.min ? undefined : lo,
    max: hi === bounds.max ? undefined : hi,
  };
}

/** Price range filter: a labeled min/max range slider paired with editable number fields. Raw
 *  M3 elements (not the shared-ui React wrappers) so tests can drive them directly. */
export function PriceRangeField({ bounds, value, onChange, copy }: PriceRangeFieldProps) {
  const min = value.min ?? bounds.min;
  const max = value.max ?? bounds.max;

  const onSliderChange = (e: ChangeEvent<HTMLElement & { valueStart?: number; valueEnd?: number }>) => {
    const el = e.currentTarget;
    onChange(normalize(el.valueStart ?? bounds.min, el.valueEnd ?? bounds.max, bounds));
  };
  const onMinChange = (e: ChangeEvent<HTMLElement & { value: string }>) => {
    onChange(normalize(Number(e.currentTarget.value), max, bounds));
  };
  const onMaxChange = (e: ChangeEvent<HTMLElement & { value: string }>) => {
    onChange(normalize(min, Number(e.currentTarget.value), bounds));
  };

  return (
    <div className="price-range">
      <div className="price-range__inputs">
        {createElement('md-outlined-text-field', {
          type: 'number',
          label: copy.min,
          value: String(min),
          min: String(bounds.min),
          max: String(bounds.max),
          inputmode: 'numeric',
          onChange: onMinChange,
        })}
        <span aria-hidden="true">–</span>
        {createElement('md-outlined-text-field', {
          type: 'number',
          label: copy.max,
          value: String(max),
          min: String(bounds.min),
          max: String(bounds.max),
          inputmode: 'numeric',
          onChange: onMaxChange,
        })}
      </div>
      {createElement('md-slider', {
        range: true,
        labeled: true,
        min: bounds.min,
        max: bounds.max,
        step: bounds.step,
        'value-start': min,
        'value-end': max,
        ariaLabelStart: copy.minLabel,
        ariaLabelEnd: copy.maxLabel,
        onChange: onSliderChange,
      })}
    </div>
  );
}
