import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '../../api/api-client';

/** Thin CRUD-over-fetch hook so Master/Manage pages are mostly field definitions,
 *  not repeated loading/error/list-refresh boilerplate. `listPath` may return either
 *  `{ items: T[] }` (most list endpoints) or `T[]` directly. */
export function useResource<T extends { id: string }>(basePath: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<{ items: T[] } | T[]>(basePath)
      .then((res) => setItems(Array.isArray(res) ? res : res.items))
      .catch((err) => setError(err instanceof ApiError ? err.code : 'load_failed'))
      .finally(() => setLoading(false));
  }, [basePath]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (body: unknown) => {
      const created = await apiClient.post<T>(basePath, body);
      setItems((prev) => [created, ...prev]);
      return created;
    },
    [basePath],
  );

  const update = useCallback(
    async (id: string, body: unknown) => {
      const updated = await apiClient.patch<T>(`${basePath}/${id}`, body);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      return updated;
    },
    [basePath],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiClient.delete(`${basePath}/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [basePath],
  );

  return { items, loading, error, load, create, update, remove, setItems };
}
