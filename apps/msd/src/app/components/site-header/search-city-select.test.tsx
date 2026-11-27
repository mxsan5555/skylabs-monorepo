import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@skylabs-monorepo/shared-ui';
import { SearchCitySelect } from './search-city-select';
import content from '../../../content.json';

const { setSearchCity, shell } = vi.hoisted(() => ({
  setSearchCity: vi.fn(),
  shell: {
    locations: [
      { state: 'Maharashtra', city: 'Pune' },
      { state: 'Maharashtra', city: 'Nagpur' },
      { state: 'Uttar Pradesh', city: 'Gorakhpur' },
    ],
    state: null as string | null,
    searchCity: null as string | null,
  },
}));

vi.mock('../../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({ locations: shell.locations }),
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({ state: shell.state, searchCity: shell.searchCity, setSearchCity }),
}));

const t = content.header.searchCity;
const filterField = () => document.querySelector('sky-action-field') as HTMLElement & { updateComplete: Promise<boolean> };

async function typeFilter(value: string) {
  await act(async () => {
    await filterField().updateComplete;
  });
  act(() => {
    const input = filterField().shadowRoot?.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
}

beforeEach(() => {
  setSearchCity.mockClear();
  shell.state = null;
  shell.searchCity = null;
});

describe('SearchCitySelect', () => {
  it('shows "All cities" by default, and every partner city when opened', () => {
    render(<SearchCitySelect />);
    expect(screen.getByRole('button', { name: `${t.changeLabel}: ${t.allCitiesOption}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${t.changeLabel}: ${t.allCitiesOption}` }));
    const list = screen.getByRole('list', { name: t.listLabel });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([t.allCitiesOption, 'Gorakhpur', 'Nagpur', 'Pune']);
  });

  it('shows the current pick as its label', () => {
    shell.searchCity = 'Nagpur';
    render(<SearchCitySelect />);
    expect(screen.getByRole('button', { name: `${t.changeLabel}: Nagpur` })).toBeTruthy();
  });

  it('scopes the list to the header\'s selected state, if one is set', () => {
    shell.state = 'Uttar Pradesh';
    render(<SearchCitySelect />);
    fireEvent.click(screen.getByRole('button'));
    const list = screen.getByRole('list', { name: t.listLabel });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([t.allCitiesOption, 'Gorakhpur']);
  });

  it('picking a city calls setSearchCity and closes the dialog', () => {
    render(<SearchCitySelect />);
    fireEvent.click(screen.getByRole('button'));
    const list = screen.getByRole('list', { name: t.listLabel });
    fireEvent.click(within(list).getByRole('button', { name: 'Pune' }));
    expect(setSearchCity).toHaveBeenCalledWith('Pune');
    expect(document.querySelector('md-dialog')).toBeNull();
  });

  it('"All cities" clears the pick', () => {
    shell.searchCity = 'Pune';
    render(<SearchCitySelect />);
    fireEvent.click(screen.getByRole('button'));
    const list = screen.getByRole('list', { name: t.listLabel });
    fireEvent.click(within(list).getByRole('button', { name: t.allCitiesOption }));
    expect(setSearchCity).toHaveBeenCalledWith(null);
  });

  it('filters the list by what is typed, and Enter picks the first match', async () => {
    render(<SearchCitySelect />);
    fireEvent.click(screen.getByRole('button'));
    await typeFilter('nag');
    const list = screen.getByRole('list', { name: t.listLabel });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([t.allCitiesOption, 'Nagpur']);
    fireEvent(filterField(), new CustomEvent('sky-submit', { detail: { value: 'nag' } }));
    expect(setSearchCity).toHaveBeenCalledWith('Nagpur');
  });
});
