import { useEffect, useRef, type ReactNode } from 'react';
import { ProductCardGallery } from './product-card-gallery';
import './sky-product-card-wc.css';
interface SkyProductCardProps {
  children?: ReactNode;
  image?: string;
  imageAlt?: string;
  gallery?: string[];
  variant?: 'plain' | 'outlined';
  badge?: string;
  favorite?: boolean;
  favoriteActive?: boolean;
  tag?: string;
  tagIcon?: string;
  eyebrow?: string;
  eyebrowHref?: string;
  heading?: string;
  location?: string;
  distance?: string;
  rating?: number;
  reviews?: number;
  score?: number;
  scoreLabel?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  pricePrefix?: string;
  priceNote?: string;
  href?: string;
  align?: 'left' | 'center' | 'right';
  layout?: 'vertical' | 'horizontal';
  onFavorite?: () => void;
}

const ATTRIBUTE_NAMES = {
  imageAlt: 'image-alt',
  favoriteActive: 'favorite-active',
  tagIcon: 'tag-icon',
  eyebrowHref: 'eyebrow-href',
  scoreLabel: 'score-label',
  originalPrice: 'original-price',
  pricePrefix: 'price-prefix',
  priceNote: 'price-note',
} as const;

export function SkyProductCardWC({
  children,
  onFavorite,
  gallery,
  favorite,
  favoriteActive,
  ...props
}: SkyProductCardProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el || !onFavorite) {
      return;
    }

    const handleFavorite = () => {
      onFavorite();
    };

    el.addEventListener('favorite', handleFavorite);

    return () => {
      el.removeEventListener('favorite', handleFavorite);
    };
  }, [onFavorite]);

  useEffect(() => {
    const el = ref.current as
      | (HTMLElement & {
          gallery?: string[];
        })
      | null;

    if (el && gallery) {
      el.gallery = gallery;
    }
  }, [gallery]);

  useEffect(() => {
    const el = ref.current as
      | (HTMLElement & {
          favorite?: boolean;
          favoriteActive?: boolean;
        })
      | null;

    if (!el) {
      return;
    }

    el.favorite = Boolean(favorite);
    el.favoriteActive = Boolean(favoriteActive);
  }, [favorite, favoriteActive]);

  const attrs: Record<string, string | number> = {};

  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const attributeName =
      ATTRIBUTE_NAMES[key as keyof typeof ATTRIBUTE_NAMES] ?? key;

    attrs[attributeName] = value;
  });
return (
  <div className="sky-product-card-wc">
    <sky-product-card
      ref={ref as any}
      {...(attrs as any)}
    >
      {children}
    </sky-product-card>

  {gallery && gallery.length > 0 && (
  <ProductCardGallery
    images={gallery}
    alt={props.imageAlt ?? ''}
    layout={props.layout}
  />
)}
  </div>
);
}