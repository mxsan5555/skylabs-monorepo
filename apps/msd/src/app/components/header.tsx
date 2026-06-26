import { NavLink, useNavigate } from 'react-router-dom';
import { FilledButton, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../auth/auth-context';
import { SearchBar } from './search-bar';
/**
 * App header: brand, primary nav, and auth action. App-specific (it knows the
 * router and auth), so it lives in the app, not in shared-ui.
 */
export function Header() {
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <NavLink to="/" className="app-header__brand">
        msd
      </NavLink>

      <nav className="app-header__nav" aria-label="Primary">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/showcase">Showcase</NavLink>
        <NavLink to="/beauty&spa">Beauty & Spa</NavLink>
        <NavLink to="/summerdeals">Summer Deals</NavLink>
      </nav>
      <SearchBar />
      {isAuthenticated ? (
        <>
          <FilledButton onClick={() => navigate('/account')}>
            My account
          </FilledButton>
          <TextButton onClick={signOut}>Log out</TextButton>
        </>
      ) : (
        <FilledButton onClick={() => navigate('/sign-in')}>Sign in</FilledButton>
      )}
    </header>
  );
}
