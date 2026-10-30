import { useState } from 'react';
import { FilledButton, OutlinedButton, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { DealPackageInput } from '../../../../api/rbac/vendors';
import { renderCheckbox, renderTextField } from '../../../components/form-controls/form-controls';
import { StringListField } from './string-list-field';
import { packageLabel, percentOff } from './deal-format';

/** A card as shown: the input fields plus the id once saved. */
export type PackageCard = DealPackageInput & { id?: string };

const EMPTY: DealPackageInput = { durationMinutes: 60, persons: 1, sellingPrice: 0, inclusions: [], isActive: true };
export const MAX_PACKAGES = 10;

/** Client copy of the API rules (PLANNING §2.7); the API re-checks. */
export function packageError(p: DealPackageInput, others: PackageCard[]): string | null {
  if (!Number.isInteger(p.durationMinutes) || p.durationMinutes < 15 || p.durationMinutes > 480) return 'Duration must be 15 to 480 minutes.';
  if (!Number.isInteger(p.persons) || p.persons < 1 || p.persons > 6) return 'People must be 1 to 6.';
  if (!(p.sellingPrice >= 0)) return 'Enter a price of 0 or more.';
  if (p.originalPrice !== undefined && p.originalPrice < p.sellingPrice) return 'The original price must not be below the price.';
  if (others.some((o) => o.durationMinutes === p.durationMinutes && o.persons === p.persons)) {
    return 'Another package has the same duration and people.';
  }
  return null;
}

function PackageEditor({
  initial,
  others,
  saving,
  onSave,
  onCancel,
}: {
  initial: DealPackageInput;
  others: PackageCard[];
  saving: boolean;
  onSave: (value: DealPackageInput) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<DealPackageInput>(initial);
  const [error, setError] = useState('');
  const set = (patch: Partial<DealPackageInput>) => setValue((v) => ({ ...v, ...patch }));
  const save = () => {
    const problem = packageError(value, others);
    setError(problem ?? '');
    if (!problem) onSave({ ...value, name: value.name?.trim() || undefined });
  };
  const off = percentOff(value.sellingPrice, value.originalPrice);

  return (
    <div className="form-grid">
      {renderTextField({
        label: 'Package name (optional)',
        value: value.name ?? '',
        maxLength: 80,
        supportingText: 'Shown as the duration when empty',
        onInput: (name) => set({ name }),
      })}
      {renderTextField({ label: 'Duration (minutes)', type: 'number', min: 15, max: 480, required: true, value: String(value.durationMinutes || ''), onInput: (v) => set({ durationMinutes: Number(v) || 0 }) })}
      {renderTextField({ label: 'People', type: 'number', min: 1, max: 6, required: true, value: String(value.persons || ''), onInput: (v) => set({ persons: Number(v) || 0 }) })}
      {renderTextField({ label: 'Price', type: 'number', min: 0, prefixText: '₹', required: true, value: String(value.sellingPrice ?? ''), onInput: (v) => set({ sellingPrice: Number(v) || 0 }) })}
      {renderTextField({
        label: 'Original price (optional)',
        type: 'number',
        min: 0,
        prefixText: '₹',
        value: value.originalPrice !== undefined ? String(value.originalPrice) : '',
        supportingText: off !== null ? `${off}% off` : undefined,
        onInput: (v) => set({ originalPrice: v === '' ? undefined : Number(v) }),
      })}
      <StringListField
        label="What's included"
        addLabel="Add an item"
        items={value.inclusions}
        max={8}
        maxLength={80}
        onChange={(inclusions) => set({ inclusions })}
      />
      {renderCheckbox({ label: 'Active (customers can pick it)', checked: value.isActive, onChange: (isActive) => set({ isActive }) })}
      {error && <p className="error-state" role="alert">{error}</p>}
      <div className="form-actions">
        <FilledButton disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save package'}</FilledButton>
        <TextButton disabled={saving} onClick={onCancel}>Cancel</TextButton>
      </div>
    </div>
  );
}

/**
 * Package cards for the deal form (PLANNING §2.7): add, edit, delete and reorder. The parent
 * decides what each action does: keep a local list on the create screen, or call the package
 * routes on the edit screen. Each handler resolves when done and rejects with a message to show.
 */
export function DealPackageCards({
  packages,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
}: {
  packages: PackageCard[];
  onAdd: (value: DealPackageInput) => Promise<void>;
  onUpdate: (index: number, value: DealPackageInput) => Promise<void>;
  onDelete: (index: number) => Promise<void>;
  onMove: (from: number, to: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<number | 'new' | null>(packages.length === 0 ? 'new' : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (work: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await work();
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this package.');
    } finally {
      setBusy(false);
    }
  };

  const others = (index: number | 'new') => packages.filter((_, i) => i !== index);

  return (
    <div className="deal-packages">
      <p className="field-hint">
        Each package is one option a customer picks, for example 60 min for 1 person at ₹1,499. Add up to {MAX_PACKAGES}; at least one must be active.
      </p>
      {error && <p className="error-state" role="alert">{error}</p>}
      <ol className="deal-packages__list">
        {packages.map((pkg, index) => {
          const off = percentOff(pkg.sellingPrice, pkg.originalPrice);
          return (
            <li key={pkg.id ?? `new-${index}`} className="deal-packages__card">
              {editing === index ? (
                <PackageEditor
                  initial={pkg}
                  others={others(index)}
                  saving={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(value) => run(() => onUpdate(index, value), () => setEditing(null))}
                />
              ) : (
                <>
                  <div className="deal-packages__summary">
                    <h3 className="deal-packages__name">{packageLabel({ name: pkg.name ?? null, durationMinutes: pkg.durationMinutes, persons: pkg.persons })}</h3>
                    <p className="deal-packages__price">
                      <strong>₹{pkg.sellingPrice.toLocaleString('en-IN')}</strong>
                      {pkg.originalPrice !== undefined && pkg.originalPrice > pkg.sellingPrice && <s>₹{pkg.originalPrice.toLocaleString('en-IN')}</s>}
                      {off !== null && <span>{off}% off</span>}
                    </p>
                    {pkg.inclusions.length > 0 && <p className="field-hint">Includes: {pkg.inclusions.join(', ')}</p>}
                    <span className={`status-pill ${pkg.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>{pkg.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="page-head__actions">
                    <OutlinedButton disabled={busy || editing !== null} onClick={() => setEditing(index)}>
                      <Icon slot="icon" aria-hidden="true">edit</Icon>
                      Edit
                    </OutlinedButton>
                    <OutlinedButton disabled={busy || editing !== null} onClick={() => run(() => onDelete(index))}>
                      <Icon slot="icon" aria-hidden="true">delete</Icon>
                      Delete
                    </OutlinedButton>
                    <TextButton disabled={busy || index === 0} aria-label={`Move ${packageLabel({ name: pkg.name ?? null, durationMinutes: pkg.durationMinutes, persons: pkg.persons })} up`} onClick={() => run(() => onMove(index, index - 1))}>
                      <Icon slot="icon" aria-hidden="true">arrow_upward</Icon>
                      Up
                    </TextButton>
                    <TextButton
                      disabled={busy || index === packages.length - 1}
                      aria-label={`Move ${packageLabel({ name: pkg.name ?? null, durationMinutes: pkg.durationMinutes, persons: pkg.persons })} down`}
                      onClick={() => run(() => onMove(index, index + 1))}
                    >
                      <Icon slot="icon" aria-hidden="true">arrow_downward</Icon>
                      Down
                    </TextButton>
                  </div>
                </>
              )}
            </li>
          );
        })}
        {editing === 'new' && (
          <li className="deal-packages__card">
            <PackageEditor
              initial={EMPTY}
              others={packages}
              saving={busy}
              onCancel={() => setEditing(null)}
              onSave={(value) => run(() => onAdd(value), () => setEditing(null))}
            />
          </li>
        )}
      </ol>
      {editing === null && packages.length < MAX_PACKAGES && (
        <OutlinedButton disabled={busy} onClick={() => setEditing('new')}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          Add package
        </OutlinedButton>
      )}
    </div>
  );
}
