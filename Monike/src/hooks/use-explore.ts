import { useCallback, useMemo } from 'react';
import {
  exploreMonthsFetcher,
  exploreSummaryFetcher,
  type ExploreMonthsResponse,
  type ExploreSummaryResponse,
} from '@/services/api';
import { useSWR } from './use-swr';

export function useExploreMonths() {
  return useSWR<ExploreMonthsResponse>(
    '/explore/months',
    useCallback(exploreMonthsFetcher, []),
  );
}

export function useExploreSummary(year: number, month: number) {
  const key = `/explore/summary/${year}/${month}`;
  // Recreate fetcher only when year/month actually change
  const fetcher = useMemo(
    () => exploreSummaryFetcher(year, month),
    [year, month],
  );
  return useSWR<ExploreSummaryResponse>(key, fetcher);
}