import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * false during server rendering and hydration, true once the client has taken over.
 *
 * `useSyncExternalStore`'s server snapshot (`false`) is what `renderToString` and the first
 * client render both produce, so hydration matches the server markup; React then re-renders with
 * the client snapshot (`true`) right after hydration completes, in the same pass it reconciles
 * hydration in. `useState(false)` + a `useEffect(() => setTrue(), [])` would land the same end
 * state but through an extra render (mount false, effect fires, re-render true) and a visible
 * flash of the server-rendered branch before the client one replaces it.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
