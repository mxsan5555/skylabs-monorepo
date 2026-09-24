import { useEffect, useRef, type RefObject } from 'react';

/**
 * Listens for a custom-element event through a ref. React 19 does not attach `on<event>`
 * props to custom elements it hydrates from prerendered HTML, so event handlers on
 * `sky-*` / `md-*` tags must be wired here instead. The latest handler is always used.
 */
export function useCustomEvent<D>(
  ref: RefObject<HTMLElement | null>,
  type: string,
  handler: (event: CustomEvent<D>) => void,
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = (event: Event) => latest.current(event as CustomEvent<D>);
    el.addEventListener(type, listener);
    return () => el.removeEventListener(type, listener);
  }, [ref, type]);
}
