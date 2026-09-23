import { useEffect, useState } from 'react';

/** True while the page is scrolled past `threshold` px and the last scroll went down. */
export function useHideOnScroll(threshold = 64): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > threshold && y > last);
        last = y;
        frame = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return hidden;
}
