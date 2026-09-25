import type { ReactNode } from 'react';
import './page-section.css';

export interface PageSectionProps {
  /** Band colour role: `surface` (60, page base) or `tint` (30, surface-container). */
  tone?: 'surface' | 'tint';
  /** Shorter top padding, for a band that follows another band closely. */
  flush?: boolean;
  /** Lays direct children out as a vertical stack with a 16px gap. */
  stack?: boolean;
  className?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/** Full-bleed page band with the site's 1280px content column. Every msd page section uses it. */
export function PageSection({ tone = 'surface', flush = false, stack = false, className, children, ...aria }: PageSectionProps) {
  const classes = ['page-section', `page-section--${tone}`, flush && 'page-section--flush', className]
    .filter(Boolean)
    .join(' ');
  const container = stack ? 'page-section__container page-section__container--stack' : 'page-section__container';
  return (
    <section className={classes} {...aria}>
      <div className={container}>{children}</div>
    </section>
  );
}
