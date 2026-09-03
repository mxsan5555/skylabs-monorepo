import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FilledButton, TextButton, IconButton, FilledTonalIconButton, Icon, Menu, MenuItem, Divider, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, subscribeCartUpdated, clearCart, } from '../../api/cart';
import { useWishlist } from '../../wishlist/wishlist-context';
import { listCatalogCategories, type CatalogCategoryWithChildren, } from '../../api/catalog';
import { isCustomerUser, isStaffUser, } from '../../auth/role-routing';
import content from '../../content.json';
import './header.css';
import logo from "../../assets/logo.jpg";
import logo2 from "../../assets/logo2.jpg";
export function Header() {
  const {
    isAuthenticated,
    signOut,
    token,
    bootstrap,
  } = useAuth();
  const navigate = useNavigate();
  const { ids: wishlistIds } = useWishlist();
  const isCustomer = !!bootstrap && isCustomerUser(bootstrap) && !isStaffUser(bootstrap);
  const isStaff = !!bootstrap && isStaffUser(bootstrap);
  const myAccountPath = isCustomer ? '/my-account' : '/account';
  const [totalItems, setTotalItems] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const profileRef = useRef<HTMLDivElement>(null);
  const wishlistCount = wishlistIds ? wishlistIds.size : 0;
  const cartCount = totalItems;
  const toggleProfileMenu = () => { setProfileMenuOpen((state) => !state); };
  const closeDrawer = () => { setDrawerOpen(false); };
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await listCatalogCategories();
        console.log('CATEGORIES RESPONSE:', response);
        setCategories(response.data);
      } catch (error) { console.error('Failed to load categories:', error); }
    };
    loadCategories();
  }, []);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent,
    ) => {
      if (profileRef.current && !profileRef.current.contains(
        event.target as Node,
      )
      ) { setProfileMenuOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside,);
    return () => document.removeEventListener('mousedown', handleClickOutside,);
  }, []);
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const handleEsc = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') { setDrawerOpen(false); }
    };
    document.addEventListener('keydown', handleEsc,
    );
    return () =>
      document.removeEventListener('keydown', handleEsc,);
  }, [drawerOpen]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);
  useEffect(() => {
    if (!isAuthenticated) {
      setTotalItems(0);
      return;
    }
    let cancelled = false;
    const loadCount = () => {
      getCart(token)
        .then(({ data }) => {
          if (!cancelled) {
            const cartItemCount = data.items.reduce((sum, item) => sum + item.quantity, 0);
            setTotalItems(cartItemCount);
          }
        })
        .catch(() => {
          if (!cancelled) { setTotalItems(0); }
        });
    };
    loadCount();
    const unsubscribeCart = subscribeCartUpdated(loadCount);
    return () => {
      cancelled = true;
      unsubscribeCart();
    };
  }, [isAuthenticated, token,]);
  const handleSignOut = () => {
    signOut();
    setProfileMenuOpen(false);
    setDrawerOpen(false);
    setTotalItems(0);
  };
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
  return (
    <>
      <a className="skip-link" href="#main-content"> {content.header.skipToContent} </a>
      <header className="site-header" role="banner" >
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
            <div className="header-categories">
              {categories.map((category) => (
                <NavLink
                  key={category.id}
                  to={`/category/${category.slug}`}
                  className={({ isActive }) =>
                    `header-category-link${isActive ? ' header-category-link--active' : ''}`
                  }
                >
                  <span>{category.name}</span>
                </NavLink>
              ))}

             
            </div>
          </div>
          <div className="site-header__actions">
            <FilledTonalIconButton
              className="site-header__cart"
              aria-label={`Wishlist, ${wishlistCount} item${wishlistCount !== 1
                ? 's'
                : ''
                }`}
              onClick={() => navigate('/wishlist')}
            >
              <Icon> favorite_border  </Icon>
              {wishlistCount > 0 && (
                <span className="site-header__cart-badge"> {wishlistCount} </span>
              )}
            </FilledTonalIconButton>
            <FilledTonalIconButton
              className="site-header__cart"
              aria-label={`Cart, ${cartCount} item${cartCount !== 1
                ? 's'
                : ''
                }`}
              onClick={() => navigate('/cart')}
            >
              <Icon> shopping_bag </Icon>
              {cartCount > 0 && (
                <span className="site-header__cart-badge"> {cartCount}</span>
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
                    <Icon> person </Icon>
                  </FilledTonalIconButton>
                  {profileMenuOpen && (
                    <Menu
                      open
                      anchor="profile-button"
                      xOffset={-120}
                      yOffset={16}
                      onClosed={() => setProfileMenuOpen(false)}
                    >
                      <MenuItem
                        onClick={() => {
                          navigate(myAccountPath,);
                          setProfileMenuOpen(false,);
                        }}
                      >
                        <Icon slot="start">person </Icon>
                        {content.header.profileMenu.profile}
                      </MenuItem>
                      {isCustomer && (
                        <MenuItem
                          onClick={() => {
                            navigate('/orders',);
                            setProfileMenuOpen(false,);
                          }}
                        >
                          <Icon slot="start">receipt_long</Icon>
                          Orders
                        </MenuItem>
                      )}
                      <MenuItem
                        onClick={handleSignOut}
                      >
                        <Icon slot="start"> logout
                        </Icon>
                        {content.header.profileMenu.signOut}
                      </MenuItem>
                    </Menu>
                  )}
                </div>
              ) : (
                <FilledButton onClick={() => navigate('/sign-in',)} > Sign In</FilledButton>
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
        className={`nav-drawer${drawerOpen ? ' nav-drawer--open' : ''}`}
        aria-label={content.header.drawerLabel}
        aria-hidden={!drawerOpen}
      >
        <div className="nav-drawer__header">
          <NavLink
            to="/"
            className="nav-drawer__brand"
            onClick={closeDrawer}
            aria-label={content.header.homeAriaLabel}
          >
            <img
              src={logo}
              alt={content.site.name}
              className="nav-drawer__logo nav-drawer__logo--desktop"
            />
            <img
              src={logo2}
              alt={content.site.name}
              className="nav-drawer__logo nav-drawer__logo--mobile"
            />
          </NavLink>
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
            <ul className="nav-drawer__links">
              {categories.map((category) => (
                <li key={category.id}>
                  <NavLink
                    to={`/category/${category.slug}`}
                    className="nav-drawer__link"
                    onClick={closeDrawer}
                  >
                    {category.name}
                  </NavLink>
                </li>
              ))}

              {/* Static Product */}
              <li>
                <NavLink
                  to="/products"
                  className="nav-drawer__link"
                  onClick={closeDrawer}
                >
                  Products
                </NavLink>
              </li>

              {/* Static Therapists */}
              <li>
                <NavLink
                  to="/therapists"
                  className="nav-drawer__link"
                  onClick={closeDrawer}
                >
                  Therapists
                </NavLink>
              </li>
            </ul>
          </ul>
          <Divider />
          {isCustomer && (
            <>
              <ul className="nav-drawer__links">
                <li>
                  <NavLink
                    to="/orders"
                    className="nav-drawer__link"
                    onClick={closeDrawer}
                  >
                    Orders
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/cart"
                    className="nav-drawer__link"
                    onClick={closeDrawer}
                  >
                    Cart
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/wishlist"
                    className="nav-drawer__link"
                    onClick={closeDrawer}
                  >
                    Wishlist
                  </NavLink>
                </li>
              </ul>
              <Divider />
            </>
          )}
          <div className="nav-drawer__auth">
            {isAuthenticated ? (
              <>
                <FilledButton
                  onClick={() => {
                    navigate(myAccountPath,);
                    closeDrawer();
                  }}
                >
                  {content.header.myAccount}
                </FilledButton>
                {isCustomer && (
                  <TextButton onClick={() => { navigate('/orders',); closeDrawer(); }} >
                    Orders
                  </TextButton>
                )}
                <TextButton onClick={handleSignOut} >
                  {content.header.signOut}
                </TextButton>
              </>
            ) : (
              <FilledButton
                onClick={() => { navigate('/sign-in',); closeDrawer(); }} >
                {content.header.signIn}
              </FilledButton>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
export default Header;