import { useEffect, useRef } from 'react';

import '@skylabs-monorepo/shared-ui/carousel';
import '@skylabs-monorepo/shared-ui';

import {
  FilledButton,
} from '@skylabs-monorepo/shared-ui/react';

import type { CatalogProduct } from '../../api/catalog';
import { formatINR } from '../../utils/format';
import { ProductCardGallery } from './product-card-gallery';
import './product-card.css';

interface ProductCardProps {
  product: CatalogProduct;
  image?: string;
  gallery?: string[];
  favoriteActive?: boolean;
  onFavorite?: () => void;
  onAddToCart?: () => void;
  addToCartLabel?: string;
   layout?: 'vertical' | 'horizontal';
}

export function ProductCard({
  product,
  image,
  gallery = [],
  favoriteActive = false,
  onFavorite,
  onAddToCart,
  addToCartLabel = 'Add to cart',
   layout = 'vertical',
}: ProductCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  const price = Number(product.price);

  const originalPrice =
    product.originalPrice != null
      ? Number(product.originalPrice)
      : undefined;

  const discount =
    product.discount ??
    (originalPrice !== undefined && originalPrice > price
      ? Math.round(
          ((originalPrice - price) / originalPrice) * 100,
        )
      : 0);

  const images = gallery.length
    ? gallery
    : image
      ? [image]
      : [];

  useEffect(() => {
    const card = cardRef.current;

    if (!card || !onFavorite) return;

    const handleFavorite = () => {
      onFavorite();
    };

    card.addEventListener('favorite', handleFavorite);

    return () => {
      card.removeEventListener('favorite', handleFavorite);
    };
  }, [onFavorite]);

  return (
    <sky-product-card
      ref={(element) => {
        cardRef.current = element;
      }}
      variant="outlined"
       layout={layout}
      image={undefined}
      imageAlt={product.imageAlt ?? product.name}
      badge="Product"
      favorite={Boolean(onFavorite)}
      favoriteActive={favoriteActive}
      eyebrow={
        product.brand ??
        product.vendor?.businessName ??
        undefined
      }
      heading={product.name}
      originalPrice={
        originalPrice !== undefined && originalPrice !== price
          ? formatINR(originalPrice)
          : undefined
      }
      price={formatINR(price)}
      discount={discount ? `-${discount}%` : undefined}
      tag={product.popularTags?.[0]?.name}
      href={`/products/${product.id}`}
    >
      <div slot="media">
        <ProductCardGallery
          images={images}
          alt={product.imageAlt ?? product.name}
          layout={layout}
        />
      </div>

      {onAddToCart && (
        <div onClick={(event) => event.stopPropagation()}>
          <FilledButton
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAddToCart();
            }}
          >
            {addToCartLabel}
          </FilledButton>
        </div>
      )}
    </sky-product-card>
  );
}

export default ProductCard;