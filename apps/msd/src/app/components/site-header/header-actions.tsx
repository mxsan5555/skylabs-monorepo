import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilledButton, FilledTonalIconButton, Icon, Menu, MenuItem } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCartCount } from '../../../hooks/use-cart-count';
import { countLabel, useAccountLinks } from '../shell/shell-labels';
import content from '../../../content.json';

const t = content.header;
const ACCOUNT_BUTTON_ID = 'site-header-account';

function CountedAction({ href, icon, label, count }: { href: string; icon: string; label: string; count: number }) {
  return (
    <span className="header-actions__counted">
      <FilledTonalIconButton href={href} aria-label={countLabel(label, count)}>
        <Icon>{icon}</Icon>
      </FilledTonalIconButton>
      {count > 0 && (
        <sky-badge size="small" className="header-actions__badge" aria-hidden="true">
          {count}
        </sky-badge>
      )}
    </span>
  );
}

/** Row 1 actions (desktop only; phones use MobileTabBar). */
export function HeaderActions() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { ids } = useWishlist();
  const cartCount = useCartCount();
  const { isAuthenticated, isCustomer, accountPath } = useAccountLinks();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="header-actions">
      <Link to={t.becomeMemberTo} className="header-actions__member label-large">
        {t.becomeMember}
      </Link>
      <CountedAction href="/wishlist" icon="favorite_border" label={t.wishlist} count={ids?.size ?? 0} />
      <CountedAction href="/cart" icon="shopping_bag" label={t.cart} count={cartCount} />
      {isAuthenticated ? (
        <span className="header-actions__account">
          <FilledTonalIconButton
            id={ACCOUNT_BUTTON_ID}
            aria-label={t.accountMenuLabel}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon>person</Icon>
          </FilledTonalIconButton>
          <Menu
            open={menuOpen}
            anchor={ACCOUNT_BUTTON_ID}
            positioning="popover"
            onClosed={() => setMenuOpen(false)}
          >
            <MenuItem onClick={() => go(accountPath)}>
              <Icon slot="start" aria-hidden="true">
                person
              </Icon>
              <span slot="headline">{t.profileMenu.profile}</span>
            </MenuItem>
            {isCustomer && (
              <MenuItem onClick={() => go('/orders')}>
                <Icon slot="start" aria-hidden="true">
                  receipt_long
                </Icon>
                <span slot="headline">{t.profileMenu.orders}</span>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
            >
              <Icon slot="start" aria-hidden="true">
                logout
              </Icon>
              <span slot="headline">{t.profileMenu.signOut}</span>
            </MenuItem>
          </Menu>
        </span>
      ) : (
        <FilledButton href="/sign-in">{t.signIn}</FilledButton>
      )}
    </div>
  );
}
