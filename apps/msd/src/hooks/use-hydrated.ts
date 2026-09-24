import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** false during server rendering and hydration, true once the client has taken over. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
