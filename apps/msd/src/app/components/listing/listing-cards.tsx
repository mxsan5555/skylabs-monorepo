import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogDeal, CatalogProduct, CatalogTherapist } from '../../../api/catalog';
import { OfferCard } from '../offer-card/offer-card';
import { TherapistCard } from '../therapist-card/therapist-card';
import { TherapistAddToCartDialog } from '../therapist-add-to-cart-dialog';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import type { DealMapPoint } from '../deal-map/deal-map';
import type { ListingKind, ListingView } from './listing-params';
import content from '../../../content.json';

export type ListingItems =
  | { kind: 'deals'; items: CatalogDeal[] }
  | { kind: 'products'; items: CatalogProduct[] }
  | { kind: 'therapists'; items: CatalogTherapist[] };

/** The cards of a listing (PLANNING §4): offer cards for deals and products (image slider, the
 *  API's tag), therapist cards with View packages; list view = horizontal cards. */
export function listingCards(list: ListingItems, view: ListingView) {
  const horizontal = view === 'list';
  const layout = horizontal ? 'horizontal' : 'vertical';
  if (list.kind === 'therapists') {
    return list.items.map((therapist) => (
      <TherapistCard key={therapist.id} therapist={therapist} variant="outlined" layout={horizontal ? 'horizontal' : undefined}>
        <TherapistAddToCartDialog
          therapist={therapist}
          renderTrigger={(open) => (
            <FilledButton
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                open();
              }}
            >
              {content.category.actions.viewPackages}
            </FilledButton>
          )}
        />
      </TherapistCard>
    ));
  }
  if (list.kind === 'products') {
    return list.items.map((product) => <OfferCard slider key={product.id} item={{ type: 'product', product }} variant="outlined" layout={layout} />);
  }
  return list.items.map((deal) => <OfferCard slider key={deal.id} item={{ type: 'deal', deal }} variant="outlined" layout={layout} />);
}

/** "deals" / "products" / "therapists" nouns for the result count. */
export function listingNoun(kind: ListingKind) {
  const t = content.category;
  return kind === 'therapists' ? t.resultCount.therapist : kind === 'products' ? t.resultCount.product : t.dealCount;
}

/** Loading, load-error and empty copy per kind; `all` = explore's mixed list. */
export function listingCopy(kind: ListingKind | 'all') {
  if (kind === 'all') return { loading: content.search.loading, loadError: content.search.loadError, empty: content.search.empty };
  const page = content.listingPages[kind];
  const empty = kind === 'products' ? content.listingPages.products.empty : kind === 'therapists' ? content.category.emptyTherapists : content.category.emptyDeals;
  return { loading: page.loading, loadError: page.loadError, empty };
}

/** `usePagedList`'s errorMessage: the API's message, else the kind's load-error copy. */
export const listingLoadError = (kind: ListingKind | 'all') => (err: unknown) =>
  err instanceof ApiRequestError ? err.message : listingCopy(kind).loadError;

/** Map markers for deals whose branch has coordinates (price label, link to the deal). */
export function dealMapPoints(deals: CatalogDeal[]): DealMapPoint[] {
  return deals.flatMap((d) =>
    d.branch?.latitude != null && d.branch?.longitude != null
      ? [{ id: d.id, lat: Number(d.branch.latitude), lng: Number(d.branch.longitude), label: formatINR(Number(d.salePrice)), title: d.title, href: `/deal/${d.id}` }]
      : [],
  );
}
