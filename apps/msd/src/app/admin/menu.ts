import type { UserRole } from '../../types';

/**
 * Role-aware navigation for the account/admin console (dummy labels for now).
 * Each item declares which roles may see it; the sidebar filters by the signed-in
 * user's roles, so one layout serves user / admin / marketing / sales.
 */
export interface MenuItem {
  label: string;
  icon: string;
  to?: string;
  roles: UserRole[];
  children?: MenuItem[];
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
      {
        label: 'Dashboard',
        icon: 'dashboard',
        to: '/account/dashboard',
        roles: EVERYONE,
      },
      {
        label: 'My Account',
        icon: 'person',
        to: '/account/profile',
        roles: EVERYONE,
      },
      {
        label: 'Dashboard',
        icon: 'dashboard',
        to: '/account/dashboard',
        roles: EVERYONE,
      },
      {
        label: 'My Account',
        icon: 'person',
        to: '/account/profile',
        roles: EVERYONE,
      },
      {
        label: 'My Bookings',
        icon: 'calendar_month',
        to: '/account/bookings',
        roles: EVERYONE,
      },
    ],
  },
  {
    label: 'Masters',
    items: [
      {
        label: 'Master',
        icon: 'folder',
        roles: ['admin'],
        children: [
          {
            label: 'Category',
            icon: 'category',
            to: '/account/master/category',
            roles: ['admin'],
          },
          {
            label: 'Subcategory',
            icon: 'account_tree',
            to: '/account/master/subcategory',
            roles: ['admin'],
          },
          {
            label: 'Customer',
            icon: 'account_tree',
            to: '/account/master/customer',
            roles: ['admin'],
          },
          {
            label: 'Notification',
            icon: 'account_tree',
            to: '/account/master/notification',
            roles: ['admin'],
          },
          {
            label: 'Membership',
            icon: 'account_tree',
            to: '/account/master/membership',
            roles: ['admin'],
          },
        ],
      },
    ],
  },

  {
    label: 'Manage',
    items: [
      { label: 'Deals', icon: 'sell', to: '/account/deals', roles: ['admin'] },
      {
        label: 'Product',
        icon: 'package_2',
        to: '/account/product',
        roles: ['admin'],
      },
      {
        label: 'Promotions',
        icon: 'campaign',
        to: '/account/promotions',
        roles: ['marketing'],
      },
      {
        label: 'Sales',
        icon: 'insights',
        to: '/account/sales',
        roles: ['sales'],
      },
    ],
  },

  {
    label: 'Company',
    items: [
      {
        label: 'Vendor',
        icon: 'storefront',
        to: '/account/company/vendor',
        roles: ['admin'],
      },
      {
        label: 'Service',
        icon: 'massage',
        to: '/account/company/service',
        roles: ['admin'],
      },
    ],
  },
  {
    label: 'Orders',
    items: [
      {
        label: 'Cart',
        icon: 'add_shopping_cart',
        to: '/account/orders/cart',
        roles: ['admin'],
      },
      {
        label: 'Booking',
        icon: 'event_available',
        to: '/account/orders/booking',
        roles: ['admin'],
      },
      {
        label: 'Wishlist',
        icon: 'favorite',
        to: '/account/orders/wishlist',
        roles: ['admin'],
      },
      {
        label: 'Payment',
        icon: 'paid',
        to: '/account/orders/payment',
        roles: ['admin'],
      },
    ],
  },
];

/** Flattened lookup for breadcrumbs. */
export function findMenuItem(pathname: string): MenuItem | undefined {
  return ADMIN_MENU.flatMap((g) => g.items).find((i) => i.to === pathname);
}
