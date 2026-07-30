import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FilledButton, FilledTonalIconButton, TextButton, IconButton, Icon, OutlinedTextField, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../auth/auth-context';
import { useCart } from '../../cart/cart-context';
import content from '../../content.json';
import './header.css';
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { DEALS } from "../../data/deals";
import type { Deal } from "../../types";

export function Header() {
  const { isAuthenticated, signOut } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const { location } = useCurrentLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Deal[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const results = DEALS.filter((deal) =>
      deal.title.toLowerCase().includes(query) ||
      deal.providerName.toLowerCase().includes(query) ||
      deal.location.toLowerCase().includes(query)
    );

    setSuggestions(results.slice(0, 6));
    setShowSuggestions(true);
  }, [searchQuery]);

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
      // setSearchOpen(false);
    }
  }

  return (
    <>
      {/* Skip to main content — accessibility */}
      <a className="skip-link" href="#main-content">
        {content.header.skipToContent}
      </a>
<>
      <header className="site-header" role="banner">
        <div className="site-header__top">
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
          <div className="site-header__search-wrapper">
            <div className="site-header__search-top">
              <form
                className="home__hero-search"
                role="search"
                aria-label="Search deals"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value;
                  if (q?.trim()) navigate(`/explore?q=${encodeURIComponent(q.trim())}`);
                  else navigate('/explore');
                }}
              >
                <OutlinedTextField
                  name="q"
                  label={content.search.placeholder}
                  className="home__hero-search-field"
                  value={searchQuery}
                  onInput={(e) => {
                    const target = e.currentTarget as HTMLInputElement;
                    setSearchQuery(target.value);
                  }}
                >
                  <Icon slot="leading-icon" aria-hidden="true">search</Icon>
                  {searchQuery && (
                    <Icon
                      slot="trailing-icon"
                      onClick={() => setSearchQuery('')}
                      style={{ cursor: "pointer" }}
                    >
                      close
                    </Icon>
                  )}
                </OutlinedTextField>
              </form>
              <button
                type="button"
                className="site-header__location"
              >
                <Icon>location_on</Icon>

                <span>
                  {location ?? "Detecting location..."}
                </span>
              </button>
            </div>
            {showSuggestions && (
              <div className="search-suggestions">
                {suggestions.length > 0 ? (
                  suggestions.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      className="search-suggestion"
                      onClick={() => {
                        navigate(`/deal/${deal.id}`);
                        setSearchQuery("");
                        setShowSuggestions(false);
                      }}
                    >
                      <Icon>search</Icon>

                      <div>
                        <strong>{deal.title}</strong>
                        <small>
                          {deal.providerName} • {deal.location}
                        </small>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="search-no-results">
                    No spas found
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="site-header__actions">
            {/*wishlist*/}
            <FilledTonalIconButton
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
            </FilledTonalIconButton>

            {/* Cart */}
            <FilledTonalIconButton
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
            </FilledTonalIconButton>
            {/* Account */}
            <div className="site-header__auth">
              {isAuthenticated ? (
                <>
                  <FilledButton onClick={() => navigate('/account')}>My Account</FilledButton>
                  <FilledButton onClick={signOut}>Sign Out</FilledButton>
                </>
              ) : (
                <FilledButton onClick={() => navigate('/sign-in')}>Sign In</FilledButton>
              )}
            </div>
          </div>
        </div>
        
        {/* Second Row */}
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
              <>
                <Icon className="site-header__nav-icon" aria-hidden="true"  >{item.icon} </Icon>
                <span>{item.label}</span>
              </>
            </NavLink>
          ))}
        </nav>
      </header>
</>
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
