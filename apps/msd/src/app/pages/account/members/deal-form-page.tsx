import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import { FilledButton, OutlinedButton, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createTherapist,
  createVendorTherapist,
  dealApi,
  getVendor,
  listBranches,
  listCategories,
  listMyBranches,
  listMyTherapists,
  listVendorTherapistsForAdmin,
  type Branch,
  type Category,
  type Deal,
  type DealCancellationPolicy,
  type DealInput,
  type DealPackageInput,
  type DealSurface,
  type DealUpdateInput,
} from '../../../../api/rbac/vendors';
import type { MediaImage } from '../../../../api/media';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { memberTrail } from './member-crumbs';
import { renderCheckbox, renderSelect, renderTextField } from '../../../components/form-controls/form-controls';
import { StringListField } from './string-list-field';
import { DealPackageCards, packageError, type PackageCard } from './deal-package-cards';
import { CANCELLATION_OPTIONS, fromDateInput, toDateInput } from './deal-format';

interface DealFormPageProps {
  token: string | null;
  /** `staff`: `/account/members/:vendorId/deals/...`; `member`: `/account/vendor-deals/...`. */
  surface?: 'staff' | 'member';
}

interface TherapistOption {
  id: string;
  branchId: string;
  personName: string;
  therapistType: string;
}

const EMPTY_FORM = {
  branchId: '',
  categoryId: '',
  subcategoryId: '',
  title: '',
  slug: '',
  tagline: '',
  highlights: [] as string[],
  description: '',
  startDate: '',
  endDate: '',
  validityDays: '',
  maxBookings: '',
  limitPerCustomer: '',
  bookingRequired: true,
  bookingInstructions: '',
  cancellationPolicy: 'FREE_24H' as DealCancellationPolicy,
  cancellationNote: '',
  eligibility: [] as string[],
  termsAndConditions: '',
  faqs: [] as { question: string; answer: string }[],
};
type FormState = typeof EMPTY_FORM;
type FieldErrors = Partial<Record<'branchId' | 'categoryId' | 'title' | 'slug' | 'dates' | 'packages' | 'faqs', string>>;

const MISSING_TEXT: Record<string, string> = {
  image: 'Add at least one image',
  package: 'Add an active package',
  branch: 'Activate the branch',
  member: 'The member must be active',
};

function formFromDeal(deal: Deal): FormState {
  return {
    branchId: deal.branchId,
    categoryId: deal.categoryId,
    subcategoryId: deal.subcategoryId ?? '',
    title: deal.title,
    slug: deal.slug,
    tagline: deal.tagline ?? deal.shortDescription ?? '',
    highlights: deal.highlights ?? [],
    description: deal.description ?? '',
    startDate: toDateInput(deal.startDate),
    endDate: toDateInput(deal.endDate),
    validityDays: deal.validityDays != null ? String(deal.validityDays) : '',
    maxBookings: deal.maxBookings != null ? String(deal.maxBookings) : '',
    limitPerCustomer: deal.limitPerCustomer != null ? String(deal.limitPerCustomer) : '',
    bookingRequired: deal.bookingRequired ?? true,
    bookingInstructions: deal.bookingInstructions ?? '',
    cancellationPolicy: deal.cancellationPolicy ?? 'FREE_24H',
    cancellationNote: deal.cancellationNote ?? '',
    eligibility: deal.eligibility ?? [],
    termsAndConditions: deal.termsAndConditions ?? '',
    faqs: (deal.faqs ?? []).map(({ question, answer }) => ({ question, answer })),
  };
}

function cardsFromDeal(deal: Deal): PackageCard[] {
  return (deal.packages ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? undefined,
    durationMinutes: p.durationMinutes,
    persons: p.persons ?? 1,
    sellingPrice: Number(p.sellingPrice),
    originalPrice: p.originalPrice != null ? Number(p.originalPrice) : undefined,
    inclusions: p.inclusions ?? [],
    isActive: p.isActive,
  }));
}

const intOrNull = (value: string) => (value.trim() === '' ? null : Math.trunc(Number(value)));

/** Field values for create and update (API.md §2.1). Empty optional fields are left out on
 *  create and cleared (`null` / `""`) on update. */
function fieldsFromForm(form: FormState) {
  return {
    categoryId: form.categoryId,
    subcategoryId: form.subcategoryId || null,
    title: form.title.trim(),
    tagline: form.tagline.trim(),
    highlights: form.highlights,
    description: form.description,
    startDate: fromDateInput(form.startDate) ?? null,
    endDate: fromDateInput(form.endDate, true) ?? null,
    validityDays: intOrNull(form.validityDays),
    maxBookings: intOrNull(form.maxBookings),
    limitPerCustomer: intOrNull(form.limitPerCustomer),
    bookingRequired: form.bookingRequired,
    bookingInstructions: form.bookingInstructions,
    cancellationPolicy: form.cancellationPolicy,
    cancellationNote: form.cancellationNote.trim(),
    eligibility: form.eligibility,
    termsAndConditions: form.termsAndConditions,
    faqs: form.faqs.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })),
  };
}

function withoutEmpty<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
}

function validate(form: FormState, packages: PackageCard[], isEdit: boolean): FieldErrors {
  const title = form.title.trim();
  const errors: FieldErrors = {
    branchId: form.branchId ? undefined : 'Select a branch.',
    categoryId: form.categoryId ? undefined : 'Select a category.',
    title: title.length < 5 || title.length > 120 ? 'Use 5 to 120 characters.' : undefined,
    slug: form.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug) ? 'Lowercase letters, numbers and single hyphens only.' : undefined,
    dates: form.startDate && form.endDate && form.endDate < form.startDate ? 'The sale must end after it starts.' : undefined,
    faqs: form.faqs.some((f) => !f.question.trim() || !f.answer.trim()) ? 'Every question needs an answer.' : undefined,
  };
  if (!isEdit) {
    if (packages.length === 0) errors.packages = 'Add at least one package.';
    else {
      const problem = packages.map((p, i) => packageError(p, packages.filter((_, j) => j !== i))).find(Boolean);
      if (problem) errors.packages = problem;
    }
  }
  return errors;
}

/**
 * Add / edit a deal (docs/msd/PLANNING.md §2.7): one form for staff working for a member and for
 * the member's own console. Sections follow the deal page: Basics, Media, Packages, Description,
 * Availability and redemption, Fine print, FAQs, Therapists, Publish. A deal needs a branch
 * first; package cards save on their own once the deal exists; prices are never typed in (the
 * API takes them from the cheapest active package).
 */
export function DealFormPage({ token, surface = 'staff' }: DealFormPageProps) {
  const params = useParams<{ vendorId?: string; dealId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const isStaff = surface === 'staff';
  const vendorId = params.vendorId ?? '';
  const dealId = params.dealId;
  const isEdit = Boolean(dealId);
  const apiSurface: DealSurface = useMemo(() => (isStaff ? { kind: 'staff', vendorId } : { kind: 'member' }), [isStaff, vendorId]);
  const api = useMemo(() => dealApi(token, apiSurface), [token, apiSurface]);
  const listPath = isStaff ? `/account/members/${vendorId}/deals` : '/account/vendor-deals';
  const editPath = (id: string) => (isStaff ? `/account/members/${vendorId}/deals/${id}` : `/account/vendor-deals/${id}`);
  const branchFormPath = isStaff ? `/account/members/${vendorId}/branches/new` : '/account/vendor-branches-deals';

  const [vendorName, setVendorName] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, branchId: searchParams.get('branchId') ?? '' });
  const [packages, setPackages] = useState<PackageCard[]>([]);
  const [therapistIds, setTherapistIds] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<MediaImage[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [copyBranchId, setCopyBranchId] = useState('');
  const [newTherapist, setNewTherapist] = useState({ therapistType: '', personName: '' });
  const [therapistError, setTherapistError] = useState('');
  const [creatingTherapist, setCreatingTherapist] = useState(false);

  const applyDeal = useCallback((next: Deal) => {
    setDeal(next);
    setPackages(cardsFromDeal(next));
    setImages(next.mediaImages ?? []);
  }, []);

  useEffect(() => {
    if (!isStaff || !vendorId) return;
    getVendor(token, vendorId)
      .then(({ data }) => setVendorName(data.businessName || data.owner?.name || null))
      .catch(() => setVendorName(null));
  }, [token, vendorId, isStaff]);

  useEffect(() => {
    (isStaff ? listBranches(token, vendorId) : listMyBranches(token))
      .then(({ data }) => setBranches(data))
      .catch(() => setBranches([]));
  }, [token, vendorId, isStaff]);

  // D10: every active SERVICE category is open to every member.
  useEffect(() => {
    listCategories(token, { type: 'SERVICE' })
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]));
  }, [token]);

  useEffect(() => {
    if (isStaff) {
      if (!vendorId) return;
      listVendorTherapistsForAdmin(token, vendorId)
        .then(({ data }) => setTherapists(data))
        .catch(() => setTherapists([]));
      return;
    }
    if (!form.branchId) return setTherapists([]);
    listMyTherapists(token, form.branchId)
      .then(({ data }) => setTherapists(data.map((t) => ({ ...t, branchId: form.branchId }))))
      .catch(() => setTherapists([]));
  }, [token, vendorId, isStaff, form.branchId]);

  useEffect(() => {
    if (!dealId) return;
    setLoading(true);
    api
      .listAll()
      .then(({ data }) => {
        const found = data.find((d) => d.id === dealId);
        if (!found) return setLoadError('Deal not found.');
        applyDeal(found);
        setForm(formFromDeal(found));
        setTherapistIds(new Set((found.therapists ?? []).map((t) => t.id)));
      })
      .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this deal.'))
      .finally(() => setLoading(false));
  }, [api, dealId, applyDeal]);

  const title = deal?.title || (isEdit ? 'Deal' : 'New deal');
  useSetBreadcrumbs(
    isStaff
      ? [
          ...memberTrail(vendorId, vendorName),
          { label: 'Deals', to: listPath },
          { label: isEdit ? title : 'Add deal' },
        ]
      : [{ label: 'Deals', to: listPath }, { label: isEdit ? title : 'Add deal' }],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'categoryId' ? { subcategoryId: '' } : {}) }));
    if (key === 'branchId') setTherapistIds(new Set());
  };

  const topCategories = categories.filter((c) => !c.parentId);
  const subcategories = categories.filter((c) => c.parentId === form.categoryId);
  const branchTherapists = therapists.filter((t) => t.branchId === form.branchId);
  const branch = branches?.find((b) => b.id === form.branchId);
  const canEditSlug = !deal?.publishedAt || isStaff;
  const canDelete = isStaff && can('vendors.deals', 'delete');

  // ─── Packages: local before the first save, one call per card after ───
  const branchId = deal?.branchId ?? form.branchId;
  const packageOps = {
    onAdd: async (value: DealPackageInput) => {
      if (!deal) return setPackages((prev) => [...prev, value]);
      applyDeal((await api.addPackage(branchId, deal.id, value)).data);
      showSnackbar('Package added.');
    },
    onUpdate: async (index: number, value: DealPackageInput) => {
      const current = packages[index];
      if (!deal || !current.id) return setPackages((prev) => prev.map((p, i) => (i === index ? { ...value, id: p.id } : p)));
      applyDeal((await api.updatePackage(branchId, deal.id, current.id, { ...value, name: value.name ?? null, originalPrice: value.originalPrice ?? null })).data);
      showSnackbar('Package saved.');
    },
    onDelete: async (index: number) => {
      const current = packages[index];
      if (!deal || !current.id) return setPackages((prev) => prev.filter((_, i) => i !== index));
      applyDeal((await api.deletePackage(branchId, deal.id, current.id)).data);
      showSnackbar('Package deleted.');
    },
    onMove: async (from: number, to: number) => {
      const next = [...packages];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      if (!deal) return setPackages(next);
      applyDeal((await api.reorderPackages(branchId, deal.id, next.map((p) => p.id as string))).data);
    },
  };

  const addTherapist = async () => {
    const therapistType = newTherapist.therapistType.trim();
    const personName = newTherapist.personName.trim();
    if (!form.branchId || !therapistType || !personName) return setTherapistError('Enter both a type and a name.');
    setCreatingTherapist(true);
    setTherapistError('');
    try {
      // The API puts the new therapist on this branch of this member, whatever is sent.
      const { data } = isStaff
        ? await createVendorTherapist(token, vendorId, form.branchId, { therapistType, personName })
        : await createTherapist(token, form.branchId, { therapistType, personName });
      setTherapists((prev) => [...prev, { id: data.id, branchId: form.branchId, personName, therapistType }]);
      setTherapistIds((prev) => new Set(prev).add(data.id));
      setNewTherapist({ therapistType: '', personName: '' });
    } catch (err) {
      setTherapistError(err instanceof ApiRequestError ? err.message : 'Could not add this therapist.');
    } finally {
      setCreatingTherapist(false);
    }
  };

  const save = async () => {
    const nextErrors = validate(form, packages, isEdit);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return setSaveError('Fix the highlighted fields before saving.');
    setSaving(true);
    setSaveError('');
    try {
      const fields = fieldsFromForm(form);
      if (deal) {
        const input: DealUpdateInput = {
          ...fields,
          ...(form.slug !== deal.slug && canEditSlug ? { slug: form.slug } : {}),
          therapistIds: [...therapistIds],
        };
        const { data } = await api.update(deal.branchId, deal.id, input);
        applyDeal(data);
        setForm(formFromDeal(data));
        showSnackbar('Deal saved.');
      } else {
        const input: DealInput = {
          ...(withoutEmpty(fields) as Omit<DealInput, 'packages'>),
          ...(form.slug ? { slug: form.slug } : {}),
          bookingRequired: form.bookingRequired,
          therapistIds: [...therapistIds],
          packages: packages.map(({ id: _id, ...p }) => p),
        };
        const { data } = await api.create(form.branchId, input);
        applyDeal(data);
        setForm(formFromDeal(data));
        showSnackbar('Deal saved as a draft. Add images, then go live.');
        navigate(editPath(data.id), { replace: true });
      }
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this deal.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: 'DRAFT' | 'ACTIVE' | 'INACTIVE') => {
    if (!deal) return;
    setStatusError('');
    try {
      applyDeal((await api.setStatus(deal.branchId, deal.id, status)).data);
      showSnackbar(status === 'ACTIVE' ? 'The deal is live.' : status === 'INACTIVE' ? 'The deal is paused.' : 'The deal is back to draft.');
    } catch (err) {
      setStatusError(err instanceof ApiRequestError ? err.message : 'Could not change the status.');
    }
  };

  const copyToBranch = async () => {
    if (!deal || !copyBranchId) return;
    setStatusError('');
    try {
      const { data } = await api.copy(deal.branchId, deal.id, copyBranchId);
      showSnackbar('Copied as a draft to the other branch.');
      navigate(editPath(data.id));
    } catch (err) {
      setStatusError(err instanceof ApiRequestError ? err.message : 'Could not copy this deal.');
    }
  };

  const removeDeal = async () => {
    if (!deal || !(await confirm(`Delete "${deal.title}"? This cannot be undone.`))) return;
    try {
      await api.remove(deal.branchId, deal.id);
      showSnackbar('Deal deleted.');
      navigate(listPath);
    } catch (err) {
      setStatusError(err instanceof ApiRequestError ? err.message : 'Could not delete this deal.');
    }
  };

  if (loading) return <p className="loading-state">Loading deal…</p>;
  if (loadError) return <p className="error-state" role="alert">{loadError}</p>;

  // PLANNING §2.7: no branch, no deal.
  if (!isEdit && branches !== null && branches.length === 0) {
    return (
      <div className="admin-page">
        <title>Add deal · MSD</title>
        <header className="page-head">
          <h1>Add deal</h1>
        </header>
        <p className="empty-state">
          Add a branch first. A deal is sold at one branch, so pick its state and city on the branch, then come back.
        </p>
        <FilledButton onClick={() => navigate(branchFormPath)}>
          <Icon slot="icon" aria-hidden="true">add_business</Icon>
          Add a branch
        </FilledButton>
      </div>
    );
  }

  const branchChosen = Boolean(form.branchId);
  const missing = deal
    ? [
        ...(images.length === 0 ? ['image'] : []),
        ...(packages.some((p) => p.isActive) ? [] : ['package']),
        ...(branch && !branch.isActive ? ['branch'] : []),
      ]
    : [];
  const otherBranches = (branches ?? []).filter((b) => b.id !== deal?.branchId);

  return (
    <div className="admin-page">
      <title>{`${isEdit ? 'Edit' : 'Add'} deal · MSD`}</title>
      <header className="page-head">
        <div>
          <h1>{isEdit ? 'Edit deal' : 'Add deal'}</h1>
          {deal && (
            <p className="field-hint">
              <span className={`status-pill ${deal.status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive'}`}>{deal.status}</span>
              {deal.status === 'ACTIVE' && (
                <>
                  {' '}
                  <Link to={`/deal/${deal.slug}`} target="_blank" rel="noopener">View on the website</Link>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      {saveError && <p className="error-state" role="alert">{saveError}</p>}

      <sky-accordion>
        <sky-accordion-item header="Basics" open>
          <div className="form-grid">
            {deal ? (
              <p className="field-hint">
                Branch: {branch?.name ?? deal.branch?.name ?? '—'}
                {branch?.city ? `, ${branch.city}` : ''} (fixed; use Copy to branch to sell it at another branch)
              </p>
            ) : (
              renderSelect({
                label: 'Branch',
                value: form.branchId,
                required: true,
                disabled: branches === null,
                placeholder: branches === null ? 'Loading branches…' : 'Select a branch',
                options: (branches ?? []).map((b) => ({ value: b.id, label: [b.name, b.city, b.state].filter(Boolean).join(', ') })),
                onChange: (value) => set('branchId', value),
              })
            )}
            {errors.branchId && <p className="error-state" role="alert">{errors.branchId}</p>}
            {renderSelect({
              label: 'Category',
              value: form.categoryId,
              required: true,
              placeholder: 'Select a category',
              options: topCategories.map((c) => ({ value: c.id, label: c.name })),
              extraOption:
                form.categoryId && !topCategories.some((c) => c.id === form.categoryId) && deal?.category
                  ? { value: form.categoryId, label: deal.category.name }
                  : undefined,
              onChange: (value) => set('categoryId', value),
            })}
            {errors.categoryId && <p className="error-state" role="alert">{errors.categoryId}</p>}
            {subcategories.length > 0 &&
              renderSelect({
                label: 'Subcategory (optional)',
                value: form.subcategoryId,
                placeholder: 'None',
                options: subcategories.map((c) => ({ value: c.id, label: c.name })),
                onChange: (value) => set('subcategoryId', value),
              })}
            {renderTextField({
              label: 'Title',
              required: true,
              maxLength: 120,
              value: form.title,
              errorText: errors.title,
              supportingText: 'What the customer gets, for example "Swedish full body massage"',
              onInput: (value) => set('title', value),
            })}
            {renderTextField({
              label: 'Tagline',
              maxLength: 140,
              value: form.tagline,
              supportingText: `Shown under the title and in search results · ${form.tagline.length}/140`,
              onInput: (value) => set('tagline', value),
            })}
            {renderTextField({
              label: 'Web address',
              value: form.slug,
              maxLength: 90,
              disabled: !canEditSlug,
              prefixText: '/deal/',
              errorText: errors.slug,
              supportingText: canEditSlug
                ? isEdit
                  ? 'Changing it after the deal went live keeps the old address working'
                  : 'Leave empty: made from the title, business and city'
                : 'Fixed once the deal has been live; MSD support can change it',
              onInput: (value) => set('slug', value.toLowerCase()),
            })}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Images and video" disabled={!branchChosen}>
          <div className="form-grid">
            <p className="field-hint">Add 1 to 10 photos; the first is the cover. Customers see them as a gallery.</p>
            {branchChosen && (
              <MediaUploader
                entityType="deal"
                entityId={deal?.id ?? null}
                branchId={branchId}
                selfService={!isStaff}
                vendorId={isStaff ? vendorId : undefined}
                existingImages={deal?.mediaImages ?? []}
                existingVideo={deal?.mediaVideo ?? null}
                token={token}
                onImagesChange={setImages}
              />
            )}
            {deal && images.length > 0 && (
              <fieldset>
                <legend>Image descriptions (for screen readers and search)</legend>
                <div className="form-grid">
                  {images.map((image, index) => (
                    <ImageAltField
                      key={image.id}
                      label={`Image ${index + 1}${image.isPrimary ? ' (cover)' : ''}`}
                      initial={image.altText ?? ''}
                      onSave={async (altText) => {
                        const { data } = await api.setImageAlt(deal.branchId, deal.id, image.id, altText);
                        setImages((prev) => prev.map((img) => (img.id === image.id ? { ...img, altText: data.altText } : img)));
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Packages" disabled={!branchChosen} open={!isEdit}>
          {errors.packages && <p className="error-state" role="alert">{errors.packages}</p>}
          <DealPackageCards packages={packages} {...packageOps} />
        </sky-accordion-item>

        <sky-accordion-item header="Description" disabled={!branchChosen}>
          <div className="form-grid">
            <StringListField
              label="Highlights"
              addLabel="Add a highlight"
              hint="Short selling points shown under the title, for example Includes steam bath."
              items={form.highlights}
              max={6}
              maxLength={80}
              onChange={(items) => set('highlights', items)}
            />
            {renderTextField({
              label: 'What you get',
              type: 'textarea',
              rows: 6,
              maxLength: 5000,
              value: form.description,
              onInput: (value) => set('description', value),
            })}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Availability and redemption" disabled={!branchChosen}>
          <div className="form-grid">
            {renderTextField({ label: 'Sale starts', type: 'date', value: form.startDate, onInput: (value) => set('startDate', value) })}
            {renderTextField({
              label: 'Sale ends',
              type: 'date',
              value: form.endDate,
              errorText: errors.dates,
              supportingText: 'Shows an "Ends in" countdown in the last 7 days',
              onInput: (value) => set('endDate', value),
            })}
            {renderTextField({
              label: 'Valid for (days after purchase)',
              type: 'number',
              min: 1,
              max: 365,
              value: form.validityDays,
              onInput: (value) => set('validityDays', value),
            })}
            {renderTextField({
              label: 'Total stock (optional)',
              type: 'number',
              min: 0,
              value: form.maxBookings,
              supportingText: deal?.stockLeft != null ? `${deal.stockLeft} left` : 'Empty: no limit',
              onInput: (value) => set('maxBookings', value),
            })}
            {renderTextField({
              label: 'Limit per customer (optional)',
              type: 'number',
              min: 1,
              max: 20,
              value: form.limitPerCustomer,
              onInput: (value) => set('limitPerCustomer', value),
            })}
            {renderCheckbox({
              label: 'Customers book a time before visiting',
              checked: form.bookingRequired,
              onChange: (checked) => set('bookingRequired', checked),
            })}
            {renderTextField({
              label: 'How to book and redeem',
              type: 'textarea',
              rows: 3,
              maxLength: 2000,
              value: form.bookingInstructions,
              supportingText: 'For example: call the branch 24 hours before and show the voucher on arrival',
              onInput: (value) => set('bookingInstructions', value),
            })}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Fine print" disabled={!branchChosen}>
          <div className="form-grid">
            {renderSelect({
              label: 'Cancellation',
              value: form.cancellationPolicy,
              options: CANCELLATION_OPTIONS,
              onChange: (value) => set('cancellationPolicy', value as DealCancellationPolicy),
            })}
            {renderTextField({
              label: 'Cancellation note (optional)',
              maxLength: 500,
              value: form.cancellationNote,
              onInput: (value) => set('cancellationNote', value),
            })}
            <StringListField
              label="Who can use it"
              addLabel="Add a rule"
              hint='Short rules, for example "Women only" or "18+".'
              items={form.eligibility}
              max={6}
              maxLength={40}
              onChange={(items) => set('eligibility', items)}
            />
            {renderTextField({
              label: 'Terms and conditions',
              type: 'textarea',
              rows: 4,
              maxLength: 5000,
              value: form.termsAndConditions,
              supportingText: 'Write blackout dates here, for example not valid on public holidays',
              onInput: (value) => set('termsAndConditions', value),
            })}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Questions and answers" disabled={!branchChosen}>
          <div className="form-grid">
            {errors.faqs && <p className="error-state" role="alert">{errors.faqs}</p>}
            {form.faqs.map((faq, index) => (
              <fieldset key={index} className="deal-faq">
                <legend>Question {index + 1}</legend>
                <div className="form-grid">
                  {renderTextField({
                    label: 'Question',
                    maxLength: 200,
                    value: faq.question,
                    onInput: (question) => set('faqs', form.faqs.map((f, i) => (i === index ? { ...f, question } : f))),
                  })}
                  {renderTextField({
                    label: 'Answer',
                    type: 'textarea',
                    rows: 2,
                    maxLength: 1000,
                    value: faq.answer,
                    onInput: (answer) => set('faqs', form.faqs.map((f, i) => (i === index ? { ...f, answer } : f))),
                  })}
                  <div className="page-head__actions">
                    <TextButton disabled={index === 0} onClick={() => set('faqs', swap(form.faqs, index, index - 1))}>
                      <Icon slot="icon" aria-hidden="true">arrow_upward</Icon>
                      Up
                    </TextButton>
                    <TextButton onClick={() => set('faqs', form.faqs.filter((_, i) => i !== index))}>
                      <Icon slot="icon" aria-hidden="true">delete</Icon>
                      Remove
                    </TextButton>
                  </div>
                </div>
              </fieldset>
            ))}
            {form.faqs.length < 10 && (
              <OutlinedButton onClick={() => set('faqs', [...form.faqs, { question: '', answer: '' }])}>
                <Icon slot="icon" aria-hidden="true">add</Icon>
                Add a question
              </OutlinedButton>
            )}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Media (Images &amp; Video)" disabled={!branchChosen}>
          <div className="form-grid">
            <p className="field-hint">The deal's photos and an optional short video — shown on its public page.</p>
            <MediaUploader
              entityType="deal"
              entityId={deal?.id ?? null}
              branchId={form.branchId}
              vendorId={vendorId}
              existingImages={deal?.mediaImages ?? []}
              existingVideo={deal?.mediaVideo ?? null}
              token={token}
            />
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Therapists" disabled={!branchChosen}>
          <div className="form-grid">
            <p className="field-hint">Pick who performs this deal from this branch, or add a new therapist to the branch.</p>
            {branchTherapists.length === 0 ? (
              <p className="empty-state">No therapists on this branch yet. Add one below.</p>
            ) : (
              <div className="category-grant-grid">
                {branchTherapists.map((t) =>
                  renderCheckbox({
                    label: `${t.personName} · ${t.therapistType}`,
                    checked: therapistIds.has(t.id),
                    onChange: (checked) =>
                      setTherapistIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(t.id);
                        else next.delete(t.id);
                        return next;
                      }),
                  }),
                )}
              </div>
            )}
            <fieldset>
              <legend>Add a new therapist to this branch</legend>
              <div className="form-grid">
                {renderTextField({
                  label: 'Type (for example Massage therapist)',
                  value: newTherapist.therapistType,
                  onInput: (value) => setNewTherapist((f) => ({ ...f, therapistType: value })),
                })}
                {renderTextField({ label: 'Name', value: newTherapist.personName, onInput: (value) => setNewTherapist((f) => ({ ...f, personName: value })) })}
                <OutlinedButton disabled={creatingTherapist} onClick={addTherapist}>
                  <Icon slot="icon" aria-hidden="true">person_add</Icon>
                  {creatingTherapist ? 'Adding…' : 'Add therapist'}
                </OutlinedButton>
              </div>
              {therapistError && <p className="error-state" role="alert">{therapistError}</p>}
            </fieldset>
          </div>
        </sky-accordion-item>

        {deal && (
          <sky-accordion-item header="Publish" open>
            <div className="form-grid">
              {statusError && <p className="error-state" role="alert">{statusError}</p>}
              {missing.length > 0 ? (
                <div className="field-hint">
                  <p>Before it can go live:</p>
                  <ul className="deal-readiness">
                    {missing.map((m) => (
                      <li key={m}>{MISSING_TEXT[m]}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                deal.status !== 'ACTIVE' && <p className="field-hint">Ready to go live.</p>
              )}
              <div className="page-head__actions">
                {deal.status !== 'ACTIVE' && (
                  <FilledButton disabled={missing.length > 0} onClick={() => changeStatus('ACTIVE')}>
                    <Icon slot="icon" aria-hidden="true">public</Icon>
                    Go live
                  </FilledButton>
                )}
                {deal.status === 'ACTIVE' && <OutlinedButton onClick={() => changeStatus('INACTIVE')}>Pause</OutlinedButton>}
                {deal.status !== 'DRAFT' && <TextButton onClick={() => changeStatus('DRAFT')}>Back to draft</TextButton>}
              </div>
              {otherBranches.length > 0 && (
                <fieldset>
                  <legend>Copy to branch</legend>
                  <p className="field-hint">Makes a draft at another branch with the same details, packages and questions. Add its images there.</p>
                  <div className="form-grid">
                    {renderSelect({
                      label: 'Target branch',
                      value: copyBranchId,
                      placeholder: 'Select a branch',
                      options: otherBranches.map((b) => ({ value: b.id, label: [b.name, b.city].filter(Boolean).join(', ') })),
                      onChange: setCopyBranchId,
                    })}
                    <OutlinedButton disabled={!copyBranchId} onClick={copyToBranch}>
                      <Icon slot="icon" aria-hidden="true">content_copy</Icon>
                      Copy
                    </OutlinedButton>
                  </div>
                </fieldset>
              )}
              {canDelete && (
                <div>
                  <TextButton onClick={removeDeal}>
                    <Icon slot="icon" aria-hidden="true">delete_forever</Icon>
                    Delete deal
                  </TextButton>
                </div>
              )}
            </div>
          </sky-accordion-item>
        )}
      </sky-accordion>

      <div className="form-actions">
        <FilledButton disabled={saving || !branchChosen} onClick={() => save()}>
          {saving ? 'Saving…' : isEdit ? 'Save' : 'Save as draft'}
        </FilledButton>
        <TextButton onClick={() => navigate(listPath)}>Back to deals</TextButton>
      </div>
      {ConfirmDialog}
    </div>
  );
}

function swap<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** One image's alt text, saved when the field loses focus with a changed value. */
function ImageAltField({ label, initial, onSave }: { label: string; initial: string; onSave: (altText: string) => Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState('');
  return (
    <div
      onBlur={() => {
        if (value === saved) return;
        onSave(value.trim())
          .then(() => {
            setSaved(value);
            setError('');
          })
          .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not save this description.'));
      }}
    >
      {renderTextField({ label, value, maxLength: 125, errorText: error || undefined, supportingText: 'Describe the photo, for example "Couple massage room with candles"', onInput: setValue })}
    </div>
  );
}

export default DealFormPage;
