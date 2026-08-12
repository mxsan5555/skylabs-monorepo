import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  TextButton,
  IconButton,
  FilledTonalIconButton,
  Icon,
  OutlinedTextField,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, subscribeCartUpdated } from '../../api/cart';
import { useWishlist } from '../../wishlist/wishlist-context';
import { isCustomerUser, isStaffUser } from '../../auth/role-routing';
import content from '../../content.json'
import './header.css';

export function Header() {
  const { isAuthenticated, signOut, token, bootstrap } = useAuth();
  const navigate = useNavigate();
  // Real, backend-driven wishlist count — `WishlistProvider` already loads the signed-in
  // customer's full wishlist on mount/sign-in/sign-out, so the badge just reads its live `ids`.
  const { ids: wishlistIds } = useWishlist();
  // Customers (including dual-role customer+vendor users, who land here in their customer
  // experience) get the storefront's own account area; staff/vendor-only users keep the
  // existing admin-console destination — never mix the two navigations.
  const myAccountPath = bootstrap && isCustomerUser(bootstrap) && !isStaffUser(bootstrap)
    ? '/my-account'
    : '/account';
  const [totalItems, setTotalItems] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [drawerOpen]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Real, backend-driven cart count — refetched on sign-in/out and whenever any page mutates
  // the cart (see `subscribeCartUpdated` in `api/cart.ts`), so the badge stays live without a
  // global store.
  useEffect(() => {
    if (!isAuthenticated) {
      setTotalItems(0);
      return;
    }
    let cancelled = false;
    const loadCount = () => {
      getCart(token)
        .then(({ data }) => {
          if (!cancelled) setTotalItems(data.items.reduce((sum, item) => sum + item.quantity, 0));
        })
        .catch(() => {
          if (!cancelled) setTotalItems(0);
        });
    };
    loadCount();
    const unsubscribe = subscribeCartUpdated(loadCount);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthenticated, token]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setSearchOpen(false);
    }
  }

  return (
    <>
      {/* Skip to main content — accessibility */}
      <a className="skip-link" href="#main-content">
        {content.header.skipToContent}
      </a>

      <header className="site-header" role="banner">
        <div className="site-header__inner">
          {/* Mobile: hamburger */}
          <FilledTonalIconButton
            className="site-header__hamburger"
            aria-label={content.header.openNavigation}
            aria-expanded={drawerOpen}
            aria-controls="nav-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon aria-hidden="true">menu</Icon>
          </FilledTonalIconButton>

          {/* Brand */}
          <NavLink to="/" className="site-header__brand" aria-label={`${content.site.name} – ${content.site.fullName} home`}>
            <span className="site-header__brand-icon" aria-hidden="true">
              <Icon>spa</Icon>
            </span>
            <span className="site-header__brand-text">
              <span className="site-header__brand-name">{content.site.name}</span>
              <span className="site-header__brand-tagline">{content.site.fullName}</span>
            </span>
          </NavLink>

          {/* Desktop primary nav */}
          <nav className="site-header__nav" aria-label="Primary">
            {content.nav.primary.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `site-header__nav-link${isActive ? ' site-header__nav-link--active' : ''
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop search */}
          {/* <form
            className={`site-header__search-form${searchOpen ? ' site-header__search-form--open' : ''}`}
            role="search"
            aria-label="Site search"
            onSubmit={handleSearch}
          >
            <OutlinedTextField
              className="site-header__search-field"
              label={content.search.placeholder}
              value={searchQuery}
              onInput={(e) =>
                setSearchQuery((e.target as unknown as { value: string }).value)
              }
            >
              <Icon slot="leading-icon" aria-hidden="true">search</Icon>
            </OutlinedTextField>
          </form> */}

          {/* Mobile search toggle */}
          <IconButton
            className="site-header__search-toggle"
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Icon aria-hidden="true">{searchOpen ? 'close' : 'search'}</Icon>
          </IconButton>

          {/* Cart */}
          <IconButton
            className="site-header__cart"
            aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
            onClick={() => navigate('/cart')}
          >
            <Icon aria-hidden="true">shopping_bag</Icon>
            {totalItems > 0 && (
              <span className="site-header__cart-badge" aria-hidden="true">
                {totalItems}
              </span>
            )}
          </IconButton>
          <IconButton
            className="site-header__cart"
            aria-label={`Wishlist, ${wishlistIds.size} item${wishlistIds.size !== 1 ? 's' : ''}`}
            onClick={() => navigate('/wishlist')}
          >
            <Icon aria-hidden="true">favorite_border</Icon>
            {wishlistIds.size > 0 && (
              <span className="site-header__cart-badge" aria-hidden="true">
                {wishlistIds.size}
              </span>
            )}
          </IconButton>

          {/* Auth */}
          <div className="site-header__auth">
            {isAuthenticated ? (
              <>
                <TextButton onClick={() => navigate(myAccountPath)}>My Account</TextButton>
                <TextButton onClick={signOut}>Sign Out</TextButton>
              </>
            ) : (
              <FilledButton onClick={() => navigate('/sign-in')}>Sign In</FilledButton>
            )}
          </div>
        </div>

        {/* Mobile search bar (expanded) */}
        {searchOpen && (
          <div className="site-header__mobile-search">
            <form role="search" aria-label="Site search" onSubmit={handleSearch}>
              <OutlinedTextField
                className="site-header__search-field site-header__search-field--mobile"
                label={content.search.placeholder}
                value={searchQuery}
                onInput={(e) =>
                  setSearchQuery((e.target as unknown as { value: string }).value)
                }
              >
                <Icon slot="leading-icon" aria-hidden="true">search</Icon>
              </OutlinedTextField>
            </form>
          </div>
        )}
      </header>

      {/* Mobile nav drawer */}
      {drawerOpen && (
        <div
          className="nav-drawer-backdrop"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <nav
        id="nav-drawer"
        className={`nav-drawer${drawerOpen ? ' nav-drawer--open' : ''}`}
        aria-label="Navigation drawer"
        aria-hidden={!drawerOpen}
      >
        <div className="nav-drawer__header">
          <span className="nav-drawer__brand">
            <Icon aria-hidden="true" className="nav-drawer__brand-icon">spa</Icon>
            <span>
              <strong>MSD</strong>
              <small>MySpaDeal</small>
            </span>
          </span>
          <IconButton aria-label={content.header.closeNavigation} onClick={() => setDrawerOpen(false)}>
            <Icon aria-hidden="true">close</Icon>
          </IconButton>
        </div>

        <Divider />

        <div className="nav-drawer__body">
          <sky-accordion>
            {/* <sky-accordion-item header={content.nav.drawerCategoryHeader} open>
              <ul className="nav-drawer__cat-list">
                {content.nav.categories.map((cat) => (
                  <li key={cat.to}>
                    <NavLink
                      to={cat.to}
                      className="nav-drawer__cat-link"
                      onClick={() => setDrawerOpen(false)}
                    >
                      {cat.label}
                      <span className="nav-drawer__cat-count">{cat.count} services</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </sky-accordion-item> */}
          </sky-accordion>

          <Divider />

          <ul className="nav-drawer__links">
            {content.nav.primary.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className="nav-drawer__link"
                  onClick={() => setDrawerOpen(false)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <Divider />

          <div className="nav-drawer__auth">
            {isAuthenticated ? (
              <>
                <FilledButton onClick={() => { navigate(myAccountPath); setDrawerOpen(false); }}>
                  {content.header.myAccount}
                </FilledButton>
                <TextButton onClick={() => { signOut(); setDrawerOpen(false); }}>
                  {content.header.signOut}
                </TextButton>
              </>
            ) : (
              <FilledButton onClick={() => { navigate('/sign-in'); setDrawerOpen(false); }}>
                {content.header.signIn}
              </FilledButton>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
