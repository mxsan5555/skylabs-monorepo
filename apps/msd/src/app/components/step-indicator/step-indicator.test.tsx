import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepIndicator } from './step-indicator';

describe('StepIndicator', () => {
  it('is a named ordered list that marks the current step and says which are done', () => {
    render(<StepIndicator label="Checkout steps" steps={['Your Details', 'Payment']} current={1} doneLabel="completed" />);
    const list = screen.getByRole('list', { name: 'Checkout steps' });
    expect(list.tagName).toBe('OL');
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Your Details');
    expect(items[0].textContent).toContain('completed');
    expect(items[0].getAttribute('aria-current')).toBeNull();
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[1].textContent).not.toContain('completed');
  });

  it('numbers the steps that are not done', () => {
    render(<StepIndicator label="Steps" steps={['One', 'Two']} current={0} doneLabel="completed" />);
    const numbers = Array.from(document.querySelectorAll('.step-indicator__marker')).map((m) => m.textContent);
    expect(numbers).toEqual(['1', '2']);
  });

  it('marks the current step in the error role when asked (a cancellation)', () => {
    render(<StepIndicator label="Steps" steps={['Placed', 'Cancelled']} current={1} doneLabel="completed" tone="error" />);
    expect(document.querySelector('.step-indicator')?.classList.contains('step-indicator--error')).toBe(true);
  });
});
