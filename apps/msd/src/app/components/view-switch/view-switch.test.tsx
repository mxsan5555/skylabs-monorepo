import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewSwitch } from './view-switch';

const options = [
  { value: 'list', label: 'List view', icon: 'view_list' },
  { value: 'grid', label: 'Grid view', icon: 'grid_view' },
  { value: 'map', label: 'Map view', icon: 'map' },
];

describe('ViewSwitch', () => {
  it('renders a labelled group with the active view pressed', () => {
    render(<ViewSwitch label="Results view" options={options} value="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Results view' })).toBeTruthy();
    const buttons = Array.from(document.querySelectorAll('md-icon-button'));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['List view', 'Grid view', 'Map view']);
  });

  it('reports the picked view', () => {
    const onChange = vi.fn();
    render(<ViewSwitch label="Results view" options={options} value="grid" onChange={onChange} />);
    fireEvent.click(document.querySelectorAll('md-icon-button')[2]);
    expect(onChange).toHaveBeenCalledWith('map');
  });
});
