# Called: when user opens Recipients screen.
# Cached 1hr.
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter

from cache import TTL_HISTORICAL, get_cached
from models import MonthlyTransferBar, RecipientItem, RecipientsResponse
from routers.utils import as_float, as_int, fetch_rows

router = APIRouter()


# The two tables expose recipient differently:
#   transactions        → regex-extracted from description ("Transfer to NAME | ...")
#   statement_transactions → explicit `recipient` column
# This CTE normalizes both to a single `recipient_name` + `debit` + `trans_date` shape.
_RECIPIENT_CTE = r"""
WITH all_transfers AS (
    SELECT
        REGEXP_REPLACE(description, '^Transfer to (.+?) \|.*$', '\1') AS recipient_name,
        debit,
        trans_date
    FROM transactions
    WHERE debit > 0
      AND description ILIKE 'Transfer to%'

    UNION ALL

    SELECT
        recipient AS recipient_name,
        debit,
        trans_date
    FROM statement_transactions
    WHERE debit > 0
      AND recipient IS NOT NULL
      AND recipient != ''
)
"""


async def _fetch_recipient_rows() -> list:
    return await fetch_rows(
        _RECIPIENT_CTE +
        """
        SELECT recipient_name,
               COALESCE(SUM(debit), 0)      AS total_sent,
               COUNT(*)                      AS transfer_count,
               COALESCE(AVG(debit), 0)       AS avg_per_transfer,
               MAX(trans_date::date)::text   AS last_transfer_date
        FROM all_transfers
        GROUP BY recipient_name
        HAVING COUNT(*) >= 3
        ORDER BY total_sent DESC
        """
    )


async def _fetch_monthly_bars() -> dict[str, list[MonthlyTransferBar]]:
    rows = await fetch_rows(
        _RECIPIENT_CTE +
        """
        SELECT recipient_name,
               TO_CHAR(DATE_TRUNC('month', trans_date), 'Mon') AS month_label,
               COALESCE(SUM(debit), 0) AS total_sent
        FROM all_transfers
        WHERE trans_date >= NOW() - INTERVAL '6 months'
        GROUP BY recipient_name, month_label, DATE_TRUNC('month', trans_date)
        ORDER BY DATE_TRUNC('month', trans_date)
        """
    )
    grouped: dict[str, list[MonthlyTransferBar]] = defaultdict(list)
    for row in rows:
        grouped[str(row["recipient_name"] or "")].append(MonthlyTransferBar(
            month_label=str(row["month_label"] or ""),
            total_sent=as_float(row["total_sent"]),
        ))
    return grouped


async def _fetch_recipients() -> RecipientsResponse:
    rows = await _fetch_recipient_rows()
    monthly_bars = await _fetch_monthly_bars()
    return RecipientsResponse(items=[
        RecipientItem(
            name=str(row["recipient_name"] or ""),
            total_sent=as_float(row["total_sent"]),
            transfer_count=as_int(row["transfer_count"]),
            avg_per_transfer=as_float(row["avg_per_transfer"]),
            last_transfer_date=str(row["last_transfer_date"] or ""),
            monthly_bars=monthly_bars.get(str(row["recipient_name"] or ""), []),
        )
        for row in rows
    ])


@router.get("/recipients", response_model=RecipientsResponse)
async def get_recipients() -> RecipientsResponse:
    return await get_cached("recipients", TTL_HISTORICAL, _fetch_recipients)
