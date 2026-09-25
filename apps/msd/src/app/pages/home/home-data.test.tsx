import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { imageSrcSet, useHomeCatalog } from './home-data';
import { PrerenderDataProvider } from '../../../prerender-data/prerender-data';

const m = vi.hoisted(() => ({
  deals: vi.fn(),
  products: vi.fn(),
  therapists: vi.fn(),
  faqs: vi.fn(),
}));

vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogDeals: (...a: unknown[]) => m.deals(...a),
  listCatalogProducts: (...a: unknown[]) => m.products(...a),
  listCatalogTherapists: (...a: unknown[]) => m.therapists(...a),
  listCatalogFaqs: (...a: unknown[]) => m.faqs(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.deals.mockResolvedValue({ data: [{ id: 'd1' }] });
  m.products.mockResolvedValue({ data: [] });
  m.therapists.mockResolvedValue({ data: [] });
  m.faqs.mockResolvedValue({ data: [{ id: 'f1', question: 'Q', answer: 'A' }] });
});

describe('useHomeCatalog', () => {
  it('waits while location is unresolved (undefined coords)', async () => {
    renderHook(() => useHomeCatalog(undefined));
    await Promise.resolve();
    expect(m.deals).not.toHaveBeenCalled();
  });

  it('fetches once with coordinates when resolved', async () => {
    const { result } = renderHook(() => useHomeCatalog({ latitude: 26.7, longitude: 83.4 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(m.deals).toHaveBeenCalledTimes(1);
    expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: 26.7, longitude: 83.4, pageSize: 24 }));
    expect(result.current.deals).toHaveLength(1);
    await waitFor(() => expect(result.current.faqs).toHaveLength(1));
  });

  it('fetches without coordinates when location is none (null)', async () => {
    const { result } = renderHook(() => useHomeCatalog(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: undefined, longitude: undefined }));
  });

  it('reports an error without throwing', async () => {
    m.deals.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useHomeCatalog(null));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeTruthy();
  });

  it('a FAQ failure just leaves faqs empty', async () => {
    m.faqs.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useHomeCatalog(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.faqs).toEqual([]);
  });
});

describe('useHomeCatalog — unmount and refetch behavior', () => {
  it('does not error when FAQs resolve after the component has unmounted', async () => {
    let resolveFaqs!: (v: { data: { id: string; question: string; answer: string }[] }) => void;
    m.faqs.mockImplementation(() => new Promise((resolve) => { resolveFaqs = resolve; }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useHomeCatalog(null));
    unmount();
    resolveFaqs({ data: [{ id: 'f1', question: 'Q', answer: 'A' }] });
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps status "ready" and the previous arrays during a refetch, instead of flashing "loading"', async () => {
    const { result, rerender } = renderHook(
      ({ coords }: { coords: { latitude: number; longitude: number } | null }) => useHomeCatalog(coords),
      { initialProps: { coords: { latitude: 1, longitude: 2 } } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.deals).toHaveLength(1);

    let resolveDeals!: (v: { data: { id: string }[] }) => void;
    m.deals.mockImplementation(() => new Promise((resolve) => { resolveDeals = resolve; }));

    rerender({ coords: { latitude: 3, longitude: 4 } });

    // The refetch is in flight (deals hasn't resolved yet): no skeleton flash, old data stays.
    expect(result.current.status).toBe('ready');
    expect(result.current.deals).toHaveLength(1);

    resolveDeals({ data: [{ id: 'd2' }, { id: 'd3' }] });
    await waitFor(() => expect(result.current.deals).toHaveLength(2));
    expect(result.current.status).toBe('ready');
  });

  it('keeps status "ready" and the previous arrays when a refetch fails (stale-while-revalidate)', async () => {
    const { result, rerender } = renderHook(
      ({ coords }: { coords: { latitude: number; longitude: number } | null }) => useHomeCatalog(coords),
      { initialProps: { coords: { latitude: 1, longitude: 2 } } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    m.deals.mockRejectedValue(new Error('down'));
    rerender({ coords: { latitude: 3, longitude: 4 } });
    await waitFor(() => expect(m.deals).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBe('');
    expect(result.current.deals).toHaveLength(1);
  });
});

describe('imageSrcSet', () => {
  const url = 'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1400&q=80';

  it('builds one candidate per width by replacing the w= query param', () => {
    expect(imageSrcSet(url, [640, 1400])).toBe(
      'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=640&q=80 640w, ' +
        'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1400&q=80 1400w',
    );
  });

  it('returns undefined when the URL has no w= param or is not absolute', () => {
    expect(imageSrcSet('https://example.test/a.jpg', [640])).toBeUndefined();
    expect(imageSrcSet('/local.jpg?w=1400', [640])).toBeUndefined();
  });
});

describe('useHomeCatalog with prerendered data', () => {
  const home = { deals: [{ id: 'p1' }], products: [], therapists: [], faqs: [{ id: 'f9', question: 'Q', answer: 'A' }] };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PrerenderDataProvider payload={{ home }}>{children}</PrerenderDataProvider>
  );

  it('starts ready with the prerendered lists and waits for the location before refreshing lists', async () => {
    const { result } = renderHook(() => useHomeCatalog(undefined), { wrapper });
    expect(result.current.status).toBe('ready');
    expect(result.current.deals).toEqual([{ id: 'p1' }]);
    await Promise.resolve();
    expect(m.deals).not.toHaveBeenCalled();
  });

  it('refreshes once without coordinates when the location resolves to none', async () => {
    const firstRender: { calls: number; deals: unknown }[] = [];
    const { result, rerender } = renderHook(() => {
      const r = useHomeCatalog(null);
      firstRender.push({ calls: m.deals.mock.calls.length, deals: r.deals });
      return r;
    }, { wrapper });
    expect(firstRender[0]).toEqual({ calls: 0, deals: [{ id: 'p1' }] });
    await waitFor(() => expect(result.current.deals).toEqual([{ id: 'd1' }]));
    rerender();
    expect(m.deals).toHaveBeenCalledTimes(1);
    expect(m.deals.mock.calls[0][0]).not.toHaveProperty('latitude', expect.anything());
    expect(result.current.status).toBe('ready');
  });

  it('keeps the prerendered lists when the refresh fails', async () => {
    m.deals.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useHomeCatalog(null), { wrapper });
    await waitFor(() => expect(m.deals).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(result.current.status).toBe('ready');
    expect(result.current.deals).toEqual([{ id: 'p1' }]);
  });

  it('refreshes FAQs once in the background, keeping the payload FAQs on failure', async () => {
    const { result } = renderHook(() => useHomeCatalog(undefined), { wrapper });
    expect(result.current.faqs).toEqual(home.faqs);
    await waitFor(() => expect(result.current.faqs).toEqual([{ id: 'f1', question: 'Q', answer: 'A' }]));
    expect(m.faqs).toHaveBeenCalledTimes(1);

    m.faqs.mockRejectedValue(new Error('down'));
    const failed = renderHook(() => useHomeCatalog(undefined), { wrapper });
    await waitFor(() => expect(m.faqs).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(failed.result.current.faqs).toEqual(home.faqs);
  });

  it('refetches nearest-first when coordinates arrive, keeping the prerendered data on screen', async () => {
    let resolveDeals!: (v: { data: { id: string }[] }) => void;
    m.deals.mockImplementation(() => new Promise((resolve) => { resolveDeals = resolve; }));
    const { result } = renderHook(() => useHomeCatalog({ latitude: 1, longitude: 2 }), { wrapper });
    expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: 1, longitude: 2 }));
    expect(result.current.status).toBe('ready');
    expect(result.current.deals).toEqual([{ id: 'p1' }]);
    resolveDeals({ data: [{ id: 'n1' }] });
    await waitFor(() => expect(result.current.deals).toEqual([{ id: 'n1' }]));
  });
});
