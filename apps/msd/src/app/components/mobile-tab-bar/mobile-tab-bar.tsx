import { useId, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCartCount } from '../../../hooks/use-cart-count';
import { countLabel, useAccountLinks } from '../shell/shell-labels';
import { CategorySheet } from './category-sheet';
import content from '../../../content.json';
import './mobile-tab-bar.css';

const t = content.tabBar;

function TabIcon({ icon, count }: { icon: string; count?: number }) {
  return (
    <span className="tab-bar__icon">
      <Icon aria-hidden="true">{icon}</Icon>
      {!!count && (
        <sky-badge size="small" className="tab-bar__badge" aria-hidden="true">
          {count}
        </sky-badge>
      )}
    </span>
  );
}

function TabLink({
  to,
  icon,
  label,
  count,
  end,
}: {
  to: string;
  icon: string;
  label: string;
  count?: number;
  end?: boolean;
}) {
  return (
    <li>
      <NavLink to={to} end={end} className="tab-bar__item" aria-label={count ? countLabel(label, count) : undefined}>
        <TabIcon icon={icon} count={count} />
        <span className="tab-bar__label label-medium">{label}</span>
      </NavLink>
    </li>
  );
}

/**
 * Phone-only (< 840px) bottom navigation: Home, Categories (opens a full-screen sheet),
 * Wishlist, Cart, Account. Carries the actions the header hides below 840px.
 */
export function MobileTabBar() {
  const { ids } = useWishlist();
  const cartCount = useCartCount();
  const { accountPath } = useAccountLinks();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetId = useId();
  const categoriesButtonRef = useRef<HTMLButtonElement>(null);

  // The sheet unmounts on close, so md-dialog cannot restore focus itself; return it to the button.
  const closeSheet = () => {
    setSheetOpen(false);
    categoriesButtonRef.current?.focus();
  };

  return (
    <>
      <nav className="tab-bar" aria-label={t.label}>
        <ul className="tab-bar__list">
          <TabLink to="/" icon="home" label={t.home} end />
          <li>
            <button
              ref={categoriesButtonRef}
              type="button"
              className="tab-bar__item"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-controls={sheetOpen ? sheetId : undefined}
              onClick={() => setSheetOpen(true)}
            >
              <TabIcon icon="grid_view" />
              <span className="tab-bar__label label-medium">{t.categories}</span>
            </button>
          </li>
          <TabLink to="/wishlist" icon="favorite_border" label={t.wishlist} count={ids?.size ?? 0} />
          <TabLink to="/cart" icon="shopping_bag" label={t.cart} count={cartCount} />
          <TabLink to={accountPath} icon="person" label={t.account} />
        </ul>
      </nav>
      <CategorySheet id={sheetId} open={sheetOpen} onClose={closeSheet} />
    </>
  );
}
