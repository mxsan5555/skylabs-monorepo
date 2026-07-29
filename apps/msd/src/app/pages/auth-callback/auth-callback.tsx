import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../../auth/auth-context';
import { apiClient } from '../../../api/api-client';
import type { User, UserRole } from '../../../types';

/**
 * Lands here after the Google OAuth redirect from msd-api
 * (`/auth/google/callback`). Trades the one-time `code` query param for a
 * real JWT via `/auth/exchange` — the JWT itself never travels in a URL.
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  const [error, setError] = useState(false);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const code = searchParams.get('code');
    if (!code) {
      setError(true);
      return;
    }

    apiClient
      .post<{ token: string; roles: UserRole[]; user: User }>('/auth/exchange', { code })
      .then((result) => {
        signIn(result.token, result.roles, result.user);
        navigate('/', { replace: true });
      })
      .catch(() => setError(true));
    // Runs once on mount — the exchange code is single-use, so re-running on
    // a dependency change would just fail the second call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-screen">
      <title>Signing in · MSD</title>
      <div className="auth-brand">
        <h1 className="auth-brand__title">MSD</h1>
      </div>
      <div className="auth-card">
        {error ? (
          <>
            <h2>Sign-in failed</h2>
            <p>That link is invalid or has expired.</p>
            <TextButton onClick={() => navigate('/sign-in')}>Back to sign in</TextButton>
          </>
        ) : (
          <p>Signing you in…</p>
        )}
      </div>
    </div>
  );
}

export default AuthCallback;
