import { useCallback, useEffect, useState } from 'react';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getFinanceSettings, updateFinanceSettings, type FinanceSettings } from '../../../../api/rbac/accounts';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';

interface FormState {
  defaultCommissionRatePercent: string;
  serviceHoldHours: string;
  productReturnHoldHours: string;
  completionOtpExpiryMinutes: string;
  completionOtpMaxAttempts: string;
  completionOtpResendCooldownSeconds: string;
}

function toForm(s: FinanceSettings): FormState {
  return {
    defaultCommissionRatePercent: s.defaultCommissionRatePercent,
    serviceHoldHours: String(s.serviceHoldHours),
    productReturnHoldHours: String(s.productReturnHoldHours),
    completionOtpExpiryMinutes: String(s.completionOtpExpiryMinutes),
    completionOtpMaxAttempts: String(s.completionOtpMaxAttempts),
    completionOtpResendCooldownSeconds: String(s.completionOtpResendCooldownSeconds),
  };
}

/**
 * Fills the `/account/system-settings` stub (`system-settings:view`/`:edit`) with the Finance
 * Settings form — default commission rate, service/product hold periods, and completion-OTP
 * config. Singleton row (`GET`/`PUT /accounts/finance-settings`) — a partial `PUT` leaves every
 * other field untouched server-side.
 */
export function SystemSettingsPage() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canEdit = can('system-settings', 'edit');

  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getFinanceSettings(token)
      .then(({ data }) => setForm(toForm(data)))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load finance settings.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: keyof FormState, value: string) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const submit = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await updateFinanceSettings(token, {
        defaultCommissionRatePercent: Number(form.defaultCommissionRatePercent),
        serviceHoldHours: Number(form.serviceHoldHours),
        productReturnHoldHours: Number(form.productReturnHoldHours),
        completionOtpExpiryMinutes: Number(form.completionOtpExpiryMinutes),
        completionOtpMaxAttempts: Number(form.completionOtpMaxAttempts),
        completionOtpResendCooldownSeconds: Number(form.completionOtpResendCooldownSeconds),
      });
      setForm(toForm(data));
      showToast('Finance settings saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save finance settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <title>System Settings · MSD</title>
      <header className="admin-page__head">
        <h1 className="admin-page__title">System Settings</h1>
        <p className="admin-page__subtitle">Commission default and hold-period / completion-OTP configuration.</p>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      {loading || !form ? (
        <p className="loading-state">Loading settings…</p>
      ) : (
        <div className="panel">
          <h2>Finance Settings</h2>
          <div className="form-grid">
            <OutlinedTextField
              label="Default commission rate (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.defaultCommissionRatePercent}
              disabled={!canEdit}
              onInput={(e: Event) => setField('defaultCommissionRatePercent', (e.target as HTMLInputElement).value)}
            />
            <OutlinedTextField
              label="Service hold period (hours)"
              type="number"
              min="0"
              value={form.serviceHoldHours}
              disabled={!canEdit}
              onInput={(e: Event) => setField('serviceHoldHours', (e.target as HTMLInputElement).value)}
            />
            <OutlinedTextField
              label="Product return hold period (hours)"
              type="number"
              min="0"
              value={form.productReturnHoldHours}
              disabled={!canEdit}
              onInput={(e: Event) => setField('productReturnHoldHours', (e.target as HTMLInputElement).value)}
            />
            <OutlinedTextField
              label="Completion OTP expiry (minutes)"
              type="number"
              min="1"
              value={form.completionOtpExpiryMinutes}
              disabled={!canEdit}
              onInput={(e: Event) => setField('completionOtpExpiryMinutes', (e.target as HTMLInputElement).value)}
            />
            <OutlinedTextField
              label="Completion OTP max attempts"
              type="number"
              min="1"
              value={form.completionOtpMaxAttempts}
              disabled={!canEdit}
              onInput={(e: Event) => setField('completionOtpMaxAttempts', (e.target as HTMLInputElement).value)}
            />
            <OutlinedTextField
              label="Completion OTP resend cooldown (seconds)"
              type="number"
              min="0"
              value={form.completionOtpResendCooldownSeconds}
              disabled={!canEdit}
              onInput={(e: Event) => setField('completionOtpResendCooldownSeconds', (e.target as HTMLInputElement).value)}
            />
          </div>
          {canEdit && (
            <div className="form-actions">
              <FilledButton onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</FilledButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SystemSettingsPage;
