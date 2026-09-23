import { describe, it, expect } from 'vitest';
import { haversineKm, nearestCity, parseGeoHeaders } from './geo';

describe('parseGeoHeaders', () => {
  it('reads and decodes the Vercel IP headers', () => {
    const headers = new Headers({
      'x-vercel-ip-city': 'Navi%20Mumbai',
      'x-vercel-ip-country-region': 'MH',
      'x-vercel-ip-latitude': '19.0330',
      'x-vercel-ip-longitude': '73.0297',
    });
    expect(parseGeoHeaders(headers)).toEqual({ city: 'Navi Mumbai', region: 'MH', latitude: 19.033, longitude: 73.0297 });
  });

  it('returns null without a city header', () => {
    expect(parseGeoHeaders(new Headers())).toBeNull();
  });

  it('keeps the city but drops non-numeric coordinates', () => {
    const headers = new Headers({ 'x-vercel-ip-city': 'Pune', 'x-vercel-ip-latitude': 'abc' });
    expect(parseGeoHeaders(headers)).toEqual({ city: 'Pune', region: null, latitude: null, longitude: null });
  });

  it('falls back to the raw city when the header is not valid URI encoding', () => {
    const headers = new Headers({ 'x-vercel-ip-city': 'Pune%' });
    expect(parseGeoHeaders(headers)).toEqual({ city: 'Pune%', region: null, latitude: null, longitude: null });
  });

  it('keeps zero and negative coordinates instead of dropping them as falsy', () => {
    const headers = new Headers({
      'x-vercel-ip-city': 'Accra',
      'x-vercel-ip-latitude': '0',
      'x-vercel-ip-longitude': '-0.1276',
    });
    expect(parseGeoHeaders(headers)).toEqual({ city: 'Accra', region: null, latitude: 0, longitude: -0.1276 });
  });
});

describe('haversineKm', () => {
  it('measures Pune to Mumbai at roughly 120 km', () => {
    const km = haversineKm({ latitude: 18.5204, longitude: 73.8567 }, { latitude: 19.076, longitude: 72.8777 });
    expect(km).toBeGreaterThan(115);
    expect(km).toBeLessThan(125);
  });
});

describe('nearestCity', () => {
  const cities = [
    { state: 'Maharashtra', city: 'Pune', latitude: 18.5204, longitude: 73.8567 },
    { state: 'Maharashtra', city: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
    { state: 'Delhi', city: 'Delhi', latitude: null, longitude: null },
  ];

  it('picks the closest city with coordinates', () => {
    expect(nearestCity({ latitude: 18.6, longitude: 73.8 }, cities)?.city).toBe('Pune');
  });

  it('returns null when no city has coordinates', () => {
    expect(nearestCity({ latitude: 18.6, longitude: 73.8 }, [cities[2]])).toBeNull();
  });

  it('returns the nearest city when it is within the default 75km cap', () => {
    // ~13km from Pune.
    expect(nearestCity({ latitude: 18.6, longitude: 73.8 }, cities)?.city).toBe('Pune');
  });

  it('returns null when the nearest city is farther than the default 75km cap', () => {
    // Delhi is roughly 1150km from both Pune and Mumbai.
    const farPoint = { latitude: 28.6139, longitude: 77.209 };
    expect(nearestCity(farPoint, cities)).toBeNull();
  });

  it('respects a custom maxKm', () => {
    // ~13km from Pune, inside the default cap but outside a tighter 5km cap.
    expect(nearestCity({ latitude: 18.6, longitude: 73.8 }, cities, 5)).toBeNull();
  });
});
