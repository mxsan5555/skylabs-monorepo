import { lazy, Suspense } from 'react';
import { CircularProgress } from '@skylabs-monorepo/shared-ui/react';
import type { DealMapPoint } from './types';
import './deal-map.css';

export type { DealMapPoint } from './types';

/** `VITE_MAP_PROVIDER=google` switches back to Google Maps; anything else uses Leaflet + OSM. */
export function resolveMapProvider(value: string | undefined): 'leaflet' | 'google' {
  return value === 'google' ? 'google' : 'leaflet';
}

const Engine = lazy(() =>
  resolveMapProvider(import.meta.env.VITE_MAP_PROVIDER) === 'google' ? import('./google-map') : import('./leaflet-map'),
);

/** Deal locations as price markers. The map engine loads only when this renders (browser only). */
export function DealMap({ points, ariaLabel, loadingLabel }: { points: DealMapPoint[]; ariaLabel: string; loadingLabel: string }) {
  return (
    <div className="deal-map" role="region" aria-label={ariaLabel}>
      <Suspense
        fallback={
          <div className="deal-map__loading">
            <CircularProgress indeterminate aria-label={loadingLabel} />
          </div>
        }
      >
        <Engine points={points} />
      </Suspense>
    </div>
  );
}
