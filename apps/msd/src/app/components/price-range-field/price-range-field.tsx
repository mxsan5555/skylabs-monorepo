import { createElement, useEffect, useRef, type ChangeEvent } from 'react';
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
  // md-slider's handle names are properties (ariaLabelStart/End), not aria-* attributes; set them
  // directly so React's aria-prop validator never sees them.
  const sliderRef = useRef<HTMLElement & { ariaLabelStart?: string; ariaLabelEnd?: string }>(null);
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    slider.ariaLabelStart = copy.minLabel;
    slider.ariaLabelEnd = copy.maxLabel;
  }, [copy.minLabel, copy.maxLabel]);

  const onSliderChange = (e: ChangeEvent<HTMLElement & { valueStart?: number; valueEnd?: number }>) => {
    const el = e.currentTarget;
    onChange(normalize(el.valueStart ?? bounds.min, el.valueEnd ?? bounds.max, bounds));
  };
  // An emptied (or non-numeric) field means "no limit" on that side, never 0.
  const parse = (raw: string, fallback: number) => {
    const n = raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const onMinChange = (e: ChangeEvent<HTMLElement & { value: string }>) => {
    onChange(normalize(parse(e.currentTarget.value, bounds.min), max, bounds));
  };
  const onMaxChange = (e: ChangeEvent<HTMLElement & { value: string }>) => {
    onChange(normalize(min, parse(e.currentTarget.value, bounds.max), bounds));
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
        ref: sliderRef,
        range: true,
        labeled: true,
        min: bounds.min,
        max: bounds.max,
        step: bounds.step,
        'value-start': min,
        'value-end': max,
        onChange: onSliderChange,
      })}
    </div>
  );
}
