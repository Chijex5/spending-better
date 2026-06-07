"""
analyze_statement.py
────────────────────
Pass in a raw OPay/Zenith account-statement DataFrame (as read from Excel)
and get back two clean DataFrames:

    transactions_df  — every row is one transaction, with a Category column
    daily_df         — one row per calendar day, all spending features + ML label

Usage
─────
    from analyze_statement import analyze

    import pandas as pd
    raw = pd.read_excel("statement.xlsx", sheet_name="Wallet Account Transactions", header=None)

    transactions, daily = analyze(raw)

    # or, if your sheet already has the right headers:
    transactions, daily = analyze(raw, has_headers=True)

The function is pure — it never writes files, never prints, never loads
anything from disk. It returns DataFrames you can do whatever you want with.

Requirements
────────────
    pip install pandas numpy scikit-learn openpyxl
"""

import re
import warnings
from decimal import Decimal

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 1 — PARSING
#  Turns the raw Excel sheet (with OPay's weird row offsets) into a clean
#  transaction-level DataFrame.
# ─────────────────────────────────────────────────────────────────────────────

EXPECTED_COLUMNS = [
    "Trans_Date",
    "Value_Date",
    "Description",
    "Debit",
    "Credit",
    "Balance",
    "Channel",
    "Ref",
]


def _clean_amount(val) -> float:
    """Convert any messy amount cell (string, float, NaN, '--') to float."""
    if pd.isna(val) or val == "--":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    return float(str(val).replace(",", "").replace("₦", "").strip())


def _parse_raw_sheet(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    OPay statements have 7 header/metadata rows before data starts.
    Strip them, assign column names, clean types.
    """
    df = df_raw.iloc[7:].copy()
    df.columns = EXPECTED_COLUMNS
    df = df.dropna(subset=["Trans_Date"]).reset_index(drop=True)

    for col in ["Debit", "Credit", "Balance"]:
        df[col] = df[col].apply(_clean_amount)

    df["Trans_Date"] = pd.to_datetime(df["Trans_Date"], errors="coerce")
    df = df.dropna(subset=["Trans_Date"]).reset_index(drop=True)
    return df


def _parse_clean_sheet(df: pd.DataFrame) -> pd.DataFrame:
    """
    If the caller already has a DataFrame with proper headers + types,
    just normalise the amount columns and date column.
    """
    df = df.copy()
    for col in ["Debit", "Credit", "Balance"]:
        if col in df.columns:
            df[col] = df[col].apply(_clean_amount)
    df["Trans_Date"] = pd.to_datetime(df["Trans_Date"], errors="coerce")
    df = df.dropna(subset=["Trans_Date"]).reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 2 — CATEGORISATION
#  Rule-based keyword matching on the Description field.
#  Runs in order — first match wins.
# ─────────────────────────────────────────────────────────────────────────────

# Each tuple: (category_name, [keywords that trigger it])
# Order matters — more specific rules first.
_CATEGORY_RULES = [
    # Utilities / bills
    ("Electricity",       ["electricity", "buypower", "prepaid meter", "ikedc", "ekedc", "aedc"]),
    # Telecoms
    ("Data",              ["mobile data", "datamtn", "dataair", "mtn data", "airtel data", "9mobile data", "glo data"]),
    ("Airtime",           ["airtime"]),
    # Savings / internal moves
    ("Savings",           ["auto-save", "owealth", "spend & save", "target savings", "piggybank"]),
    # Loan / credit
    ("Loan Repayment",    ["easemoni", "loan repay", "credit repay", "carbon repay", "fairmoney"]),
    # Subscriptions
    ("Subscription",      ["spotify", "canva", "google play", "netflix", "apple subscription",
                            "showmax", "dstv", "gotv", "startimes", "amazon prime"]),
    # Food
    ("Food & Dining",     ["chicken republic", "bakery", "foodstuffs", "food court",
                            "restaurant", "eatery", "domino", "kilimanjaro", "mr biggs"]),
    # Bank overhead
    ("Bank Charges",      ["stamp duty", "sms alert", "maintenance fee", "card maintenance",
                            "vat on", "commission on"]),
    # Education
    ("Education",         ["jamb", "bioscience", "faculty", "conference fee", "school fee",
                            "tuition", "waec", "neco", "university"]),
    # Online payment processors
    ("Online Payment",    ["paystack", "remita", "coralpay", "flutterwave", "interswitch"]),
    # POS (physical card swipes)
    ("POS Purchase",      ["pos transfer", "pos/", "/pos", "pos ", "point of sale"]),
    # Family (Uzodinma surname appears in family transactions)
    ("Family Transfer",   ["uzodinma"]),
    # Catch-all transfer directions — keep these LAST
    ("Incoming Transfer", ["transfer from"]),
    ("Person-to-Person",  ["transfer to"]),
]


def categorize(description: str) -> str:
    """
    Assign a category to a single transaction description string.
    Returns one of the category names defined in _CATEGORY_RULES, or 'Other'.
    """
    d = str(description).lower()
    for category, keywords in _CATEGORY_RULES:
        if any(kw in d for kw in keywords):
            return category
    return "Other"


def _add_categories(df: pd.DataFrame) -> pd.DataFrame:
    """Add a Category column to the transaction DataFrame."""
    df = df.copy()
    df["Category"] = df["Description"].apply(categorize)
    return df


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 3 — .RECIPIENT EXTRACTION
#  For P2P transfers, pull the recipient name from the description.
#  OPay format: "Transfer to DAVID CHIMEZIE OGBONNA | OPay | 8023456789"
# ─────────────────────────────────────────────────────────────────────────────

def _extract_recipient(description: str):
    """Return recipient name from a P2P description, or None."""
    m = re.match(r"Transfer to (.+?) \|", str(description))
    return m.group(1).strip() if m else None


def _add_recipient(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Recipient"] = df.apply(
        lambda r: _extract_recipient(r["Description"])
        if r["Category"] in ("Person-to-Person", "Family Transfer")
        else None,
        axis=1,
    )
    return df


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 4 — TRANSACTION-LEVEL ENRICHMENT
#  Adds useful derived columns to the transaction DataFrame.
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_transactions(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Direction: credit (money in) or debit (money out)
    df["Direction"] = np.where(df["Credit"] > 0, "credit", "debit")

    # Net amount (always positive)
    df["Amount"] = np.where(df["Credit"] > 0, df["Credit"], df["Debit"])

    # Time features
    df["Date"]       = df["Trans_Date"].dt.date
    df["Hour"]       = df["Trans_Date"].dt.hour
    df["DayOfWeek"]  = df["Trans_Date"].dt.day_name()
    df["Month"]      = df["Trans_Date"].dt.strftime("%Y-%m")
    df["MonthName"]  = df["Trans_Date"].dt.strftime("%B %Y")

    # Flag: is this a real spend (not savings shuffle, not bank charges)?
    df["IsRealSpend"] = (
        (df["Debit"] > 0)
        & (~df["Category"].isin(["Savings", "Bank Charges", "Incoming Transfer"]))
    ).astype(int)

    return df


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 5 — DAILY FEATURE ENGINEERING
#  Aggregates transactions into one row per calendar day.
#  These are the features the ML model is trained on.
# ─────────────────────────────────────────────────────────────────────────────

# All spend categories we track as separate columns in the daily view
_SPEND_CATEGORIES = [
    "Person-to-Person",
    "POS Purchase",
    "Data",
    "Airtime",
    "Savings",
    "Online Payment",
    "Family Transfer",
    "Loan Repayment",
    "Food & Dining",
    "Subscription",
    "Electricity",
    "Education",
    "Bank Charges",
    "Other",
]

# Column name mapping: category → daily column name
_CAT_COL = {
    "Person-to-Person": "p2p_spend",
    "POS Purchase":     "pos_spend",
    "Data":             "data_spend",
    "Airtime":          "airtime_spend",
    "Savings":          "savings_out",
    "Online Payment":   "online_spend",
    "Family Transfer":  "family_spend",
    "Loan Repayment":   "loan_spend",
    "Food & Dining":    "food_spend",
    "Subscription":     "sub_spend",
    "Electricity":      "elec_spend",
    "Education":        "edu_spend",
    "Bank Charges":     "bank_charges",
    "Other":            "other_spend",
}

# ML features — same order as used in training
ML_FEATURES = [
    "dow", "dom", "month_num", "is_weekend",
    "prev_day_spend", "prev_week_same_day",
    "rolling_7d_avg", "rolling_14d_avg",
    "num_transactions", "max_single",
    "p2p_spend", "pos_spend", "data_spend",
    "savings_out", "online_spend", "family_spend",
    "airtime_spend", "discretionary", "total_credit",
]


def _build_daily(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate transaction-level df → daily feature matrix.

    Returns a DataFrame with one row per calendar day containing:
    - raw totals by category
    - time features (dow, dom, month, is_weekend)
    - rolling statistics (7d, 14d averages, lag features)
    - ML label: high_spend (1 if total_debit > 75th percentile)
    """
    df = df.copy()
    df["_date"] = pd.to_datetime(df["Trans_Date"].dt.date)

    # ── base aggregations ──────────────────────────────────────────────────
    agg_base = df.groupby("_date").agg(
        total_debit      = ("Debit",  "sum"),
        total_credit     = ("Credit", "sum"),
        num_transactions = ("Debit",  lambda x: (x > 0).sum()),
        max_single       = ("Debit",  "max"),
        closing_balance  = ("Balance","last"),
    ).reset_index().rename(columns={"_date": "date"})

    # ── per-category spend columns ─────────────────────────────────────────
    for cat, col in _CAT_COL.items():
        mask = df["Category"] == cat
        cat_daily = (
            df[mask]
            .groupby("_date")["Debit"]
            .sum()
            .reset_index()
            .rename(columns={"_date": "date", "Debit": col})
        )
        agg_base = agg_base.merge(cat_daily, on="date", how="left")
        agg_base[col] = agg_base[col].fillna(0.0)

    # ── time features ──────────────────────────────────────────────────────
    agg_base["dow"]        = agg_base["date"].dt.dayofweek          # 0=Mon
    agg_base["dow_name"]   = agg_base["date"].dt.day_name()
    agg_base["dom"]        = agg_base["date"].dt.day
    agg_base["month_num"]  = agg_base["date"].dt.month
    agg_base["month_name"] = agg_base["date"].dt.strftime("%B")
    agg_base["year"]       = agg_base["date"].dt.year
    agg_base["week_num"]   = agg_base["date"].dt.isocalendar().week.astype(int)
    agg_base["is_weekend"] = (agg_base["dow"] >= 5).astype(int)

    # ── derived spend buckets ──────────────────────────────────────────────
    agg_base["discretionary"] = (
        agg_base["p2p_spend"]
        + agg_base["pos_spend"]
        + agg_base["online_spend"]
    )
    agg_base["essential"] = (
        agg_base["elec_spend"]
        + agg_base["data_spend"]
        + agg_base["airtime_spend"]
        + agg_base.get("food_spend", 0)
    )

    # ── sort before rolling ────────────────────────────────────────────────
    agg_base = agg_base.sort_values("date").reset_index(drop=True)

    # ── rolling / lag features ─────────────────────────────────────────────
    agg_base["rolling_7d_avg"]     = (
        agg_base["total_debit"].rolling(7,  min_periods=1).mean()
    )
    agg_base["rolling_14d_avg"]    = (
        agg_base["total_debit"].rolling(14, min_periods=1).mean()
    )
    agg_base["rolling_7d_std"]     = (
        agg_base["total_debit"].rolling(7,  min_periods=1).std().fillna(0)
    )
    agg_base["prev_day_spend"]     = agg_base["total_debit"].shift(1).fillna(0)
    agg_base["prev_week_same_day"] = agg_base["total_debit"].shift(7).fillna(0)
    agg_base["cumulative_month"]   = agg_base.groupby("month_num")["total_debit"].cumsum()

    # ── ML label ──────────────────────────────────────────────────────────
    threshold = agg_base["total_debit"].quantile(0.75)
    agg_base["high_spend_threshold"] = round(threshold, 2)
    agg_base["high_spend"] = (agg_base["total_debit"] > threshold).astype(int)

    return agg_base


# ─────────────────────────────────────────────────────────────────────────────
#  SECTION 6 — SUMMARY STATISTICS
#  Optional third return value: a dict of headline numbers.
# ─────────────────────────────────────────────────────────────────────────────

def _build_summary(transactions: pd.DataFrame, daily: pd.DataFrame) -> dict:
    real = transactions[transactions["IsRealSpend"] == 1]
    return {
        "total_transactions":      len(transactions),
        "date_range_start":        str(transactions["Trans_Date"].min().date()),
        "date_range_end":          str(transactions["Trans_Date"].max().date()),
        "total_days":              len(daily),
        "total_real_spend":        round(real["Debit"].sum(), 2),
        "total_credit_received":   round(transactions["Credit"].sum(), 2),
        "avg_daily_spend":         round(daily["total_debit"].mean(), 2),
        "max_daily_spend":         round(daily["total_debit"].max(), 2),
        "max_spend_date":          str(daily.loc[daily["total_debit"].idxmax(), "date"].date()),
        "high_spend_threshold":    round(daily["total_debit"].quantile(0.75), 2),
        "high_spend_days":         int(daily["high_spend"].sum()),
        "category_totals":         (
            real.groupby("Category")["Debit"]
            .sum()
            .sort_values(ascending=False)
            .round(2)
            .to_dict()
        ),
        "monthly_totals":          (
            real.groupby("Month")["Debit"]
            .sum()
            .sort_values(ascending=False)
            .round(2)
            .to_dict()
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def analyze(
    df_raw: pd.DataFrame,
    has_headers: bool = False,
    include_summary: bool = False,
):
    """
    Analyse a raw account-statement DataFrame.

    Parameters
    ----------
    df_raw : pd.DataFrame
        The DataFrame as loaded from Excel.
        - If has_headers=False (default): expects OPay's raw format where the
          first 7 rows are metadata and row 8 onwards is data with no headers.
        - If has_headers=True: expects a DataFrame that already has the correct
          column names: Trans_Date, Value_Date, Description, Debit, Credit,
          Balance, Channel, Ref.

    has_headers : bool, default False
        Set True if df_raw already has proper column headers.

    include_summary : bool, default False
        If True, returns a third value: a dict of headline statistics.

    Returns
    -------
    transactions : pd.DataFrame
        One row per transaction. Columns include everything from the original
        sheet plus: Category, Direction, Amount, Date, Hour, DayOfWeek,
        Month, MonthName, IsRealSpend, Recipient.

    daily : pd.DataFrame
        One row per calendar day. Columns include all category spend columns,
        time features, rolling averages, lag features, and the ML label
        high_spend (1 = above 75th percentile day).

    summary : dict  (only if include_summary=True)
        Headline numbers: totals, averages, category breakdown, monthly totals.

    Example
    -------
        import pandas as pd
        from analyze_statement import analyze

        raw = pd.read_excel(
            "my_statement.xlsx",
            sheet_name="Wallet Account Transactions",
            header=None,
        )
        transactions, daily = analyze(raw)

        # Real spend only, no bank charges / savings shuffles
        real_spend = transactions[transactions["IsRealSpend"] == 1]

        # High-spend days
        danger_days = daily[daily["high_spend"] == 1]

        # Ready for ML
        from sklearn.ensemble import RandomForestClassifier
        from analyze_statement import ML_FEATURES
        X = daily[ML_FEATURES].fillna(0)
        y = daily["high_spend"]
    """
    # 1. Parse
    if has_headers:
        df = _parse_clean_sheet(df_raw)
    else:
        df = _parse_raw_sheet(df_raw)

    # 2. Categorise
    df = _add_categories(df)

    # 3. Enrich
    df = _enrich_transactions(df)

    # 4. Add recipient names
    df = _add_recipient(df)

    # 5. Build daily features
    daily = _build_daily(df)

    if include_summary:
        summary = _build_summary(df, daily)
        return df, daily, summary

    return df, daily


# ─────────────────────────────────────────────────────────────────────────────
#  CONVENIENCE HELPERS (importable)
# ─────────────────────────────────────────────────────────────────────────────

def from_excel(path: str, sheet_name: str = "Wallet Account Transactions"):
    """
    Load directly from an Excel file path and return (transactions, daily).

    Example
    -------
        from analyze_statement import from_excel
        transactions, daily = from_excel("statement.xlsx")
    """
    raw = pd.read_excel(path, sheet_name=sheet_name, header=None)
    return analyze(raw, has_headers=False)


def add_new_transactions(daily_existing: pd.DataFrame, new_transactions: pd.DataFrame):
    """
    Merge a batch of new transactions into an existing daily DataFrame and
    recompute all rolling features. Use this when you add new receipt data.

    Parameters
    ----------
    daily_existing : pd.DataFrame
        Your existing daily feature matrix (from analyze()).
    new_transactions : pd.DataFrame
        New transactions (already categorised) to fold in.

    Returns
    -------
    pd.DataFrame
        Updated daily DataFrame with recomputed rolling features and labels.
    """
    new_daily = _build_daily(new_transactions)
    combined  = pd.concat([daily_existing, new_daily], ignore_index=True)
    combined  = combined.drop_duplicates(subset="date", keep="last")
    combined  = combined.sort_values("date").reset_index(drop=True)

    # Recompute all rolling features on the merged series
    combined["rolling_7d_avg"]     = combined["total_debit"].rolling(7,  min_periods=1).mean()
    combined["rolling_14d_avg"]    = combined["total_debit"].rolling(14, min_periods=1).mean()
    combined["rolling_7d_std"]     = combined["total_debit"].rolling(7,  min_periods=1).std().fillna(0)
    combined["prev_day_spend"]     = combined["total_debit"].shift(1).fillna(0)
    combined["prev_week_same_day"] = combined["total_debit"].shift(7).fillna(0)
    combined["cumulative_month"]   = combined.groupby("month_num")["total_debit"].cumsum()

    threshold = combined["total_debit"].quantile(0.75)
    combined["high_spend_threshold"] = round(threshold, 2)
    combined["high_spend"]           = (combined["total_debit"] > threshold).astype(int)

    return combined


# ─────────────────────────────────────────────────────────────────────────────
#  QUICK TEST  —  run directly: python analyze_statement.py
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else None

    if path is None:
        print("Usage: python analyze_statement.py path/to/statement.xlsx")
        print()
        print("Running self-test with dummy data...")

        # Build a tiny synthetic statement to prove the pipeline works
        dummy_raw = pd.DataFrame(
            [[""] * 8] * 7  # 7 metadata rows
            + [
                ["2026-01-01 10:00", "2026-01-01", "Transfer to JOHN DOE | OPay | 8012345678", 5000, 0, 95000, "Mobile", "REF001"],
                ["2026-01-01 11:00", "2026-01-01", "Airtime | 8012345678 | AIR",               500,  0, 94500, "Mobile", "REF002"],
                ["2026-01-01 15:00", "2026-01-01", "Transfer from JANE DOE | OPay | 8087654321 | Sent", 0, 20000, 114500, "Mobile", "REF003"],
                ["2026-01-02 09:00", "2026-01-02", "Mobile Data MTN 1GB | 8012345678",         1000, 0, 113500, "Mobile", "REF004"],
                ["2026-01-02 13:00", "2026-01-02", "POS Transfer | Shoprite | 7023456789",     3500, 0, 110000, "Mobile", "REF005"],
                ["2026-01-03 08:00", "2026-01-03", "Electricity | Buypower | meter 1234",      8000, 0, 102000, "Mobile", "REF006"],
                ["2026-01-03 19:00", "2026-01-03", "Spotify | subscription renewal",            900, 0, 101100, "Mobile", "REF007"],
            ]
        )

        transactions, daily, summary = analyze(dummy_raw, has_headers=False, include_summary=True)

        print("\n── transactions ──────────────────────────────────────")
        print(transactions[["Trans_Date", "Description", "Debit", "Credit", "Category", "Direction", "Amount"]].to_string(index=False))

        print("\n── daily ─────────────────────────────────────────────")
        cols = ["date", "total_debit", "total_credit", "p2p_spend", "airtime_spend",
                "data_spend", "pos_spend", "elec_spend", "sub_spend",
                "rolling_7d_avg", "high_spend"]
        print(daily[cols].to_string(index=False))

        print("\n── summary ───────────────────────────────────────────")
        for k, v in summary.items():
            if not isinstance(v, dict):
                print(f"  {k}: {v}")
        print("  category_totals:")
        for cat, total in summary["category_totals"].items():
            print(f"    {cat}: ₦{total:,.2f}")

        sys.exit(0)

    # Real file
    print(f"Loading: {path}")
    transactions, daily, summary = from_excel(path) if "," not in path else (None, None, None)

    if transactions is not None:
        print(f"\ntransactions shape : {transactions.shape}")
        print(f"daily shape        : {daily.shape}")
        print(f"\nCategory distribution (debits only):")
        print(transactions[transactions["Debit"] > 0]["Category"].value_counts().to_string())
        print(f"\nFirst 5 daily rows:")
        print(daily[["date", "total_debit", "discretionary", "rolling_7d_avg", "high_spend"]].head().to_string(index=False))