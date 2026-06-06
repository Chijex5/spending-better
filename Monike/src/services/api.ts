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

export type UploadResult = {
  total_rows_in_file: number;
  new_days_inserted: number;
  days_updated: number;
  duplicate_transactions_skipped: number;
  date_range_start: string;   // "2026-01-01"
  date_range_end: string;     // "2026-06-05"
  high_spend_days_detected: number;
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

export async function uploadStatement(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<UploadResult> {
  const file = new File(uri);   // wrap the DocumentPicker URI directly

  const result = await file.upload(`${API_BASE_URL}/log/upload`, {
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    httpMethod: 'POST',
  });

  console.log('UPLOAD STATUS:', result.status);

  if (result.status !== 200) {
    throw new Error(result.body || `Upload failed with status ${result.status}`);
  }

  return JSON.parse(result.body) as UploadResult;
}

// ─── Period param helper ─────────────────────────────────────────────────────
// Maps the UI Period string → the backend query param value
export type ApiPeriod = 'month' | '3months' | 'all';

export const periodToApiParam: Record<string, ApiPeriod> = {
  'This Month': 'month',
  '3 Months': '3months',
  'All Time': 'all',
};

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
