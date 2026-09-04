import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import './error-boundary.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort, top-level safety net for a render-phase crash anywhere in the route tree — wraps
 * `<AppRoutes />` in `app.tsx`. This is NOT a replacement for the per-page `error`-state pattern
 * used everywhere else in this app (a failed API call already renders its own inline
 * `.error-state` message via `useState`/`.catch()` and keeps the rest of that page usable). This
 * only catches what that pattern structurally can't: a component that throws *while rendering*
 * (a bad prop, a null-deref, a third-party bug) — without this, that throws past React and blanks
 * the entire app to a white screen with no way back short of a manual URL reload.
 *
 * Must be a class component — `componentDidCatch`/`getDerivedStateFromError` have no Hooks
 * equivalent in React 19; function components cannot catch render-phase errors in their children.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Never swallow silently — this is the app's last line of defense, so the failure must at
    // least reach the console for anyone debugging a support report.
    console.error('Unhandled error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-page" role="alert">
          <sky-info-card
            icon="error"
            heading="Something went wrong"
            subheading="An unexpected error occurred. Reloading the page usually fixes it."
          />
          <FilledButton onClick={() => window.location.reload()}>Reload page</FilledButton>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
