import { Link } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';

export interface StatTileProps {
  /** Material Symbols name for the badge. */
  icon: string;
  /** The number or state the card is about. */
  value: string;
  label: string;
  /** Optional second line (e.g. "9 live", a due date, a status reason). */
  detail?: string;
  /** The page the whole card opens; without it the card is plain text. */
  to?: string;
}

/**
 * One console stat card: icon badge, value, label and an optional detail line; with `to`, the
 * whole card is one link with an arrow. Shared by the admin dashboard and the member page
 * (item 7) so both read the same way. Styles: `.dashboard-stat*` in styles.css.
 */
export function StatTile({ icon, value, label, detail, to }: StatTileProps) {
  const body = (
    <>
      <span className="dashboard-stat__icon">
        <Icon aria-hidden="true">{icon}</Icon>
      </span>
      <span className="dashboard-stat__text">
        <span className="dashboard-stat__value title-large">{value}</span>{' '}
        <span className="dashboard-stat__label body-medium">{label}</span>
        {detail && (
          <>
            {' '}
            <span className="dashboard-stat__detail body-small">{detail}</span>
          </>
        )}
      </span>
    </>
  );
  if (!to) return <div className="dashboard-stat">{body}</div>;
  return (
    <Link to={to} className="dashboard-stat">
      {body}
      <span className="dashboard-stat__go">
        <Icon aria-hidden="true">arrow_forward</Icon>
      </span>
    </Link>
  );
}

export default StatTile;
