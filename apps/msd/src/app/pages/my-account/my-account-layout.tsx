import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { AccountProvider } from '../../../account/account-context';
import { isDualRoleUser, setExperienceMode } from '../../../auth/role-routing';
import './my-account.css';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Match only the exact path (for the index route) rather than every nested path under it. */
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/my-account', label: 'Profile & Addresses', icon: 'person', end: true },
  { to: '/orders', label: 'Orders', icon: 'receipt_long' },
  { to: '/bookings', label: 'Bookings', icon: 'event_available' },
  { to: '/wishlist', label: 'Wishlist', icon: 'favorite_border' },
  { to: '/cart', label: 'Cart', icon: 'shopping_cart' },
  { to: '/my-account/payments', label: 'Payment History', icon: 'payments' },
  { to: '/my-account/invoices', label: 'Invoices', icon: 'description' },
  { to: '/my-account/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Storefront "My Account" shell: a small nav (reusing the same `entity-list`/`.active` row
 * styling used for selectable lists elsewhere, not a new sidebar component) plus the routed
 * page content. Wraps its subtree in `AccountProvider` — the localStorage profile/address
 * store — the same way `AdminLayout` does, since the profile page here renders the shared
 * `ProfileForm` too. This is deliberately NOT `AdminLayout`: customers must never see the
 * admin-console chrome, even mostly empty.
 */
export function MyAccountLayout() {
  const { bootstrap, signOut } = useAuth();
  const dualRole = bootstrap ? isDualRoleUser(bootstrap) : false;

  const switchToVendor = () => {
    setExperienceMode('vendor');
  };

  return (
    <AccountProvider>
      <div className="my-account-shell">
        <meta name="robots" content="noindex" />
        <nav className="my-account-nav" aria-label="My account">
          <ul className="entity-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `entity-list__item my-account-nav__link${isActive ? ' active' : ''}`
                  }
                >
                  <span className="role-list__name">
                    <Icon aria-hidden="true">{item.icon}</Icon>
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
            {dualRole && (
              <li>
                <NavLink
                  to="/account/dashboard"
                  onClick={switchToVendor}
                  className="entity-list__item my-account-nav__link"
                >
                  <span className="role-list__name">
                    <Icon aria-hidden="true">storefront</Icon>
                    Switch to Vendor Dashboard
                  </span>
                </NavLink>
              </li>
            )}
            <li className="my-account-nav__logout">
              <button type="button" className="entity-list__item" onClick={signOut}>
                <span className="role-list__name">
                  <Icon aria-hidden="true">logout</Icon>
                  Logout
                </span>
              </button>
            </li>
          </ul>
        </nav>
        <div className="my-account-shell__content">
          <Outlet />
        </div>
      </div>
    </AccountProvider>
  );
}

export default MyAccountLayout;
