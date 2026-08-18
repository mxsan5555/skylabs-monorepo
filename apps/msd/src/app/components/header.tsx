import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import {
  FilledButton,
  TextButton,
  IconButton,
  FilledTonalIconButton,
  Icon,
  Menu,
  MenuItem,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';

import { useAuth } from '@skylabs-monorepo/shared-auth/react';

import {
  getCart,
  subscribeCartUpdated,
  clearCart,
} from '../../api/cart';

import {
  listBookings,
  subscribeBookingsUpdated,
} from '../../api/bookings';

import { useWishlist } from '../../wishlist/wishlist-context';

import {
  isCustomerUser,
  isStaffUser,
} from '../../auth/role-routing';

import { DEALS } from '../../data/deals';

import content from '../../content.json';

import './header.css';

export function Header() {
  const {
    isAuthenticated,
    signOut,
    token,
    bootstrap,
  } = useAuth();

  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Wishlist
  // ---------------------------------------------------------------------------

  const { ids: wishlistIds } = useWishlist();

  // ---------------------------------------------------------------------------
  // ROLE CHECK
  // ---------------------------------------------------------------------------

  /**
   * Customer:
   *   - Wishlist
   *   - Cart
   *   - Bookings
   *   - Orders
   *
   * Staff:
   *   - SuperAdmin
   *   - Admin
   *   - Vendor
   *   - Marketing
   *   - Sales
   *
   * Wishlist and Cart icons are visible for ALL users,
   * including guests.
   *
   * Customer-only pages/APIs remain protected.
   */

  const isCustomer =
    !!bootstrap &&
    isCustomerUser(bootstrap) &&
    !isStaffUser(bootstrap);

  const isStaff =
    !!bootstrap &&
    isStaffUser(bootstrap);

  // ---------------------------------------------------------------------------
  // Account path
  // ---------------------------------------------------------------------------

  const myAccountPath = isCustomer
    ? '/my-account'
    : '/account';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [totalItems, setTotalItems] =
    useState(0);

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [profileMenuOpen, setProfileMenuOpen] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [suggestions, setSuggestions] =
    useState(DEALS.slice(0, 6));

  const [showSuggestions, setShowSuggestions] =
    useState(false);

  const profileRef =
    useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Counts
  // ---------------------------------------------------------------------------

  const wishlistCount =
    wishlistIds ? wishlistIds.size : 0;

  const cartCount = totalItems;

  // ---------------------------------------------------------------------------
  // Profile menu
  // ---------------------------------------------------------------------------

  const toggleProfileMenu = () => {
    setProfileMenuOpen((state) => !state);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Close profile menu outside click
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent,
    ) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(
          event.target as Node,
        )
      ) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    );

    return () =>
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      );
  }, []);

  // ---------------------------------------------------------------------------
  // Search suggestions
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const value =
      searchQuery.trim().toLowerCase();

    if (!value) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const filtered = DEALS.filter(
      (deal) =>
        deal.title
          .toLowerCase()
          .includes(value) ||
        deal.providerName
          .toLowerCase()
          .includes(value) ||
        deal.location
          .toLowerCase()
          .includes(value),
    );

    setSuggestions(
      filtered.slice(0, 6),
    );

    setShowSuggestions(true);
  }, [searchQuery]);

  // ---------------------------------------------------------------------------
  // Drawer Escape
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const handleEsc = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };

    document.addEventListener(
      'keydown',
      handleEsc,
    );

    return () =>
      document.removeEventListener(
        'keydown',
        handleEsc,
      );
  }, [drawerOpen]);

  // ---------------------------------------------------------------------------
  // Body scroll lock
  // ---------------------------------------------------------------------------

  useEffect(() => {
    document.body.style.overflow =
      drawerOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // ---------------------------------------------------------------------------
  // Cart count
  // ---------------------------------------------------------------------------

  useEffect(() => {
    /**
     * Cart API belongs only to customer storefront.
     *
     * IMPORTANT:
     * The cart icon itself is visible to everyone.
     *
     * But we DO NOT call customer cart API for:
     * - Guest
     * - SuperAdmin
     * - Admin
     * - Vendor
     * - Marketing
     * - Sales
     */

    if (
      !isAuthenticated ||
      !isCustomer
    ) {
      setTotalItems(0);
      return;
    }

    let cancelled = false;

    // The badge counts Product CartItems AND PENDING Bookings (a Deal or Therapist booked
    // directly, "Added to Cart" or "Book Now" alike — see cart.tsx's own doc comment) together,
    // since both live in the same customer-facing Cart page as ONE combined total. Refetches on
    // every mutation to either source (subscribeCartUpdated/subscribeBookingsUpdated), so the
    // badge never depends on the customer having revisited the cart/bookings page.
    const loadCount = () => {
      Promise.all([
        getCart(token),
        listBookings(token, { status: 'PENDING', pageSize: 50 }),
      ])
        .then(([cartRes, bookingsRes]) => {
          if (!cancelled) {
            const cartItemCount = cartRes.data.items.reduce((sum, item) => sum + item.quantity, 0);
            setTotalItems(cartItemCount + bookingsRes.data.length);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTotalItems(0);
          }
        });
    };

    loadCount();

    const unsubscribeCart =
      subscribeCartUpdated(loadCount);
    const unsubscribeBookings =
      subscribeBookingsUpdated(loadCount);

    return () => {
      cancelled = true;
      unsubscribeCart();
      unsubscribeBookings();
    };
  }, [
    isAuthenticated,
    isCustomer,
    token,
  ]);

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  function handleSearch(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (searchQuery.trim()) {
      navigate(
        `/explore?q=${encodeURIComponent(
          searchQuery.trim(),
        )}`,
      );

      setSearchQuery('');
      setShowSuggestions(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Open deal
  // ---------------------------------------------------------------------------

  function openDeal(id: string) {
    navigate(`/deal/${id}`);

    setSearchQuery('');
    setShowSuggestions(false);
  }

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------

  const handleSignOut = () => {
    clearCart(token);
    signOut();

    setProfileMenuOpen(false);
    setDrawerOpen(false);

    setTotalItems(0);
  };

  // ---------------------------------------------------------------------------
  // Customer navigation
  // ---------------------------------------------------------------------------

  const goToCustomerPage = (
    path: string,
  ) => {
    if (!isCustomer) {
      navigate('/account');
      return;
    }

    navigate(path);
    setProfileMenuOpen(false);
    setDrawerOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* =====================================================================
          SKIP LINK
      ====================================================================== */}

      <a
        className="skip-link"
        href="#main-content"
      >
        {content.header.skipToContent}
      </a>

      {/* =====================================================================
          HEADER
      ====================================================================== */}

      <header
        className="site-header"
        role="banner"
      >
        <div className="site-header__top">

          {/* ---------------------------------------------------------------
              Mobile menu
          ---------------------------------------------------------------- */}

          <IconButton
            className="site-header__menu-btn"
            aria-label={
              content.header.openMenu
            }
            onClick={() =>
              setDrawerOpen(true)
            }
          >
            <Icon>menu</Icon>
          </IconButton>

          {/* ---------------------------------------------------------------
              Logo
          ---------------------------------------------------------------- */}

          <NavLink
            to="/"
            className="site-header__brand"
            aria-label={
              content.header.homeAriaLabel
            }
          >
            <strong className="site-header__brand-text">
              {content.site.name}
            </strong>
          </NavLink>

          {/* ---------------------------------------------------------------
              Categories
          ---------------------------------------------------------------- */}

          <div className="header-categories">
            {content.nav.primary.map(
              (category) => (
                <NavLink
                  key={category.to}
                  to={category.to}
                  className={({ isActive }) =>
                    `header-category-link${
                      isActive
                        ? ' header-category-link--active'
                        : ''
                    }`
                  }
                >
                  <span>
                    {category.label}
                  </span>
                </NavLink>
              ),
            )}
          </div>

          {/* ---------------------------------------------------------------
              Header actions
          ---------------------------------------------------------------- */}

          <div className="site-header__actions">

            {/* =============================================================
                WISHLIST
                VISIBLE FOR ALL USERS
            ============================================================= */}

            <FilledTonalIconButton
              className="site-header__cart"
              aria-label={`Wishlist, ${wishlistCount} item${
                wishlistCount !== 1
                  ? 's'
                  : ''
              }`}
              onClick={() =>
                navigate('/wishlist')
              }
            >
              <Icon>
                favorite_border
              </Icon>

              {wishlistCount > 0 && (
                <span className="site-header__cart-badge">
                  {wishlistCount}
                </span>
              )}
            </FilledTonalIconButton>

            {/* =============================================================
                CART
                VISIBLE FOR ALL USERS
            ============================================================= */}

            <FilledTonalIconButton
              className="site-header__cart"
              aria-label={`Cart, ${cartCount} item${
                cartCount !== 1
                  ? 's'
                  : ''
              }`}
              onClick={() =>
                navigate('/cart')
              }
            >
              <Icon>
                shopping_bag
              </Icon>

              {cartCount > 0 && (
                <span className="site-header__cart-badge">
                  {cartCount}
                </span>
              )}
            </FilledTonalIconButton>

            {/* =============================================================
                PROFILE
            ============================================================= */}

            <div className="site-header__profile">

              {isAuthenticated ? (

                <div
                  className="profile-menu"
                  ref={profileRef}
                >
                  <FilledTonalIconButton
                    id="profile-button"
                    className="profile-button"
                    onClick={
                      toggleProfileMenu
                    }
                    aria-label="My Account"
                  >
                    <Icon>
                      person
                    </Icon>
                  </FilledTonalIconButton>

                  {/* =======================================================
                      PROFILE MENU
                  ======================================================== */}

                  {profileMenuOpen && (

                    <Menu
                      open
                      anchor="profile-button"
                      yOffset={15}
                      onClosed={() =>
                        setProfileMenuOpen(
                          false,
                        )
                      }
                    >

                      {/* -------------------------------------------------
                          ACCOUNT
                      -------------------------------------------------- */}

                      <MenuItem
                        onClick={() => {
                          navigate(
                            myAccountPath,
                          );

                          setProfileMenuOpen(
                            false,
                          );
                        }}
                      >
                        <Icon slot="start">
                          person
                        </Icon>

                        {
                          content.header
                            .profileMenu
                            .profile
                        }
                      </MenuItem>

                      {/* -------------------------------------------------
                          BOOKINGS
                          CUSTOMER ONLY
                      -------------------------------------------------- */}

                      {isCustomer && (
                        <MenuItem
                          onClick={() => {
                            navigate(
                              '/bookings',
                            );

                            setProfileMenuOpen(
                              false,
                            );
                          }}
                        >
                          <Icon slot="start">
                            calendar_month
                          </Icon>

                          {
                            content.header
                              .profileMenu
                              .bookings
                          }
                        </MenuItem>
                      )}

                      {/* -------------------------------------------------
                          ORDERS
                          CUSTOMER ONLY
                      -------------------------------------------------- */}

                      {isCustomer && (
                        <MenuItem
                          onClick={() => {
                            navigate(
                              '/orders',
                            );

                            setProfileMenuOpen(
                              false,
                            );
                          }}
                        >
                          <Icon slot="start">
                            receipt_long
                          </Icon>

                          Orders
                        </MenuItem>
                      )}

                      {/* -------------------------------------------------
                          SIGN OUT
                      -------------------------------------------------- */}

                      <MenuItem
                        onClick={
                          handleSignOut
                        }
                      >
                        <Icon slot="start">
                          logout
                        </Icon>

                        {
                          content.header
                            .profileMenu
                            .signOut
                        }
                      </MenuItem>

                    </Menu>
                  )}
                </div>

              ) : (

                <FilledButton
                  onClick={() =>
                    navigate(
                      '/sign-in',
                    )
                  }
                >
                  Sign In
                </FilledButton>

              )}

            </div>
          </div>
        </div>
      </header>

      {/* =====================================================================
          MOBILE DRAWER BACKDROP
      ====================================================================== */}

      {drawerOpen && (
        <div
          className="nav-drawer-backdrop"
          aria-hidden="true"
          onClick={
            closeDrawer
          }
        />
      )}

      {/* =====================================================================
          MOBILE DRAWER
      ====================================================================== */}

      <nav
        id="nav-drawer"
        className={`nav-drawer${
          drawerOpen
            ? ' nav-drawer--open'
            : ''
        }`}
        aria-label={
          content.header.drawerLabel
        }
        aria-hidden={!drawerOpen}
      >

        {/* ---------------------------------------------------------------
            Drawer header
        ---------------------------------------------------------------- */}

        <div className="nav-drawer__header">

          <strong className="site-header__brand-text">
            {content.site.name}
          </strong>

          <IconButton
            aria-label={
              content.header
                .closeNavigation
            }
            onClick={
              closeDrawer
            }
          >
            <Icon>
              close
            </Icon>
          </IconButton>

        </div>

        <Divider />

        {/* ---------------------------------------------------------------
            Drawer body
        ---------------------------------------------------------------- */}

        <div className="nav-drawer__body">

          <sky-accordion />

          <Divider />

          {/* -------------------------------------------------------------
              Primary navigation
          -------------------------------------------------------------- */}

          <ul className="nav-drawer__links">

            {content.nav.primary.map(
              (item) => (
                <li key={item.to}>

                  <NavLink
                    to={item.to}
                    className="nav-drawer__link"
                    onClick={
                      closeDrawer
                    }
                  >
                    {item.label}
                  </NavLink>

                </li>
              ),
            )}

          </ul>

          <Divider />

          {/* -------------------------------------------------------------
              Customer-only mobile links
          -------------------------------------------------------------- */}

          {isCustomer && (
            <>
              <ul className="nav-drawer__links">

                <li>
                  <NavLink
                    to="/bookings"
                    className="nav-drawer__link"
                    onClick={
                      closeDrawer
                    }
                  >
                    Bookings
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/orders"
                    className="nav-drawer__link"
                    onClick={
                      closeDrawer
                    }
                  >
                    Orders
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/cart"
                    className="nav-drawer__link"
                    onClick={
                      closeDrawer
                    }
                  >
                    Cart
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/wishlist"
                    className="nav-drawer__link"
                    onClick={
                      closeDrawer
                    }
                  >
                    Wishlist
                  </NavLink>
                </li>

              </ul>

              <Divider />
            </>
          )}

          {/* -------------------------------------------------------------
              Authentication
          -------------------------------------------------------------- */}

          <div className="nav-drawer__auth">

            {isAuthenticated ? (

              <>

                {/* Account */}

                <FilledButton
                  onClick={() => {
                    navigate(
                      myAccountPath,
                    );

                    closeDrawer();
                  }}
                >
                  {
                    content.header
                      .myAccount
                  }
                </FilledButton>

                {/* Customer-only bookings */}

                {isCustomer && (
                  <TextButton
                    onClick={() => {
                      navigate(
                        '/bookings',
                      );

                      closeDrawer();
                    }}
                  >
                    Bookings
                  </TextButton>
                )}

                {/* Customer-only orders */}

                {isCustomer && (
                  <TextButton
                    onClick={() => {
                      navigate(
                        '/orders',
                      );

                      closeDrawer();
                    }}
                  >
                    Orders
                  </TextButton>
                )}

                {/* Sign out */}

                <TextButton
                  onClick={
                    handleSignOut
                  }
                >
                  {
                    content.header
                      .signOut
                  }
                </TextButton>

              </>

            ) : (

              <FilledButton
                onClick={() => {
                  navigate(
                    '/sign-in',
                  );

                  closeDrawer();
                }}
              >
                {
                  content.header
                    .signIn
                }
              </FilledButton>

            )}

          </div>
        </div>
      </nav>
    </>
  );
}

export default Header;