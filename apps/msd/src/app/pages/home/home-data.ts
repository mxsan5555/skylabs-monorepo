import { useEffect, useRef, useState } from 'react';
import {
  listCatalogDeals,
  listCatalogFaqs,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogDeal,
  type CatalogFaq,
  type CatalogProduct,
  type CatalogTherapist,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import type { Coordinates } from '../../../location/geo';
import { type DealCardDeal } from '../../components/deal-card';
import { resolveDealMedia } from '../../../utils/media';
import content from '../../../content.json';
import { usePrerenderedData } from '../../../prerender-data/prerender-data';
import type { HomeData } from '../../../prerender-data/loaders';

const { home } = content;

/**
 * Adapts a real `CatalogDeal` into the shape `DealCard` renders. Real deals carry no
 * rating/reviews (no such fields exist on the real `Deal` model), so those stay `undefined`
 * rather than fabricated. `distance` is the real Haversine `distanceKm` computed server-side only
 * when the caller's coordinates were sent (see `useCurrentLocation`).
 */
export function toDealCardDeal(deal: CatalogDeal): DealCardDeal {
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const media = resolveDealMedia(deal);
  return {
    id: deal.id,
    title: deal.title,
    image: media.images[0] ?? '',
    imageAlt: deal.title,
    gallery: media.images.length > 0 ? media.images : undefined,
    video: media.video,
    providerName: deal.vendor?.businessName ?? undefined,
    location: deal.branch?.city ?? undefined,
    distance: deal.distanceKm != null ? Math.round(deal.distanceKm * 10) / 10 : undefined,
    price: salePrice,
    originalPrice: originalPrice && originalPrice !== salePrice ? originalPrice : undefined,
    discount: deal.discountPercent ?? undefined,
    priceNote: deal.durationMinutes ? `${deal.durationMinutes} min` : undefined,
    tag: deal.popularTags?.[0]?.name,
  };
}

export function toProductCardDeal(product: CatalogProduct): DealCardDeal {
  const price = Number(product.price);
  const originalPrice = product.originalPrice != null ? Number(product.originalPrice) : undefined;
  return {
    id: product.id,
    title: product.name,
    image: product.image ?? '',
    imageAlt: product.imageAlt ?? product.name,
    providerName: product.vendor?.businessName ?? undefined,
    location: product.vendor?.city ?? undefined,
    price,
    originalPrice: originalPrice != null && originalPrice !== price ? originalPrice : undefined,
    discount: product.discount ?? undefined,
    priceNote: home.ui.labels.product,
    tag: product.popularTags?.[0]?.name,
  };
}

export const HOME_DEALS_PAGE_SIZE = 24;
export const HOME_RAIL_SIZE = 12;

export interface HomeCatalog {
  status: 'loading' | 'ready' | 'error';
  error: string;
  deals: CatalogDeal[];
  products: CatalogProduct[];
  therapists: CatalogTherapist[];
  faqs: CatalogFaq[];
}

/**
 * One batched fetch for the home page. `coords === undefined` means the visitor location is
 * still resolving, so the fetch waits (one request, already nearest-first); `null` means no
 * location, so it fetches without coordinates. Categories come from `CatalogShellProvider`.
 * FAQs are CMS-managed and non-critical: a failure just leaves them empty.
 */
export function useHomeCatalog(coords: Coordinates | null | undefined): HomeCatalog {
  // A prerendered home embeds its lists (build-time, fetched without coordinates): start ready
  // from them, then refresh once the location resolves so visitors never keep stale build data.
  const initial = usePrerenderedData<HomeData>('home');
  const prerendered = !!initial;
  const [state, setState] = useState<Omit<HomeCatalog, 'faqs'>>(() =>
    initial
      ? { status: 'ready', error: '', deals: initial.deals, products: initial.products, therapists: initial.therapists }
      : { status: 'loading', error: '', deals: [], products: [], therapists: [] },
  );
  const [faqs, setFaqs] = useState<CatalogFaq[]>(() => initial?.faqs ?? []);
  const resolved = coords !== undefined;
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;
  // Only the very first load shows the full skeleton. A refetch triggered by coords changing
  // after data has already loaded keeps `status: 'ready'` and the current arrays on screen
  // until the new data arrives, instead of flashing back to the loading state.
  const hasLoadedRef = useRef(prerendered);

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    if (!hasLoadedRef.current) {
      setState((s) => ({ ...s, status: 'loading', error: '' }));
    }
    Promise.all([
      listCatalogDeals({ pageSize: HOME_DEALS_PAGE_SIZE, latitude, longitude }),
      listCatalogProducts({ pageSize: HOME_RAIL_SIZE, sort: 'newest' }),
      listCatalogTherapists({ pageSize: HOME_RAIL_SIZE, latitude, longitude }),
    ])
      .then(([deals, products, therapists]) => {
        if (cancelled) return;
        hasLoadedRef.current = true;
        setState({ status: 'ready', error: '', deals: deals.data ?? [], products: products.data ?? [], therapists: therapists.data ?? [] });
      })
      .catch((err) => {
        // Stale-while-revalidate: once data has loaded, a failed refetch keeps it on screen.
        if (cancelled || hasLoadedRef.current) return;
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof ApiRequestError ? err.message : content.home.ui.messages.loadError,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [resolved, latitude, longitude]);

  // FAQs are CMS-managed and non-critical: a failure leaves them empty, or keeps the prerendered
  // ones. `cancelled` guards against setting state after this hook's component has unmounted.
  useEffect(() => {
    let cancelled = false;
    listCatalogFaqs()
      .then(({ data }) => {
        if (!cancelled) setFaqs(data ?? []);
      })
      .catch(() => {
        if (!cancelled && !prerendered) setFaqs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [prerendered]);

  return { ...state, faqs };
}

/** `srcset` for a CDN image whose width is a `w=` query param (e.g. Unsplash): one candidate per
 *  width. Undefined when the URL is not absolute or carries no `w=` param. */
export function imageSrcSet(url: string, widths: number[]): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!parsed.searchParams.has('w')) return undefined;
  return widths
    .map((w) => {
      parsed.searchParams.set('w', String(w));
      return `${parsed.toString()} ${w}w`;
    })
    .join(', ');
}
