import { useNavigate } from 'react-router-dom';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';

interface VendorProductsStepProps {
  vendorId: string;
  offersProduct: boolean;
  productCount: number;
}

/**
 * Onboarding wizard Step 5 — a read-only recap + a "Manage products" link out to
 * `ProductsListPage`/`ProductFormPage` (`/account/vendors/:id/products`), which now own every
 * product add/edit/status change for admin use. This step used to run its own `ProductFormDialog`
 * popup CRUD inline — removed because it duplicated that same job in a second place; see
 * `vendor-wizard-branches.tsx`'s own doc comment for the full rationale. Product is vendor-level
 * (no branch dependency, unlike Deals/Therapists — see msd-api's Product schema doc comment), so
 * there is no branch-count gate here.
 */
export function VendorProductsStep({ vendorId, offersProduct, productCount }: VendorProductsStepProps) {
  const navigate = useNavigate();

  if (!offersProduct) {
    return <p className="empty-state">This vendor has not enabled the Product business module in Step 2.</p>;
  }

  return (
    <section aria-label="Products">
      <div className="page-head">
        <h3 className="section-title">Products</h3>
        <OutlinedButton onClick={() => navigate(`/account/vendors/${vendorId}/products`)}>
          <Icon slot="icon" aria-hidden="true">open_in_new</Icon>
          Manage products
        </OutlinedButton>
      </div>
      <p className="field-hint">{productCount} product{productCount === 1 ? '' : 's'}.</p>
    </section>
  );
}

export default VendorProductsStep;
