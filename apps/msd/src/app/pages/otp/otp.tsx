import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedTextField, Icon, IconButton, TextButton, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import content from '../../../content.json';
import { requestOtp, verifyOtp } from '../../../api/rbac/auth';
import { ApiRequestError } from '../../../api/rbac/client';
const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in and returns to `/account/dashboard`. Includes a
 * resend countdown. Wired to the real msd-api `/auth/otp/verify` endpoint —
 * `signIn()` (from `@skylabs-monorepo/shared-auth/react`) stores the token
 * and fetches `/rbac/bootstrap`, so the destination is always the same
 * regardless of the signed-in user's roles; what they can do once there is
 * driven entirely by `bootstrap.menu`/`bootstrap.permissions`.
 */
export function Otp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [error, setError] = useState('');
  const otpContent = content.auth.otp;
  const [loading, setLoading] = useState(false);
  const { identifier, method } = (location.state as {
    identifier: string;
    method: 'email' | 'phone';
  }) || {};
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000,);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!identifier) { navigate('/sign-in', { replace: true }); }
  }, [identifier, navigate]);
  const verify = async () => {
    setError('');
    if (!code.trim()) {
      setError(otpContent.validation.emptyOtp);
      return;
    }
    if (code.length !== 6) {
      setError(otpContent.validation.invalidOtp);
      return;
    }
    if (!identifier) {
      navigate('/sign-in');
      return;
    }
    setLoading(true);
    try {
      const { data } = await verifyOtp(identifier, code);
      await signIn(data.accessToken);
      navigate('/account/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : otpContent.validation.invalidOtp);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setSeconds(RESEND_SECONDS);
    try {
      await requestOtp(identifier, 'login');
    } catch {
      // Resend failures are non-fatal — the countdown still resets so the user can retry.
    }
  };

  if (!identifier) return null;

  return (
    <div className="auth-screen otp-screen">
      <title>{otpContent.pageTitle}</title>
      <meta name="robots" content="noindex, nofollow" />
      <IconButton
        className="otp-back"
        aria-label={otpContent.backAriaLabel}
        onClick={() => navigate('/sign-in')}
      >
        <Icon aria-hidden="true">{otpContent.icons.back}</Icon>
      </IconButton>

      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">{otpContent.icons.logo}</Icon>
        </div>
        <h1 className="auth-brand__title">{otpContent.heading}</h1>
        <p className="auth-brand__subtitle">{otpContent.subtitle}</p>
        <span className="auth-destination">
          <Icon aria-hidden="true">{method === 'phone' ? otpContent.icons.destination : 'mail'}</Icon>
          {identifier}
        </span>
      </div>

      <div className="auth-card">
        <h2>{otpContent.enterCode}</h2>
        <p>{otpContent.description}</p>

        <OutlinedTextField
          className="otp-field"
          label={otpContent.fieldLabel}
          type="text"
          inputMode="numeric"
          autocomplete="one-time-code"
          maxLength={6}
          value={code}
          onInput={(event: Event) => {
            const target = event.target as HTMLInputElement;
            const otp = target.value.replace(/\D/g, '').slice(0, 6);
            target.value = otp;
            setCode(otp);
            if (error) setError('');
          }}
        />
        {error && <p className="auth-error">{error}</p>}
        <FilledButton className="auth-submit" onClick={verify} disabled={loading || code.length !== 6}>
          {loading ? otpContent.verifyingButton : otpContent.verifyButton}
        </FilledButton>
      </div>

      <p className="otp-resend">
        {otpContent.resend.question}{' '}
        {seconds > 0 ? (
          <span className="otp-muted">{otpContent.resend.countdown} {seconds}s</span>
        ) : (
          <TextButton onClick={resend}>
            {otpContent.resend.button}
          </TextButton>
        )}
      </p>
    </div>
  );
}

export default Otp;
