import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { addCartItem } from '../../../api/cart';
import { ApiRequestError } from '../../../api/rbac/client';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import type { CatalogDeal } from '../../../api/catalog';
import { formatINR, pluralize } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import content from '../../../content.json';
import './wishlist.css';
const { wishlist: wishlistContent } = content;

/**
 * Real, backend-driven wishlist (`GET /wishlist` via `WishlistProvider`) — same layout, empty
 * state, and grid CSS as the previous mock/localStorage page, just fed from `useWishlist()`'s
 * `items` (each carrying its full real `Deal` payload, so no extra per-item fetch is needed).
 * Uses `SkyProductCardWC` directly (not the old mock-shaped `DealCard`) because a real `Deal`
 * doesn't carry the mock's `rating`/`distance`/`location` fields — this is the exact same card
 * component `category.tsx`/`vendor.tsx` already use for real deals, so no new card was invented.
 */
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
      await addCartItem(token, deal.id, 1);
      setCartMessage(`Added "${deal.product?.name ?? deal.title}" to your cart.`);
    } catch (err) {
      setCartError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
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
              ({items.length} {pluralize(items.length, 'deal')})
            </span>
          )}
        </h1>

        {cartMessage && <p className="field-hint" role="status">{cartMessage}</p>}
        {cartError && <p className="error-state" role="alert">{cartError}</p>}

        {loading ? (
          <p className="loading-state">Loading your wishlist…</p>
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
                <SkyProductCardWC
                  variant="outlined"
                  badge={deal.service ? 'Service' : 'Product'}
                  eyebrow={[deal.vendor?.businessName, deal.branch?.name].filter(Boolean).join(' · ') || undefined}
                  eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
                  heading={deal.service?.name ?? deal.product?.name ?? deal.title}
                  image={primaryImage(resolveDealMedia(deal))}
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
                  favoriteActive={true}
                  onFavorite={() => remove(dealId)}
                />
                {deal.service ? (
                  <OutlinedButton
                    className="wishlist-grid__add-btn"
                    onClick={() => navigate(`/deal/${deal.id}`)}
                  >
                    <Icon slot="icon" aria-hidden="true">event_available</Icon>
                    Book
                  </OutlinedButton>
                ) : (
                  <FilledButton
                    className="wishlist-grid__add-btn"
                    onClick={() => handleAddToCart(deal)}
                    disabled={addingId === deal.id}
                  >
                    <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                    {addingId === deal.id ? 'Adding…' : wishlistContent.addToCartLabel}
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
