import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePagedList } from './use-paged-list';

const page = (ids: string[], total: number) => Promise.resolve({ data: ids, meta: { total } });
const errorMessage = () => 'Could not load.';

describe('usePagedList', () => {
  it('loads page 1 and reports the total', async () => {
    const fetchPage = vi.fn(() => page(['a', 'b'], 3));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchPage).toHaveBeenCalledWith(1);
    expect(result.current.items).toEqual(['a', 'b']);
    expect(result.current.total).toBe(3);
    expect(result.current.hasMore).toBe(true);
  });

  it('appends the next page and stops at the total', async () => {
    const fetchPage = vi.fn((p: number) => (p === 1 ? page(['a', 'b'], 3) : page(['c'], 3)));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c']));
    expect(fetchPage).toHaveBeenLastCalledWith(2);
    expect(result.current.hasMore).toBe(false);
  });

  it('resets on a key change and ignores the stale response', async () => {
    let resolveOld!: (v: { data: string[]; meta: { total: number } }) => void;
    const fetchPage = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockImplementationOnce(() => page(['new'], 1));
    const { result, rerender } = renderHook(({ k }) => usePagedList(fetchPage, k, { errorMessage }), { initialProps: { k: 'one' } });
    rerender({ k: 'two' });
    await waitFor(() => expect(result.current.items).toEqual(['new']));
    await act(async () => resolveOld({ data: ['old'], meta: { total: 1 } }));
    expect(result.current.items).toEqual(['new']);
  });

  it('starts from a seeded page and refreshes it once in the background', async () => {
    const fetchPage = vi.fn(() => page(['fresh'], 1));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage, initial: { items: ['seed'], total: 1 } }));
    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual(['seed']);
    await waitFor(() => expect(result.current.items).toEqual(['fresh']));
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the seeded page when the background refresh fails', async () => {
    const fetchPage = vi.fn(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage, initial: { items: ['seed'], total: 1 } }));
    await waitFor(() => expect(fetchPage).toHaveBeenCalled());
    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual(['seed']);
  });

  it('reports a first-page error and retries through loadMore', async () => {
    const fetchPage = vi.fn().mockRejectedValueOnce(new Error('down')).mockImplementationOnce(() => page(['a'], 1));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not load.');
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual(['a']));
  });

  it('does nothing while disabled', () => {
    const fetchPage = vi.fn(() => page([], 0));
    renderHook(() => usePagedList(fetchPage, 'k', { errorMessage, enabled: false }));
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
