import { Outlet } from 'react-router-dom';

/**
 * Centered, minimal shell for auth screens (sign-in, otp). No app header/footer
 * — just a narrow column on the themed background. Marks auth routes noindex
 * (React 19 hoists the tag to <head> and removes it when leaving).
 */
export function AuthLayout() {
  return (
    <div className="auth-layout">
      <meta name="robots" content="noindex" />
      <main className="auth-layout__inner">
        <Outlet />
      </main>
    </div>
  );
}
