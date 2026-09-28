import { createElement, useId, useState } from 'react';
import { Icon, Menu, MenuItem } from '@skylabs-monorepo/shared-ui/react';

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface ChoiceMenuProps {
  /** `chip` = M3 assist chip (toolbar start), `text` = M3 text button (toolbar end). */
  trigger: 'chip' | 'text';
  icon: string;
  /** Visible trigger text. */
  label: string;
  /** Accessible name of the menu. */
  menuLabel: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}

/** A trigger that opens an M3 menu of single-choice options (sort, city, ...). */
export function ChoiceMenu({ trigger, icon, label, menuLabel, options, value, onChange }: ChoiceMenuProps) {
  const id = `choice-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [open, setOpen] = useState(false);
  const aria = { id, 'aria-haspopup': 'menu', 'aria-expanded': open ? 'true' : 'false', onClick: () => setOpen((o) => !o) };
  const iconEl = createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, icon);
  const triggerEl =
    trigger === 'chip'
      ? createElement('md-assist-chip', { ...aria, label }, iconEl)
      : createElement('md-text-button', aria, iconEl, label);

  return (
    <>
      {triggerEl}
      <Menu open={open} anchor={id} positioning="popover" aria-label={menuLabel} onClosed={() => setOpen(false)}>
        {options.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === value}
            onClick={() => {
              setOpen(false);
              onChange(option.value);
            }}
          >
            <span slot="headline">{option.label}</span>
            {option.value === value && (
              <Icon slot="end" aria-hidden="true">
                check
              </Icon>
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
