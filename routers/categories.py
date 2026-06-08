from __future__ import annotations

from datetime import date
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query

from cache import TTL_HISTORICAL, get_cached
from models import (
    CategoriesResponse,
    CategoryItem,
    CategoryTransaction,
    CategoryTransactionsResponse,
)
from routers.utils import as_float, as_int, fetch_rows

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

COMBINED_TRANSACTIONS = """
    (
        SELECT id, trans_date, description, category, debit, credit
        FROM transactions
        UNION ALL
        SELECT id, trans_date, description, category, debit, credit
        FROM statement_transactions
    ) AS txns
"""


def _period_label(period: str) -> str:
    today = date.today()
    if period == "month":
        return today.strftime("%b %Y")
    if period == "3months":
        start_month = today.month - 3
        start_year = today.year
        while start_month <= 0:
            start_month += 12
            start_year -= 1
        return f"{date(start_year, start_month, 1).strftime('%b')}–{today.strftime('%b %Y')}"
    return "All Time"


def _period_clause(period: str) -> str:
    if period == "month":
        return "AND trans_date >= DATE_TRUNC('month', NOW())"
    if period == "3months":
        return "AND trans_date >= NOW() - INTERVAL '3 months'"
    return ""


# ─── GET /categories ──────────────────────────────────────────────────────────

async def _fetch_categories(period: str) -> CategoriesResponse:
    clause = _period_clause(period)
    rows = await fetch_rows(
        f"""
        SELECT category,
               COALESCE(SUM(debit), 0)  AS total,
               COUNT(*)                  AS transaction_count,
               COALESCE(AVG(debit), 0)  AS avg_per_transaction
        FROM {COMBINED_TRANSACTIONS}
        WHERE debit > 0
          AND category NOT IN ('Savings', 'Bank Charges')
          {clause}
        GROUP BY category
        ORDER BY total DESC
        """
    )
    grand_total = sum(as_float(row["total"]) for row in rows)
    items = [
        CategoryItem(
            category=str(row["category"] or ""),
            total=as_float(row["total"]),
            share_pct=(as_float(row["total"]) / grand_total * 100) if grand_total else 0.0,
            transaction_count=as_int(row["transaction_count"]),
            avg_per_transaction=as_float(row["avg_per_transaction"]),
        )
        for row in rows
    ]
    return CategoriesResponse(
        period_label=_period_label(period),
        total_real_spend=grand_total,
        items=items,
    )


@router.get("/categories", response_model=CategoriesResponse)
async def get_categories(
    period: str = Query("month", pattern="^(month|3months|all)$"),
) -> CategoriesResponse:
    if period not in {"month", "3months", "all"}:
        raise HTTPException(status_code=400, detail="Invalid period")
    return await get_cached(
        f"categories_{period}",
        TTL_HISTORICAL,
        lambda: _fetch_categories(period),
    )


# ─── GET /categories/{name}/transactions ──────────────────────────────────────

async def _fetch_category_transactions(
    name: str,
    period: str,
) -> CategoryTransactionsResponse:
    clause = _period_clause(period)

    check = await fetch_rows(
        f"""
        SELECT COUNT(*) AS cnt
        FROM {COMBINED_TRANSACTIONS}
        WHERE debit > 0
          AND LOWER(category) = LOWER($1)
          {clause}
        """,
        name,
    )
    if not check or as_int(check[0]["cnt"]) == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No transactions found for category '{name}' in the requested period.",
        )

    rows = await fetch_rows(
        f"""
        SELECT trans_date::text            AS trans_date,
               description,
               COALESCE(debit,   0)        AS debit,
               COALESCE(credit,  0)        AS credit
        FROM {COMBINED_TRANSACTIONS}
        WHERE debit > 0
          AND LOWER(category) = LOWER($1)
          {clause}
        ORDER BY trans_date DESC, id DESC
        """,
        name,
    )

    items = [
        CategoryTransaction(
            trans_date=str(row["trans_date"]),
            description=str(row["description"] or ""),
            debit=as_float(row["debit"]),
            credit=as_float(row["credit"]),
        )
        for row in rows
    ]

    total = sum(t.debit for t in items)

    return CategoryTransactionsResponse(
        category=name,
        period_label=_period_label(period),
        total=total,
        transaction_count=len(items),
        items=items,
    )


@router.get(
    "/categories/{name:path}/transactions",
    response_model=CategoryTransactionsResponse,
)
async def get_category_transactions(
    name: str,
    period: str = Query("month", pattern="^(month|3months|all)$"),
) -> CategoryTransactionsResponse:
    decoded_name = unquote(name)

    if period not in {"month", "3months", "all"}:
        raise HTTPException(status_code=400, detail="Invalid period")

    cache_key = f"category_txns_{decoded_name}_{period}"
    return await get_cached(
        cache_key,
        TTL_HISTORICAL,
        lambda: _fetch_category_transactions(decoded_name, period),
    )