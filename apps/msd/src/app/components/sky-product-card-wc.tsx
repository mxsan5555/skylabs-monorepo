import { useEffect, useRef, type ReactNode } from 'react';

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
    const el = ref.current as (HTMLElement & { gallery?: string[] }) | null;

    if (el && gallery) {
      el.gallery = gallery;
    }
  }, [gallery]);

  const attrs: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;

    const name =
      ATTRIBUTE_NAMES[key as keyof typeof ATTRIBUTE_NAMES];

    if (!name) {
      attrs[key] = value;
    } else if (value !== null && value !== false) {
      attrs[name] = value === true ? '' : value;
    }
  }

  return (
    <sky-product-card
      ref={ref as any}
      {...(attrs as any)}
    >
      {children}
    </sky-product-card>
  );
}