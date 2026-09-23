import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useHomeCatalog } from './home-data';

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
