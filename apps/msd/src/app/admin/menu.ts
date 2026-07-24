import type { UserRole } from '../../types';

/**
 * Role-aware navigation for the account/admin console (dummy labels for now).
 * Each item declares which roles may see it; the sidebar filters by the signed-in
 * user's roles, so one layout serves user / admin / marketing / sales.
 */
export interface MenuItem {
  label: string;
  icon: string;
  to: string;
  roles: UserRole[];
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const EVERYONE: UserRole[] = ['user', 'admin', 'marketing', 'sales'];
const STAFF: UserRole[] = ['admin', 'marketing'];

export const ADMIN_MENU: MenuGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'dashboard', to: '/account/dashboard', roles: EVERYONE },
      { label: 'My Bookings', icon: 'confirmation_number', to: '/account/bookings', roles: EVERYONE },
      { label: 'My Account', icon: 'person', to: '/account/profile', roles: EVERYONE },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Deals', icon: 'sell', to: '/account/deals', roles: ['admin'] },
      { label: 'Promotions', icon: 'campaign', to: '/account/promotions', roles: ['marketing'] },
      { label: 'Sales', icon: 'insights', to: '/account/sales', roles: ['admin', 'sales'] },
    ],
  },
  {
    label: 'Master',
    items: [
      { label: 'Categories', icon: 'category', to: '/account/master/categories', roles: STAFF },
      { label: 'Features', icon: 'tune', to: '/account/master/features', roles: STAFF },
      { label: 'Cancellation Policies', icon: 'policy', to: '/account/master/cancellation-policies', roles: ['admin'] },
      { label: 'Companies', icon: 'storefront', to: '/account/master/companies', roles: ['admin'] },
    ],
  },
];

/** Flattened lookup for breadcrumbs. */
export function findMenuItem(pathname: string): MenuItem | undefined {
  return ADMIN_MENU.flatMap((g) => g.items).find((i) => i.to === pathname);
}
