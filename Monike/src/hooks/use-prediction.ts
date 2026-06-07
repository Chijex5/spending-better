import { useCallback } from 'react';
import { predictionFetcher, type PredictionResponse } from '@/services/api';
import { useSWR } from './use-swr';

export function usePrediction() {
  return useSWR<PredictionResponse>(
    '/prediction',
    useCallback(predictionFetcher, []),
  );
}