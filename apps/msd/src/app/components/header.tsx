import { NavLink, useNavigate } from 'react-router-dom';
import { FilledButton, TextButton, IconButton, Icon, Menu, MenuItem, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../auth/auth-context';
import { useState } from 'react';
import { SearchBar } from './search-bar';
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
      <div className="header-search">
        <SearchBar />
      </div>
      <div className="header-nearme">
        <FilledButton
          className="nearme-btn"
          onClick={() => navigate("/search?nearMe=true")}
        >
          <Icon slot="icon">near_me</Icon>

          <span className="nearme-text">
            Near Me
          </span>

        </FilledButton>
      </div>
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

      </div>
      {menuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="mobile-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-menu-header">
              <div className="mobile-menu-brand">
                <Icon>spa</Icon>
                <h2>MSD</h2>
              </div>

              <IconButton onClick={() => setMenuOpen(false)}>
                <Icon>close</Icon>
              </IconButton>
            </div>

            <nav className="mobile-menu-nav">

              <NavLink to="/" onClick={() => setMenuOpen(false)}>
                <Icon>home</Icon>
                Home
              </NavLink>

              <NavLink to="/showcase" onClick={() => setMenuOpen(false)}>
                <Icon>grid_view</Icon>
                Showcase
              </NavLink>

              <NavLink to="/summer-deals" onClick={() => setMenuOpen(false)}>
                <Icon>local_offer</Icon>
                Summer Deals
              </NavLink>

              <NavLink to="/beauty&spa" onClick={() => setMenuOpen(false)}>
                <Icon>spa</Icon>
                Beauty & Spa
              </NavLink>

              <NavLink to="/account" onClick={() => setMenuOpen(false)}>
                <Icon>person</Icon>
                My Account
              </NavLink>

              <button
                className="logout-btn"
                onClick={() => {
                  signOut();
                  setMenuOpen(false);
                }}
              >
                <Icon>logout</Icon>
                Logout
              </button>

            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}
