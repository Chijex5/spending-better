# Called: when user opens Categories screen,
#         on period toggle change (month/3mo/all).
# Cached 1hr. Historical data — no need to re-fetch often.
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from cache import TTL_HISTORICAL, get_cached
from models import CategoriesResponse, CategoryItem
from routers.utils import as_float, as_int, fetch_rows

router = APIRouter()


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


async def _fetch_categories(period: str) -> CategoriesResponse:
    period_clause = ""
    if period == "month":
        period_clause = "AND trans_date >= DATE_TRUNC('month', NOW())"
    elif period == "3months":
        period_clause = "AND trans_date >= NOW() - INTERVAL '3 months'"

    rows = await fetch_rows(
        f"""
        SELECT category,
               COALESCE(SUM(debit), 0) AS total,
               COUNT(*) AS transaction_count,
               COALESCE(AVG(debit), 0) AS avg_per_transaction
        FROM transactions
        WHERE debit > 0
          AND category NOT IN ('Savings', 'Bank Charges')
          {period_clause}
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
    return CategoriesResponse(period_label=_period_label(period), total_real_spend=grand_total, items=items)


@router.get("/categories", response_model=CategoriesResponse)
async def get_categories(period: str = Query("month", pattern="^(month|3months|all)$")) -> CategoriesResponse:
    if period not in {"month", "3months", "all"}:
        raise HTTPException(status_code=400, detail="Invalid period")
    return await get_cached(f"categories_{period}", TTL_HISTORICAL, lambda: _fetch_categories(period))
