import { useEffect, useRef, useState } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  listCategories,
  setMyVendorModulesAndCategoryAccess,
  setVendorModulesAndCategoryAccess,
  type Category,
  type Vendor,
  type VendorCategoryAccessRow,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';

interface VendorProductCategoryAccessProps {
  token: string | null;
  vendorId: string;
  isSelf: boolean;
  vendor: Vendor;
  access: VendorCategoryAccessRow[];
  onSaved: (vendor: Vendor, access: VendorCategoryAccessRow[]) => void;
}

/**
 * Onboarding wizard Step 2's "Product Categories" editor — Service/Therapy category access is
 * now managed entirely per-branch (see `BranchDialog`'s own "Categories & Subcategories" section
 * in `vendor-branches.tsx`), so this screen is Product-only: the `offersProduct` toggle bound to
 * `Vendor.offersProduct`, plus its own Product category checklist, sourced unfiltered by vendor
 * (`listCategories({ type: 'PRODUCT' })`, no `vendorId`) since this IS the granting screen for
 * Product — Product never flows through branch-level access (a branch's `setBranchCategoryAccess`
 * call rejects a PRODUCT-type category outright; Products aren't sold per-branch).
 *
 * Saved via the same replace-the-full-set `setVendorModulesAndCategoryAccess`/
 * `setMyVendorModulesAndCategoryAccess` call as before — that endpoint still expects all three
 * module flags plus the vendor's FULL granted `categoryId` set (every type, not just Product), so
 * `offersService`/`offersTherapy` and any Service/Therapy grants already on the vendor (created by
 * the branch-level flow) are carried through untouched in the payload rather than
 * rendered/edited here — dropping them would silently wipe the `VendorCategoryAccess` grants
 * backing every branch's own category mapping.
 */
export function VendorProductCategoryAccess({ token, vendorId, isSelf, vendor, access, onSaved }: VendorProductCategoryAccessProps) {
  const { showToast } = useToast();
  const [offersProduct, setOffersProduct] = useState(vendor.offersProduct);
  // Every currently-granted category id, of EVERY type (Service/Therapy included) — only the
  // PRODUCT-type ones are ever rendered/toggled below; the rest ride along untouched in the
  // replace-the-full-set payload (see this component's own doc comment).
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set(access.map((a) => a.categoryId)));
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    setOffersProduct(vendor.offersProduct);
    setGrantedIds(new Set(access.map((a) => a.categoryId)));
  }, [vendor, access]);

  useEffect(() => {
    setError('');
    listCategories(token, { type: 'PRODUCT' })
      .then(({ data }) => setCatalog(data.filter((c) => !c.parentId)))
      .catch((err) => {
        setCatalog([]);
        setError(err instanceof ApiRequestError ? err.message : 'Could not load categories.');
      });
  }, [token]);

  const productCategoryIds = new Set(catalog.map((c) => c.id));

  const toggleModule = () => {
    const turningOff = offersProduct;
    setOffersProduct((v) => !v);
    if (turningOff) {
      // A vendor that no longer offers Product can't keep Product categories granted — the
      // backend rejects a categoryId whose type doesn't match an enabled module, so drop them
      // here too (Service/Therapy grants, of a different type, are untouched by this filter).
      setGrantedIds((prev) => new Set([...prev].filter((id) => !productCategoryIds.has(id))));
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
      const input = {
        offersService: vendor.offersService,
        offersProduct,
        offersTherapy: vendor.offersTherapy,
        categoryIds: [...grantedIds],
      };
      const { data } = isSelf
        ? await setMyVendorModulesAndCategoryAccess(token, input)
        : await setVendorModulesAndCategoryAccess(token, vendorId, input);
      showToast('Product categories saved successfully');
      onSaved({ ...vendor, offersProduct }, data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save product categories.');
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-label="Product categories">
      <h3 className="section-title">Product Categories</h3>
      <p className="field-hint">Enable the Product module if this business sells physical products, then grant it the categories it can sell under.</p>
      <div className="form-grid">
        <label className="category-grant-grid__option">
          <input type="checkbox" checked={offersProduct} onChange={toggleModule} />
          Product
        </label>
      </div>

      {!offersProduct ? (
        <p className="empty-state">Enable the Product module above to grant it categories.</p>
      ) : (
        <div className="category-grant-grid">
          <div className="category-grant-grid__group">
            {catalog.length === 0 ? (
              <p className="empty-state">No active Product categories exist yet.</p>
            ) : (
              catalog.map((c) => (
                <label key={c.id} className="category-grant-grid__option">
                  <input type="checkbox" checked={grantedIds.has(c.id)} onChange={() => toggleCategory(c.id)} />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="error-state" role="alert">{error}</p>}
      <div className="form-actions">
        <FilledButton onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save product categories'}</FilledButton>
      </div>
    </section>
  );
}

export default VendorProductCategoryAccess;
