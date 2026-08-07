import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Divider, FilledButton, FilledTonalIconButton, Icon, IconButton, List, ListItem, Menu, MenuItem, OutlinedTextField, TextButton, } from "@skylabs-monorepo/shared-ui/react";
import { useAuth } from "../../auth/auth-context";
import { useCart } from "../../cart/cart-context";
import { useWishlist } from "../../wishlist/wishlist-context";
import content from "../../content.json";
import { DEALS } from "../../data/deals";
import logo from "../../assets/logo.jpg";
import logo2 from "../../assets/logo2.jpg";
import "./header.css";

export function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, signOut } = useAuth();
  const { totalItems: cartCount, clearCart, } = useCart();
  const { wishlistCount, clear, } = useWishlist();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
  const search = (value: string) => {
    const q = value.trim();
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
    setShowSuggestions(false);
  };
  const openDeal = (id: string | number) => {
    navigate(`/deal/${id}`);
    setSearchQuery("");
    setShowSuggestions(false);
  };
  const closeDrawer = () => setDrawerOpen(false);
  const toggleProfileMenu = () => setProfileMenuOpen((prev) => !prev);
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
          <div className="site-header__search-wrapper">
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
          </div>
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
                  >
                    <Icon>account_circle</Icon>
                    <span className="profile-arrow">
                      <Icon>{profileMenuOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}</Icon>
                    </span>
                  </FilledTonalIconButton>
                  {profileMenuOpen && (
                    <Menu
                      open
                      anchor="profile-button"
                      onClosed={() => setProfileMenuOpen(false)}
                    >
                      <MenuItem
                        onClick={() => {
                          navigate("/account");
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon>person</Icon>
                        {content.header.profileMenu.profile}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          navigate("/bookings");
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon>calendar_month</Icon>
                        {content.header.profileMenu.bookings}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          navigate("/wishlist");
                          setProfileMenuOpen(false);
                        }}
                      >
                        <Icon>favorite</Icon>
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
                        <Icon>logout</Icon>
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
        <nav
          className="site-header__nav"
          aria-label="Primary"
        >
          {content.nav.primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `site-header__nav-link${isActive ? " site-header__nav-link--active" : ""}`}
            >
              <Icon className="site-header__nav-icon">{item.icon}</Icon>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
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
                <FilledButton
                  onClick={() => {
                    navigate("/account");
                    closeDrawer();
                  }}
                >
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