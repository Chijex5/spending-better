import { Platform } from 'react-native';

const DEFAULT_API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

export type DailyBar = {
  date: string;
  total_debit: number;
  is_high_spend: boolean;
  day_label: string;
};

export type SpendHealth = {
  pace: string;
  streak_days: number;
  saved_this_month: number;
};

export type RecentTransaction = {
  trans_date: string;
  description: string;
  category: string;
  debit: number;
  credit: number;
};

export type DashboardResponse = {
  total_spent_this_month: number;
  month_label: string;
  pct_change_vs_last_month: number;
  avg_daily: number;
  high_spend_days: number;
  prediction_risk: string;
  prediction_prob: number;
  seven_day_bars: DailyBar[];
  spend_health: SpendHealth;
  recent_transactions: RecentTransaction[];
};

export type SummaryResponse = {
  month_label: string;
  year: number;
  month: number;
  total_real_spend: number;
  pct_change_vs_prev_month: number;
  over_under_pace: number;
  budget_limit: number;
};

export type LogEntry = {
  date: string;
  total_debit: number;
  total_credit: number;
  p2p_spend: number;
  pos_spend: number;
  data_spend: number;
  airtime_spend: number;
  online_spend: number;
  family_spend: number;
  savings_out: number;
  high_spend: boolean;
  source: string;
};

export async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GET ${path} failed with ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return response.json() as Promise<T>;
}
