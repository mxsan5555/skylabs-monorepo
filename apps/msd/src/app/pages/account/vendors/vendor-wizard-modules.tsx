import { useEffect, useRef, useState } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  listCategories,
  setMyVendorModulesAndCategoryAccess,
  setVendorModulesAndCategoryAccess,
  type Category,
  type CategoryType,
  type Vendor,
  type VendorCategoryAccessRow,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';

type ModuleKey = 'offersService' | 'offersProduct' | 'offersTherapy';

const MODULES: { key: ModuleKey; type: CategoryType; label: string }[] = [
  { key: 'offersService', type: 'SERVICE', label: 'Service' },
  { key: 'offersProduct', type: 'PRODUCT', label: 'Product' },
  { key: 'offersTherapy', type: 'THERAPY', label: 'Therapy' },
];

interface VendorModulesAndCategoryAccessProps {
  token: string | null;
  vendorId: string;
  isSelf: boolean;
  vendor: Vendor;
  access: VendorCategoryAccessRow[];
  onSaved: (vendor: Vendor, access: VendorCategoryAccessRow[]) => void;
}

/**
 * Onboarding wizard Step 2's "Business Modules + Category Access" editor — Service/Product/
 * Therapy checkboxes bound to the three `Vendor` booleans, plus one category checklist per
 * enabled module, sourced unfiltered by vendor (`listCategories({ type })`, no `vendorId`) since
 * this IS the granting screen — every active category of that module shows here regardless of
 * what's granted yet. Saved as one replace-the-full-set call, same shape as
 * `rbac.routes.ts`'s `PUT /roles/:id/permissions`.
 */
export function VendorModulesAndCategoryAccess({ token, vendorId, isSelf, vendor, access, onSaved }: VendorModulesAndCategoryAccessProps) {
  const { showToast } = useToast();
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>({
    offersService: vendor.offersService,
    offersProduct: vendor.offersProduct,
    offersTherapy: vendor.offersTherapy,
  });
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set(access.map((a) => a.categoryId)));
  const [catalogs, setCatalogs] = useState<Record<CategoryType, Category[]>>({ SERVICE: [], PRODUCT: [], THERAPY: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setModules({ offersService: vendor.offersService, offersProduct: vendor.offersProduct, offersTherapy: vendor.offersTherapy });
    setGrantedIds(new Set(access.map((a) => a.categoryId)));
  }, [vendor, access]);

  useEffect(() => {
    setError('');
    (['SERVICE', 'PRODUCT', 'THERAPY'] as const).forEach((type) => {
      listCategories(token, { type })
        .then(({ data }) => setCatalogs((prev) => ({ ...prev, [type]: data.filter((c) => !c.parentId) })))
        .catch((err) => {
          setCatalogs((prev) => ({ ...prev, [type]: [] }));
          setError(err instanceof ApiRequestError ? err.message : 'Could not load categories.');
        });
    });
  }, [token]);

  const toggleModule = (key: ModuleKey) => {
    const moduleDef = MODULES.find((m) => m.key === key);
    if (!moduleDef) return;
    const { type } = moduleDef;
    const turningOff = modules[key];
    setModules((m) => ({ ...m, [key]: !m[key] }));
    if (turningOff) {
      // A module a vendor no longer offers can't keep categories granted under it — the backend
      // rejects a categoryId whose type doesn't match an enabled module, so drop them here too.
      const idsForType = new Set(catalogs[type].map((c) => c.id));
      setGrantedIds((prev) => new Set([...prev].filter((id) => !idsForType.has(id))));
    }
  };

  const toggleCategory = (id: string) =>
    setGrantedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const input = { ...modules, categoryIds: [...grantedIds] };
      const { data } = isSelf
        ? await setMyVendorModulesAndCategoryAccess(token, input)
        : await setVendorModulesAndCategoryAccess(token, vendorId, input);
      showToast('Business modules and category access saved successfully');
      onSaved({ ...vendor, ...modules }, data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save business modules and category access.');
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const enabledModules = MODULES.filter((m) => modules[m.key]);

  return (
    <section aria-label="Business modules and category access">
      <h3 className="section-title">Business Modules</h3>
      <p className="field-hint">Choose which kinds of offerings this business sells, then grant it access to the categories it can sell under each.</p>
      <div className="form-grid">
        {MODULES.map(({ key, label }) => (
          <label key={key} className="category-grant-grid__option">
            <input type="checkbox" checked={modules[key]} onChange={() => toggleModule(key)} />
            {label}
          </label>
        ))}
      </div>

      <h3 className="section-title">Category Access</h3>
      {enabledModules.length === 0 ? (
        <p className="empty-state">Enable a business module above to grant it categories.</p>
      ) : (
        <div className="category-grant-grid">
          {enabledModules.map(({ type, label }) => (
            <div className="category-grant-grid__group" key={type}>
              <h4>{label} categories</h4>
              {catalogs[type].length === 0 ? (
                <p className="empty-state">No active {label} categories exist yet.</p>
              ) : (
                catalogs[type].map((c) => (
                  <label key={c.id} className="category-grant-grid__option">
                    <input type="checkbox" checked={grantedIds.has(c.id)} onChange={() => toggleCategory(c.id)} />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="error-state" role="alert">{error}</p>}
      <div className="form-actions">
        <FilledButton onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save modules & category access'}</FilledButton>
      </div>
    </section>
  );
}

export default VendorModulesAndCategoryAccess;
