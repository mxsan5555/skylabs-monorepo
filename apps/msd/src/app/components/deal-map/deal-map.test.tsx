import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DealMap, resolveMapProvider } from './deal-map';

vi.mock('./leaflet-map', () => ({ default: ({ points }: { points: unknown[] }) => <div>leaflet {points.length}</div> }));
vi.mock('./google-map', () => ({ default: () => <div>google</div> }));

const point = { id: '1', lat: 26.76, lng: 83.37, label: '₹999', title: 'Deal', href: '/deal/1' };

describe('DealMap', () => {
  it('uses leaflet unless the provider is google', () => {
    expect(resolveMapProvider(undefined)).toBe('leaflet');
    expect(resolveMapProvider('leaflet')).toBe('leaflet');
    expect(resolveMapProvider('google')).toBe('google');
    expect(resolveMapProvider('other')).toBe('leaflet');
  });

  it('lazy-loads the engine inside a labelled region', async () => {
    render(<DealMap points={[point]} ariaLabel="Deals on the map" loadingLabel="Loading map" />);
    expect(screen.getByRole('region', { name: 'Deals on the map' })).toBeTruthy();
    expect(await screen.findByText('leaflet 1')).toBeTruthy();
  });
});
