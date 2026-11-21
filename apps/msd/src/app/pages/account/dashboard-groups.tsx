import { useId } from 'react';
import { Link } from 'react-router-dom';
import { StatTile } from '../../components/stat-tile/stat-tile';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { DashboardStats } from '../../../api/rbac/dashboard';
import { formatINR } from '../../../utils/format';

interface StatCard {
  key: string;
  label: string;
  icon: string;
  value: (stats: DashboardStats) => string;
  /** Role dashboard-widget key that shows this card; cards without one need `reports:view`. */
  widget?: string;
  /** The page the whole card opens; the card is a link only when the user holds `${menuKey}:view`. */
  link: { to: string; menuKey: string };
}

interface LinkItem {
  label: string;
  to: string;
  icon: string;
  /** Menu key: the link shows only when the user holds `${menuKey}:view`. */
  menuKey: string;
}

const count = (n: number) => n.toLocaleString('en-IN');

const MEMBER_CARDS: StatCard[] = [
  { key: 'members', label: 'All members', icon: 'storefront', widget: 'vendors-count', value: (s) => count(s.vendors), link: { to: '/account/members', menuKey: 'members' } },
  { key: 'branches', label: 'Total branches', icon: 'location_on', value: (s) => count(s.branches), link: { to: '/account/branches', menuKey: 'vendors.branches' } },
  { key: 'deals', label: 'Total deals', icon: 'local_offer', value: (s) => count(s.deals), link: { to: '/account/deals', menuKey: 'vendors.deals' } },
  { key: 'products', label: 'Total products', icon: 'inventory_2', widget: 'products-count', value: (s) => count(s.products), link: { to: '/account/products', menuKey: 'products' } },
  { key: 'therapists', label: 'Total therapists', icon: 'spa', value: (s) => count(s.therapists), link: { to: '/account/therapists', menuKey: 'vendors.therapists' } },
];

const CUSTOMER_CARDS: StatCard[] = [
  { key: 'customers', label: 'Total customers', icon: 'groups', widget: 'customers-count', value: (s) => count(s.customers), link: { to: '/account/customers', menuKey: 'customers' } },
  { key: 'orders', label: 'Total orders', icon: 'shopping_bag', widget: 'orders-recent', value: (s) => count(s.orders), link: { to: '/account/orders', menuKey: 'orders' } },
  { key: 'revenue', label: 'Total revenue', icon: 'payments', value: (s) => formatINR(Number(s.revenue)), link: { to: '/account/reports', menuKey: 'reports' } },
];

const QUICK_ACTIONS: LinkItem[] = [
  { label: 'Categories', to: '/account/masters/categories', icon: 'category', menuKey: 'masters.categories' },
  { label: 'Slider', to: '/account/masters/home-hero', icon: 'view_carousel', menuKey: 'masters.home-hero' },
  { label: 'Marketing tags', to: '/account/masters/tags', icon: 'sell', menuKey: 'masters.tags' },
  { label: 'Promotion CTA', to: '/account/masters/promotions', icon: 'campaign', menuKey: 'masters.promotions' },
  { label: 'Settings', to: '/account/settings', icon: 'settings', menuKey: 'settings' },
];

const ADMIN_LINKS: LinkItem[] = [
  { label: 'Manage roles', to: '/account/administration/roles', icon: 'admin_panel_settings', menuKey: 'rbac.roles' },
  { label: 'Manage users', to: '/account/administration/users', icon: 'manage_accounts', menuKey: 'rbac.users' },
  { label: 'View logs', to: '/account/administration/audit-logs', icon: 'history', menuKey: 'rbac.audit-logs' },
  { label: 'Analytics', to: '/account/reports', icon: 'analytics', menuKey: 'reports' },
  { label: 'Social', to: '/account/cms/social-media', icon: 'share', menuKey: 'cms.social-media' },
];

export interface DashboardGroupsProps {
  stats: DashboardStats | null;
  loading: boolean;
  /** Keys of the dashboard widgets assigned to the user's roles. */
  widgetKeys: string[];
}

function StatGroup({ title, cards, stats, loading }: { title: string; cards: StatCard[]; stats: DashboardStats | null; loading: boolean }) {
  const headingId = useId();
  const { can } = useAuth();
  if (cards.length === 0) return null;
  return (
    <section className="dashboard-group" aria-labelledby={headingId}>
      <h2 id={headingId} className="title-medium">
        {title}
      </h2>
      <ul className="dashboard-stats" aria-busy={loading}>
        {cards.map((card) => (
          <li key={card.key}>
            <StatTile
              icon={card.icon}
              value={loading || !stats ? '—' : card.value(stats)}
              label={card.label}
              to={can(card.link.menuKey, 'view') ? card.link.to : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LinkGroup({ title, items }: { title: string; items: LinkItem[] }) {
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <section className="dashboard-group" aria-labelledby={headingId}>
      <h2 id={headingId} className="title-medium">
        {title}
      </h2>
      <ul className="dashboard-links">
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to}>
              <Icon aria-hidden="true">{item.icon}</Icon>
              {item.label}
              <Icon aria-hidden="true" className="dashboard-links__go">
                arrow_forward
              </Icon>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two rows of two columns: Members | Customers stats, then Admin | Quick actions links. */
export function DashboardGroups({ stats, loading, widgetKeys }: DashboardGroupsProps) {
  const { can } = useAuth();
  const showAll = can('reports', 'view');
  const visible = (card: StatCard) => showAll || (card.widget !== undefined && widgetKeys.includes(card.widget));
  const allowed = (item: LinkItem) => can(item.menuKey, 'view');

  const quick = QUICK_ACTIONS.filter(allowed);
  const admin = ADMIN_LINKS.filter(allowed);

  return (
    <>
      <div className="dashboard-pair">
        <StatGroup title="Members" cards={MEMBER_CARDS.filter(visible)} stats={stats} loading={loading} />
        <StatGroup title="Customers" cards={CUSTOMER_CARDS.filter(visible)} stats={stats} loading={loading} />
      </div>
      {(quick.length > 0 || admin.length > 0) && (
        <div className="dashboard-pair">
          <LinkGroup title="Admin" items={admin} />
          <LinkGroup title="Quick actions" items={quick} />
        </div>
      )}
    </>
  );
}

export default DashboardGroups;
