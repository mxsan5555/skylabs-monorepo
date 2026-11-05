import { OutlinedIconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import './quantity-stepper.css';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Lowest value; the minus button stops here. */
  min?: number;
  /** Highest value (stock or limit); the plus button stops here. */
  max?: number;
  /** Visible label before the buttons (e.g. "Quantity"). */
  label?: string;
  /** Accessible name of the group (e.g. "Quantity for Serum"); or use `labelledBy`. */
  groupLabel?: string;
  /** Id of a visible element that names the group. */
  labelledBy?: string;
  decreaseLabel: string;
  increaseLabel: string;
}

/** Minus / value / plus as one named group; the value is announced when it changes. Cart lines and
 *  the deal and therapist detail pages. */
export function QuantityStepper({ value, onChange, min = 1, max, label, groupLabel, labelledBy, decreaseLabel, increaseLabel }: QuantityStepperProps) {
  const name = labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': groupLabel };
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <div className="quantity-stepper" role="group" {...name}>
      {label && <span className="quantity-stepper__label label-medium">{label}</span>}
      <OutlinedIconButton aria-label={decreaseLabel} disabled={atMin} onClick={() => !atMin && onChange(value - 1)}>
        <Icon aria-hidden="true">remove</Icon>
      </OutlinedIconButton>
      <output className="quantity-stepper__value title-small" aria-live="polite">
        {value}
      </output>
      <OutlinedIconButton aria-label={increaseLabel} disabled={atMax} onClick={() => !atMax && onChange(value + 1)}>
        <Icon aria-hidden="true">add</Icon>
      </OutlinedIconButton>
    </div>
  );
}
