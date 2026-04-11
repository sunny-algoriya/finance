"""Group flat ledger transaction dicts by calendar year, then month (descending)."""

import calendar
from collections import OrderedDict
from typing import Any


def group_ledger_rows_by_year_month(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Rows must be ordered newest-first; each row must include ``txn_date`` (``YYYY-MM-DD``).

    Returns::
        [
            {"year": 2026, "months": [
                {"month": 4, "label": "April 2026", "transactions": [...]},
                ...
            ]},
            ...
        ]
    Years descending; months descending within each year.
    """
    years: OrderedDict[int, OrderedDict[int, list]] = OrderedDict()
    for row in rows:
        td = str(row.get("txn_date") or "")
        parts = td.split("-")
        if len(parts) < 2:
            continue
        try:
            y = int(parts[0])
            m = int(parts[1])
        except ValueError:
            continue
        if y not in years:
            years[y] = OrderedDict()
        if m not in years[y]:
            years[y][m] = []
        years[y][m].append(row)

    out: list[dict[str, Any]] = []
    for y in sorted(years.keys(), reverse=True):
        months_block: list[dict[str, Any]] = []
        for m in sorted(years[y].keys(), reverse=True):
            label = f"{calendar.month_name[int(m)]} {y}"
            months_block.append(
                {
                    "month": int(m),
                    "label": label,
                    "transactions": years[y][m],
                }
            )
        out.append({"year": y, "months": months_block})
    return out
