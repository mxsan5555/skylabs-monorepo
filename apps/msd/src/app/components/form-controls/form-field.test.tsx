import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-controls';

describe('FormField', () => {
  it('wraps a control and shows its error as an alert', () => {
    render(
      <FormField error="Please enter your state.">
        <input aria-label="State" />
      </FormField>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Please enter your state.');
    expect(screen.getByLabelText('State').closest('.form-field')).not.toBeNull();
  });

  it('shows no alert without an error, and spans the row when wide', () => {
    render(
      <FormField wide>
        <input aria-label="Address" />
      </FormField>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.form-field--wide')).not.toBeNull();
  });
});
