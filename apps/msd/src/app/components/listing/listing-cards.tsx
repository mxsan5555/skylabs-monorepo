import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogDeal, CatalogProduct, CatalogTherapist } from '../../../api/catalog';
import { OfferCard } from '../offer-card/offer-card';
import { TherapistCard } from '../therapist-card/therapist-card';
import { TherapistAddToCartDialog } from '../therapist-add-to-cart-dialog';
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
