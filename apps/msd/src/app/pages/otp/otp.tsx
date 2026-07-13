import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedTextField,
  Icon,
  IconButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../../auth/auth-context';
import { apiClient, ApiError } from '../../../api/api-client';
import type { User, UserRole } from '../../../types';

const DEFAULT_RETRY_SECONDS = 30;

interface OtpLocationState {
  destination?: string;
  method?: 'email' | 'phone';
  retryAfterSeconds?: number;
}

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in via msd-api and returns to the public home page.
 * Resend re-requests a code from the backend; the countdown is driven by the
 * server's `retryAfterSeconds`, not a hardcoded constant.
 */
export function Otp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const state = (location.state as OtpLocationState | null) ?? {};
  const destination = state.destination ?? '';
  const method = state.method ?? 'email';

  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(state.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const timer = setInterval(
      () => setSeconds((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  const verify = async () => {
    if (pending || code.length !== 6) return;
    setError(null);
    setPending(true);
    try {
      const result = await apiClient.post<{
        token: string;
        roles: UserRole[];
        user: User;
      }>('/auth/otp/verify', { method, destination, code });
      signIn(result.token, result.roles, result.user);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'too_many_attempts') {
        setError('Too many attempts. Please request a new code.');
      } else {
        setError('That code is invalid or has expired.');
      }
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    if (resending || seconds > 0) return;
    setResending(true);
    setError(null);
    try {
      const { retryAfterSeconds } = await apiClient.post<{
        ok: true;
        retryAfterSeconds: number;
      }>('/auth/otp/request', { method, destination });
      setSeconds(retryAfterSeconds);
    } catch {
      setError('Could not resend the code. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-screen otp-screen">
      <title>Verify your {method === 'phone' ? 'phone' : 'email'} · MSD</title>
      <IconButton
        className="otp-back"
        aria-label="Go back"
        onClick={() => navigate('/sign-in')}
      >
        <Icon aria-hidden="true">arrow_back</Icon>
      </IconButton>

      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">sms</Icon>
        </div>
        <h1 className="auth-brand__title">Verify your {method === 'phone' ? 'phone' : 'email'}</h1>
        <p className="auth-brand__subtitle">We sent a 6-digit code to</p>
        <span className="auth-destination">
          <Icon aria-hidden="true">{method === 'phone' ? 'call' : 'mail'}</Icon>
          {destination}
        </span>
      </div>

      <div className="auth-card">
        <h2>Enter the code</h2>
        <p>The code expires in a few minutes.</p>

        <OutlinedTextField
          className="otp-field"
          label="6-digit code"
          type="text"
          inputMode="numeric"
          autocomplete="one-time-code"
          maxLength={6}
          value={code}
          onInput={(event: Event) =>
            setCode((event.target as HTMLInputElement).value)
          }
        />

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <FilledButton className="auth-submit" onClick={verify} disabled={pending}>
          {pending ? 'Verifying…' : 'Verify & Continue'}
        </FilledButton>
      </div>

      <p className="otp-resend">
        Didn’t receive the code?{' '}
        {seconds > 0 ? (
          <span className="otp-muted">Resend in {seconds}s</span>
        ) : (
          <TextButton onClick={resend} disabled={resending}>
            Resend code
          </TextButton>
        )}
      </p>
    </div>
  );
}

export default Otp;
