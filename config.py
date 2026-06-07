# config.py
from __future__ import annotations

# ── Live values (mutated at startup and on settings save) ─────────────────────
HIGH_SPEND_THRESHOLD: float = 5000.0
MONTHLY_BUDGET: float = 0.0

FEATURES = [
    'dow', 'dom', 'month', 'is_weekend', 'prev_day_spend',
    'prev_week_same_day', 'rolling_7d_avg', 'rolling_14d_avg',
    'num_transactions', 'max_single', 'p2p_spend', 'pos_spend',
    'data_spend', 'savings_out', 'online_spend', 'family_spend',
    'airtime_spend', 'discretionary', 'total_credit',
]


async def load_from_db() -> None:
    """
    Called once in lifespan startup. Pulls user_settings from DB and
    overwrites the module-level defaults. Silent no-op if table is empty
    or doesn't exist yet (first run before migration).
    """
    global HIGH_SPEND_THRESHOLD, MONTHLY_BUDGET
    try:
        from routers.utils import fetch_row
        row = await fetch_row(
            "SELECT high_spend_threshold, monthly_budget FROM user_settings LIMIT 1"
        )
        if row:
            HIGH_SPEND_THRESHOLD = float(row["high_spend_threshold"])
            MONTHLY_BUDGET = float(row["monthly_budget"])
            print(f"Config loaded from DB — threshold: ₦{HIGH_SPEND_THRESHOLD:,.0f}, budget: ₦{MONTHLY_BUDGET:,.0f}")
        else:
            print("Config: no saved settings found, using defaults.")
    except Exception as e:
        print(f"Config DB load skipped ({e}), using defaults.")