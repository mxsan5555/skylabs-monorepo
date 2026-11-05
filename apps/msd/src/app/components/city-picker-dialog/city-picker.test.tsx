import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import '@skylabs-monorepo/shared-ui';
import { CityPicker } from './city-picker';
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
  useVisitorLocation: () => ({ status: 'ready', city: 'Pune', state: 'Maharashtra', setCity, requestBrowser }),
}));

const t = content.header.city;
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

const locate = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText(t.useCurrent).closest('md-filled-tonal-button') as HTMLElement);
  });
};

beforeEach(() => {
  setCity.mockClear();
  requestBrowser.mockReset();
});

describe('CityPicker', () => {
  it('filters the partner cities by city or state and says when nothing matches', async () => {
    render(<CityPicker onDone={vi.fn()} />);
    await typeFilter('gorak');
    const list = screen.getByRole('list', { name: t.listLabel });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['GorakhpurUttar Pradesh']);
    await typeFilter('maharash');
    expect(within(screen.getByRole('list', { name: t.listLabel })).getByRole('button', { name: /Pune/ })).toBeTruthy();
    await typeFilter('zzz');
    expect(screen.getByRole('status')).toHaveTextContent('No partner city matches “zzz”');
  });

  it('Enter in the filter picks the first match', async () => {
    const onDone = vi.fn();
    render(<CityPicker onDone={onDone} />);
    await typeFilter('gorak');
    fireEvent(filterField(), new CustomEvent('sky-submit', { detail: { value: 'gorak' } }));
    expect(setCity).toHaveBeenCalledWith({ state: 'Uttar Pradesh', city: 'Gorakhpur' });
    expect(onDone).toHaveBeenCalled();
  });

  it('finishes when the browser locates the visitor', async () => {
    requestBrowser.mockResolvedValue('located');
    const onDone = vi.fn();
    render(<CityPicker onDone={onDone} />);
    await locate();
    expect(onDone).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays open with an alert when the browser refuses, and clears it on retry', async () => {
    requestBrowser.mockResolvedValue('failed');
    const onDone = vi.fn();
    render(<CityPicker onDone={onDone} />);
    await locate();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(t.locateFailedTitle);
    requestBrowser.mockResolvedValue('superseded');
    await locate();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('stays open and says no partner city is near when the visitor is too far away (ST-05)', async () => {
    requestBrowser.mockResolvedValue('far');
    const onDone = vi.fn();
    render(<CityPicker onDone={onDone} />);
    await locate();
    expect(onDone).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t.locateFarTitle);
    expect(alert).toHaveTextContent('75 km');
    expect(alert).not.toHaveTextContent(t.locateFailedTitle);
    expect(screen.getByText(t.useCurrent).closest('md-filled-tonal-button')).toHaveAttribute('aria-describedby', alert.id);
  });
});
