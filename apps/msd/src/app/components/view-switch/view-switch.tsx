import { createElement } from 'react';

export interface ViewOption {
  value: string;
  label: string;
  icon: string;
}

/** Icon-button group for switching result views (list / grid / map). */
export function ViewSwitch({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ViewOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      {options.map((option) =>
        createElement(
          'md-icon-button',
          {
            key: option.value,
            'aria-label': option.label,
            'aria-pressed': option.value === value ? 'true' : 'false',
            toggle: true,
            selected: option.value === value,
            onClick: () => onChange(option.value),
          },
          createElement('md-icon', { 'aria-hidden': 'true' }, option.icon),
        ),
      )}
    </div>
  );
}
