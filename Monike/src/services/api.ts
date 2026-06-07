// src/services/api.ts  
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { UploadType } from 'expo-file-system';


const DEFAULT_API_BASE_URL = Platform.OS === 'android' ? 'http://192.168.167.58:8000' : 'http://localhost:8000';

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

// ─── New types to add to your existing api.ts ───────────────────────────────

export type CategoryItem = {
  category: string;
  total: number;
  share_pct: number;
  transaction_count: number;
  avg_per_transaction: number;
};

export type CategoriesResponse = {
  period_label: string;
  total_real_spend: number;
  items: CategoryItem[];
};

 
// ─── API function ─────────────────────────────────────────────────────────────
 
/**
 * Upload an account statement file (xlsx / xls / csv) to the backend.
 *
 * The backend will:
 *   1. Parse the file with analyze_statement.analyze()
 *   2. Deduplicate against existing statement_transactions rows
 *   3. Upsert daily_log rows for any new/updated days
 *   4. Return a summary of what changed
 *
 * @param uri      — local file URI from expo-document-picker / expo-file-system
 * @param filename — original filename, e.g. "statement_june.xlsx"
 * @param mimeType — e.g. "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
 */

// ─── Period param helper ─────────────────────────────────────────────────────
// Maps the UI Period string → the backend query param value
export type ApiPeriod = 'month' | '3months' | 'all';

export const periodToApiParam: Record<string, ApiPeriod> = {
  'This Month': 'month',
  '3 Months': '3months',
  'All Time': 'all',
};

// ─── Prediction types ─────────────────────────────────────────────────────────

export type FeatureImportance = {
  feature_key: string;
  label: string;
  importance: number;       // 0.0 – 1.0
  current_value: string;
};

export type SpendVelocity = {
  last_7_total: number;
  prev_7_total: number;
  pct_change: number;
  direction: 'up' | 'down' | 'flat';
  narrative: string;
};

export type WeekOutlookDay = {
  date: string;
  day_label: string;
  risk: string;
  avg_spend: number;    // NEW — historical avg for that day-of-week
  probability: number;  // NEW — 0-100, drives the bar height in OutlookCell
};
 
export type PredictionResponse = {
  target_date: string;
  day_name: string;
  probability: number;          // 0.0 – 1.0
  risk_level: string;
  rolling_7d_avg: number;
  rolling_14d_avg: number;
  top_features: FeatureImportance[];
  week_outlook: WeekOutlookDay[];
 
  // ── new ──
  velocity: SpendVelocity;
  advisor_tips: string[];       // server-generated, number-aware
  prev_day_spend: number;
  high_spend_threshold: number;
};

export async function predictionFetcher(_key: string): Promise<PredictionResponse> {
  return apiFetch<PredictionResponse>('/prediction');
}

// ─── Explore / Monthly Summary types ─────────────────────────────────────────

export type ExploreMonth = {
  year: number;
  month: number;
  label: string;        // "JUNE 2026"
};

export type ExploreMonthsResponse = {
  months: ExploreMonth[];
};

export type WeekBreakdown = {
  week: number;
  range: string;
  spend: number;
  txns: number;
};

export type DailyCell = {
  day: number;
  date: string;         // "5 Jun"
  total: number;
  is_today: boolean;
  risk: string;         // "LOW" | "MEDIUM" | "HIGH"
};

export type DayTransaction = {
  id: string;
  description: string;
  category: string;
  date: string;         // "5 Jun"
  day: string;          // "Fri"
  time: string;
  amount: number;       // negative = debit, positive = credit
};

export type ExploreSummaryResponse = {
  year: number;
  month: number;
  month_label: string;
  real_spend: number;
  previous_spend: number;
  credits: number;
  budget: number;
  spend_to_date: number;
  daily_pace_reference: number;
  weekly: WeekBreakdown[];
  daily: DailyCell[];
  day_transactions: DayTransaction[];
  previous7: number;
  last7: number;
};

export async function exploreMonthsFetcher(_key: string): Promise<ExploreMonthsResponse> {
  return apiFetch<ExploreMonthsResponse>('/explore/months');
}

export function exploreSummaryFetcher(year: number, month: number) {
  return (_key: string): Promise<ExploreSummaryResponse> =>
    apiFetch<ExploreSummaryResponse>(`/explore/summary?year=${year}&month=${month}`);
}

export type CategoryTransaction = {
  trans_date: string;       // "2026-06-05"
  description: string;
  debit: number;
  credit: number;
  balance: number | null;
};
 
export type CategoryTransactionsResponse = {
  category: string;
  period_label: string;
  total: number;
  transaction_count: number;
  items: CategoryTransaction[];
};

export async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GET ${path} failed with ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`POST ${path} failed with ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return response.json() as Promise<T>;
}

// ─── Replace the uploadStatement function in src/services/api.ts ─────────────
//
// The POST now returns { job_id } — the full result arrives over WebSocket.
// Also add the UploadJobStarted type.

export type UploadJobStarted = {
  job_id: string;
};

// UploadResult stays the same — it's what the WS 'complete' event carries.
export type UploadResult = {
  total_rows_in_file: number;
  new_days_inserted: number;
  days_updated: number;
  duplicate_transactions_skipped: number;
  date_range_start: string;
  date_range_end: string;
  high_spend_days_detected: number;
};

/**
 * POST /log/upload
 *
 * Sends the file and gets back a job_id immediately.
 * Connect to ws(s)://…/ws/upload/{job_id} for live progress.
 */
export async function uploadStatement(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<UploadJobStarted> {
  const file = new File(uri);

  const result = await file.upload(`${API_BASE_URL}/log/upload`, {
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    httpMethod: 'POST',
  });

  if (result.status !== 200) {
    throw new Error(result.body || `Upload failed with status ${result.status}`);
  }

  return JSON.parse(result.body) as UploadJobStarted;
}