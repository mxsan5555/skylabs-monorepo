import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { OfferCard } from '../../components/offer-card/offer-card';
import { useWishlist } from '../../../wishlist/wishlist-context';
import type { CatalogProduct } from '../../../api/catalog';
import type { WishlistProduct } from '../../../api/wishlist';
import content from '../../../content.json';
import './wishlist.css';

const { wishlist: wishlistContent } = content;

function toCatalogProduct(
  product: WishlistProduct,
): CatalogProduct {
  return {
    ...product,
    price: String(product.price),
    originalPrice:
      product.originalPrice == null
        ? null
        : String(product.originalPrice),
    description: product.description,
    summary: product.summary,
    category: product.category,
    subcategory: product.subcategory,
   mediaImages: product.mediaImages as CatalogProduct['mediaImages'],
    vendor: product.vendor
      ? {
          ...product.vendor,
          city: product.vendor.city ?? null,
          logoUrl: product.vendor.logoUrl ?? null,
        }
      : null,
  };
}
export function Wishlist() {
  const { items, loading } = useWishlist();
  const navigate = useNavigate();

  return (
    <div
  className={`wishlist-page ${
    window.location.pathname === '/my-account/wishlist'
      ? 'wishlist-page--account'
      : ''
  }`}
>
      <title>{content.meta.wishlist.title}</title>

      <meta
        name="description"
        content={content.meta.wishlist.description}
      />

      <meta name="robots" content="noindex" />

      <div className="wishlist-page__inner">
        <h1 className="wishlist-page__title">
          {wishlistContent.title}
        </h1>

        {loading ? (
          <p className="loading-state">
            {wishlistContent.loading}
          </p>
        ) : items.length === 0 ? (
          <div className="wishlist-page__empty">
            <sky-info-card
              icon="favorite_border"
              heading={wishlistContent.emptyHeading}
              subheading={wishlistContent.emptySubheading}
            />

            <FilledButton onClick={() => navigate('/explore')}>
              <Icon slot="icon" aria-hidden="true">
                explore
              </Icon>
              {wishlistContent.emptyCtaLabel}
            </FilledButton>
          </div>
        ) : (
          <ul
            className="wishlist-grid"
            aria-label="Saved wishlist items"
          >
            {items.map((item) => {
 
              if (item.deal && item.dealId) {
                return (
                  <li key={item.id} className="wishlist-grid__item">
                    <OfferCard
                      item={{
                        type: 'deal',
                        deal: item.deal,
                      }}
                      variant="outlined"
                      layout="vertical"
                    />
                  </li>
                );
              }

              // Saved product
              if (item.product && item.productId) {
                return (
                  <li key={item.id} className="wishlist-grid__item">
                    <OfferCard
                      item={{
                        type: 'product',
                        product: toCatalogProduct(item.product),
                      }}
                      variant="outlined"
                      layout="vertical"
                    />
                  </li>
                );
              }

              // Ignore incomplete wishlist entries
              return null;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Wishlist;