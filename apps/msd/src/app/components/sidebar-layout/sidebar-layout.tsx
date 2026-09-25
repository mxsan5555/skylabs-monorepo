import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '@skylabs-monorepo/shared-ui';
import { useMediaQuery } from '../../../hooks/use-media-query';
import './sidebar-layout.css';

export interface SidebarLayoutProps {
  open: boolean;
  onClose: () => void;
  sidebar: ReactNode;
  sidebarLabel: string;
  closeLabel: string;
  children: ReactNode;
}

/** Results with a filter sidebar: a column from 840px, a left side sheet on phones. */
export function SidebarLayout({ open, onClose, sidebar, sidebarLabel, closeLabel, children }: SidebarLayoutProps) {
  const desktop = useMediaQuery('(min-width: 840px)', true);
  const sheet = !desktop;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // The phone sheet is modal: it renders at the end of <body> (portal) and everything else in
  // <body> is made inert while it is open, so Tab and screen readers stay inside it.
  useEffect(() => {
    if (!sheet || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const outside = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !!panel && !el.contains(panel) && !el.inert,
    );
    outside.forEach((el) => (el.inert = true));
    panel?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      outside.forEach((el) => (el.inert = false));
      previous?.focus?.();
    };
  }, [sheet, open]);

  const aside = open && (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="sidebar-layout__aside"
      aria-label={sidebarLabel}
      {...(sheet ? { role: 'dialog', 'aria-modal': 'true' } : {})}
    >
      {sheet &&
        createElement(
          'md-icon-button',
          { class: 'sidebar-layout__close', 'aria-label': closeLabel, onClick: onClose },
          createElement('md-icon', { 'aria-hidden': 'true' }, 'close'),
        )}
      {sidebar}
    </aside>
  );

  return (
    <div className={`sidebar-layout${open ? ' sidebar-layout--open' : ''}${sheet ? ' sidebar-layout--sheet' : ''}`}>
      {sheet
        ? open &&
          createPortal(
            <div className="sidebar-layout--sheet">
              <div className="sidebar-layout__scrim" aria-hidden="true" onClick={onClose} />
              {aside}
            </div>,
            document.body,
          )
        : aside}
      <div className="sidebar-layout__main">{children}</div>
    </div>
  );
}
