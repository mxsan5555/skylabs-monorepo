import { useCallback, useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { categoryHref, useCatalogShell, useCategoryLinks } from '../../../catalog/catalog-shell';
import { useDismiss } from '../../../hooks/use-dismiss';
import content from '../../../content.json';

const MAX_STRIP_LINKS = 8;

/** Row 2: plain category links plus an "All categories" disclosure panel. The panel links stay
 *  in the DOM (hidden) so prerendered HTML carries every category URL for crawlers. The panel
 *  closes on Escape (focus returns to the toggle), an outside pointer press, focus leaving the
 *  nav, and any route change. */
export function CategoryStrip() {
  const links = useCategoryLinks();
  const { categories } = useCatalogShell();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  const dismiss = useCallback((reason: 'escape' | 'outside') => {
    setOpen(false);
    if (reason === 'escape') buttonRef.current?.focus();
  }, []);
  useDismiss(open, rootRef, dismiss);

  const { pathname, search } = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [pathname, search]);

  // Only a real focus target outside the nav closes the panel; a null target (window blur,
  // click on a non-focusable spot) leaves it to the pointer and Escape handlers.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <nav ref={rootRef} className="category-strip" aria-label={content.header.categoriesNavLabel} onBlur={onBlur}>
      <div className="category-strip__inner">
        <button
          ref={buttonRef}
          type="button"
          className="category-strip__all label-large"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon aria-hidden="true">menu</Icon>
          {content.header.allCategories}
          <Icon aria-hidden="true" className="category-strip__chevron">
            expand_more
          </Icon>
        </button>
        <ul className="category-strip__links">
          {links.slice(0, MAX_STRIP_LINKS).map((link) => (
            <li key={link.id}>
              <NavLink to={link.to} className="category-strip__link label-large">
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
      <div id={panelId} className="mega-panel" hidden={!open}>
        {categories.length === 0 ? (
          // Categories still loading or failed: offer the same fallback links as the strip.
          <ul className="mega-panel__list">
            {links.map((link) => (
              <li key={link.id}>
                <Link to={link.to} className="mega-panel__link body-medium" onClick={close}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mega-panel__grid">
            {categories.map((cat) => (
              <div key={cat.id} className="mega-panel__group">
                <Link to={categoryHref(cat.slug)} className="mega-panel__heading title-small" onClick={close}>
                  {cat.name}
                </Link>
                {cat.children.length > 0 && (
                  <ul className="mega-panel__list">
                    {cat.children.map((sub) => (
                      <li key={sub.id}>
                        <Link
                          to={categoryHref(cat.slug, sub.slug)}
                          className="mega-panel__link body-medium"
                          onClick={close}
                        >
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
