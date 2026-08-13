import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Icon,
  Tabs,
  PrimaryTab,
  ChipSet,
  FilterChip,
  OutlinedTextField,
  FilledButton,
  OutlinedButton,
  TextButton,
  Dialog,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogCategory, listCatalogDeals, type CatalogCategoryWithChildren, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { createBooking } from '../../../api/bookings';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import './category.css';

type OfferingFilter = 'all' | 'service' | 'product';

const TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'];

/**
 * Category → Sub Category → Service/Product → Deal discovery page — the customer catalogue's
 * single canonical entry point (formerly split between this static-data page and the
 * marketplace category route; the two were deliberately built to be visually identical, so
 * this page now simply owns the real data source). Reuses `category.css` and the
 * `Tabs`/`ChipSet`/`SkyProductCardWC` components unchanged, but reads real Vendor/Branch/Deal
 * data from `GET /catalog/*` — only active, approved deals with an active vendor/branch/catalog
 * item are ever returned (enforced server-side in `catalog.service.ts`).
 *
 * Purchasable unit is the Deal, never the bare Service/Product — matches the "Do not show
 * Service/Product records directly as purchasable items" rule: a card always shows a Deal's
 * price, and the Service/Product name is display-only context on that Deal.
 */
export function Category() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const [category, setCategory] = useState<CatalogCategoryWithChildren | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');

  const [subcategoryIdx, setSubcategoryIdx] = useState(0);
  const [offeringFilter, setOfferingFilter] = useState<OfferingFilter>('all');
  const [search, setSearch] = useState('');

  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');

  useEffect(() => {
    setCategoryLoading(true);
    setCategoryError('');
    setSubcategoryIdx(0);
    getCatalogCategory(slug)
      .then(({ data }) => setCategory(data))
      .catch((err) => {
        // A 404 here just means "unknown/inactive category slug" — render as not-found, not an error banner.
        if (err instanceof ApiRequestError && err.status === 404) {
          setCategory(null);
        } else {
          setCategoryError(err instanceof ApiRequestError ? err.message : 'Could not load category.');
        }
      })
      .finally(() => setCategoryLoading(false));
  }, [slug]);

  const activeSubcategory = subcategoryIdx === 0 ? undefined : category?.children[subcategoryIdx - 1];

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent(`/category/${slug}`)}`);
    return false;
  };

  const addToCart = async (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, deal.id, 1);
      setActionMessage(`Added "${deal.product?.name ?? deal.title}" to your cart.`);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
    }
  };

  const bookDeal = async (deal: CatalogDeal, bookingDate: string, timeSlot: string) => {
    if (!requireAuthOrRedirect()) return;
    await createBooking(token, { dealId: deal.id, bookingDate: new Date(bookingDate).toISOString(), timeSlot });
    setActionMessage(`Booked "${deal.service?.name ?? deal.title}" for ${bookingDate} at ${timeSlot}.`);
  };

  const toggleFavorite = (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    void toggleWishlist(deal.id);
  };

  useEffect(() => {
    if (!category) return;
    setDealsLoading(true);
    setDealsError('');
    listCatalogDeals({
      categoryId: category.id,
      subcategoryId: activeSubcategory?.id,
      type: offeringFilter === 'all' ? undefined : offeringFilter,
      search: search || undefined,
      pageSize: 60,
    })
      .then(({ data }) => setDeals(data))
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : 'Could not load deals.'))
      .finally(() => setDealsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, activeSubcategory?.id, offeringFilter, search]);

  if (categoryLoading) {
    return <p className="loading-state">Loading category…</p>;
  }

  if (categoryError || !category) {
    return (
      <div className="category-page category-page--empty">
        <title>Category Not Found | MSD</title>
        <sky-info-card icon="search_off" heading="Category not found" subheading={categoryError || 'Try browsing all categories.'} />
        <FilledButton onClick={() => navigate('/categories')}>Browse Categories</FilledButton>
      </div>
    );
  }

  return (
    <div className="category-page">
      <title>{`${category.name} Deals | MSD`}</title>
      <meta name="description" content={category.description ?? `Browse ${category.name} services and products near you.`} />

      <Breadcrumb
        className="category-page__breadcrumb"
        items={[{ label: 'Home', to: '/' }, { label: 'Categories', to: '/categories' }, { label: category.name }]}
      />

      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>category</Icon>
          </div>
          <div>
            <h1 className="category-page__title">{category.name}</h1>
            {category.description && <p className="category-page__subtitle">{category.description}</p>}
          </div>
        </div>
      </header>

      {category.children.length > 0 && (
        <div className="category-page__tabs-wrap">
          <Tabs
            className="category-page__tabs"
            onChange={(e) => setSubcategoryIdx((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
          >
            <PrimaryTab active={subcategoryIdx === 0}>All</PrimaryTab>
            {category.children.map((sub, i) => (
              <PrimaryTab key={sub.id} active={subcategoryIdx === i + 1}>
                {sub.name}
              </PrimaryTab>
            ))}
          </Tabs>
        </div>
      )}

      <div className="category-page__sort">
        <div className="category-page__sort-inner">
          <ChipSet aria-label="Filter by offering type">
            <FilterChip label="All" selected={offeringFilter === 'all'} onClick={() => setOfferingFilter('all')} />
            <FilterChip label="Services" selected={offeringFilter === 'service'} onClick={() => setOfferingFilter('service')} />
            <FilterChip label="Products" selected={offeringFilter === 'product'} onClick={() => setOfferingFilter('product')} />
          </ChipSet>
          <OutlinedTextField
            label="Search"
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          />
          <p className="category-page__count" aria-live="polite" aria-atomic="true">
            {dealsLoading ? '…' : `${deals.length} deal${deals.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
      {actionError && <p className="error-state" role="alert">{actionError}</p>}

      <section className="category-page__grid-wrap" aria-label={`${category.name} deals`}>
        <div className="category-page__grid-inner">
          {dealsLoading ? (
            <p className="loading-state">Loading deals…</p>
          ) : dealsError ? (
            <p className="error-state" role="alert">{dealsError}</p>
          ) : deals.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="sentiment_dissatisfied" heading="No deals found" subheading="Try a different sub-category or filter." />
            </div>
          ) : (
            <ul className="category-page__grid">
              {deals.map((deal) => (
                <li key={deal.id}>
                  <SkyProductCardWC
                    variant="outlined"
                    badge={deal.service ? 'Service' : 'Product'}
                    eyebrow={[deal.vendor?.businessName, deal.branch?.name].filter(Boolean).join(' · ')}
                    eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
                    heading={deal.service?.name ?? deal.product?.name ?? deal.title}
                    image={deal.service?.image ?? deal.product?.image ?? undefined}
                    imageAlt={deal.service?.imageAlt ?? deal.product?.imageAlt ?? undefined}
                    price={formatINR(Number(deal.salePrice))}
                    originalPrice={
                      deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                        ? formatINR(Number(deal.originalPrice))
                        : undefined
                    }
                    discount={deal.discountPercent ? `-${deal.discountPercent}%` : undefined}
                    priceNote={deal.durationMinutes ? `${deal.durationMinutes} min` : undefined}
                    href={deal.service ? `/deal/${deal.id}` : `/products/${deal.id}`}
                    favorite
                    favoriteActive={isWishlisted(deal.id)}
                    onFavorite={() => toggleFavorite(deal)}
                  >
                    <div
                      className="category-page__card-actions"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    >
                      {deal.service ? (
                        <BookingDialog deal={deal} onBook={(date, time) => bookDeal(deal, date, time)} />
                      ) : (
                        <FilledButton onClick={() => addToCart(deal)}>
                          <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                          Add to Cart
                        </FilledButton>
                      )}
                    </div>
                  </SkyProductCardWC>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** Date + time-slot picker for a service deal — reuses `checkout.tsx`'s existing chip-based
 *  time-slot pattern instead of a new date/time widget. */
function BookingDialog({ deal, onBook }: { deal: CatalogDeal; onBook: (date: string, time: string) => Promise<void> }) {
  const dialogRef = useRef<MdDialog>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date || !time) {
      setError('Select a date and time.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onBook(date, time);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not book this service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <OutlinedButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">event_available</Icon>
        Book
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">Book {deal.service?.name ?? deal.title}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Date"
            type="date"
            value={date}
            onInput={(e: Event) => setDate((e.target as HTMLInputElement).value)}
          />
          <p className="field-hint">Time slot</p>
          <ChipSet aria-label="Select a time slot">
            {TIME_SLOTS.map((slot) => (
              <FilterChip key={slot} label={slot} selected={time === slot} onClick={() => setTime(slot)} />
            ))}
          </ChipSet>
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Booking…' : 'Confirm booking'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default Category;
