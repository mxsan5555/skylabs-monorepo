import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Routes same-origin link clicks from inside shadow DOM (the `href` links rendered by shared-ui's
 * `sky-*` cards and `md-*` buttons) through React Router, so they navigate client-side instead of
 * reloading the page. Light-DOM links are left alone (`<Link>` already handles them), as are
 * modified clicks (new tab/window), `target`/`download` links and other origins.
 */
export function useShadowLinkNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
      if (!link || !(link.getRootNode() instanceof ShadowRoot)) return;
      if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
}
