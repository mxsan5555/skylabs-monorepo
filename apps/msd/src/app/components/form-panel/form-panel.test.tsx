import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormPanel, FormPanelSection } from './form-panel';

describe('FormPanel', () => {
  it('is a region named by its h2, with the intro, sections, actions and note', () => {
    render(
      <FormPanel id="pay" heading="Payment Details" intro="Choose how you want to pay." actions={<button type="button">Pay</button>} note="Razorpay handles the payment.">
        <FormPanelSection title="Delivering to" icon="location_on" action={<button type="button">Edit details</button>}>
          <p>Neeraj Singh, New Delhi</p>
        </FormPanelSection>
        <FormPanelSection>
          <p>Methods</p>
        </FormPanelSection>
      </FormPanel>,
    );
    const region = screen.getByRole('region', { name: 'Payment Details' });
    expect(region.querySelector('h2')?.id).toBe('pay');
    expect(region.textContent).toContain('Choose how you want to pay.');
    expect(region.querySelectorAll('.form-panel__section')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 3, name: 'Delivering to' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit details' }).closest('.form-panel__section-head')).not.toBeNull();
    expect(region.querySelector('.form-panel__section-head md-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Pay' }).closest('.form-panel__footer')).not.toBeNull();
    expect(screen.getByText('Razorpay handles the payment.').closest('.form-panel__footer')).not.toBeNull();
  });

  it('leaves out the footer, a section head and the intro when not given', () => {
    render(
      <FormPanel id="d" heading="Your Details">
        <FormPanelSection>
          <p>Fields</p>
        </FormPanelSection>
      </FormPanel>,
    );
    expect(document.querySelector('.form-panel__footer')).toBeNull();
    expect(document.querySelector('.form-panel__section-head')).toBeNull();
    expect(document.querySelector('.form-panel__intro')).toBeNull();
  });
});
