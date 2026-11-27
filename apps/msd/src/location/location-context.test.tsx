import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { LocationProvider, useVisitorLocation } from './location-context';

const DEFAULT_LOCATIONS = [
  { state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 },
  { state: 'Maharashtra', city: 'Nagpur', latitude: 21.15, longitude: 79.09 },
];
let mockLocations: Array<{ state: string; city: string; latitude?: number | null; longitude?: number | null }> = DEFAULT_LOCATIONS;

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
  mockLocations = DEFAULT_LOCATIONS;
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

  it('resolves IP coordinates through the catalog to the nearest city', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Pimpri', region: 'MH', latitude: 18.62, longitude: 73.8 }) } as Response);
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|Pune'));
  });

  it('shows no city for IP coordinates farther than 75 km from every catalog city', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Bengaluru', region: 'KA', latitude: 12.97, longitude: 77.59 }) } as Response);
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|-'));
  });

  it('keeps an IP city without coordinates only when it names a catalog city (catalog spelling)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'pune', region: 'MH', latitude: null, longitude: null }) } as Response);
    const { unmount } = render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|Pune'));
    unmount();

    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Bengaluru', region: 'KA', latitude: null, longitude: null }) } as Response);
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|-'));
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

  it('requestBrowser resolves far when no partner city is within the cap, and keeps the coordinates (ST-05)', async () => {
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 28.6, longitude: 77.2 } } as GeolocationPosition),
    );
    let result: string | undefined;
    function FarProbe() {
      const { status, source, city, coords, requestBrowser } = useVisitorLocation();
      return (
        <>
          <p data-testid="out">{`${status}|${source}|${city ?? '-'}|${coords ? 'coords' : '-'}`}</p>
          <button onClick={() => void requestBrowser().then((r) => (result = r))}>locate</button>
        </>
      );
    }
    render(<LocationProvider><FarProbe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-|-'));

    act(() => {
      screen.getByText('locate').click();
    });

    await waitFor(() => expect(result).toBe('far'));
    expect(out()).toBe('ready|browser|-|coords');
  });

  it('requestBrowser resolves located when a partner city is within the cap', async () => {
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
    );
    let result: string | undefined;
    function NearProbe() {
      const { requestBrowser } = useVisitorLocation();
      return <button onClick={() => void requestBrowser().then((r) => (result = r))}>locate</button>;
    }
    render(<LocationProvider><NearProbe /></LocationProvider>);
    act(() => {
      screen.getByText('locate').click();
    });
    await waitFor(() => expect(result).toBe('located'));
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

  describe('setState (header state picker)', () => {
    function PickStateProbe() {
      const { status, source, city, state, coords, setState } = useVisitorLocation();
      return (
        <>
          <p data-testid="out">{`${status}|${source}|${state ?? '-'}|${city ?? '-'}|${coords ? `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}` : '-'}`}</p>
          <button onClick={() => setState('Maharashtra')}>pick-state</button>
        </>
      );
    }

    it('saves a state-only choice: city stays null, coords average that state\'s cities, and it is never resolved back to one of them', async () => {
      render(<LocationProvider><PickStateProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('none|none|-|-|-'));
      act(() => screen.getByText('pick-state').click());
      expect(out()).toBe('ready|state|Maharashtra|-|19.84,76.47');
      const saved = JSON.parse(localStorage.getItem('msd.location') ?? '{}');
      expect(saved).toEqual({ state: 'Maharashtra', city: null, latitude: 19.835, longitude: 76.47 });
    });

    it('restores a saved state-only choice on reload with city still null', async () => {
      localStorage.setItem('msd.location', JSON.stringify({ state: 'Maharashtra', city: null, latitude: 19.835, longitude: 76.47 }));
      render(<LocationProvider><PickStateProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('ready|state|Maharashtra|-|19.84,76.47'));
    });

    it('requestBrowser failure after a state pick keeps the state (not "none")', async () => {
      function Probe2() {
        const { status, source, state, setState, requestBrowser } = useVisitorLocation();
        return (
          <>
            <p data-testid="out">{`${status}|${source}|${state ?? '-'}`}</p>
            <button onClick={() => setState('Maharashtra')}>pick-state</button>
            <button onClick={() => requestBrowser()}>locate</button>
          </>
        );
      }
      render(<LocationProvider><Probe2 /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('none|none|-'));
      act(() => screen.getByText('pick-state').click());
      expect(out()).toBe('ready|state|Maharashtra');

      getCurrentPosition.mockImplementation((_ok: PositionCallback, err?: PositionErrorCallback) => err?.({} as GeolocationPositionError));
      act(() => {
        screen.getByText('locate').click();
      });
      await waitFor(() => expect(out()).toBe('ready|state|Maharashtra'));
    });
  });

  describe('searchCity (search bar city/area selector, item F4)', () => {
    function SearchCityProbe() {
      const { city, searchCity, setSearchCity, setState } = useVisitorLocation();
      return (
        <>
          <p data-testid="out">{`${city ?? '-'}|${searchCity ?? '-'}`}</p>
          <button onClick={() => setSearchCity('Nagpur')}>pick-nagpur</button>
          <button onClick={() => setSearchCity(null)}>clear</button>
          <button onClick={() => setState('Goa')}>pick-goa</button>
        </>
      );
    }

    it('defaults once from the resolved city (browser-located), never overwritten afterwards', async () => {
      permissionState = 'granted';
      getCurrentPosition.mockImplementation((ok: PositionCallback) =>
        ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
      );
      render(<LocationProvider><SearchCityProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('Pune|Pune'));
      expect(localStorage.getItem('msd.searchCity')).toBe('Pune');
    });

    it('never defaults when a search city is already persisted from a previous visit', async () => {
      localStorage.setItem('msd.searchCity', 'Nagpur');
      permissionState = 'granted';
      getCurrentPosition.mockImplementation((ok: PositionCallback) =>
        ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
      );
      render(<LocationProvider><SearchCityProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('Pune|Nagpur'));
    });

    it('persists an explicit pick, and an explicit clear to "all cities" is never re-defaulted', async () => {
      permissionState = 'granted';
      getCurrentPosition.mockImplementation((ok: PositionCallback) =>
        ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
      );
      render(<LocationProvider><SearchCityProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('Pune|Pune'));

      act(() => screen.getByText('pick-nagpur').click());
      expect(out()).toBe('Pune|Nagpur');
      expect(localStorage.getItem('msd.searchCity')).toBe('Nagpur');

      act(() => screen.getByText('clear').click());
      expect(out()).toBe('Pune|-');
      expect(localStorage.getItem('msd.searchCity')).toBeNull();
    });

    it('clears a search city that no longer belongs to a newly-picked state', async () => {
      render(<LocationProvider><SearchCityProbe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('-|-'));
      act(() => screen.getByText('pick-nagpur').click());
      expect(out()).toBe('-|Nagpur');

      act(() => screen.getByText('pick-goa').click());
      expect(out()).toBe('-|-');
    });

    it('keeps a search city that still belongs to the newly-picked state', async () => {
      function Probe() {
        const { searchCity, setSearchCity, setState } = useVisitorLocation();
        return (
          <>
            <p data-testid="out">{searchCity ?? '-'}</p>
            <button onClick={() => setSearchCity('Pune')}>pick-pune</button>
            <button onClick={() => setState('Maharashtra')}>pick-maharashtra</button>
          </>
        );
      }
      render(<LocationProvider><Probe /></LocationProvider>);
      await waitFor(() => expect(out()).toBe('-'));
      act(() => screen.getByText('pick-pune').click());
      expect(out()).toBe('Pune');
      act(() => screen.getByText('pick-maharashtra').click());
      expect(out()).toBe('Pune');
    });
  });
});
