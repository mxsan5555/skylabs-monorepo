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
  SkyAccordionReact,
  SkyAccordionItemReact,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../auth/auth-context';
import { useCart } from '../../cart/cart-context';
import content from '../../content.json'
import './header.css';

export function Header() {
  const { isAuthenticated, signOut } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
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
            aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
            onClick={() => navigate('/wishlist')}
          >
            <Icon aria-hidden="true">favorite_border</Icon>
            {totalItems > 0 && (
              <span className="site-header__cart-badge" aria-hidden="true">
                {totalItems}
              </span>
            )}
          </IconButton>

          {/* Auth */}
          <div className="site-header__auth">
            {isAuthenticated ? (
              <>
                <TextButton onClick={() => navigate('/account')}>My Account</TextButton>
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
          <SkyAccordionReact>
            {/* <SkyAccordionItemReact header={content.nav.drawerCategoryHeader} open>
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
            </SkyAccordionItemReact> */}
          </SkyAccordionReact>

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
                <FilledButton onClick={() => { navigate('/account'); setDrawerOpen(false); }}>
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
