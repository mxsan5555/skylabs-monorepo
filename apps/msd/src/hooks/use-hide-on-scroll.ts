import { useEffect, useState } from 'react';

/** Scroll movement smaller than this (px) is treated as jitter and never toggles the state. */
export const SCROLL_HYSTERESIS_PX = 8;

/** True while the page is scrolled past `threshold` px and the last deliberate scroll went down.
 *  Deltas under `hysteresis` px are ignored so trackpad jitter cannot flip it back and forth. */
export function useHideOnScroll(threshold = 64, hysteresis = SCROLL_HYSTERESIS_PX): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (y <= threshold) {
          setHidden(false);
          last = y;
          return;
        }
        const delta = y - last;
        if (Math.abs(delta) < hysteresis) return;
        setHidden(delta > 0);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold, hysteresis]);

  return hidden;
}
