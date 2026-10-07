import { useNavigate } from 'react-router-dom';

import {
  FilledButton,
  OutlinedButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';

import { useWishlist } from '../../../wishlist/wishlist-context';

import type {
  CatalogDeal,
} from '../../../api/catalog';

import type {
  WishlistProduct,
} from '../../../api/wishlist';

import { resolveDealMedia, resolveProductMedia } from '../../../utils/media';

import content from '../../../content.json';

import './wishlist.css';
import { DealCard, type DealCardDeal } from '../../components/deal-card';
import { Breadcrumb } from '../../components/breadcrumb';
const { wishlist: wishlistContent } = content;

/**
 * Convert a backend Deal into the common DealCard format.
 */
function toDealCardDeal(
  deal: CatalogDeal,
): DealCardDeal {
  const title = deal.title;

  const salePrice =
    Number(deal.salePrice);

  const originalPrice =
    deal.originalPrice
      ? Number(deal.originalPrice)
      : undefined;

  const media =
    resolveDealMedia(deal);

  return {
    id: deal.id,

    title,

    image:
      media.images[0] ?? '',

    imageAlt: title,

    gallery:
      media.images.length > 0
        ? media.images
        : undefined,

    video: media.video,

    providerName:
      deal.vendor?.businessName ??
      undefined,

    location:
      deal.branch?.city ??
      undefined,

    price: salePrice,

    originalPrice:
      originalPrice &&
      originalPrice !== salePrice
        ? originalPrice
        : undefined,

    discount:
      deal.discountPercent ??
      undefined,

    priceNote:
      deal.durationMinutes
        ? `${deal.durationMinutes} min`
        : undefined,

    tag:
      deal.popularTags?.[0]?.name,
  };
}

/**
 * Convert Product into the same DealCard structure.
 *
 * DealCard is only being reused as the visual card.
 * The underlying wishlist entity is still a Product.
 */
function toProductCardDeal(
  product: WishlistProduct,
): DealCardDeal {
  const price =
    Number(product.price);

  const originalPrice =
    product.originalPrice !== null
      ? Number(product.originalPrice)
      : undefined;
  const media = resolveProductMedia(product);

  return {
    id: product.id,

    title: product.name,

    image:
      media.images[0] ?? '',

    imageAlt:
      product.imageAlt ??
      product.name,

    gallery:
      media.images.length > 0
        ? media.images
        : undefined,

    badge: 'Product',

    providerName:
      product.vendor?.businessName ??
      product.brand ??
      undefined,

    price,

    originalPrice:
      originalPrice !== undefined &&
      originalPrice !== price
        ? originalPrice
        : undefined,

    discount:
      product.discount ??
      undefined,
  };
}

export function Wishlist() {
  const {
    items,
    itemCount,
    loading,
    remove,
    removeProduct,
  } = useWishlist();

  const navigate =
    useNavigate();

  return (
    <div className="wishlist-page">
      <title>
        {content.meta.wishlist.title}
      </title>

      <meta
        name="description"
        content={
          content.meta.wishlist
            .description
        }
      />

      <meta
        name="robots"
        content="noindex"
      />

      <div className="wishlist-page__inner">
  <Breadcrumb
    items={[
      { label: 'Home', to: '/' },
      { label: 'Wishlist' },
    ]}
  />

  <h1 className="wishlist-page__title">
          {wishlistContent.title}

          {itemCount > 0 && (
            <span className="wishlist-page__count">
              ({itemCount}{' '}
              {itemCount === 1
                ? wishlistContent.itemSingular
                : wishlistContent.itemPlural}
              )
            </span>
          )}
        </h1>

        {loading ? (
          <p className="loading-state">
            {wishlistContent.loading}
          </p>
        ) : items.length === 0 ? (
          <div className="wishlist-page__empty">
            <sky-info-card
              icon="favorite_border"
              heading={
                wishlistContent.emptyHeading
              }
              subheading={
                wishlistContent.emptySubheading
              }
            />

            <FilledButton
              onClick={() =>
                navigate('/explore')
              }
            >
              <Icon
                slot="icon"
                aria-hidden="true"
              >
                explore
              </Icon>

              {
                wishlistContent.emptyCtaLabel
              }
            </FilledButton>
          </div>
        ) : (
          <ul
            className="wishlist-grid"
            aria-label="Saved wishlist items"
          >
            {items.map((item) => {
              /**
               * DEAL
               */
              if (
                item.deal &&
                item.dealId
              ) {
                const deal =
                  item.deal;

                return (
                  <li
                    key={item.id}
                    className="wishlist-grid__item"
                  >
                    <DealCard
                      deal={toDealCardDeal(
                        deal,
                      )}
                      favoriteActive={true}
                      onFavorite={() =>
                        void remove(
                          item.dealId!,
                        )
                      }
                      eyebrowHref={
                        deal.vendor?.slug
                          ? `/vendor/${deal.vendor.slug}`
                          : undefined
                      }
                    />

                    <OutlinedButton
                      className="wishlist-grid__add-btn"
                      onClick={() =>
                        navigate(
                          `/deal/${deal.id}`,
                        )
                      }
                    >
                      <Icon
                        slot="icon"
                        aria-hidden="true"
                      >
                        event_available
                      </Icon>

                      {
                        wishlistContent.bookLabel
                      }
                    </OutlinedButton>
                  </li>
                );
              }

              /**
               * PRODUCT
               */
              if (
                item.product &&
                item.productId
              ) {
                const product =
                  item.product;

                return (
                  <li
                    key={item.id}
                    className="wishlist-grid__item"
                  >
                    <DealCard
                      deal={toProductCardDeal(
                        product,
                      )}
                      favoriteActive={true}
                      onFavorite={() =>
                        void removeProduct(
                          item.productId!,
                        )
                      }
                    />

                    <OutlinedButton
                      className="wishlist-grid__add-btn"
                      onClick={() =>
                        navigate(
                          `/products/${product.id}`,
                        )
                      }
                    >
                      <Icon
                        slot="icon"
                        aria-hidden="true"
                      >
                        shopping_bag
                      </Icon>

                      View Product
                    </OutlinedButton>
                  </li>
                );
              }

              return null;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Wishlist;