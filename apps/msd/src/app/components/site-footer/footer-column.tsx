import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useMediaQuery } from '../../../hooks/use-media-query';

export const WIDE_QUERY = '(min-width: 840px)';

export interface FooterLink {
  id: string;
  label: string;
  to: string;
}

/** A headed link list. Wide screens: always open. Narrow screens: the heading becomes a
 *  disclosure button; links stay in the DOM (only hidden) so crawlers still see them. */
export function FooterColumn({ id, title, links, inline = false }: { id: string; title: string; links: FooterLink[]; inline?: boolean }) {
  const wide = useMediaQuery(WIDE_QUERY, true);
  const [open, setOpen] = useState(false);
  const headingId = `${id}-heading`;
  const listId = `${id}-list`;
  const collapsed = !wide && !open;

  return (
    <nav className={`footer-col${inline ? ' footer-col--inline' : ''}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="footer-col__heading title-small">
        {wide ? (
          title
        ) : (
          <button type="button" className="footer-col__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
            {title}
            <Icon aria-hidden="true" className="footer-col__chevron">expand_more</Icon>
          </button>
        )}
      </h2>
      <ul id={listId} className="footer-col__list" data-collapsed={collapsed ? 'true' : undefined}>
        {links.map((link) => (
          <li key={link.id}>
            <Link to={link.to} className="footer-col__link body-medium">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
