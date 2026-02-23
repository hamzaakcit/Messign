import { useState, useEffect, useCallback, useRef } from 'react';

interface UseQueryOptions {
  enabled?: boolean;
}

export function useQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: UseQueryOptions = {}
): { data: T | undefined; isLoading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { enabled = true } = options;
  const fnRef = useRef(queryFn);
  fnRef.current = queryFn;
  const keyStr = JSON.stringify(queryKey);

  const refetch = useCallback(() => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    fnRef.current()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setIsLoading(false));
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [keyStr, enabled, refetch]);

  return { data, isLoading, error, refetch };
}
