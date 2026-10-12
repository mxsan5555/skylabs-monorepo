import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  /** Omit for the current page and for plain group labels like "Members". */
  to?: string;
}

interface BreadcrumbState {
  trail: Crumb[];
  setTrail: (trail: Crumb[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbState | null>(null);

/** Lets a page put its own crumbs (e.g. the member's business name) in the admin header. Pages
 *  that do not set a trail keep the menu-title breadcrumb the layout already shows. */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<Crumb[]>([]);
  const value = useMemo(() => ({ trail, setTrail }), [trail]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/** The trail a page set, or an empty array. Read by the admin layout. */
export function useBreadcrumbTrail(): Crumb[] {
  return useContext(BreadcrumbContext)?.trail ?? [];
}

/** Sets the header crumbs while the calling page is mounted. Pass a new array freely: the effect
 *  re-runs only when the crumbs' content changes. */
export function useSetBreadcrumbs(crumbs: Crumb[]): void {
  const ctx = useContext(BreadcrumbContext);
  const setTrail = ctx?.setTrail;
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    if (!setTrail) return;
    setTrail(JSON.parse(key) as Crumb[]);
    return () => setTrail([]);
  }, [setTrail, key]);
}
