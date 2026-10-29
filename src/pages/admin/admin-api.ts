import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Calls the API (session travels via the admin cookie automatically). */
export const adminApi = <T,>(path: string, opts?: Parameters<typeof api>[1]) =>
  api<T>(path, opts);

export type TabProps = { onAuthError: (e: unknown) => void };

/** YYYY-MM-DD of a date in Addis Ababa time (UTC+3). */
export const isoDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/** Loads an admin endpoint; keeps the previous data while reloading. */
export function useLoad<T>(path: string, onAuthError: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setError('');
    setLoading(true);
    return adminApi<T>(path)
      .then(setData)
      .catch((e) => {
        onAuthError(e);
        setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [path, onAuthError]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, load, setError };
}
