import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import type { CatalogDeal } from '../../../api/catalog';
import { resolveDealMedia } from '../../../utils/media';
import content from '../../../content.json';
import './wishlist.css';
import { DealCard, type DealCardDeal } from '../../components/deal-card';
const { wishlist: wishlistContent } = content;
/**
 * Real, backend-driven wishlist (`GET /wishlist` via `WishlistProvider`) — same layout, empty
 * state, and grid CSS as the previous mock/localStorage page, just fed from `useWishlist()`'s
 * `items` (each carrying its full real `Deal` payload, so no extra per-item fetch is needed).
 * Uses `SkyProductCardWC` directly (not the old mock-shaped `DealCard`) because a real `Deal`
 * doesn't carry the mock's `rating`/`distance`/`location` fields — this is the exact same card
 * component `category.tsx`/`vendor.tsx` already use for real deals, so no new card was invented.
 * A wishlisted Deal is always a service booking now (Deal has no Product concept) — the card's
 * action always routes to the deal page to pick a package, never a direct "Add to Cart".
 */
function toDealCardDeal(deal: CatalogDeal): DealCardDeal {
  const title = deal.title;
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const media = resolveDealMedia(deal);
  return {
    id: deal.id,
    title,
    image: media.images[0] ?? '',
    imageAlt: title,
    gallery: media.images.length > 0 ? media.images : undefined,
    video: media.video,
    providerName: deal.vendor?.businessName ?? undefined,
    location: deal.branch?.city ?? undefined,
    price: salePrice,
    originalPrice: originalPrice && originalPrice !== salePrice ? originalPrice : undefined,
    discount: deal.discountPercent ?? undefined,
    priceNote: deal.durationMinutes ? `${deal.durationMinutes} min` : undefined,
    tag: deal.popularTags?.[0]?.name,
  };
}
export function Wishlist() {
  const { items, loading, remove } = useWishlist();
  const navigate = useNavigate();
  return (
    <div className="wishlist-page">
      <title>{content.meta.wishlist.title}</title>
      <meta name="description" content={content.meta.wishlist.description} />
      <meta name="robots" content="noindex" />
      <div className="wishlist-page__inner">
        <h1 className="wishlist-page__title">
          {wishlistContent.title}
          {items.length > 0 && (
            <span className="wishlist-page__count">
              ({items.length}{' '} {items.length === 1 ? wishlistContent.dealSingular : wishlistContent.dealPlural})
            </span>
          )}
        </h1>
        {loading ? (
          <p className="loading-state">{wishlistContent.loading}</p>
        ) : items.length === 0 ? (
          <div className="wishlist-page__empty">
            <sky-info-card
              icon="favorite_border"
              heading={wishlistContent.emptyHeading}
              subheading={wishlistContent.emptySubheading}
            />
            <FilledButton onClick={() => navigate('/explore')}>
              <Icon slot="icon" aria-hidden="true">explore</Icon>
              {wishlistContent.emptyCtaLabel}
            </FilledButton>
          </div>
        ) : (
          <ul className="wishlist-grid" aria-label="Saved deals">
            {items.map(({ deal, dealId }) => (
              <li key={dealId} className="wishlist-grid__item">
                <DealCard
                  deal={toDealCardDeal(deal)}
                  favoriteActive={true}
                  onFavorite={() => remove(dealId)}
                  eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
                />
                <OutlinedButton
                  className="wishlist-grid__add-btn"
                  onClick={() => navigate(`/deal/${deal.id}`)}
                >
                  <Icon slot="icon" aria-hidden="true">event_available</Icon>
                  {wishlistContent.bookLabel}
                </OutlinedButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export default Wishlist;
