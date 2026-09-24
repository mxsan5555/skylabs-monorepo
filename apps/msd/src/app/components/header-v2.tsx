import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  TextButton,
  IconButton,
  FilledTonalIconButton,
  Icon,
  Menu,
  MenuItem,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, subscribeCartUpdated } from '../../api/cart';
import { useWishlist } from '../../wishlist/wishlist-context';
import { isCustomerUser, isStaffUser } from '../../auth/role-routing';
import content from '../../content.json';
import logo from '../../assets/LOGO.jpeg';
import './header-v2.css';

interface NavItem {
  title: string;
  subtitle: string;
  href: string;
}

interface NavMenu {
  label: string;
  items: NavItem[];
  promotional?: boolean;
}

const NAV_MENUS: NavMenu[] = [
  {
    label: 'Massage',
    items: [
      { title: 'Full Body Massage', subtitle: 'Head-to-toe relaxation', href: '/category/massage' },
      { title: 'Ayurvedic Massage', subtitle: 'Traditional Indian healing', href: '/category/massage?sub=ayurvedic-massage' },
      { title: 'Deep Tissue Massage', subtitle: 'Muscle tension relief', href: '/category/massage?sub=deep-tissue-massage' },
      { title: 'Swedish Massage', subtitle: 'Classic relaxation', href: '/category/massage?sub=swedish-massage' },
      { title: 'Head Massage', subtitle: 'Champi & scalp therapy', href: '/category/massage?sub=head-massage' },
      { title: 'Couples Massage', subtitle: 'Shared experience', href: '/category/massage?sub=couple-massage' },
      { title: 'Foot Reflexology', subtitle: 'Pressure point therapy', href: '/category/massage?sub=reflexology' },
      { title: 'Prenatal Massage', subtitle: 'Safe for expectant mothers', href: '/category/massage?sub=prenatal-massage' },
      { title: 'Hot Stone Massage', subtitle: 'Thermal therapy', href: '/category/massage?sub=hot-stone-massage' },
    ],
  },
  {
    label: 'Spa & Wellness',
    items: [
      { title: 'Body Scrub & Polishing', subtitle: 'Glowing skin treatment', href: '/category/spa-wellness?sub=body-scrub' },
      { title: 'Body Wraps', subtitle: 'Detox & hydration therapy', href: '/category/spa-wellness?sub=body-wrap' },
      { title: 'Steam & Sauna', subtitle: 'Cleanse and relax', href: '/category/spa-wellness?sub=steam-sauna' },
      { title: 'Aromatherapy', subtitle: 'Scent-based healing', href: '/category/spa-wellness?sub=aromatherapy-spa' },
      { title: 'Detox Treatments', subtitle: 'Full-body cleanse', href: '/category/spa-wellness?sub=detox-treatment' },
      { title: 'Bridal Spa Package', subtitle: 'Pre-wedding glow ritual', href: '/category/spa-wellness?sub=bridal-spa' },
    ],
  },
  {
    label: 'Hair',
    items: [
      { title: "Women's Haircut", subtitle: 'Style & trim', href: '/category/hair?sub=haircut' },
      { title: "Men's Haircut", subtitle: 'Grooming & shape', href: '/category/hair?sub=haircut' },
      { title: 'Hair Coloring & Highlights', subtitle: 'Global & balayage', href: '/category/hair?sub=hair-coloring' },
      { title: 'Keratin & Smoothening', subtitle: 'Frizz-free finish', href: '/category/hair?sub=keratin-treatment' },
      { title: 'Hair Spa Treatment', subtitle: 'Deep conditioning therapy', href: '/category/hair?sub=hair-spa' },
      { title: 'Bridal Hair', subtitle: 'Wedding-ready styling', href: '/category/hair?sub=bridal-hair' },
      { title: 'Hair Extensions', subtitle: 'Volume & length', href: '/category/hair?sub=hair-extensions' },
    ],
  },
  {
    label: 'Skin & Beauty',
    items: [
      { title: 'Facials & Cleanup', subtitle: 'Glow & deep cleanse', href: '/category/skin-beauty?sub=facial' },
      { title: 'De-Tan Treatment', subtitle: 'Even skin tone', href: '/category/skin-beauty?sub=de-tan' },
      { title: 'Chemical Peels', subtitle: 'Skin renewal therapy', href: '/category/skin-beauty?sub=chemical-peel' },
      { title: 'Body Polishing', subtitle: 'Full-body radiance', href: '/category/skin-beauty?sub=body-polish' },
      { title: 'Laser Hair Removal', subtitle: 'Long-lasting smoothness', href: '/category/skin-beauty?sub=laser-hair-removal' },
      { title: 'Anti-Ageing Treatments', subtitle: 'Botox, fillers & more', href: '/category/skin-beauty?sub=anti-ageing' },
      { title: 'Body Contouring & Slimming', subtitle: 'Shape & tone', href: '/category/skin-beauty?sub=body-contouring' },
      { title: 'Bleaching', subtitle: 'Instant brightening', href: '/category/skin-beauty?sub=bleaching' },
    ],
  },
  {
    label: 'Nails & Lashes',
    items: [
      { title: 'Manicure', subtitle: 'Hand care & polish', href: '/category/nails-lashes?sub=manicure' },
      { title: 'Pedicure', subtitle: 'Foot care & polish', href: '/category/nails-lashes?sub=pedicure' },
      { title: 'Nail Art', subtitle: 'Creative nail designs', href: '/category/nails-lashes?sub=nail-art' },
      { title: 'Gel & Acrylic Nails', subtitle: 'Long-lasting wear', href: '/category/nails-lashes?sub=gel-nails' },
      { title: 'Eyelash Extensions', subtitle: 'Full & dramatic lashes', href: '/category/nails-lashes?sub=eyelash-extensions' },
      { title: 'Lash Lift & Lamination', subtitle: 'Natural lash enhancement', href: '/category/nails-lashes?sub=lash-lift' },
    ],
  },
  {
    label: 'Therapy',
    items: [
      { title: 'Physiotherapy', subtitle: 'Injury & pain recovery', href: '/category/therapy?sub=physiotherapy' },
      { title: 'Acupuncture', subtitle: 'Ancient needle therapy', href: '/category/therapy?sub=acupuncture' },
      { title: 'Chiropractic Care', subtitle: 'Spine & joint alignment', href: '/category/therapy?sub=chiropractic-care' },
      { title: 'Naturopathy', subtitle: 'Natural healing therapies', href: '/category/therapy?sub=naturopathy' },
      { title: 'Yoga & Meditation', subtitle: 'Mind-body balance', href: '/category/therapy?sub=yoga' },
    ],
  },
  {
    label: 'Products',
    items: [
      { title: 'Skincare', subtitle: 'Face wash, serums, moisturisers', href: '/category/product?sub=skincare' },
      { title: 'Hair Care', subtitle: 'Shampoo, oils & treatments', href: '/category/product?sub=hair-care' },
      { title: 'Massage & Spa Products', subtitle: 'Oils, scrubs & spa kits', href: '/category/product?sub=massage-spa-products' },
      { title: 'Wellness Products', subtitle: 'Essential oils & self-care kits', href: '/category/product?sub=wellness-products' },
      { title: 'Beauty', subtitle: 'Makeup & beauty tools', href: '/category/product?sub=beauty' },
    ],
  },
];

function DropdownMenu({ menu, onClose }: { menu: NavMenu; onClose: () => void }) {
  return (
    <div className="hv2-dropdown" role="menu">
      {menu.items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className="hv2-dropdown__item"
          role="menuitem"
          onClick={onClose}
        >
          <span className="hv2-dropdown__item-title">{item.title}</span>
          <span className="hv2-dropdown__item-subtitle">{item.subtitle}</span>
        </NavLink>
      ))}
    </div>
  );
}

function NavMenuButton({ menu }: { menu: NavMenu }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, close]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((s) => !s);
    }
  };

  return (
    <div className="hv2-nav__item" ref={ref}>
      <button
        ref={triggerRef}
        className={`hv2-nav__trigger${menu.promotional ? ' hv2-nav__trigger--promo' : ''}${open ? ' hv2-nav__trigger--active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((s) => !s)}
        onKeyDown={handleKeyDown}
      >
        {menu.label}
        <svg
          className={`hv2-nav__chevron${open ? ' hv2-nav__chevron--open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <DropdownMenu menu={menu} onClose={close} />}
    </div>
  );
}

export function HeaderV2() {
  const { isAuthenticated, signOut, token, bootstrap } = useAuth();
  const navigate = useNavigate();
  const { ids: wishlistIds } = useWishlist();

  const isCustomer = !!bootstrap && isCustomerUser(bootstrap) && !isStaffUser(bootstrap);
  const myAccountPath = isCustomer ? '/my-account' : '/account/dashboard';

  const [totalItems, setTotalItems] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDrawerMenu, setExpandedDrawerMenu] = useState<string | null>(null);

  const profileRef = useRef<HTMLDivElement>(null);
  const wishlistCount = wishlistIds ? wishlistIds.size : 0;

  const closeDrawer = () => {
    setDrawerOpen(false);
    setExpandedDrawerMenu(null);
  };
  const toggleProfileMenu = () => setProfileMenuOpen((s) => !s);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
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
            setTotalItems(data.items.reduce((sum, item) => sum + item.quantity, 0));
          }
        })
        .catch(() => { if (!cancelled) setTotalItems(0); });
    };
    loadCount();
    const unsub = subscribeCartUpdated(loadCount);
    return () => { cancelled = true; unsub(); };
  }, [isAuthenticated, token]);

  const handleSignOut = () => {
    signOut();
    setProfileMenuOpen(false);
    closeDrawer();
    setTotalItems(0);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <>
      <a className="hv2-skip-link" href="#main-content">{content.header.skipToContent}</a>

      <header className="hv2-header" role="banner">
        <div className="hv2-header__inner">
          {/* Hamburger — mobile only */}
          <IconButton
            className="hv2-header__hamburger"
            aria-label={content.header.openMenu}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon>menu</Icon>
          </IconButton>

          {/* Logo */}
          <NavLink to="/" className="hv2-header__brand" aria-label={content.header.homeAriaLabel}>
            <img src={logo} alt={content.site.name} className="hv2-header__logo" />
          </NavLink>

          {/* Core nav */}
          <nav className="hv2-nav" aria-label="Main navigation">
            {NAV_MENUS.map((menu) => (
              <NavMenuButton key={menu.label} menu={menu} />
            ))}
          </nav>

          {/* Search */}
          <form className="hv2-search" role="search" onSubmit={handleSearch}>
            <input
              className="hv2-search__input"
              type="search"
              placeholder="Search massage services..."
              aria-label="Search massage services"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="hv2-search__btn" aria-label="Submit search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          {/* Right actions */}
          <div className="hv2-header__actions">
            <NavLink to="/member" className="hv2-header__member-link">
              Become a Member
            </NavLink>

            {/* Wishlist */}
            <FilledTonalIconButton
              className="hv2-header__icon-btn"
              aria-label={`Wishlist, ${wishlistCount} item${wishlistCount !== 1 ? 's' : ''}`}
              onClick={() => navigate('/wishlist')}
            >
              <Icon>favorite_border</Icon>
              {wishlistCount > 0 && (
                <span className="hv2-badge" aria-hidden="true">{wishlistCount}</span>
              )}
            </FilledTonalIconButton>

            {/* Cart */}
            <FilledTonalIconButton
              className="hv2-header__icon-btn"
              aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
              onClick={() => navigate('/cart')}
            >
              <Icon>shopping_bag</Icon>
              {totalItems > 0 && (
                <span className="hv2-badge" aria-hidden="true">{totalItems}</span>
              )}
            </FilledTonalIconButton>

            {/* Profile */}
            <div className="hv2-profile" ref={profileRef}>
              {isAuthenticated ? (
                <>
                  <FilledTonalIconButton
                    id="hv2-profile-btn"
                    className="hv2-header__icon-btn"
                    onClick={toggleProfileMenu}
                    aria-label="My Account"
                    aria-expanded={profileMenuOpen}
                    aria-haspopup="true"
                  >
                    <Icon>person</Icon>
                  </FilledTonalIconButton>
                  {profileMenuOpen && (
                    <Menu
                      open
                      anchor="hv2-profile-btn"
                      xOffset={-120}
                      yOffset={16}
                      onClosed={() => setProfileMenuOpen(false)}
                    >
                      <MenuItem
                        onClick={() => { navigate(myAccountPath); setProfileMenuOpen(false); }}
                      >
                        <Icon slot="start">person</Icon>
                        {content.header.profileMenu.profile}
                      </MenuItem>
                      {isCustomer && (
                        <MenuItem onClick={() => { navigate('/orders'); setProfileMenuOpen(false); }}>
                          <Icon slot="start">receipt_long</Icon>
                          Orders
                        </MenuItem>
                      )}
                      <MenuItem onClick={handleSignOut}>
                        <Icon slot="start">logout</Icon>
                        {content.header.profileMenu.signOut}
                      </MenuItem>
                    </Menu>
                  )}
                </>
              ) : (
                <FilledButton onClick={() => navigate('/sign-in')}>Sign In</FilledButton>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="hv2-backdrop"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}

      {/* Mobile drawer */}
      <nav
        id="hv2-nav-drawer"
        className={`hv2-drawer${drawerOpen ? ' hv2-drawer--open' : ''}`}
        aria-label={content.header.drawerLabel}
        aria-hidden={!drawerOpen}
      >
        <div className="hv2-drawer__header">
          <NavLink to="/" className="hv2-drawer__brand" onClick={closeDrawer} aria-label={content.header.homeAriaLabel}>
            <img src={logo} alt={content.site.name} className="hv2-drawer__logo" />
          </NavLink>
          <IconButton aria-label={content.header.closeNavigation} onClick={closeDrawer}>
            <Icon>close</Icon>
          </IconButton>
        </div>

        <Divider />

        <div className="hv2-drawer__body">
          <NavLink to="/member" className="hv2-drawer__member-link" onClick={closeDrawer}>
            Become a Member
          </NavLink>

          <Divider />

          {/* Search in drawer */}
          <form className="hv2-drawer__search" role="search" onSubmit={(e) => { handleSearch(e); closeDrawer(); }}>
            <input
              className="hv2-search__input"
              type="search"
              placeholder="Search massage services..."
              aria-label="Search massage services"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="hv2-search__btn" aria-label="Submit search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <Divider />

          {/* Accordion nav menus */}
          <ul className="hv2-drawer__nav">
            {NAV_MENUS.map((menu) => {
              const isExpanded = expandedDrawerMenu === menu.label;
              return (
                <li key={menu.label} className="hv2-drawer__nav-group">
                  <button
                    className={`hv2-drawer__nav-trigger${menu.promotional ? ' hv2-drawer__nav-trigger--promo' : ''}`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedDrawerMenu(isExpanded ? null : menu.label)}
                  >
                    {menu.label}
                    <svg
                      className={`hv2-nav__chevron${isExpanded ? ' hv2-nav__chevron--open' : ''}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <ul className="hv2-drawer__subnav">
                      {menu.items.map((item) => (
                        <li key={item.href}>
                          <NavLink to={item.href} className="hv2-drawer__sublink" onClick={closeDrawer}>
                            <span className="hv2-drawer__sublink-title">{item.title}</span>
                            <span className="hv2-drawer__sublink-subtitle">{item.subtitle}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <Divider />

          {isCustomer && (
            <>
              <ul className="hv2-drawer__links">
                <li><NavLink to="/orders" className="hv2-drawer__link" onClick={closeDrawer}>Orders</NavLink></li>
                <li><NavLink to="/cart" className="hv2-drawer__link" onClick={closeDrawer}>Cart</NavLink></li>
                <li><NavLink to="/wishlist" className="hv2-drawer__link" onClick={closeDrawer}>Wishlist</NavLink></li>
              </ul>
              <Divider />
            </>
          )}

          <div className="hv2-drawer__auth">
            {isAuthenticated ? (
              <>
                <FilledButton onClick={() => { navigate(myAccountPath); closeDrawer(); }}>
                  {content.header.myAccount}
                </FilledButton>
                <TextButton onClick={handleSignOut}>{content.header.signOut}</TextButton>
              </>
            ) : (
              <FilledButton onClick={() => { navigate('/sign-in'); closeDrawer(); }}>
                {content.header.signIn}
              </FilledButton>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

/* ============================================================
   HeaderV3 — Polished two-row layout
   Row 1 (hv3-top): Logo · Search (dominant) · Actions   72px
   Row 2 (hv3-cat): Category strip with dropdowns        48px
   ============================================================ */

function CatStripItem({ menu }: { menu: NavMenu }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, close]);

  return (
    <div className="hv3-cat__item" ref={ref}>
      <button
        ref={triggerRef}
        className={`hv3-cat__trigger${open ? ' hv3-cat__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((s) => !s); }
        }}
      >
        {menu.label}
        <svg
          className={`hv3-cat__chevron${open ? ' hv3-cat__chevron--open' : ''}`}
          width="11"
          height="11"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="hv3-cat__dropdown" role="menu">
          {menu.items.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className="hv3-cat__dropdown-item"
              role="menuitem"
              onClick={close}
            >
              <span className="hv3-cat__dropdown-title">{item.title}</span>
              <span className="hv3-cat__dropdown-sub">{item.subtitle}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeaderV3() {
  const { isAuthenticated, signOut, token, bootstrap } = useAuth();
  const navigate = useNavigate();
  const { ids: wishlistIds } = useWishlist();

  const isCustomer = !!bootstrap && isCustomerUser(bootstrap) && !isStaffUser(bootstrap);
  const myAccountPath = isCustomer ? '/my-account' : '/account/dashboard';

  const [totalItems, setTotalItems] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [expandedDrawerMenu, setExpandedDrawerMenu] = useState<string | null>(null);

  const profileRef = useRef<HTMLDivElement>(null);
  const wishlistCount = wishlistIds ? wishlistIds.size : 0;

  const closeDrawer = () => { setDrawerOpen(false); setExpandedDrawerMenu(null); };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  useEffect(() => {
    if (!isAuthenticated) { setTotalItems(0); return; }
    let cancelled = false;
    const load = () => {
      getCart(token)
        .then(({ data }) => { if (!cancelled) setTotalItems(data.items.reduce((s, i) => s + i.quantity, 0)); })
        .catch(() => { if (!cancelled) setTotalItems(0); });
    };
    load();
    const unsub = subscribeCartUpdated(load);
    return () => { cancelled = true; unsub(); };
  }, [isAuthenticated, token]);

  const handleSignOut = () => { signOut(); setProfileMenuOpen(false); closeDrawer(); setTotalItems(0); };

  // Header + drawer search fields share one handler: `/explore` is the search results route.
  const handleSearch = (e: CustomEvent<{ value: string }>) => {
    if (!e.detail.value) return;
    navigate(`/explore?q=${encodeURIComponent(e.detail.value)}`);
    closeDrawer();
  };

  return (
    <>
      <a className="hv3-skip" href="#main-content">{content.header.skipToContent}</a>

      <header className="hv3-header" role="banner">
        {/* ── Row 1: Logo · Search · Actions ── */}
        <div className="hv3-top">
          <div className="hv3-top__inner">
            {/* Hamburger — mobile only */}
            <IconButton
              className="hv3-hamburger"
              aria-label={content.header.openMenu}
              onClick={() => setDrawerOpen(true)}
            >
              <Icon>menu</Icon>
            </IconButton>

            {/* Logo */}
            <NavLink to="/" className="hv3-brand" aria-label={content.header.homeAriaLabel}>
              <img src={logo} alt={content.site.name} className="hv3-logo" />
            </NavLink>

            {/* Search */}
            <sky-action-field
              className="hv3-search"
              role="search"
              dense
              type="search"
              enterkeyhint="search"
              icon="search"
              label={content.header.searchLabel}
              placeholder={content.header.searchPlaceholder}
              actionLabel={content.header.searchAction}
              onsky-submit={handleSearch}
            />

            {/* Right actions */}
            <div className="hv3-actions">
              {/* Become a Member — OutlinedButton, hidden < 1024px */}
              <span className="hv3-actions__member-wrap">
                <OutlinedButton onClick={() => navigate('/member')}>
                  Become a Member
                </OutlinedButton>
              </span>

              <span className="hv3-actions__divider" aria-hidden="true" />

              {/* Wishlist */}
              <span className="hv3-actions__icon-wrap">
                <FilledTonalIconButton
                  aria-label={`Wishlist, ${wishlistCount} item${wishlistCount !== 1 ? 's' : ''}`}
                  onClick={() => navigate('/wishlist')}
                >
                  <Icon>favorite_border</Icon>
                </FilledTonalIconButton>
                {wishlistCount > 0 && (
                  <span className="notification-bell__badge" aria-hidden="true">{wishlistCount}</span>
                )}
              </span>

              {/* Cart */}
              <span className="hv3-actions__icon-wrap">
                <FilledTonalIconButton
                  aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
                  onClick={() => navigate('/cart')}
                >
                  <Icon>shopping_bag</Icon>
                </FilledTonalIconButton>
                {totalItems > 0 && (
                  <span className="notification-bell__badge" aria-hidden="true">{totalItems}</span>
                )}
              </span>

              {/* Profile */}
              <div className="hv3-profile" ref={profileRef}>
                {isAuthenticated ? (
                  <>
                    <FilledTonalIconButton
                      id="hv3-profile-btn"
                      onClick={() => setProfileMenuOpen((s) => !s)}
                      aria-label="My Account"
                      aria-expanded={profileMenuOpen}
                      aria-haspopup="true"
                    >
                      <Icon>person</Icon>
                    </FilledTonalIconButton>
                    {profileMenuOpen && (
                      <Menu open anchor="hv3-profile-btn" xOffset={-120} yOffset={16} onClosed={() => setProfileMenuOpen(false)}>
                        <MenuItem onClick={() => { navigate(myAccountPath); setProfileMenuOpen(false); }}>
                          <Icon slot="start">person</Icon>
                          {content.header.profileMenu.profile}
                        </MenuItem>
                        {isCustomer && (
                          <MenuItem onClick={() => { navigate('/orders'); setProfileMenuOpen(false); }}>
                            <Icon slot="start">receipt_long</Icon>
                            Orders
                          </MenuItem>
                        )}
                        <MenuItem onClick={handleSignOut}>
                          <Icon slot="start">logout</Icon>
                          {content.header.profileMenu.signOut}
                        </MenuItem>
                      </Menu>
                    )}
                  </>
                ) : (
                  <FilledButton onClick={() => navigate('/sign-in')}>Sign In</FilledButton>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2: Category strip ── */}
        <nav className="hv3-cat" aria-label="Browse categories">
          <div className="hv3-cat__inner">
            {NAV_MENUS.map((menu) => (
              <CatStripItem key={menu.label} menu={menu} />
            ))}
          </div>
        </nav>
      </header>

      {/* Mobile drawer backdrop */}
      {drawerOpen && <div className="hv3-backdrop" aria-hidden="true" onClick={closeDrawer} />}

      {/* Mobile drawer */}
      <nav
        id="hv3-nav-drawer"
        className={`hv3-drawer${drawerOpen ? ' hv3-drawer--open' : ''}`}
        aria-label={content.header.drawerLabel}
        aria-hidden={!drawerOpen}
      >
        <div className="hv3-drawer__header">
          <NavLink to="/" className="hv3-drawer__brand" onClick={closeDrawer} aria-label={content.header.homeAriaLabel}>
            <img src={logo} alt={content.site.name} className="hv3-drawer__logo" />
          </NavLink>
          <IconButton aria-label={content.header.closeNavigation} onClick={closeDrawer}>
            <Icon>close</Icon>
          </IconButton>
        </div>

        <Divider />

        <div className="hv3-drawer__body">
          <NavLink to="/member" className="hv3-drawer__member" onClick={closeDrawer}>
            Become a Member
          </NavLink>

          <Divider />

          <sky-action-field
            className="hv3-drawer__search"
            role="search"
            dense
            type="search"
            enterkeyhint="search"
            icon="search"
            label={content.header.searchLabel}
            placeholder={content.header.searchPlaceholder}
            actionLabel={content.header.searchAction}
            onsky-submit={handleSearch}
          />

          <Divider />

          <ul className="hv3-drawer__nav">
            {NAV_MENUS.map((menu) => {
              const isExp = expandedDrawerMenu === menu.label;
              return (
                <li key={menu.label} className="hv3-drawer__group">
                  <button
                    className="hv3-drawer__nav-trigger"
                    aria-expanded={isExp}
                    onClick={() => setExpandedDrawerMenu(isExp ? null : menu.label)}
                  >
                    {menu.label}
                    <svg
                      className={`hv3-cat__chevron${isExp ? ' hv3-cat__chevron--open' : ''}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isExp && (
                    <ul className="hv3-drawer__subnav">
                      {menu.items.map((item) => (
                        <li key={item.href}>
                          <NavLink to={item.href} className="hv3-drawer__sublink" onClick={closeDrawer}>
                            <span className="hv3-drawer__sublink-title">{item.title}</span>
                            <span className="hv3-drawer__sublink-sub">{item.subtitle}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <Divider />

          {isCustomer && (
            <>
              <ul className="hv3-drawer__links">
                <li><NavLink to="/orders" className="hv3-drawer__link" onClick={closeDrawer}>Orders</NavLink></li>
                <li><NavLink to="/cart" className="hv3-drawer__link" onClick={closeDrawer}>Cart</NavLink></li>
                <li><NavLink to="/wishlist" className="hv3-drawer__link" onClick={closeDrawer}>Wishlist</NavLink></li>
              </ul>
              <Divider />
            </>
          )}

          <div className="hv3-drawer__auth">
            {isAuthenticated ? (
              <>
                <FilledButton onClick={() => { navigate(myAccountPath); closeDrawer(); }}>{content.header.myAccount}</FilledButton>
                <TextButton onClick={handleSignOut}>{content.header.signOut}</TextButton>
              </>
            ) : (
              <FilledButton onClick={() => { navigate('/sign-in'); closeDrawer(); }}>{content.header.signIn}</FilledButton>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

export default HeaderV2;
