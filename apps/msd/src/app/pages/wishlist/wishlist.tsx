import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { addCartItem } from '../../../api/cart';
import { ApiRequestError } from '../../../api/rbac/client';
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
 */
function toDealCardDeal(deal: CatalogDeal): DealCardDeal {
  const title = deal.product?.name ?? deal.title;
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const media = resolveDealMedia(deal);
  return {
    id: deal.id,
    title,
    image: media.images[0] ?? '',
    imageAlt: deal.product?.imageAlt ?? title,
    gallery: media.images.length > 0 ? media.images : undefined,
    video: media.video,
    providerName: deal.vendor?.businessName ?? undefined,
    location: deal.branch?.city ?? undefined,
    price: salePrice,
    originalPrice: originalPrice && originalPrice !== salePrice ? originalPrice : undefined,
    discount: deal.discountPercent ?? undefined,
    priceNote: deal.durationMinutes ? `${deal.durationMinutes} min` : undefined,
    isProduct: !!deal.product, tag: deal.popularTags?.[0]?.name ?? deal.product?.popularTags?.[0]?.name,
  };
}
export function Wishlist() {
  const { items, loading, remove } = useWishlist();
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [cartMessage, setCartMessage] = useState('');
  const [cartError, setCartError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent('/wishlist')}`);
    return false;
  };
  async function handleAddToCart(deal: CatalogDeal) {
    if (!requireAuthOrRedirect() || addingId) return;
    setCartError('');
    setCartMessage('');
    setAddingId(deal.id);
    try {
      await addCartItem(token, { dealId: deal.id, quantity: 1 });
      setCartMessage(`Added "${deal.product?.name ?? deal.title}" to your cart.`);
    } catch (err) {
      setCartError(err instanceof ApiRequestError ? err.message : wishlistContent.addToCartError);
    } finally {
      setAddingId(null);
    }
  }
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
        {cartMessage && <p className="field-hint" role="status">{cartMessage}</p>}
        {cartError && <p className="error-state" role="alert">{cartError}</p>}
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
                {!deal.product ? (
                  <OutlinedButton
                    className="wishlist-grid__add-btn"
                    onClick={() => navigate(`/deal/${deal.id}`)}
                  >
                    <Icon slot="icon" aria-hidden="true">event_available</Icon>
                    {wishlistContent.bookLabel}
                  </OutlinedButton>
                ) : (
                  <FilledButton
                    className="wishlist-grid__add-btn"
                    onClick={() => handleAddToCart(deal)}
                    disabled={addingId === deal.id}
                  >
                    <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                    {addingId === deal.id ? wishlistContent.addingLabel : wishlistContent.addToCartLabel}
                  </FilledButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export default Wishlist;
