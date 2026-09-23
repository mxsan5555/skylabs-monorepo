import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    categories: [],
    locations: [{ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }],
  }),
}));

import { LocationProvider, useLocation } from './location-context';

function Probe() {
  const { status, source, city, setCity } = useLocation();
  return (
    <>
      <p data-testid="out">{`${status}|${source}|${city ?? '-'}`}</p>
      <button onClick={() => setCity({ state: 'Delhi', city: 'Delhi', latitude: 28.6, longitude: 77.2 })}>pick</button>
    </>
  );
}

function RequestProbe() {
  const { status, source, city, setCity, requestBrowser } = useLocation();
  return (
    <>
      <p data-testid="out">{`${status}|${source}|${city ?? '-'}`}</p>
      <button onClick={() => setCity({ state: 'Delhi', city: 'Delhi', latitude: 28.6, longitude: 77.2 })}>pick</button>
      <button onClick={() => requestBrowser()}>locate</button>
    </>
  );
}

const getCurrentPosition = vi.fn();
let permissionState: PermissionState = 'prompt';

beforeEach(() => {
  localStorage.clear();
  getCurrentPosition.mockReset();
  permissionState = 'prompt';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: permissionState })) },
  });
});

afterEach(() => vi.unstubAllGlobals());

const out = () => screen.getByTestId('out').textContent;

describe('LocationProvider', () => {
  it('uses a saved city first, without touching geolocation or the network', async () => {
    localStorage.setItem('msd.location', JSON.stringify({ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }));
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|saved|Pune'));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores a corrupt saved value and continues resolution to IP/none', async () => {
    localStorage.setItem('msd.location', '{not json');
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));
  });

  it('ignores a saved value that is not a location object and continues resolution', async () => {
    localStorage.setItem('msd.location', JSON.stringify({ foo: 'bar' }));
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));
  });

  it('reads browser coordinates silently when permission is already granted, mapping to the nearest city', async () => {
    permissionState = 'granted';
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
    );
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|browser|Pune'));
  });

  it('never prompts on load when permission is "prompt", and falls back to /api/geo', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Nagpur', region: 'MH', latitude: 21.1, longitude: 79.1 }) } as Response);
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|Nagpur'));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/geo');
  });

  it('ends in "none" when the IP lookup has nothing', async () => {
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));
  });

  it('setCity saves the choice', async () => {
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));
    act(() => screen.getByText('pick').click());
    expect(out()).toBe('ready|saved|Delhi');
    expect(JSON.parse(localStorage.getItem('msd.location') ?? '{}').city).toBe('Delhi');
  });

  it('useLocation outside a provider returns a safe "none" value', () => {
    render(<Probe />);
    expect(out()).toBe('none|none|-');
  });

  it('requestBrowser does not overwrite a newer setCity made while the lookup is still pending', async () => {
    let resolvePosition!: (pos: GeolocationPosition) => void;
    getCurrentPosition.mockImplementation((ok: PositionCallback) => {
      resolvePosition = ok;
    });
    render(<LocationProvider><RequestProbe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));

    act(() => {
      screen.getByText('locate').click();
    });
    act(() => {
      screen.getByText('pick').click();
    });
    expect(out()).toBe('ready|saved|Delhi');

    await act(async () => {
      resolvePosition({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition);
      await Promise.resolve();
    });

    expect(out()).toBe('ready|saved|Delhi');
  });
});
