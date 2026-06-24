-- ─────────────────────────────────────────────────────────────────────────────
-- migration: settings + model_metadata
-- Run once against your `monike` database.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── user_settings ─────────────────────────────────────────────────────────────
-- singleton_key enforces exactly one settings row.

CREATE TABLE IF NOT EXISTS user_settings (
  id                    SERIAL PRIMARY KEY,
  singleton_key         TEXT    NOT NULL DEFAULT 'singleton' UNIQUE,
  display_name          TEXT    NOT NULL DEFAULT 'Chijioke',
  email                 TEXT    NOT NULL DEFAULT 'chijioke@monike.app',
  monthly_budget        NUMERIC NOT NULL DEFAULT 0,
  high_spend_threshold  NUMERIC NOT NULL DEFAULT 5000,
  notify_high_spend     BOOLEAN NOT NULL DEFAULT TRUE,
  notify_weekly_summary BOOLEAN NOT NULL DEFAULT TRUE,
  notify_model_updates  BOOLEAN NOT NULL DEFAULT FALSE,
  accent_theme          TEXT    NOT NULL DEFAULT 'Emerald',
  dark_mode             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- accent_theme / dark_mode are also patched in automatically at API startup
-- (main.py) so existing databases pick them up without rerunning this file.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS accent_theme TEXT NOT NULL DEFAULT 'Emerald';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT TRUE;

-- ── model_metadata ────────────────────────────────────────────────────────────
-- Append-only log — we keep a row per retrain for auditability.
-- /model/status always reads ORDER BY trained_at DESC LIMIT 1.

CREATE TABLE IF NOT EXISTS model_metadata (
  id             SERIAL PRIMARY KEY,
  trained_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  training_rows  INTEGER     NOT NULL,
  accuracy       NUMERIC,
  model_version  TEXT        NOT NULL,
  precision_score NUMERIC,
  recall_score    NUMERIC,
  roc_auc         NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_model_metadata_trained_at
  ON model_metadata (trained_at DESC);