import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { imageSrcSet, useHomeCatalog } from './home-data';

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
