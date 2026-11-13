import type { ReactNode } from 'react';
import './split-layout.css';

export interface SplitLayoutProps {
  /** Main column (form, details). */
  children: ReactNode;
  /** Right column; sticks under the header from 840px, stacks below the main column on smaller screens.
   *  Left out (falsy) when there is nothing to show. */
  aside?: ReactNode;
  /** Accessible name of the right column. */
  asideLabel: string;
}

/** Two-column band content: main column + sticky right column (Contact, Become a member). */
export function SplitLayout({ children, aside, asideLabel }: SplitLayoutProps) {
  return (
    <div className="split-layout">
      <div className="split-layout__main">{children}</div>
      {aside && (
        <aside className="split-layout__aside" aria-label={asideLabel}>
          {aside}
        </aside>
      )}
    </div>
  );
}
