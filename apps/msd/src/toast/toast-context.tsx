import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import './toast.css';

export type ToastVariant = 'success' | 'error';

interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Shows a brief, auto-dismissing, non-blocking toast — the one and only notification
   *  mechanism in this app (no third-party toast library; this is intentionally minimal). */
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3500;

/**
 * App-wide toast — mounted once at the root (see `app.tsx`). Any component calls `useToast()`
 * and fires `showToast(message, variant)` right after an API call actually resolves — never
 * before, so a toast can never claim success for a request that hasn't confirmed yet (see e.g.
 * `DealBookingDialog`/`TherapistBookingDialog`'s `submit`, which only calls this inside the
 * `try` block's success path, after `await createBooking(...)` resolves).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-item--${t.variant}`}>
            <Icon aria-hidden="true">{t.variant === 'success' ? 'check_circle' : 'error'}</Icon>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
