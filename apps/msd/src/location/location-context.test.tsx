import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { LocationProvider, useVisitorLocation } from './location-context';

let mockLocations: Array<{ state: string; city: string; latitude?: number | null; longitude?: number | null }> = [
  { state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 },
];

vi.mock('../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    categories: [],
    locations: mockLocations,
  }),
}));

function Probe() {
  const { status, source, city, setCity } = useVisitorLocation();
  return (
    <>
      <p data-testid="out">{`${status}|${source}|${city ?? '-'}`}</p>
      <button onClick={() => setCity({ state: 'Delhi', city: 'Delhi', latitude: 28.6, longitude: 77.2 })}>pick</button>
    </>
  );
}

function RequestProbe() {
  const { status, source, city, setCity, requestBrowser } = useVisitorLocation();
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
  mockLocations = [{ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }];
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

  it('treats a shapeless /api/geo response (no usable city) as no data', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
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

  it('useVisitorLocation outside a provider returns a safe "none" value', () => {
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

  it('requestBrowser success switches to a browser-sourced city and clears any saved choice', async () => {
    localStorage.setItem('msd.location', JSON.stringify({ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }));
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
    );
    render(<LocationProvider><RequestProbe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|saved|Pune'));

    act(() => {
      screen.getByText('locate').click();
    });

    await waitFor(() => expect(out()).toBe('ready|browser|Pune'));
    expect(localStorage.getItem('msd.location')).toBeNull();
  });

  it('requestBrowser failure after a resolved IP city restores the IP result', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Nagpur', region: 'MH', latitude: 21.1, longitude: 79.1 }) } as Response);
    render(<LocationProvider><RequestProbe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|Nagpur'));

    getCurrentPosition.mockImplementation((_ok: PositionCallback, err?: PositionErrorCallback) => err?.({} as GeolocationPositionError));
    act(() => {
      screen.getByText('locate').click();
    });

    await waitFor(() => expect(out()).toBe('ready|ip|Nagpur'));
  });

  it('does not lose a still-pending mount IP lookup when requestBrowser fails meanwhile', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve as (value: Response) => void;
        }),
    );
    getCurrentPosition.mockImplementation((_ok: PositionCallback, err?: PositionErrorCallback) => err?.({} as GeolocationPositionError));

    render(<LocationProvider><RequestProbe /></LocationProvider>);

    act(() => {
      screen.getByText('locate').click();
    });
    await waitFor(() => expect(out()).toBe('none|none|-'));

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ city: 'Nagpur', region: 'MH', latitude: 21.1, longitude: 79.1 }) } as Response);
      await Promise.resolve();
    });

    await waitFor(() => expect(out()).toBe('ready|ip|Nagpur'));
  });

  it('resolves once under StrictMode, applying the IP result exactly once', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Nagpur', region: 'MH', latitude: 21.1, longitude: 79.1 }) } as Response);
    render(
      <StrictMode>
        <LocationProvider>
          <Probe />
        </LocationProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(out()).toBe('ready|ip|Nagpur'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fills in the city once the catalog locations arrive after coordinates are already resolved', async () => {
    mockLocations = [];
    permissionState = 'granted';
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
    );
    const { rerender } = render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|browser|-'));

    mockLocations = [{ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }];
    rerender(<LocationProvider><Probe /></LocationProvider>);

    await waitFor(() => expect(out()).toBe('ready|browser|Pune'));
  });

  describe('state of the current city', () => {
    function StateProbe() {
      const { city, state, setCity } = useVisitorLocation();
      return (
        <>
          <p data-testid="out">{`${state ?? '-'}|${city ?? '-'}`}</p>
          <button onClick={() => setCity({ state: 'Delhi', city: 'Delhi' })}>pick</button>
        </>
      );
    }

    it('comes from the chosen location', async () => {
      render(<LocationProvider><StateProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('-|-'));
      act(() => screen.getByText('pick').click());
      expect(out()).toBe('Delhi|Delhi');
    });

    it('comes from the nearest catalog city for browser coordinates', async () => {
      permissionState = 'granted';
      getCurrentPosition.mockImplementation((ok: PositionCallback) =>
        ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
      );
      render(<LocationProvider><StateProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('Maharashtra|Pune'));
    });

    it('is looked up for an IP city only when exactly one catalog city has that name', async () => {
      mockLocations = [
        { state: 'Maharashtra', city: 'Pune' },
        { state: 'Goa', city: 'Aurangabad' },
        { state: 'Maharashtra', city: 'Aurangabad' },
      ];
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Pune', region: 'MH', latitude: null, longitude: null }) } as Response);
      const { unmount } = render(<LocationProvider><StateProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('Maharashtra|Pune'));
      unmount();

      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Aurangabad', region: 'MH', latitude: null, longitude: null }) } as Response);
      render(<LocationProvider><StateProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('-|Aurangabad'));
    });
  });
});
