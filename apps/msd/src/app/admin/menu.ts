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

export const ADMIN_MENU: MenuGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'dashboard', to: '/account/dashboard', roles: EVERYONE },
      { label: 'My Account', icon: 'person', to: '/account/profile', roles: EVERYONE },
     {
  label: "Master",
  icon: "database",
  roles: EVERYONE,
  children: [
    {
      label: "Category",
      to: "/account/master/category",
      roles: EVERYONE,
    },
    {
      label: "Sub Category",
      to: "/account/master/sub-category",
      roles: EVERYONE,
    },
    {
      label: "Brand",
      to: "/account/master/brand",
      roles: EVERYONE,
    },
    {
      label: "Vehicle Type",
      to: "/account/master/vehicle-type",
      roles: EVERYONE,
    },
  ],
},
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Deals', icon: 'sell', to: '/account/deals', roles: ['admin'] },
      { label: 'Promotions', icon: 'campaign', to: '/account/promotions', roles: ['marketing'] },
      { label: 'Sales', icon: 'insights', to: '/account/sales', roles: ['sales'] },
    ],
  },
];

/** Flattened lookup for breadcrumbs. */
export function findMenuItem(pathname: string): MenuItem | undefined {
  return ADMIN_MENU.flatMap((g) => g.items).find((i) => i.to === pathname);
}
