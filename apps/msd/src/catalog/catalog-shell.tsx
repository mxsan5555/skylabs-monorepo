import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  listCatalogCategories,
  listCatalogLocations,
  listCatalogSocialLinks,
  type CatalogCategoryWithChildren,
  type CatalogLocation,
  type CatalogSocialMediaLink,
} from '../api/catalog';
import content from '../content.json';
import { usePrerenderedData } from '../prerender-data/prerender-data';
import type { ShellData } from '../prerender-data/loaders';

export interface CatalogShellValue {
  /** Reflects the categories fetch only; locations and social links fail silently to an empty
   *  array below. */
  status: 'loading' | 'ready' | 'error';
  /** The locations fetch on its own, so a city URL can tell "still loading" and "fetch failed"
   *  apart from "no such city". */
  locationsStatus: 'loading' | 'ready' | 'error';
  categories: CatalogCategoryWithChildren[];
  locations: CatalogLocation[];
  socialLinks: CatalogSocialMediaLink[];
}

export interface CategoryLink {
  id: string;
  label: string;
  to: string;
}

const EMPTY: CatalogShellValue = { status: 'loading', locationsStatus: 'loading', categories: [], locations: [], socialLinks: [] };
const CatalogShellContext = createContext<CatalogShellValue>(EMPTY);

/** One fetch of categories + cities + social links for the whole shell (header, tab bar, footer,
 *  home). The requests settle independently so one failing never hides the others. */
export function CatalogShellProvider({ children }: { children: ReactNode }) {
  // A prerendered page embeds the shell data (build-time), so it starts ready from it and then
  // refreshes once in the background; a failed refresh keeps the embedded data.
  const initial = usePrerenderedData<ShellData>('shell');
  const [value, setValue] = useState<CatalogShellValue>(() =>
    initial ? { status: 'ready', locationsStatus: 'ready', ...initial } : EMPTY,
  );

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listCatalogCategories(), listCatalogLocations(), listCatalogSocialLinks()]).then(
      ([cats, locs, social]) => {
        if (cancelled) return;
        setValue((prev) => {
          const keep = prev.status === 'ready';
          const keepLocations = prev.locationsStatus === 'ready';
          return {
            status: cats.status === 'fulfilled' || keep ? 'ready' : 'error',
            locationsStatus: locs.status === 'fulfilled' || keepLocations ? 'ready' : 'error',
            categories: cats.status === 'fulfilled' ? (cats.value.data ?? []) : prev.categories,
            locations: locs.status === 'fulfilled' ? (locs.value.data ?? []) : prev.locations,
            socialLinks: social.status === 'fulfilled' ? (social.value.data ?? []) : prev.socialLinks,
          };
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return <CatalogShellContext.Provider value={value}>{children}</CatalogShellContext.Provider>;
}

export function useCatalogShell(): CatalogShellValue {
  return useContext(CatalogShellContext);
}

/** The one place category URLs are built: `/category/<slug>`, plus `?sub=<subSlug>` to open the
 *  category page on that subcategory tab. */
export function categoryHref(categorySlug: string, subSlug?: string): string {
  const base = `/category/${encodeURIComponent(categorySlug)}`;
  return subSlug ? `${base}?sub=${encodeURIComponent(subSlug)}` : base;
}

/** URL-safe city segment: "Navi Mumbai" -> "navi-mumbai". */
export function citySlug(city: string): string {
  return city
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** City landing page for a category: `/category/<slug>/<city-slug>`. Falls back to the plain
 *  category page when the city name has no URL-safe characters (empty or symbols only). */
export function cityHref(categorySlug: string, city: string): string {
  const slug = citySlug(city);
  return slug ? `${categoryHref(categorySlug)}/${slug}` : categoryHref(categorySlug);
}

/** Top-level category links from the API, or the static `nav.categories` list when the API
 *  has nothing (loading, error, empty) so navigation never disappears. */
export function useCategoryLinks(): CategoryLink[] {
  const { categories } = useCatalogShell();
  return useMemo(
    () =>
      categories.length > 0
        ? categories.map((c) => ({ id: c.id, label: c.name, to: categoryHref(c.slug) }))
        : content.nav.categories.map((c) => ({ id: c.to, label: c.label, to: c.to })),
    [categories],
  );
}
