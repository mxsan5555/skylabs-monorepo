import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  FilterChip,
  ChipSet,
  IconButton,
  Icon,
  LinearProgress,
} from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../admin/admin-page';
import { apiClient, ApiError } from '../../../../api/api-client';
import { inputValue } from '../../../../utils/format';

interface Company {
  id: string;
  displayName: string;
  locations: { id: string; name: string }[];
}
interface Subcategory {
  id: string;
  slug: string;
  name: string;
}
interface Category {
  id: string;
  slug: string;
  name: string;
  subcategories: Subcategory[];
}
interface CancellationPolicy {
  id: string;
  name: string;
}
interface Feature {
  id: string;
  name: string;
}
interface PricingPlanDraft {
  id?: string;
  name: string;
  durationMinutes: number;
  priceRupees: number;
  originalPriceRupees: number | '';
  sortOrder: number;
  isActive: boolean;
}

function ListEditor({ items, onChange, label, placeholder }: { items: string[]; onChange: (next: string[]) => void; label: string; placeholder: string }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="crud-list-editor span-2">
      <p className="checkout-form__group-label">{label}</p>
      {items.map((item, i) => (
        <div className="crud-list-editor__row" key={i}>
          <span style={{ flex: 1 }}>{item}</span>
          <IconButton aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
            <Icon aria-hidden="true">close</Icon>
          </IconButton>
        </div>
      ))}
      <div className="crud-list-editor__row">
        <OutlinedTextField
          label={placeholder}
          value={draft}
          onInput={(e) => setDraft(inputValue(e as unknown as Event))}
        />
        <IconButton
          aria-label="Add"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft('');
            }
          }}
        >
          <Icon aria-hidden="true">add</Icon>
        </IconButton>
      </div>
    </div>
  );
}

export function DealFormPage() {
  const { id } = useParams();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroImageAlt, setHeroImageAlt] = useState('');
  const [badge, setBadge] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [included, setIncluded] = useState<string[]>([]);
  const [notIncluded, setNotIncluded] = useState<string[]>([]);
  const [howToUse, setHowToUse] = useState<string[]>([]);
  const [finePrint, setFinePrint] = useState('');
  const [cancellationPolicyId, setCancellationPolicyId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [redeemByDays, setRedeemByDays] = useState(90);
  const [plans, setPlans] = useState<PricingPlanDraft[]>([
    { name: '60 min session', durationMinutes: 60, priceRupees: 999, originalPriceRupees: '', sortOrder: 0, isActive: true },
  ]);

  useEffect(() => {
    Promise.all([
      apiClient.get<{ items: Company[] }>('/admin/companies?pageSize=100'),
      apiClient.get<{ items: Category[] }>('/categories?all=true'),
      apiClient.get<{ items: CancellationPolicy[] }>('/cancellation-policies'),
      apiClient.get<{ items: Feature[] }>('/features'),
      isEdit ? apiClient.get<Record<string, unknown>>(`/admin/deals/${id}`) : Promise.resolve(null),
    ])
      .then(([companiesRes, categoriesRes, policiesRes, featuresRes, deal]) => {
        setCompanies(companiesRes.items);
        setCategories(categoriesRes.items);
        setPolicies(policiesRes.items);
        setFeatures(featuresRes.items);
        if (deal) {
          setCompanyId((deal.company as { id: string }).id);
          setLocationId((deal.locations as { id: string }[])[0]?.id ?? '');
          setTitle(deal.title as string);
          setShortDescription(deal.shortDescription as string);
          setDescription(deal.description as string);
          setHeroImageUrl(deal.heroImageUrl as string);
          setHeroImageAlt(deal.heroImageAlt as string);
          setBadge((deal.badge as string) ?? '');
          setSelectedFeatures(deal.features as string[]);
          setIncluded(deal.included as string[]);
          setNotIncluded(deal.notIncluded as string[]);
          setHowToUse(deal.howToUse as string[]);
          setFinePrint(deal.finePrint as string);
          setCancellationPolicyId((deal.cancellationPolicy as { id: string }).id);
          const cats = deal.categories as { categoryId: string; subcategoryId: string | null; isPrimary: boolean }[];
          const primary = cats.find((c) => c.isPrimary) ?? cats[0];
          if (primary) {
            setCategoryId(primary.categoryId);
            setSubcategoryId(primary.subcategoryId ?? '');
          }
          setRedeemByDays((deal.redeemByDaysAfterPurchase as number) ?? 90);
          const dealPlans = deal.pricingPlans as {
            id: string;
            name: string;
            durationMinutes: number | null;
            price: { amount: number };
            originalPrice: { amount: number } | null;
            sortOrder: number;
            isActive: boolean;
          }[];
          setPlans(
            dealPlans.map((p) => ({
              id: p.id,
              name: p.name,
              durationMinutes: p.durationMinutes ?? 60,
              priceRupees: p.price.amount / 100,
              originalPriceRupees: p.originalPrice ? p.originalPrice.amount / 100 : '',
              sortOrder: p.sortOrder,
              isActive: p.isActive,
            })),
          );
        }
      })
      .catch(() => setError('Failed to load form data.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const selectedCompany = companies.find((c) => c.id === companyId);
  const selectedCategory = categories.find((c) => c.id === categoryId);

  function updatePlan(i: number, patch: Partial<PricingPlanDraft>) {
    setPlans((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        companyId,
        locationIds: locationId ? [locationId] : [],
        title,
        shortDescription,
        description,
        heroImageUrl,
        heroImageAlt,
        gallery: heroImageUrl ? [{ url: heroImageUrl, alt: heroImageAlt }] : [],
        badge: badge || undefined,
        features: selectedFeatures,
        included,
        notIncluded,
        howToUse,
        finePrint,
        cancellationPolicyId,
        redeemByDaysAfterPurchase: redeemByDays,
        categories: categoryId ? [{ categoryId, subcategoryId: subcategoryId || undefined, isPrimary: true }] : [],
        pricingPlans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          durationMinutes: p.durationMinutes,
          priceAmount: Math.round(p.priceRupees * 100),
          originalPriceAmount: p.originalPriceRupees === '' ? undefined : Math.round(Number(p.originalPriceRupees) * 100),
          sortOrder: p.sortOrder,
          isActive: p.isActive,
        })),
      };
      if (isEdit) await apiClient.patch(`/admin/deals/${id}`, body);
      else await apiClient.post('/admin/deals', body);
      navigate('/account/deals');
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminPage title={isEdit ? 'Edit deal' : 'New deal'} wide>
        <LinearProgress indeterminate aria-label="Loading" />
      </AdminPage>
    );
  }

  return (
    <AdminPage title={isEdit ? 'Edit deal' : 'New deal'} subtitle="Massage deals need a company, at least one pricing plan, and a primary category." wide>
      {error && <p className="console-banner console-banner--error">{error}</p>}

      <form className="crud-dialog__form" onSubmit={(e) => e.preventDefault()}>
        <OutlinedSelect label="Company" value={companyId} onChange={(e) => { setCompanyId((e.target as HTMLSelectElement).value); setLocationId(''); }}>
          {companies.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              {c.displayName}
            </SelectOption>
          ))}
        </OutlinedSelect>
        <OutlinedSelect label="Location" value={locationId} onChange={(e) => setLocationId((e.target as HTMLSelectElement).value)}>
          {(selectedCompany?.locations ?? []).map((l) => (
            <SelectOption key={l.id} value={l.id}>
              {l.name}
            </SelectOption>
          ))}
        </OutlinedSelect>

        <OutlinedTextField className="span-2" label="Title" required value={title} onInput={(e) => setTitle(inputValue(e as unknown as Event))} />
        <OutlinedTextField className="span-2" label="Short description (card text)" required value={shortDescription} onInput={(e) => setShortDescription(inputValue(e as unknown as Event))} />
        <OutlinedTextField className="span-2" label="Full description" required value={description} onInput={(e) => setDescription(inputValue(e as unknown as Event))} />

        <OutlinedTextField label="Hero image URL" required value={heroImageUrl} onInput={(e) => setHeroImageUrl(inputValue(e as unknown as Event))} />
        <OutlinedTextField label="Hero image alt text" required value={heroImageAlt} onInput={(e) => setHeroImageAlt(inputValue(e as unknown as Event))} />
        <OutlinedTextField label="Badge (optional)" value={badge} onInput={(e) => setBadge(inputValue(e as unknown as Event))} />

        <OutlinedSelect label="Cancellation policy" value={cancellationPolicyId} onChange={(e) => setCancellationPolicyId((e.target as HTMLSelectElement).value)}>
          {policies.map((p) => (
            <SelectOption key={p.id} value={p.id}>
              {p.name}
            </SelectOption>
          ))}
        </OutlinedSelect>

        <OutlinedSelect label="Category" value={categoryId} onChange={(e) => { setCategoryId((e.target as HTMLSelectElement).value); setSubcategoryId(''); }}>
          {categories.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              {c.name}
            </SelectOption>
          ))}
        </OutlinedSelect>
        <OutlinedSelect label="Subcategory" value={subcategoryId} onChange={(e) => setSubcategoryId((e.target as HTMLSelectElement).value)}>
          {(selectedCategory?.subcategories ?? []).map((s) => (
            <SelectOption key={s.id} value={s.id}>
              {s.name}
            </SelectOption>
          ))}
        </OutlinedSelect>

        <OutlinedTextField label="Redeem within (days after purchase)" type="number" value={String(redeemByDays)} onInput={(e) => setRedeemByDays(Number(inputValue(e as unknown as Event)) || 90)} />

        <div className="span-2">
          <p className="checkout-form__group-label">Features</p>
          <ChipSet className="crud-chip-picker">
            {features.map((f) => (
              <FilterChip
                key={f.id}
                label={f.name}
                selected={selectedFeatures.includes(f.name)}
                onClick={() =>
                  setSelectedFeatures((prev) => (prev.includes(f.name) ? prev.filter((n) => n !== f.name) : [...prev, f.name]))
                }
              />
            ))}
          </ChipSet>
        </div>

        <ListEditor items={included} onChange={setIncluded} label="What's included" placeholder="Add an included item" />
        <ListEditor items={notIncluded} onChange={setNotIncluded} label="Not included" placeholder="Add an excluded item" />
        <ListEditor items={howToUse} onChange={setHowToUse} label="How to use / redemption steps" placeholder="Add a step" />

        <OutlinedTextField className="span-2" label="Fine print" required value={finePrint} onInput={(e) => setFinePrint(inputValue(e as unknown as Event))} />

        <div className="span-2">
          <p className="checkout-form__group-label">Pricing plans</p>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Minutes</th>
                  <th>Price (₹)</th>
                  <th>Original (₹)</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <OutlinedTextField value={p.name} onInput={(e) => updatePlan(i, { name: inputValue(e as unknown as Event) })} />
                    </td>
                    <td>
                      <OutlinedTextField type="number" value={String(p.durationMinutes)} onInput={(e) => updatePlan(i, { durationMinutes: Number(inputValue(e as unknown as Event)) || 0 })} />
                    </td>
                    <td>
                      <OutlinedTextField type="number" value={String(p.priceRupees)} onInput={(e) => updatePlan(i, { priceRupees: Number(inputValue(e as unknown as Event)) || 0 })} />
                    </td>
                    <td>
                      <OutlinedTextField type="number" value={String(p.originalPriceRupees)} onInput={(e) => updatePlan(i, { originalPriceRupees: inputValue(e as unknown as Event) === '' ? '' : Number(inputValue(e as unknown as Event)) })} />
                    </td>
                    <td>
                      <input type="checkbox" checked={p.isActive} onChange={(e) => updatePlan(i, { isActive: e.target.checked })} />
                    </td>
                    <td>
                      <IconButton aria-label="Remove plan" onClick={() => setPlans((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Icon aria-hidden="true">delete</Icon>
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <OutlinedButton
            style={{ marginTop: 8 }}
            onClick={() =>
              setPlans((prev) => [...prev, { name: '', durationMinutes: 60, priceRupees: 0, originalPriceRupees: '', sortOrder: prev.length, isActive: true }])
            }
          >
            <Icon slot="icon" aria-hidden="true">add</Icon>
            Add plan
          </OutlinedButton>
        </div>
      </form>

      <div className="checkout-form__nav">
        <OutlinedButton onClick={() => navigate('/account/deals')}>Cancel</OutlinedButton>
        <FilledButton onClick={save} disabled={saving || !companyId || !locationId || plans.length === 0}>
          {saving ? 'Saving…' : 'Save deal'}
        </FilledButton>
      </div>
    </AdminPage>
  );
}

export default DealFormPage;
