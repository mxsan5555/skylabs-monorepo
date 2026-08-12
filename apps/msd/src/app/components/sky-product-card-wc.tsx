/**
 * Thin React wrapper for <sky-product-card>.
 *
 * sky-product-card is a LIT web component — it works as a raw tag in both
 * React and Angular. The only reason this wrapper exists is to map the
 * `favorite` DOM CustomEvent to an `onFavorite` React prop via a ref, since
 * React 19 does not forward custom event names as synthetic events.
 *
 * Import this (not the raw tag) in any React component that needs onFavorite.
 * All other sky-product-card usages can use the raw <sky-product-card> tag.
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface SkyProductCardProps {
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
  onFavorite?: () => void;
  children?: ReactNode;
}

export function SkyProductCardWC({
  onFavorite,
  children,
  ...props
}: SkyProductCardProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onFavorite) return;
    el.addEventListener('favorite', onFavorite);
    return () => el.removeEventListener('favorite', onFavorite);
  }, [onFavorite]);

  // React 19 passes unknown camelCase props as DOM properties — LIT reads them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <sky-product-card ref={ref as any} {...(props as any)}>{children}</sky-product-card>;
}
