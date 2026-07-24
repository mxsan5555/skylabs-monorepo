import type { ReactNode } from 'react';
import './admin-console.css';

/**
 * Centered console page: a title + subtitle header over the page content.
 * Reused by every console page (profile, dashboard, role areas). `wide`
 * drops the 720px cap for table-heavy Master/Manage pages.
 */
export function AdminPage({
  title,
  subtitle,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`admin-page${wide ? ' admin-page--wide' : ''}`}>
      <title>{title} · MSD</title>
      <header className="admin-page__head">
        <h1 className="admin-page__title">{title}</h1>
        {subtitle && <p className="admin-page__subtitle">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
