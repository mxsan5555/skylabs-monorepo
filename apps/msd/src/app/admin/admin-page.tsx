import type { ReactNode } from 'react';

/**
 * Centered console page: a title + subtitle header over the page content.
 * Reused by every console page (profile, dashboard, role areas).
 */
export function AdminPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-page">
      <title>{title} · MSD</title>
      <header className="admin-page__head">
        <h1 className="admin-page__title">{title}</h1>
        {subtitle && <p className="admin-page__subtitle">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
