import { createElement, type ChangeEvent } from 'react';

/**
 * Raw M3 form controls for the console forms (deal form, package cards) and the checkout's state
 * and city lists. Raw elements, not the
 * shared-ui React wrappers, so tests can drive `value` and the native `input` / `change` events
 * (the wrappers set properties in an effect that does not run under Vitest's `@lit/react`
 * resolution; see CLAUDE.md "Testing gotchas"). Optional props are skipped, never passed as
 * `undefined`.
 */

type DrivenChangeEvent = ChangeEvent<HTMLElement & { value: string }>;

/** Select options from plain strings, each its own value and label (state, city lists). */
export const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

function defined<T extends Record<string, unknown>>(props: T): Partial<T> {
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== false)) as Partial<T>;
}

export function renderSelect({
  label,
  value,
  disabled,
  required,
  placeholder,
  options,
  extraOption,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  required?: boolean;
  /** First, empty option; omit for a select that always has a value. */
  placeholder?: string;
  options: { value: string; label: string }[];
  /** A stale value (e.g. a category since deactivated) kept selectable instead of being cleared. */
  extraOption?: { value: string; label: string };
  onChange: (value: string) => void;
}) {
  return createElement(
    'md-outlined-select',
    { label, value, ...defined({ disabled, required }), onChange: (e: DrivenChangeEvent) => onChange(e.currentTarget.value) },
    [
      ...(placeholder !== undefined
        ? [createElement('md-select-option', { key: '__placeholder__', value: '' }, createElement('div', { slot: 'headline' }, placeholder))]
        : []),
      ...(extraOption
        ? [createElement('md-select-option', { key: extraOption.value, value: extraOption.value }, createElement('div', { slot: 'headline' }, extraOption.label))]
        : []),
      ...options.map((o) => createElement('md-select-option', { key: o.value, value: o.value }, createElement('div', { slot: 'headline' }, o.label))),
    ],
  );
}

export function renderTextField({
  label,
  value,
  required,
  error,
  errorText,
  supportingText,
  type,
  rows,
  min,
  max,
  maxLength,
  prefixText,
  disabled,
  placeholder,
  inputMode,
  onInput,
}: {
  label: string;
  value: string;
  required?: boolean;
  error?: boolean;
  errorText?: string;
  supportingText?: string;
  type?: string;
  rows?: number;
  min?: number;
  max?: number;
  maxLength?: number;
  prefixText?: string;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: string;
  onInput: (value: string) => void;
}) {
  return createElement('md-outlined-text-field', {
    label,
    value,
    ...defined({
      required,
      error: error || Boolean(errorText),
      'error-text': errorText,
      'supporting-text': supportingText,
      type,
      rows,
      min,
      max,
      maxlength: maxLength,
      'prefix-text': prefixText,
      disabled,
      placeholder,
      inputmode: inputMode,
    }),
    onInput: (e: DrivenChangeEvent) => onInput(e.currentTarget.value),
  });
}

/** Native checkbox in a label (same look as the existing therapist picker). */
export function renderCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="category-grant-grid__option">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      {label}
    </label>
  );
}
