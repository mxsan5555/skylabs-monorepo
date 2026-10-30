import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RadioCardGroup } from './radio-card-group';

const OPTIONS = [
  { value: 'online', icon: 'account_balance_wallet', title: 'Online payment', description: 'UPI, card or net banking' },
  { value: 'cod', icon: 'payments', title: 'Cash on delivery', description: 'Pay when your order arrives' },
];

describe('RadioCardGroup', () => {
  it('is a fieldset named by its legend, one radio per option, the chosen one checked and marked', () => {
    render(<RadioCardGroup legend="Payment method" name="method" value="cod" options={OPTIONS} onChange={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Payment method' });
    expect(group.tagName).toBe('FIELDSET');
    const radios = Array.from(group.querySelectorAll('md-radio')) as (HTMLElement & { checked: boolean; value: string; name: string })[];
    expect(radios.map((r) => [r.value, r.checked, r.name])).toEqual([
      ['online', false, 'method'],
      ['cod', true, 'method'],
    ]);
    expect(group.querySelector('.radio-card--selected')?.textContent).toContain('Cash on delivery');
    expect(group.querySelector('.radio-card md-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reports the picked option', () => {
    const onChange = vi.fn();
    render(<RadioCardGroup legend="Payment method" name="method" value="online" options={OPTIONS} onChange={onChange} />);
    const cod = Array.from(document.querySelectorAll('md-radio'))[1] as HTMLElement & { checked: boolean };
    cod.checked = true;
    fireEvent.change(cod);
    expect(onChange).toHaveBeenCalledWith('cod');
  });
});
