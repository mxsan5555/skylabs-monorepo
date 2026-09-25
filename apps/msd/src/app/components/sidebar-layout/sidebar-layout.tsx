import { createElement, useEffect, useRef, type ReactNode } from 'react';
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

  useEffect(() => {
    if (!sheet || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [sheet, open]);

  return (
    <div className={`sidebar-layout${open ? ' sidebar-layout--open' : ''}${sheet ? ' sidebar-layout--sheet' : ''}`}>
      {open && sheet && <div className="sidebar-layout__scrim" aria-hidden="true" onClick={onClose} />}
      {open && (
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
      )}
      <div className="sidebar-layout__main" inert={sheet && open ? true : undefined}>
        {children}
      </div>
    </div>
  );
}
