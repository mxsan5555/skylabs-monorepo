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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState(DEALS.slice(0, 6));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    const value = searchQuery.trim().toLowerCase();
    if (!value) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = DEALS.filter(
      (deal) =>
        deal.title.toLowerCase().includes(value) ||
        deal.providerName.toLowerCase().includes(value) ||
        deal.location.toLowerCase().includes(value)
    );
    setSuggestions(filtered.slice(0, 6));
    setShowSuggestions(true);
  }, [searchQuery]);
  useEffect(() => {
    if (!drawerOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () =>
      document.removeEventListener("keydown", handleEsc);
  }, [drawerOpen]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
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
      <a className="skip-link" href="#main-content"> {content.header.skipToContent}</a>
      <header className="site-header" role="banner">
        <div className="site-header__top">
          <IconButton
            className="site-header__menu-btn"

            aria-label={content.header.openMenu}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon>menu</Icon>
          </IconButton>
          <NavLink
            to="/"
            className="site-header__brand"
            aria-label={content.header.homeAriaLabel}
          >
            <img
              src={logo}
              alt={content.site.name}
              className="site-header__logo site-header__logo--desktop"
            />
            <img
              src={logo2}
              alt={content.site.name}
              className="site-header__logo site-header__logo--mobile"
            />
          </NavLink>
          <div className="header-categories">
            {content.nav.primary.map((category) => (
              <NavLink
                key={category.to}
                to={category.to}
                className={({ isActive }) =>
                  `header-category-link${isActive ? " header-category-link--active" : ""
                  }`
                }
              >
                {/* <Icon>{category.icon || "spa"}</Icon> */}
                <span>{category.label}</span>
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
          {/* <div className="site-header__search-wrapper">
            <form
              className="home__hero-search"
              role="search"
              aria-label={content.search.ariaLabel}
              onSubmit={(e) => {
                e.preventDefault();
                search(searchQuery);
              }}
            >
              <OutlinedTextField
                name="q"
                value={searchQuery}
                label={content.search.placeholder}
                className="home__hero-search-field"
                onInput={(e) =>
                  setSearchQuery(
                    (e.currentTarget as HTMLInputElement).value
                  )}
              >
                <Icon slot="leading-icon">search</Icon>
                {!!searchQuery && (
                  <Icon
                    slot="trailing-icon"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                  > close </Icon>
                )}
              </OutlinedTextField>
            </form>
            {showSuggestions && (
              <List className="search-suggestions">
                {suggestions.length ? (
                  suggestions.map((deal) => (
                    <ListItem
                      key={deal.id}
                      type="button"
                      className="search-suggestion"
                      onClick={() => openDeal(deal.id)}
                    >
                      <Icon slot="start">search</Icon>
                      <div>
                        <strong>{deal.title}</strong>
                        <small> {deal.providerName} • {deal.location} </small>
                      </div>
                    </ListItem>
                  ))
                ) : (
                  <ListItem disabled>
                    {content.search.emptySuggestion}
                  </ListItem>
                )}
              </List>
            )}
          </div> */}
          <div className="site-header__actions">
            <FilledTonalIconButton
              className="site-header__cart"
              aria-label={`Wishlist, ${isAuthenticated ? wishlistCount : 0
                } item${(isAuthenticated ? wishlistCount : 0) !== 1 ? "s" : ""}`}
              onClick={() => navigate("/wishlist")}
            >
              <Icon>favorite_border</Icon>
              {isAuthenticated && wishlistCount > 0 && (
                <span className="site-header__cart-badge">
                  {wishlistCount}
                </span>
              )}
            </FilledTonalIconButton>
            <FilledTonalIconButton
              className="site-header__cart"
              aria-label={`Cart, ${isAuthenticated ? cartCount : 0
                } item${(isAuthenticated ? cartCount : 0) !== 1 ? "s" : ""}`}
              onClick={() => navigate("/cart")}
            >
              <Icon>shopping_bag</Icon>
              {isAuthenticated && cartCount > 0 && (
                <span className="site-header__cart-badge">
                  {cartCount}
                </span>
              )}
            </FilledTonalIconButton>
            <div className="site-header__profile">
              {isAuthenticated ? (
                <div className="profile-menu" ref={profileRef} >
                  <FilledTonalIconButton
  id="profile-button"
  className="profile-button"
  onClick={toggleProfileMenu}
  aria-label="My Account"
>
  <Icon>person</Icon>
</FilledTonalIconButton>
                  {profileMenuOpen && (
                    <Menu
                      open
                      anchor="profile-button"
                        yOffset={15}
                      onClosed={() => setProfileMenuOpen(false)}
                    >
                      <MenuItem
                        onClick={() => {
                          navigate("/account");
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon slot="start">person</Icon>
                        {content.header.profileMenu.profile}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          navigate("/account/bookings");
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon slot="start">calendar_month</Icon>
                        {content.header.profileMenu.bookings}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          navigate("/wishlist");
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon slot="start">favorite</Icon>
                        {content.header.profileMenu.wishlist}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          clearCart();
                          clear();
                          signOut();
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon slot="start">logout</Icon>
                        {content.header.profileMenu.signOut}
                      </MenuItem>
                    </Menu>
                  )}
                </div>
              ) : (
                <FilledButton
                  onClick={() => navigate("/sign-in")}
                >
                  Sign In
                </FilledButton>
              )}
            </div>
          </div>
        </div>
      </header>
      {drawerOpen && (
        <div
          className="nav-drawer-backdrop"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}
      <nav
        id="nav-drawer"
        className={`nav-drawer${drawerOpen ? " nav-drawer--open" : ""}`}
        aria-label={content.header.drawerLabel}
        aria-hidden={!drawerOpen}
      >
        <div className="nav-drawer__header">
          <img
            src={logo}
            alt={content.site.name}
            className="site-header__logo"
          />
          <IconButton
            aria-label={content.header.closeNavigation}
            onClick={closeDrawer}
          >
            <Icon>close</Icon>
          </IconButton>
        </div>
        <Divider />
        <div className="nav-drawer__body">
          <sky-accordion />
          <Divider />
          <ul className="nav-drawer__links">
            {content.nav.primary.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className="nav-drawer__link"
                  onClick={closeDrawer}
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
                <TextButton
                  onClick={() => {
                    clearCart();
                    clear();
                    signOut();
                    closeDrawer();
                  }}
                >
                  {content.header.signOut}
                </TextButton>
              </>
            ) : (
              <FilledButton
                onClick={() => {
                  navigate("/sign-in");
                  closeDrawer();
                }}
              >
                {content.header.signIn}
              </FilledButton>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}