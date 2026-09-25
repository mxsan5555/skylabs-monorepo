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

/** camelCase props whose Lit property reads a kebab-case attribute (sky-product-card `static properties`). */
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
    if (!el || !onFavorite) return;
    el.addEventListener('favorite', onFavorite);
    return () => el.removeEventListener('favorite', onFavorite);
  }, [onFavorite]);

  // Arrays have no attribute form, so they stay properties.
  useEffect(() => {
    const el = ref.current as (HTMLElement & { gallery?: string[] }) | null;
    if (el && gallery) el.gallery = gallery;
  }, [gallery]);

  // camelCase props become their kebab-case attributes: React 19 keeps a camelCase prop's case
  // verbatim on a custom element (e.g. `imageAlt="x"`), but Lit only observes the hyphenated
  // attribute name it declared, so it ignores that attribute either on first render or on
  // hydration. For those, `true` is an empty attribute and `false`/null/undefined omit it.
  // Single-word props (`favorite`, `rating`, ...) pass through unchanged.
  // `undefined` is always skipped entirely (never forwarded as `prop={undefined}`) — for a
  // reflecting Lit property with a non-empty default (e.g. `layout`'s `'vertical'`), rendering
  // it as an explicit React prop makes React own that attribute during hydration; once Lit's own
  // constructor default reflects the attribute onto the real element before React hydrates,
  // React sees a mismatch against the `undefined` it would have rendered server-side. Omitting
  // the key outright (same as callers who never pass it, e.g. `variant`) keeps the attribute
  // entirely Lit's concern on both server and client, so there is nothing to mismatch.
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    const name = ATTRIBUTE_NAMES[key as keyof typeof ATTRIBUTE_NAMES];
    if (!name) attrs[key] = value;
    else if (value !== null && value !== false) attrs[name] = value === true ? '' : value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <sky-product-card ref={ref as any} {...(attrs as any)}>{children}</sky-product-card>;
}
