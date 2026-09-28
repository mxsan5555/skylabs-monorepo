import { createContext, useContext, type ReactNode } from 'react';

/** Data the prerender embedded in the page, keyed by `shell`, `home`, `category:<slug>[:<city>]`. */
export type PrerenderPayload = Record<string, unknown>;

export const PRERENDER_SCRIPT_ID = '__MSD_DATA__';

const PrerenderDataContext = createContext<PrerenderPayload>({});

export function PrerenderDataProvider({ payload, children }: { payload: PrerenderPayload; children: ReactNode }) {
  return <PrerenderDataContext.Provider value={payload}>{children}</PrerenderDataContext.Provider>;
}

export function usePrerenderedData<T>(key: string): T | undefined {
  return useContext(PrerenderDataContext)[key] as T | undefined;
}

/** Client side: the JSON the prerender wrote into the page, or {} for SPA-only routes. */
export function readPrerenderPayload(): PrerenderPayload {
  try {
    const el = typeof document === 'undefined' ? null : document.getElementById(PRERENDER_SCRIPT_ID);
    return el?.textContent ? (JSON.parse(el.textContent) as PrerenderPayload) : {};
  } catch {
    return {};
  }
}

export const categoryDataKey = (slug: string, city?: string) => (city ? `category:${slug}:${city}` : `category:${slug}`);
