import type { UserRole } from '../models';

/**
 * Role-aware navigation for the account/admin console (dummy labels for now).
 * Each item declares which roles may see it; the sidebar filters by the signed-in
 * user's roles, so one layout serves customer / driver / admin / marketing / sales.
 */
export interface MenuItem {
  label: string;
  icon: string;
  to: string;
  roles: UserRole[];
  children?: MenuItem[];
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const EVERYONE: UserRole[] = [
  'customer',
  'driver',
  'admin',
  'marketing',
  'sales',
];

export const ADMIN_MENU: MenuGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'dashboard', to: '/account/dashboard', roles: EVERYONE },
      { label: 'My Account', icon: 'person', to: '/account/profile', roles: EVERYONE },
      { label: 'Location Picker', icon: 'my_location', to: '/location', roles: EVERYONE },
      {label: 'Master',icon: 'settings',to: '/account/master',roles: EVERYONE,
        children: [
          { label: 'Category', icon: 'category', to: '/account/master/category', roles: EVERYONE },
          { label: 'Subcategory', icon: 'layers', to: '/account/master/subcategory', roles: EVERYONE}
        ],
      },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Drivers', icon: 'local_taxi', to: '/account/drivers', roles: EVERYONE },
      { label: 'Bookings', icon: 'event', to: '/account/bookings', roles: ['admin'] },
      { label: 'Promotions', icon: 'campaign', to: '/account/promotions', roles: ['marketing'] },
      { label: 'Sales', icon: 'insights', to: '/account/sales', roles: ['sales'] },
    ],
  },
];

/** Flattened lookup for breadcrumbs. */
export function findMenuItem(url: string): MenuItem | undefined {
  return ADMIN_MENU.flatMap((g) => g.items)
    .flatMap((i) => [i, ...(i.children || [])])
    .find((i) => i.to === url);
}
