import { useEffect, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import {
  approveDeal,
  createDeal,
  listDeals,
  rejectDeal,
  setDealStatus,
  updateDeal,
  type Branch,
  type Category,
  type Deal,
  type DealInput,
  type VendorProduct,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DealDialog } from './vendor-branches';

interface DealWithBranch extends Deal {
  branchName: string;
}

interface VendorDealsStepProps {
  token: string | null;
  vendorId: string;
  canEdit: boolean;
  canApprove: boolean;
  branches: Branch[];
  /** The vendor's granted SERVICE categories. */
  categories: Category[];
  products: VendorProduct[];
}

/**
 * Onboarding wizard Step 3 — a flat, cross-branch Deals list (mirrors the self-service "Deals /
 * Packages" page's own pattern, `vendor-deals.tsx`, just admin-scoped) reusing `DealDialog`
 * exactly as-is, with its `branches` selector so a Deal can be created against any of this
 * vendor's branches without first picking one on a separate pane — this IS the step that drops
 * the old "pick a global Service" flow (see `DealDialog`'s own doc comment in vendor-branches.tsx).
 */
export function VendorDealsStep({ token, vendorId, canEdit, canApprove, branches, categories, products }: VendorDealsStepProps) {
  const [deals, setDeals] = useState<DealWithBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingDeal, setEditingDeal] = useState<DealWithBranch | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);

  const load = async () => {
    if (branches.length === 0) {
      setDeals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const perBranch = await Promise.all(
        branches.map(async (branch) => {
          const { data } = await listDeals(token, vendorId, branch.id);
          return data.map((d) => ({ ...d, branchName: branch.name }));
        }),
      );
      setDeals(perBranch.flat());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the branch count, not identity
  }, [token, vendorId, branches.length]);

  const save = async (input: DealInput, branchId?: string, existing?: DealWithBranch) => {
    const { data } = existing
      ? await updateDeal(token, vendorId, existing.branchId, existing.id, input)
      : await createDeal(token, vendorId, branchId ?? branches[0]?.id ?? '', input);
    await load();
    return data;
  };

  const toggleStatus = async (deal: DealWithBranch) => {
    setError('');
    try {
      const nextStatus = deal.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await setDealStatus(token, vendorId, deal.branchId, deal.id, nextStatus);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change deal status.');
    }
  };

  const doApprove = async (deal: DealWithBranch) => {
    await approveDeal(token, vendorId, deal.branchId, deal.id);
    await load();
  };

  const doReject = async (deal: DealWithBranch) => {
    const reason = window.prompt('Reason for rejecting this deal?');
    if (!reason) return;
    await rejectDeal(token, vendorId, deal.branchId, deal.id, reason);
    await load();
  };

  const canAdd = canEdit && branches.length > 0 && (categories.length > 0 || products.length > 0);

  return (
    <section aria-label="Deals">
      <div className="page-head">
        <h3 className="section-title">Deals</h3>
        {canAdd && (
          <OutlinedButton onClick={() => addDialogRef.current?.show()}>
            <Icon slot="icon" aria-hidden="true">add</Icon>
            Add deal
          </OutlinedButton>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {branches.length === 0 ? (
        <p className="empty-state">Add a branch in Step 2 before adding deals.</p>
      ) : loading ? (
        <p className="loading-state">Loading deals…</p>
      ) : deals.length === 0 ? (
        <p className="empty-state">No deals yet.</p>
      ) : (
        <ul className="entity-list">
          {deals.map((deal) => (
            <li key={deal.id}>
              <div className="entity-list__item">
                <span className="role-list__name">
                  {deal.title}
                  <span className="field-hint">
                    {' '}
                    · {deal.branchName} · {deal.product ? `Product: ${deal.product.name}` : 'Service'} · ₹{deal.salePrice}
                  </span>
                </span>
                <span className={`status-pill ${deal.status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive'}`}>
                  {deal.status} / {deal.approvalStatus}
                </span>
              </div>
              {deal.approvalRejectionReason && <p className="error-state">Rejected: {deal.approvalRejectionReason}</p>}
              <div className="page-head__actions">
                {canEdit && (
                  <OutlinedButton
                    onClick={() => {
                      setEditingDeal(deal);
                      editDialogRef.current?.show();
                    }}
                  >
                    <Icon slot="icon" aria-hidden="true">edit</Icon>
                    Edit
                  </OutlinedButton>
                )}
                {canEdit && (
                  <OutlinedButton onClick={() => toggleStatus(deal)}>
                    {deal.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </OutlinedButton>
                )}
                {canApprove && deal.approvalStatus === 'PENDING' && (
                  <>
                    <FilledButton onClick={() => doApprove(deal)}>Approve</FilledButton>
                    <OutlinedButton onClick={() => doReject(deal)}>Reject</OutlinedButton>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <DealDialog
          categories={categories}
          products={products}
          branches={branches}
          token={token}
          dialogRef={addDialogRef}
          hideTrigger
          onSave={(input, branchId) => save(input, branchId)}
        />
      )}

      {editingDeal && (
        <DealDialog
          key={editingDeal.id}
          deal={editingDeal}
          categories={categories}
          products={products}
          branches={branches}
          token={token}
          dialogRef={editDialogRef}
          hideTrigger
          onSave={(input) => save(input, undefined, editingDeal)}
          onClose={() => setEditingDeal(null)}
        />
      )}
    </section>
  );
}

export default VendorDealsStep;
