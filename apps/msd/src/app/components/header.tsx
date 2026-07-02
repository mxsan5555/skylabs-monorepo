import { NavLink, useNavigate } from 'react-router-dom';
import { FilledButton, TextButton, IconButton, Icon, Menu, MenuItem, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../auth/auth-context';
import { useState } from 'react';
/**
 * App header: brand, primary nav, and auth action. App-specific (it knows the
 * router and auth), so it lives in the app, not in shared-ui.
 */
export function Header() {
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="app-header">
      <NavLink to="/" className="app-header__brand">
        msd
      </NavLink>

      <nav className="app-header__nav" aria-label="Primary">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/showcase">Showcase</NavLink>
        <NavLink to="/summer-deals">Summer Deals</NavLink>
        <NavLink to="/beauty&spa">Beauty & Spa</NavLink>
      </nav>
      <div className="desktop-actions">
        {isAuthenticated ? (
          <>
            <FilledButton onClick={() => navigate('/account')}>
              My Account
            </FilledButton>

            <TextButton onClick={signOut}>
              Logout
            </TextButton>
          </>
        ) : (
          <FilledButton onClick={() => navigate('/sign-in')}>
            Sign in
          </FilledButton>
        )}
      </div>

      <div className="mobile-actions">
        <IconButton
          id="header-menu-anchor"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon>menu</Icon>
        </IconButton>

        <Menu
          anchor="header-menu-anchor"
          open={menuOpen}
          positioning="popover"
          onClosed={() => setMenuOpen(false)}
        >
          <MenuItem
            onClick={() => {
              navigate('/');
              setMenuOpen(false);
            }}
          >
            <div slot="headline">Home</div>
          </MenuItem>

          <MenuItem
            onClick={() => {
              navigate('/showcase');
              setMenuOpen(false);
            }}
          >
            <div slot="headline">Showcase</div>
          </MenuItem>

          <MenuItem
            onClick={() => {
              navigate('/summer-deals');
              setMenuOpen(false);
            }}
          >
            <div slot="headline">Summer Deals</div>
          </MenuItem>

          <MenuItem
            onClick={() => {
              navigate('/beauty&spa');
              setMenuOpen(false);
            }}
          >
            <div slot="headline">Beauty & Spa</div>
          </MenuItem>

          <MenuItem
            onClick={() => {
              navigate('/account');
              setMenuOpen(false);
            }}
          >
            <div slot="headline">My Account</div>
          </MenuItem>

          <MenuItem
            onClick={() => {
              signOut();
              setMenuOpen(false);
            }}
          >
            <div slot="headline">Logout</div>
          </MenuItem>
        </Menu>

      </div>

    </header>
  );
}
