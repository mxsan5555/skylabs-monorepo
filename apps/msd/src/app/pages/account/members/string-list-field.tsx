import { useState } from 'react';
import { OutlinedButton, IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { renderTextField } from './form-controls';

/**
 * A short list of plain-text items (deal highlights, eligibility, package inclusions): add with
 * the field + Add (or Enter), remove each with its button. Limits come from PLANNING §2.7.
 */
export function StringListField({
  label,
  addLabel,
  items,
  max,
  maxLength,
  hint,
  onChange,
}: {
  label: string;
  addLabel: string;
  items: string[];
  max: number;
  maxLength: number;
  hint?: string;
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const full = items.length >= max;
  const add = () => {
    const value = draft.trim();
    if (!value || full || items.includes(value)) return;
    onChange([...items, value]);
    setDraft('');
  };

  return (
    <fieldset className="string-list-field">
      <legend>{label}</legend>
      {hint && <p className="field-hint">{hint}</p>}
      {items.length > 0 && (
        <ul className="string-list-field__items">
          {items.map((item, index) => (
            <li key={item}>
              <span>{item}</span>
              <IconButton aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <Icon aria-hidden="true">close</Icon>
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div
        className="string-list-field__add"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      >
        {renderTextField({
          label: addLabel,
          value: draft,
          maxLength,
          disabled: full,
          supportingText: full ? `Up to ${max}` : `${items.length} of ${max}`,
          onInput: setDraft,
        })}
        <OutlinedButton disabled={full || !draft.trim()} onClick={add}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          Add
        </OutlinedButton>
      </div>
    </fieldset>
  );
}
