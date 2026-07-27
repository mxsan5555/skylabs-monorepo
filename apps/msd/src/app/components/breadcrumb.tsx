import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumb({ items, className = '' }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav className={`breadcrumb-nav${className ? ` ${className}` : ''}`} aria-label="Breadcrumb">
      <ol className="breadcrumb">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.label} aria-current={isLast ? 'page' : undefined}>
              {item.to && !isLast ? <Link to={item.to}>{item.label}</Link> : item.label}
              {!isLast && (
                <md-icon aria-hidden="true" class="breadcrumb__sep">chevron_right</md-icon>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
