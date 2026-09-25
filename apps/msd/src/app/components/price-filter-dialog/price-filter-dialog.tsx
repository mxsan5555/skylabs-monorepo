import { useRef, useState } from 'react';
import type { MdSlider } from '@material/web/slider/slider.js';
import { Dialog, FilledButton, Slider, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { formatINR } from '../../../utils/format';
import './price-filter-dialog.css';

export interface PriceRange {
  min?: number;
  max?: number;
}

export interface PriceFilterDialogProps {
  range: PriceRange;
  bounds: { min: number; max: number; step: number };
  copy: { title: string; price: string; priceValue: string; minLabel: string; maxLabel: string; reset: string; cancel: string; apply: string };
  onApply: (range: PriceRange) => void;
  onClose: () => void;
}

/** Price range filter. Mount it only while open; it starts from `range`. */
export function PriceFilterDialog({ range, bounds, copy, onApply, onClose }: PriceFilterDialogProps) {
  const [start, setStart] = useState(range.min ?? bounds.min);
  const [end, setEnd] = useState(range.max ?? bounds.max);
  const sliderRef = useRef<MdSlider>(null);
  useCustomEvent(sliderRef, 'input', () => {
    const slider = sliderRef.current;
    if (!slider) return;
    setStart(slider.valueStart ?? bounds.min);
    setEnd(slider.valueEnd ?? bounds.max);
  });

  return (
    <Dialog open onClose={onClose}>
      <span slot="headline">{copy.title}</span>
      <div slot="content" className="price-filter">
        <p className="title-small">{copy.price}</p>
        <p className="body-large" aria-live="polite">
          {copy.priceValue.replace('{min}', formatINR(start)).replace('{max}', formatINR(end))}
        </p>
        <Slider
          ref={sliderRef}
          range
          labeled
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          valueStart={start}
          valueEnd={end}
          ariaLabelStart={copy.minLabel}
          ariaLabelEnd={copy.maxLabel}
        />
      </div>
      <div slot="actions">
        <TextButton
          onClick={() => {
            setStart(bounds.min);
            setEnd(bounds.max);
          }}
        >
          {copy.reset}
        </TextButton>
        <TextButton onClick={onClose}>{copy.cancel}</TextButton>
        <FilledButton
          onClick={() => onApply({ min: start > bounds.min ? start : undefined, max: end < bounds.max ? end : undefined })}
        >
          {copy.apply}
        </FilledButton>
      </div>
    </Dialog>
  );
}
