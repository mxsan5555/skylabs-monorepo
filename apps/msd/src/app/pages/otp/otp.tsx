import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedTextField, Icon, IconButton, TextButton, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import content from '../../../content.json';
import { requestOtp, verifyOtp } from '../../../api/rbac/auth';
import { ApiRequestError } from '../../../api/rbac/client';
import { resolvePostLoginPath } from '../../../auth/role-routing';
const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in. Includes a resend countdown. Wired to the real
 * msd-api `/auth/otp/verify` endpoint — `signIn()` (from
 * `@skylabs-monorepo/shared-auth/react`) stores the token and kicks off the
 * `/rbac/bootstrap` fetch, but doesn't await it synchronously in a way this
 * component can rely on (the `bootstrap` value here is only current after a
 * re-render). So the redirect itself is driven by a `useEffect` that watches
 * `bootstrap` becoming available post sign-in, then routes by role via
 * `resolvePostLoginPath` — staff always land on `/account/dashboard`
 * (unchanged), a vendor lands on the admin console, a customer lands on the
 * storefront home, and a user holding both `customer` and `vendor` (the
 * common case — self-registering as a vendor never removes `customer`) is
 * sent to `/choose-experience` instead of guessing for them.
 */
export function Otp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, bootstrap, token } = useAuth();
  const [error, setError] = useState('');
  const otpContent = content.auth.otp;
  const [loading, setLoading] = useState(false);
  const [awaitingBootstrap, setAwaitingBootstrap] = useState(false);
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

  // Once `signIn()` has kicked off the bootstrap fetch, wait for it to land in context, then
  // route by role. If it fails (token cleared by `loadBootstrap`'s own error handling), fall
  // back to an error instead of hanging on this screen forever.
  useEffect(() => {
    if (!awaitingBootstrap) return;
    if (bootstrap) {
      navigate(resolvePostLoginPath(bootstrap), { replace: true });
    } else if (!token) {
      setAwaitingBootstrap(false);
      setError(otpContent.validation.invalidOtp);
    }
  }, [awaitingBootstrap, bootstrap, token, navigate, otpContent.validation.invalidOtp]);

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
      setAwaitingBootstrap(true);
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
        <FilledButton className="auth-submit" onClick={verify} disabled={loading || awaitingBootstrap || code.length !== 6}>
          {loading || awaitingBootstrap ? otpContent.verifyingButton : otpContent.verifyButton}
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
