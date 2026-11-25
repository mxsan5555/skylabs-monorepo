import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import content from '../../../content.json';
import { resolvePostLoginPath, sanitizeReturnUrl } from '../../../auth/role-routing';

export function GoogleOAuthCallback() {
  const { loading, bootstrap } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!bootstrap) {
      navigate('/sign-in?error=google', { replace: true });
      return;
    }
    const rolePath = resolvePostLoginPath(bootstrap);
    const next = sanitizeReturnUrl(new URLSearchParams(location.search).get('next') ?? '');
    navigate(rolePath === '/' ? next ?? '/my-dashboard' : rolePath, { replace: true });
  }, [bootstrap, loading, location.search, navigate]);

  return <div className="auth-screen"><p role="status">{content.auth.signIn.googleRedirecting}</p></div>;
}

export default GoogleOAuthCallback;
