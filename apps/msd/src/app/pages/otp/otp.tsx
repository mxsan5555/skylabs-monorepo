import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedTextField, Icon, IconButton, TextButton, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import content from '../../../content.json';
import { requestOtp, verifyOtp } from '../../../api/rbac/auth';
import { ApiRequestError } from '../../../api/rbac/client';
import { resolvePostLoginPath, sanitizeReturnUrl, signInPathWithNext } from '../../../auth/role-routing';
const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in. Includes a resend countdown. Wired to the real
 * msd-api `/auth/otp/verify` endpoint — `signIn()` (from
 * `@skylabs-monorepo/shared-auth/react`) stores the token and kicks off the
 * `/rbac/bootstrap` fetch, but doesn't await it synchronously in a way this
 * component can rely on (the `bootstrap` value here is only current after a
 * re-render). So the redirect itself is driven by a `useEffect` that watches
 * `bootstrap` becoming available post sign-in, then decides where to land:
 * `returnUrl` (the page the visitor was on before `sign-in.tsx` sent them
 * here — see `extractReturnUrl`) wins, but ONLY for the plain-customer
 * destination (`resolvePostLoginPath` resolving to `/`) — staff always land
 * on `/account/dashboard`, a vendor lands on the admin console, and a dual
 * customer+vendor user still goes to `/choose-experience`, exactly as
 * before `returnUrl` existed. `returnUrl` is re-validated with
 * `sanitizeReturnUrl` right here too, not just trusted from `sign-in.tsx`.
 * Never consumed until this effect actually fires (i.e. only after a real,
 * successful `verifyOtp` + `signIn`) — a failed or abandoned OTP attempt
 * leaves it untouched in this screen's own `location.state`, so a retry (or
 * the back button, which re-appends it to `/sign-in?next=...`) never loses
 * it; navigating away via a *successful* login replaces this history entry,
 * so nothing lingers for a later, unrelated login to accidentally reuse.
 */
export function Otp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, bootstrap, token } = useAuth();
  const [error, setError] = useState('');
  const otpContent = content.auth.otp;
  const [loading, setLoading] = useState(false);
  const [awaitingBootstrap, setAwaitingBootstrap] = useState(false);
  const { identifier, method, returnUrl } = (location.state as {
    identifier: string;
    method: 'email' | 'phone';
    returnUrl?: string | null;
  }) || {};
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000,);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!identifier) { navigate(signInPathWithNext(returnUrl), { replace: true }); }
  }, [identifier, returnUrl, navigate]);

  // Once `signIn()` has kicked off the bootstrap fetch, wait for it to land in context, then
  // decide where to land. `returnUrl` only ever overrides the plain-customer destination ('/')
  // — staff/vendor/dual-role destinations are untouched, see this component's own doc comment.
  // If it fails (token cleared by `loadBootstrap`'s own error handling), fall back to an error
  // instead of hanging on this screen forever.
  useEffect(() => {
    if (!awaitingBootstrap) return;
    if (bootstrap) {
      const roleDestination = resolvePostLoginPath(bootstrap);
      const safeReturnUrl = returnUrl ? sanitizeReturnUrl(returnUrl) : null;
      navigate(roleDestination === '/' && safeReturnUrl ? safeReturnUrl : roleDestination, { replace: true });
    } else if (!token) {
      setAwaitingBootstrap(false);
      setError(otpContent.validation.invalidOtp);
    }
  }, [awaitingBootstrap, bootstrap, token, returnUrl, navigate, otpContent.validation.invalidOtp]);

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
      navigate(signInPathWithNext(returnUrl));
      return;
    }
    setLoading(true);
    try {
      const { data } = await verifyOtp(identifier, code);
      await signIn(data.accessToken, data.refreshToken);
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
        onClick={() => navigate(signInPathWithNext(returnUrl))}
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
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' && code.length === 6 && !loading && !awaitingBootstrap
            ) {
              event.preventDefault();
              verify();
            }
          }}
        />
        {error && <p className="auth-error">{error}</p>}
        <FilledButton className="auth-submit" onClick={verify} disabled={loading || awaitingBootstrap || code.length !== 6}>
          {loading || awaitingBootstrap ? otpContent.verifyingButton : otpContent.verifyButton}
        </FilledButton>
      </div>

      <p className="otp-resend">
        <span>{otpContent.resend.question}</span>

        {seconds > 0 ? (
          <span className="otp-muted">
            {otpContent.resend.countdown} {seconds}s
          </span>
        ) : (
          <span className="otp-resend__button">
            <TextButton onClick={resend}>
              {otpContent.resend.button}
            </TextButton>
          </span>
        )}
      </p>
    </div>
  );
}

export default Otp;
