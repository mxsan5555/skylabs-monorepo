import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CityPickerDialog } from './city-picker-dialog';
import content from '../../../content.json';

const { setCity, requestBrowser, shell } = vi.hoisted(() => ({
  setCity: vi.fn(),
  requestBrowser: vi.fn(),
  shell: {
    locations: [
      { state: 'Maharashtra', city: 'Pune' },
      { state: 'Uttar Pradesh', city: 'Gorakhpur' },
    ],
  },
}));

vi.mock('../../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({ locations: shell.locations }),
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({
    status: 'ready',
    city: 'Pune',
    state: 'Maharashtra',
    setCity,
    requestBrowser,
  }),
}));

const t = content.header.city;

describe('CityPickerDialog', () => {
  it('renders the dialog headline and every location', () => {
    render(<CityPickerDialog onClose={vi.fn()} />);
    expect(screen.getByText(t.dialogTitle)).toBeTruthy();
    const list = screen.getByRole('list', { name: t.listLabel });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
  });

  it('sets the chosen city and closes when a city is clicked', () => {
    const onClose = vi.fn();
    render(<CityPickerDialog onClose={onClose} />);
    const list = screen.getByRole('list', { name: t.listLabel });
    fireEvent.click(within(list).getByRole('button', { name: /Gorakhpur/ }));
    expect(setCity).toHaveBeenCalledWith({ state: 'Uttar Pradesh', city: 'Gorakhpur' });
    expect(onClose).toHaveBeenCalled();
  });

  it('uses the current browser location and closes', () => {
    const onClose = vi.fn();
    render(<CityPickerDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(t.useCurrent).closest('md-filled-tonal-button') as HTMLElement);
    expect(requestBrowser).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
