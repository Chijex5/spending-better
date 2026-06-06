import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

type CacheEntry<T> = {
  data?: T;
  error?: Error;
  promise?: Promise<T>;
};

type UseSWRResult<T> = {
  data?: T;
  error?: Error;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => Promise<T | undefined>;
};

const cache = new Map<string, CacheEntry<unknown>>();

function readCache<T>(key: string): CacheEntry<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry) return entry;
  const fresh: CacheEntry<T> = {};
  cache.set(key, fresh as CacheEntry<unknown>);
  return fresh;
}

export function useSWR<T>(key: string | null, fetcher: (key: string) => Promise<T>): UseSWRResult<T> {
  const initial = key ? readCache<T>(key) : undefined;
  const [data, setData] = useState<T | undefined>(initial?.data);
  const [error, setError] = useState<Error | undefined>(initial?.error);
  const [isValidating, setIsValidating] = useState(false);

  const revalidate = useCallback(async () => {
    if (!key) return undefined;

    const entry = readCache<T>(key);
    setIsValidating(true);

    if (!entry.promise) {
      entry.promise = fetcher(key)
        .then((result) => {
          entry.data = result;
          entry.error = undefined;
          return result;
        })
        .catch((caught: unknown) => {
          const nextError = caught instanceof Error ? caught : new Error(String(caught));
          entry.error = nextError;
          throw nextError;
        })
        .finally(() => {
          entry.promise = undefined;
        });
    }

    try {
      const result = await entry.promise;
      setData(result);
      setError(undefined);
      return result;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      return undefined;
    } finally {
      setIsValidating(false);
    }
  }, [fetcher, key]);

  useEffect(() => {
    if (!key) {
      setData(undefined);
      setError(undefined);
      return;
    }

    const entry = readCache<T>(key);
    setData(entry.data);
    setError(entry.error);
    void revalidate();
  }, [key, revalidate]);

  useEffect(() => {
    if (!key) return undefined;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void revalidate();
    });

    return () => subscription.remove();
  }, [key, revalidate]);

  return {
    data,
    error,
    isLoading: Boolean(key) && data === undefined && error === undefined,
    isValidating,
    mutate: revalidate,
  };
}
