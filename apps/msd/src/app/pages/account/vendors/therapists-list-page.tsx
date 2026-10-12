import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listVendorTherapistsForAdmin, setVendorTherapistStatus, deleteVendorTherapist, type AdminTherapist } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface TherapistsListPageProps {
  token: string | null;
  vendorId: string;
  /** Gates "Add therapist" and each row's Edit/Toggle-status action — same coarse `vendors:edit`
   *  prop `BranchesListPage`/`DealsListPage` already take. */
  canEdit: boolean;
  /** Gates the Delete row action — mirrors `vendor-detail-page.tsx`'s own `canDelete`. */
  canDelete: boolean;
}

const THERAPIST_COLUMNS = JSON.stringify([
  { key: 'Type', label: 'Type' },
  { key: 'Name', label: 'Name' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Specialization', label: 'Specialization' },
  { key: 'Experience', label: 'Experience' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

function toRow(t: AdminTherapist): Record<string, string | number> {
  return {
    Type: t.therapistType,
    Name: t.personName,
    Branch: t.branch.name,
    Specialization: t.specialization?.trim() || '—',
    Experience: t.experienceYears ? `${t.experienceYears} yrs` : '—',
    Status: t.isActive ? 'Active' : 'Inactive',
  };
}

/** Therapists — data table, vendor-wide (every branch). Plugged into `VendorDetailPage`'s
 *  `section="therapists"`, replacing the old inline `TherapistsTab`. Add/Edit are full pages
 *  (`/therapists/new`, `/therapists/:therapistId`), mirroring Deals' own list+form pattern; a
 *  therapist's Delete is a real hard delete (blocked server-side, 409, if it has order/cart
 *  history — use the status toggle instead in that case). */
export function TherapistsListPage({ token, vendorId, canEdit, canDelete }: TherapistsListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [therapists, setTherapists] = useState<AdminTherapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listVendorTherapistsForAdmin(token, vendorId);
      setTherapists(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (therapist: AdminTherapist) => {
    setError('');
    try {
      await setVendorTherapistStatus(token, vendorId, therapist.id, !therapist.isActive);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change this therapist\'s status.');
    }
  };

  const remove = async (therapist: AdminTherapist) => {
    if (!(await confirm(`Delete "${therapist.personName}"? This cannot be undone.`))) return;
    try {
      await deleteVendorTherapist(token, vendorId, therapist.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this therapist.');
    }
  };

  const actions = [
    ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }, { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
    ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
  ];

  useEffect(() => {
    const el = tableRef.current;
    if (!el || actions.length === 0) return;
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const therapist = therapists[detail.rowIndex];
      if (!therapist) return;
      if (detail.action === 'edit') navigate(`/account/vendors/${vendorId}/therapists/${therapist.id}`);
      else if (detail.action === 'toggle-status') toggleStatus(therapist);
      else if (detail.action === 'delete') remove(therapist);
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions/toggleStatus/remove are recreated each render; rowIndex lookup always reads the latest `therapists` via closure
  }, [therapists, vendorId, navigate]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="section-title">Therapists</h2>
          <p className="field-hint">{loading ? 'Loading…' : `${therapists.length} therapist${therapists.length === 1 ? '' : 's'}`}</p>
        </div>
        {canEdit && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/vendors/${vendorId}/therapists/new`)}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add therapist
            </FilledButton>
          </div>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && therapists.length === 0 ? (
        <p className="empty-state">No therapists yet. Add one for a branch.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Therapists"
          columns={THERAPIST_COLUMNS}
          rows={JSON.stringify(therapists.map(toRow))}
          total={therapists.length}
          page={1}
          page-size={Math.max(therapists.length, 10)}
          loading={loading}
          actions={actions.length > 0 ? JSON.stringify(actions) : undefined}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

export default TherapistsListPage;
