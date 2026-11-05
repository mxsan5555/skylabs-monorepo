import { createElement, type ChangeEvent } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import './radio-card-group.css';

export interface RadioCardOption {
  value: string;
  /** Decorative Material Symbol. */
  icon: string;
  title: string;
  description: string;
}

export interface RadioCardGroupProps {
  legend: string;
  name: string;
  value: string;
  options: RadioCardOption[];
  onChange: (value: string) => void;
}

/**
 * Single choice shown as cards (payment method): a fieldset named by its legend, each option a
 * label around a raw `md-radio` (tests can drive it) with an icon, title and description. The
 * chosen card takes secondary-container (the 30); the radio itself carries primary.
 */
export function RadioCardGroup({ legend, name, value, options, onChange }: RadioCardGroupProps) {
  return (
    <fieldset className="radio-card-group">
      <legend className="radio-card-group__legend title-medium">{legend}</legend>
      <div className="radio-card-group__options">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label key={option.value} className={`radio-card${selected ? ' radio-card--selected' : ''}`}>
              {createElement('md-radio', {
                name,
                value: option.value,
                checked: selected,
                onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => e.currentTarget.checked && onChange(option.value),
              })}
              <span className="radio-card__icon">
                <Icon aria-hidden="true">{option.icon}</Icon>
              </span>
              <span className="radio-card__text">
                <span className="title-small">{option.title}</span>
                <span className="radio-card__description body-small">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
