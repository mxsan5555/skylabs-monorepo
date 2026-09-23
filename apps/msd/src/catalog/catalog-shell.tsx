import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  listCatalogCategories,
  listCatalogLocations,
  type CatalogCategoryWithChildren,
  type CatalogLocation,
} from '../api/catalog';
import content from '../content.json';

export interface CatalogShellValue {
  status: 'loading' | 'ready' | 'error';
  categories: CatalogCategoryWithChildren[];
  locations: CatalogLocation[];
}

export interface CategoryLink {
  id: string;
  label: string;
  to: string;
}

const EMPTY: CatalogShellValue = { status: 'loading', categories: [], locations: [] };
const CatalogShellContext = createContext<CatalogShellValue>(EMPTY);

/** One fetch of categories + cities for the whole shell (header, tab bar, footer, home).
 *  The two requests settle independently so one failing never hides the other. */
export function CatalogShellProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<CatalogShellValue>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listCatalogCategories(), listCatalogLocations()]).then(([cats, locs]) => {
      if (cancelled) return;
      setValue({
        status: cats.status === 'fulfilled' ? 'ready' : 'error',
        categories: cats.status === 'fulfilled' ? (cats.value.data ?? []) : [],
        locations: locs.status === 'fulfilled' ? (locs.value.data ?? []) : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <CatalogShellContext.Provider value={value}>{children}</CatalogShellContext.Provider>;
}

export function useCatalogShell(): CatalogShellValue {
  return useContext(CatalogShellContext);
}

/** Top-level category links from the API, or the static `nav.categories` list when the API
 *  has nothing (loading, error, empty) so navigation never disappears. */
export function useCategoryLinks(): CategoryLink[] {
  const { categories } = useCatalogShell();
  return useMemo(
    () =>
      categories.length > 0
        ? categories.map((c) => ({ id: c.id, label: c.name, to: `/category/${c.slug}` }))
        : content.nav.categories.map((c) => ({ id: c.to, label: c.label, to: c.to })),
    [categories],
  );
}
