import { createElement, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkyColor } from '@skylabs-monorepo/shared-ui';
import type { CatalogDeal, CatalogProduct } from '../../../api/catalog';
import { showCartAdded, useAddProductToCart } from '../../../hooks/use-add-product-to-cart';
import { useRequireSignIn } from '../../../hooks/use-require-sign-in';
import { useWishlistToggle } from '../../../hooks/use-wishlist-toggle';
import { fillTemplate, formatINR } from '../../../utils/format';
import { toDealCardDeal, toProductCardDeal } from '../../pages/home/home-data';
import { DealAddToCartDialog } from '../deal-add-to-cart-dialog';
import { ProductCardGallery } from '../product-card-gallery';
import { formatDistance } from '../therapist-card/therapist-card';
import { ListingToolbar } from '../listing-toolbar/listing-toolbar';
import content from '../../../content.json';

const t = content.offerCard;

export type OfferItem = { type: 'deal'; deal: CatalogDeal } | { type: 'product'; product: CatalogProduct };

/** Tag on the image: a theme role (`badge-color`), filled or tonal (`badge-tone`). */
export interface OfferTag {
  label: string;
  color: 'primary' | 'secondary' | 'tertiary' | 'error';
  tone?: 'filled' | 'tonal';
}

/** An item's first popular tag (Admin-managed) as the card's tonal tertiary tag. */
export function popularTag(tags?: { name: string }[] | null): OfferTag | undefined {
  const name = tags?.[0]?.name;
  return name ? { label: name, color: 'tertiary', tone: 'tonal' } : undefined;
}

export interface OfferCardProps {
  item: OfferItem;
  tag?: OfferTag;
  color?: SkyColor;
  variant?: 'plain' | 'outlined';
  layout?: 'vertical' | 'horizontal';
  /** Demo only: there is no review system yet (ST-22), so live pages leave it out. */
  rating?: { rating: number; reviews: number };
  /** Image slider with previous / next buttons when the item has more than one image. Off: the
   *  first image only. */
  slider?: boolean;
}

/**
 * Offer card (docs/msd/PLANNING.md §4): `sky-product-card price-first` for a deal (service) or a
 * product. The whole card opens the detail page; Add to cart and the wishlist heart act on their
 * own (a deal asks for its package first; signed-out visitors sign in first). Services show the
 * title only (no description), then, under a divider, the member and the branch area with the
 * distance when the API sent it (`divided`). Products keep their two-line description.
 */
export function OfferCard({ item, tag, color, variant = 'plain', layout = 'vertical', rating, slider = false }: OfferCardProps) {
  const navigate = useNavigate();
  const requireSignIn = useRequireSignIn();
  const addProductToCart = useAddProductToCart();
  const { isFavorite, toggleFavorite } = useWishlistToggle();

  const isDeal = item.type === 'deal';
  const id = isDeal ? item.deal.id : item.product.id;
  const card = isDeal ? toDealCardDeal(item.deal) : toProductCardDeal(item.product);
  const description = isDeal ? undefined : item.product.summary ?? item.product.description;
  // Services: branch area and city (e.g. Lower Parel, Mumbai), else the city.
  const place = isDeal ? item.deal.branch?.address ?? card.location : undefined;
  const named = (template: string) => fillTemplate(template, { title: card.title });
  const gallery = slider && card.gallery && card.gallery.length > 1 ? card.gallery : undefined;

  // The button's name is its visible text (WCAG 2.5.3); the group label names the item.
  const cartButton = (onClick: () => void) =>
    createElement(
      'md-filled-button',
      { onClick },
      createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'add_shopping_cart'),
      t.addToCart,
    );

  return (
    <sky-product-card
      variant={variant}
      {...(color ? { color } : {})}
      layout={layout}
      priceFirst
      divided={isDeal}
      {...(!gallery && card.image ? { image: card.image, imageAlt: card.imageAlt } : {})}
      {...(tag ? { badge: tag.label, badgeColor: tag.color, badgeTone: tag.tone ?? 'filled' } : {})}
      heading={card.title}
      {...(description ? { description } : {})}
      {...(isDeal && card.providerName ? { eyebrow: card.providerName } : {})}
      {...(place ? { location: place } : {})}
      {...(isDeal && card.distance != null ? { distance: formatDistance(card.distance) } : {})}
      price={formatINR(card.price)}
      {...(card.originalPrice ? { originalPrice: formatINR(card.originalPrice) } : {})}
      {...(card.discount ? { discount: fillTemplate(t.discount, { percent: String(card.discount) }) } : {})}
      {...(rating ? { rating: rating.rating, reviews: rating.reviews } : {})}
      href={isDeal ? `/deal/${id}` : `/products/${id}`}
    >
      {gallery && <ProductCardGallery slot="media" images={gallery} alt={card.imageAlt} layout={layout} fill />}
      <ListingToolbar
        ariaLabel={named(t.actionsLabel)}
        start={
          item.type === 'deal' ? (
            <DealAddToCartDialog
              deal={item.deal}
              onAdded={(label) => showCartAdded(label, () => navigate('/cart'))}
              renderTrigger={(open) => cartButton(() => requireSignIn() && open())}
            />
          ) : (
            cartButton(() => void addProductToCart(id, card.title))
          )
        }
        end={
          // M3 toggle: aria-pressed comes from `selected`. The click is cancelled so the button never
          // flips itself; `selected` follows the wishlist, even when a save fails.
          createElement(
            'md-outlined-icon-button',
            {
              toggle: true,
              selected: isFavorite(item.type, id),
              'aria-label': named(t.saveAria),
              onClick: (event: MouseEvent) => {
                event.preventDefault();
                toggleFavorite(item.type, id);
              },
            },
            createElement('md-icon', { 'aria-hidden': 'true' }, 'favorite'),
            createElement('md-icon', { slot: 'selected', 'aria-hidden': 'true' }, 'favorite'),
          )
        }
      />
    </sky-product-card>
  );
}
