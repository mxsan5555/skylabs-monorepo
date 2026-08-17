import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Icon, Tabs, PrimaryTab, ChipSet, FilterChip, OutlinedTextField, FilledButton, OutlinedButton, TextButton, Dialog, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogCategory, listCatalogDeals, type CatalogCategoryWithChildren, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { createBooking } from '../../../api/bookings';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './category.css';

type OfferingFilter = 'all' | 'service' | 'product';
const TIME_SLOTS = content.category.timeSlots;

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
          setCategoryError(err instanceof ApiRequestError ? err.message : content.category.errors.loadCategory);
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
      setActionMessage(content.category.messages.addToCartSuccess.replace('{item}', deal.product?.name ?? deal.title));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : content.category.errors.addToCart);
    }
  };

  const bookDeal = async (deal: CatalogDeal, bookingDate: string, timeSlot: string) => {
    if (!requireAuthOrRedirect()) return;
    await createBooking(token, { dealId: deal.id, bookingDate: new Date(bookingDate).toISOString(), timeSlot });
    setActionMessage(content.category.messages.bookingSuccess.replace('{item}', deal.service?.name ?? deal.title).replace('{date}', bookingDate).replace('{time}', timeSlot));
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
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : content.category.errors.loadDeals))
      .finally(() => setDealsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, activeSubcategory?.id, offeringFilter, search]);

  if (categoryLoading) {
    return <p className="loading-state"> {content.category.loading}</p>;
  }

  if (categoryError || !category) {
    return (
      <div className="category-page category-page--empty">
        <title>{content.category.notFound.metaTitle}</title>
        <sky-info-card icon="search_off" heading={content.category.notFound.heading} subheading={categoryError || content.category.notFound.subheading} />
        <FilledButton onClick={() => navigate('/categories')}>{content.category.notFound.cta}</FilledButton>
      </div>
    );
  }

  return (
    <div className="category-page">
      <title>{`${category.name}${content.category.metaTitleSuffix}`}</title>
      <meta name="description" content={category.description ?? content.category.metaDescriptionTemplate.replace('{category}', category.name)} />

      <Breadcrumb
        className="category-page__breadcrumb"
        items={[
          { label: content.category.breadcrumb.home, to: '/' },
          { label: content.category.breadcrumb.categories, to: '/categories' },
          { label: category.name }
        ]} />

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
            <PrimaryTab active={subcategoryIdx === 0}> {content.category.tabs.all}</PrimaryTab>
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
          <ChipSet aria-label={content.category.filter.ariaLabel}>
            <FilterChip label={content.category.filter.all} selected={offeringFilter === 'all'} onClick={() => setOfferingFilter('all')} />
            <FilterChip label={content.category.filter.services} selected={offeringFilter === 'service'} onClick={() => setOfferingFilter('service')} />
            <FilterChip label={content.category.filter.products} selected={offeringFilter === 'product'} onClick={() => setOfferingFilter('product')} />
          </ChipSet>
          <OutlinedTextField
            label={content.category.searchLabel}
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          />
          <p className="category-page__count" aria-live="polite" aria-atomic="true">
            {dealsLoading ? '…' : `${deals.length} ${deals.length === 1 ? content.category.dealCount.singular : content.category.dealCount.plural}`}
          </p>
        </div>
      </div>

      {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
      {actionError && <p className="error-state" role="alert">{actionError}</p>}

      <section className="category-page__grid-wrap"  aria-label={`${category.name} ${content.category.dealsAriaLabelSuffix}`}>
        <div className="category-page__grid-inner">
          {dealsLoading ? (
            <p className="loading-state">{content.category.loadingDeals}</p>
          ) : dealsError ? (
            <p className="error-state" role="alert">{dealsError}</p>
          ) : deals.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="sentiment_dissatisfied" heading={content.category.emptyDeals.heading} subheading={content.category.emptyDeals.subheading} />
            </div>
          ) : (
            <ul className="category-page__grid">
              {deals.map((deal) => (
                <li key={deal.id}>
                  <SkyProductCardWC
                    variant="outlined"
                    badge={deal.service ? content.category.offeringLabels.service : content.category.offeringLabels.product}
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
                    priceNote={deal.durationMinutes ? `${deal.durationMinutes} ${content.category.durationSuffix}` : undefined}
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
                          {content.category.actions.addToCart}
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
      setError(content.category.booking.selectDateTime);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onBook(date, time);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : content.category.booking.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <OutlinedButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">event_available</Icon>
        {content.category.booking.button}
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">{content.category.booking.headlinePrefix}{' '} {deal.service?.name ?? deal.title}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label={content.category.booking.dateLabel}
            type="date"
            value={date}
            onInput={(e: Event) => setDate((e.target as HTMLInputElement).value)}
          />
          <p className="field-hint">{content.category.booking.timeSlotLabel}</p>
          <ChipSet aria-label={content.category.booking.timeSlotAriaLabel}>
            {TIME_SLOTS.map((slot) => (
              <FilterChip key={slot} label={slot} selected={time === slot} onClick={() => setTime(slot)} />
            ))}
          </ChipSet>
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>{content.category.booking.cancel}</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>{submitting ? content.category.booking.submitting : content.category.booking.confirm}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default Category;
