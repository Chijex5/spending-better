#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════╗
║       CHIJIOKE'S SPENDING ANALYZER & ML ADVISOR      ║
║       Analyzes your OPay statement + logs daily spend ║
╚══════════════════════════════════════════════════════╝

Requirements:
    pip install pandas numpy scikit-learn colorama tabulate openpyxl

Usage:
    python spending_analyzer.py              # full menu
    python spending_analyzer.py --summary    # quick summary only
"""

import sys
import os
import io
import base64
import json
import csv
import argparse
from datetime import date, datetime, timedelta
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import psycopg2
    from psycopg2.extras import execute_values
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False

def _get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "monike"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )
# ── dependency check ──────────────────────────────────────────────────────────
MISSING = []
for pkg in ['pandas', 'numpy', 'sklearn', 'colorama', 'tabulate']:
    try:
        __import__(pkg)
    except ImportError:
        MISSING.append(pkg.replace('sklearn', 'scikit-learn'))

if MISSING:
    print(f"\n❌  Missing packages: {', '.join(MISSING)}")
    print(f"    Run: pip install {' '.join(MISSING)}\n")
    sys.exit(1)

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from colorama import init, Fore, Back, Style
from tabulate import tabulate

init(autoreset=True)

# ── constants ────────────────────────────────────────────────────────────────
HIGH_SPEND_THRESHOLD = 5_145.25          # ₦ — your historical 75th percentile
FEATURES = [
    'dow', 'dom', 'month', 'is_weekend', 'prev_day_spend',
    'prev_week_same_day', 'rolling_7d_avg', 'rolling_14d_avg',
    'num_transactions', 'max_single', 'p2p_spend', 'pos_spend',
    'data_spend', 'savings_out', 'online_spend', 'family_spend',
    'airtime_spend', 'discretionary', 'total_credit',
]
CATEGORIES = [
    'Person-to-Person', 'POS Purchase', 'Data', 'Airtime', 'Food & Dining',
    'Online Payment', 'Family Transfer', 'Electricity', 'Subscription',
    'Loan Repayment', 'Education/Academic', 'Savings', 'Bank Charges', 'Other',
]



# ── colors / style ────────────────────────────────────────────────────────────
W  = Fore.WHITE + Style.BRIGHT
G  = Fore.GREEN + Style.BRIGHT
R  = Fore.RED   + Style.BRIGHT
Y  = Fore.YELLOW + Style.BRIGHT
C  = Fore.CYAN  + Style.BRIGHT
M  = Fore.MAGENTA + Style.BRIGHT
DIM = Style.DIM
RST = Style.RESET_ALL

def sep(char='─', n=58): print(DIM + char * n)
def h1(txt): print(f"\n{C}{'═'*58}\n  {txt}\n{'═'*58}{RST}")
def h2(txt): print(f"\n{W}▸ {txt}{RST}")
def ok(txt):  print(f"{G}  ✔  {txt}{RST}")
def warn(txt): print(f"{Y}  ⚠  {txt}{RST}")
def err(txt):  print(f"{R}  ✘  {txt}{RST}")
def tip(txt):  print(f"{M}  💡 {txt}{RST}")
def fmt(n):    return f"₦{n:,.2f}"

def load_transactions() -> pd.DataFrame:
    conn = _get_db()
    df = pd.read_sql(
        """
        SELECT
            trans_date                                              AS "Trans_Date",
            description                                             AS "Description",
            category                                               AS "Category",
            debit                                                  AS "Debit",
            credit                                                 AS "Credit",
            TO_CHAR(trans_date AT TIME ZONE 'UTC', 'YYYY-MM')     AS "month_period"
        FROM transactions
        ORDER BY trans_date
        """,
        conn,
        parse_dates=["Trans_Date"],
    )
    conn.close()
    return df

def load_daily() -> pd.DataFrame:
    conn = _get_db()
    df = pd.read_sql(
        "SELECT * FROM all_daily ORDER BY date",
        conn,
        parse_dates=["date"],
    )
    conn.close()

    df = df.sort_values("date").reset_index(drop=True)
    _recompute_rolling(df)
    return df

def _recompute_rolling(df: pd.DataFrame):
    df['rolling_7d_avg']       = df['total_debit'].rolling(7,  min_periods=1).mean()
    df['rolling_14d_avg']      = df['total_debit'].rolling(14, min_periods=1).mean()
    df['prev_day_spend']       = df['total_debit'].shift(1).fillna(0)
    df['prev_week_same_day']   = df['total_debit'].shift(7).fillna(0)
    df['high_spend']           = (df['total_debit'] > HIGH_SPEND_THRESHOLD).astype(int)

# ── ML model ──────────────────────────────────────────────────────────────────

def train_model(daily: pd.DataFrame):
    X = daily[FEATURES].fillna(0)
    y = daily['high_spend']
    rf = RandomForestClassifier(
        n_estimators=200, max_depth=5, random_state=42, class_weight='balanced'
    )
    rf.fit(X, y)
    return rf

def predict_tomorrow(rf, daily: pd.DataFrame) -> dict:
    last      = daily.iloc[-1]
    tomorrow  = last['date'] + timedelta(days=1)
    dow       = tomorrow.dayofweek
    dom       = tomorrow.day
    month     = tomorrow.month
    same_dow  = daily[daily['dow'] == dow]['total_debit']
    prev_same = same_dow.iloc[-1] if len(same_dow) else 0

    row = {f: 0 for f in FEATURES}
    row.update({
        'dow': dow, 'dom': dom, 'month': month,
        'is_weekend':          int(dow >= 5),
        'prev_day_spend':      last['total_debit'],
        'prev_week_same_day':  prev_same,
        'rolling_7d_avg':      last['rolling_7d_avg'],
        'rolling_14d_avg':     last['rolling_14d_avg'],
        'total_credit':        0,
    })
    prob = rf.predict_proba(pd.DataFrame([row]))[0][1]
    return {'date': tomorrow, 'prob': prob, 'dow': dow}

def risk_label(prob: float) -> tuple:
    if prob >= 0.70: return R + "HIGH RISK",   "🔴"
    if prob >= 0.40: return Y + "MEDIUM RISK", "🟡"
    return G + "LOW RISK", "🟢"

# ── analysis sections ─────────────────────────────────────────────────────────

def show_summary(daily: pd.DataFrame, txn: pd.DataFrame):
    h1("📊  SPENDING SUMMARY  (Jan – Jun 2026)")

    real = txn[(txn['Debit'] > 0) & (~txn['Category'].isin(['Savings','Bank Charges']))]
    monthly = real.copy()
    monthly['month'] = monthly['Trans_Date'].dt.to_period('M').astype(str)
    m = monthly.groupby('month')['Debit'].sum().reset_index()

    h2("Monthly real spending")
    rows = [[r.month, fmt(r.Debit),
             G+"▼ LOW"+RST  if r.Debit < 200_000 else
             Y+"▲ MED"+RST  if r.Debit < 450_000 else
             R+"▲▲ HIGH"+RST]
            for _, r in m.iterrows()]
    print(tabulate(rows, headers=['Month','Spent','Level'], tablefmt='rounded_outline'))

    h2("Key numbers")
    avg_day   = daily['total_debit'].mean()
    max_day   = daily['total_debit'].max()
    max_date  = daily.loc[daily['total_debit'].idxmax(), 'date'].date()
    high_days = daily['high_spend'].sum()
    ok(f"Average daily spend  : {fmt(avg_day)}")
    ok(f"Highest single day   : {fmt(max_day)}  ({max_date})")
    ok(f"High-spend days      : {high_days} / {len(daily)}  (>{fmt(HIGH_SPEND_THRESHOLD)})")

    # 7-day trend
    last7 = daily.tail(7)
    prev7 = daily.iloc[-14:-7]
    chg   = (last7['total_debit'].sum() - prev7['total_debit'].sum()) / (prev7['total_debit'].sum() + 1) * 100
    arrow = (R+"▲" if chg > 5 else G+"▼" if chg < -5 else Y+"→") + RST
    h2("Last 7 days vs previous 7 days")
    print(f"  {arrow}  {chg:+.1f}%  "
          f"({fmt(last7['total_debit'].sum())} vs {fmt(prev7['total_debit'].sum())})")


def show_categories(txn: pd.DataFrame):
    h1("🏷️  SPENDING BY CATEGORY")
    real = txn[(txn['Debit'] > 0) & (~txn['Category'].isin(['Savings','Bank Charges']))]
    cats = real.groupby('Category')['Debit'].agg(['sum','count','mean']).reset_index()
    cats = cats.sort_values('sum', ascending=False)
    total = cats['sum'].sum()
    rows = []
    for _, r in cats.iterrows():
        pct = r['sum'] / total * 100
        bar = '█' * int(pct / 3)
        rows.append([r['Category'], fmt(r['sum']), f"{pct:.1f}%", int(r['count']), fmt(r['mean']), bar])
    print(tabulate(rows,
                   headers=['Category','Total','Share','Txns','Avg',''],
                   tablefmt='rounded_outline'))
    tip("Person-to-Person is your #1 spend — consider tracking who and why.")


def show_patterns(daily: pd.DataFrame):
    h1("📅  SPENDING PATTERNS")
    day_names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    h2("By day of week")
    dow = daily.groupby('dow')['total_debit'].agg(['mean','sum','count']).reset_index()
    rows = [[day_names[int(r.dow)], fmt(r['mean']), fmt(r['sum']), int(r['count'])]
            for _, r in dow.iterrows()]
    print(tabulate(rows, headers=['Day','Avg Spend','Total','Days recorded'],
                   tablefmt='rounded_outline'))
    peak_dow = int(dow.loc[dow['mean'].idxmax(), 'dow'])
    warn(f"Wednesdays are your biggest spend day on average — heads up mid-week.")

    h2("By month")
    mon = daily.groupby('month')['total_debit'].agg(['mean','sum']).reset_index()
    month_names = {1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',
                   7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec'}
    rows = [[month_names.get(int(r.month), r.month), fmt(r['mean']), fmt(r['sum'])]
            for _, r in mon.iterrows()]
    print(tabulate(rows, headers=['Month','Daily Avg','Total'], tablefmt='rounded_outline'))


def show_top_recipients(txn: pd.DataFrame):
    h1("👤  TOP RECIPIENTS")
    import re
    def extract(desc):
        m = re.match(r'Transfer to (.+?) \|', str(desc))
        return m.group(1).strip() if m else None

    real = txn[(txn['Debit'] > 0)]
    real = real.copy()
    real['Recipient'] = real['Description'].apply(extract)
    top = (real.dropna(subset=['Recipient'])
               .groupby('Recipient')['Debit']
               .agg(['sum','count'])
               .reset_index()
               .query('count >= 3')
               .sort_values('sum', ascending=False)
               .head(12))
    rows = [[r.Recipient[:35], fmt(r['sum']), int(r['count']), fmt(r['sum']/r['count'])]
            for _, r in top.iterrows()]
    print(tabulate(rows, headers=['Recipient','Total Sent','# Times','Avg'],
                   tablefmt='rounded_outline'))
    tip("DAVID CHIMEZIE OGBONNA (₦128k, 66 times) — frequent small sends add up fast.")


def show_prediction(rf, daily: pd.DataFrame):
    h1("🤖  ML OVERSPEND PREDICTION")
    pred = predict_tomorrow(rf, daily)
    label, emoji = risk_label(pred['prob'])
    day_names = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

    h2(f"Tomorrow — {pred['date'].strftime('%d %b %Y')} ({day_names[pred['dow']]})")
    print(f"\n   {emoji}  Risk level : {label}{RST}")
    print(f"   📈  Probability of overspend (>{fmt(HIGH_SPEND_THRESHOLD)}/day): {W}{pred['prob']:.1%}{RST}\n")

    # rolling context
    r7  = daily.iloc[-1]['rolling_7d_avg']
    r14 = daily.iloc[-1]['rolling_14d_avg']
    print(f"   7-day avg  : {fmt(r7)}")
    print(f"   14-day avg : {fmt(r14)}")

    # advice
    sep()
    h2("Advisor says")
    if pred['prob'] >= 0.70:
        warn("Tomorrow looks like a HIGH risk day. Here's what to watch:")
        tip("Set a mental cap of ₦15,000 for discretionary sends.")
        tip("Avoid impulse transfers — ask yourself if it can wait 24h.")
        tip("If someone asks for money tomorrow, consider sending less or next day.")
    elif pred['prob'] >= 0.40:
        warn("Medium risk tomorrow. A few nudges:")
        tip("Check your 7-day average — you're running a bit elevated.")
        tip("Data and airtime tend to cluster. Buy in advance to avoid repeat topping up.")
    else:
        ok("Low risk day predicted. You're on a good run!")
        tip("Good days are when you shore up savings or pre-pay recurring bills.")

    # Feature importance explanation
    sep()
    h2("What drives the model's prediction")
    fi = pd.Series(rf.feature_importances_, index=FEATURES).sort_values(ascending=False).head(5)
    labels = {
        'total_credit':       'Money coming in (credit)',
        'max_single':         'Largest single transaction',
        'savings_out':        'Money moved to OWealth/savings',
        'discretionary':      'Discretionary transfers (P2P, POS, online)',
        'rolling_7d_avg':     'Your 7-day spending trend',
        'prev_day_spend':     'What you spent yesterday',
        'rolling_14d_avg':    '14-day spending trend',
        'num_transactions':   'Number of transactions per day',
        'pos_spend':          'POS purchases',
    }
    for feat, score in fi.items():
        print(f"  {DIM}•{RST}  {labels.get(feat, feat):<35}  importance: {Y}{score:.1%}{RST}")


def show_recent(daily: pd.DataFrame):
    h1("📆  LAST 14 DAYS")
    last14 = daily.tail(14).copy()
    rows = []
    for _, r in last14.iterrows():
        flag = R+"⚠ HIGH"+RST if r['high_spend'] else G+"  ok"+RST
        rows.append([
            r['date'].strftime('%d %b'),
            fmt(r['total_debit']),
            fmt(r['rolling_7d_avg']),
            flag,
        ])
    print(tabulate(rows, headers=['Date','Spent','7d Avg','Status'],
                   tablefmt='rounded_outline'))


# ── daily log entry ───────────────────────────────────────────────────────────

def log_daily_spend():
    h1("✏️  LOG TODAY'S SPENDING")
    
    # Date
    today_str = date.today().strftime('%Y-%m-%d')
    raw = input(f"  Date [{today_str}]: ").strip()
    entry_date = pd.to_datetime(raw if raw else today_str)

    # Amounts by category
    print(f"\n  Enter amounts spent in each category (press Enter to skip):\n")
    amounts = {}
    cat_map = {
        'Person-to-Person':  'Bank transfers to people (₦)',
        'POS Purchase':      'POS / cash point purchases (₦)',
        'Data':              'Mobile data (₦)',
        'Airtime':           'Airtime (₦)',
        'Food & Dining':     'Food, restaurants (₦)',
        'Online Payment':    'Online payments/Paystack (₦)',
        'Family Transfer':   'Transfers to family (₦)',
        'Electricity':       'Electricity / NEPA (₦)',
        'Subscription':      'Subscriptions (Spotify, Canva…) (₦)',
        'Loan Repayment':    'Loan repayments (₦)',
        'Other':             'Anything else (₦)',
    }
    for cat, prompt in cat_map.items():
        raw = input(f"  {prompt}: ").strip()
        try:
            amounts[cat] = float(raw.replace(',', '')) if raw else 0.0
        except ValueError:
            amounts[cat] = 0.0

    total = sum(amounts.values())
    income_raw = input(f"\n  Money received today (credit) (₦): ").strip()
    try:
        total_credit = float(income_raw.replace(',', '')) if income_raw else 0.0
    except ValueError:
        total_credit = 0.0

    # Build row
    dow = entry_date.dayofweek
    dom = entry_date.day
    month = entry_date.month
    max_single = max(amounts.values()) if amounts else 0
    discretionary = amounts.get('Person-to-Person', 0) + amounts.get('POS Purchase', 0) + amounts.get('Online Payment', 0)

    row = {
        'date':             entry_date.strftime('%Y-%m-%d'),
        'total_debit':      total,
        'total_credit':     total_credit,
        'num_transactions': sum(1 for v in amounts.values() if v > 0),
        'max_single':       max_single,
        'p2p_spend':        amounts.get('Person-to-Person', 0),
        'pos_spend':        amounts.get('POS Purchase', 0),
        'data_spend':       amounts.get('Data', 0),
        'savings_out':      0,
        'online_spend':     amounts.get('Online Payment', 0),
        'family_spend':     amounts.get('Family Transfer', 0),
        'airtime_spend':    amounts.get('Airtime', 0),
        'dow':              dow,
        'dom':              dom,
        'month':            month,
        'is_weekend':       int(dow >= 5),
        'discretionary':    discretionary,
        'rolling_7d_avg':   0,   # recomputed on load
        'rolling_14d_avg':  0,
        'prev_day_spend':   0,
        'prev_week_same_day': 0,
        'high_spend':       int(total > HIGH_SPEND_THRESHOLD),
    }

    # Write / append
    # Write to Postgres
    conn = _get_db()
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO daily_log (
                date, total_debit, total_credit, num_transactions, max_single,
                p2p_spend, pos_spend, data_spend, savings_out, online_spend,
                family_spend, airtime_spend, discretionary,
                dow, dom, month, is_weekend, high_spend, source
            ) VALUES (
                %(date)s, %(total_debit)s, %(total_credit)s, %(num_transactions)s,
                %(max_single)s, %(p2p_spend)s, %(pos_spend)s, %(data_spend)s,
                %(savings_out)s, %(online_spend)s, %(family_spend)s,
                %(airtime_spend)s, %(discretionary)s,
                %(dow)s, %(dom)s, %(month)s, %(is_weekend)s, %(high_spend)s, 'manual'
            )
            ON CONFLICT (date) DO UPDATE SET
                total_debit      = EXCLUDED.total_debit,
                total_credit     = EXCLUDED.total_credit,
                num_transactions = EXCLUDED.num_transactions,
                high_spend       = EXCLUDED.high_spend,
                updated_at       = NOW()
        """, {**row, "is_weekend": bool(row["is_weekend"]), "high_spend": bool(row["high_spend"])})
    conn.commit()
    conn.close()

    sep()
    if total > HIGH_SPEND_THRESHOLD:
        err(f"Today's total: {fmt(total)} — that's a HIGH-spend day (>{fmt(HIGH_SPEND_THRESHOLD)})")
        warn("Consider what drove it and whether it was avoidable.")
    elif total > HIGH_SPEND_THRESHOLD * 0.7:
        warn(f"Today's total: {fmt(total)} — approaching your high-spend threshold.")
    else:
        ok(f"Today's total: {fmt(total)} — within normal range.")


def view_log():
    h1("📓  YOUR SPENDING LOG")
    conn = _get_db()
    log = pd.read_sql(
        "SELECT * FROM daily_log ORDER BY date DESC LIMIT 30",
        conn,
        parse_dates=["date"],
    )
    conn.close()

    if log.empty:
        warn("No log entries yet. Use option 7 to log your first day.")
        return

    rows = []
    for _, r in log.iterrows():
        flag = R+"HIGH"+RST if r.get('high_spend', False) else G+"ok"+RST
        rows.append([
            r['date'].strftime('%d %b %Y'),
            fmt(r['total_debit']),
            fmt(r.get('p2p_spend', 0)),
            fmt(r.get('pos_spend', 0)),
            fmt(r.get('data_spend', 0) + r.get('airtime_spend', 0)),
            flag,
        ])
    print(tabulate(rows,
                   headers=['Date','Total','P2P','POS','Data/Air','Status'],
                   tablefmt='rounded_outline'))
    ok(f"{len(log)} entries shown (most recent 30).")

# ── main menu ─────────────────────────────────────────────────────────────────

MENU = [
    ("1", "📊  Summary & monthly overview"),
    ("2", "🏷️  Spending by category"),
    ("3", "📅  Day/week/month patterns"),
    ("4", "👤  Top recipients"),
    ("5", "📆  Last 14 days"),
    ("6", "🤖  ML overspend prediction for tomorrow"),
    ("7", "✏️  Log today's spending"),
    ("8", "📓  View spending log"),
    ("9", "🔁  Retrain model with logged data"),
    ("0", "🚪  Exit"),
]

def print_menu():
    sep('═')
    print(f"{C}  CHIJIOKE'S SPENDING ANALYZER{RST}")
    sep('═')
    for key, label in MENU:
        print(f"  {W}{key}{RST}  {label}")
    sep()


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--summary', action='store_true')
    args, _ = parser.parse_known_args()

    print(f"\n{C}Loading your statement data…{RST}")
    txn   = load_transactions()
    daily = load_daily()
    print(f"{G}  ✔  {len(txn):,} transactions loaded  ({len(daily)} days){RST}")

    print(f"{C}Training ML model…{RST}")
    rf = train_model(daily)
    ok(f"Model ready  (trained on {len(daily)} days, threshold {fmt(HIGH_SPEND_THRESHOLD)}/day)")

    if args.summary:
        show_summary(daily, txn)
        show_prediction(rf, daily)
        return

    while True:
        print_menu()
        choice = input(f"\n  {W}Choose [0-9]: {RST}").strip()

        if choice == '0':
            print(f"\n{G}  Bye! Stay on budget. 💪{RST}\n")
            break
        elif choice == '1': show_summary(daily, txn)
        elif choice == '2': show_categories(txn)
        elif choice == '3': show_patterns(daily)
        elif choice == '4': show_top_recipients(txn)
        elif choice == '5': show_recent(daily)
        elif choice == '6': show_prediction(rf, daily)
        elif choice == '7':
            log_daily_spend()
        elif choice == '8': view_log()
        elif choice == '9':
            print(f"\n{C}Reloading & retraining…{RST}")
            daily = load_daily()
            rf    = train_model(daily)
            ok(f"Model retrained on {len(daily)} days (includes your log entries).")
        else:
            err("Invalid choice, try again.")

        input(f"\n  {DIM}Press Enter to return to menu…{RST}")


if __name__ == '__main__':
    main()