from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from transactions.models import SplitItem


def parse_year_month_query_params(qp):
    """
    Shared for ledger-style endpoints. Supports year, month, year_month=YYYY-MM,
    and filter_year / filter_month / filter[year] / filter[month].
    """
    year_raw = qp.get("year") or qp.get("filter_year") or qp.get("filter[year]")
    month_raw = qp.get("month") or qp.get("filter_month") or qp.get("filter[month]")
    year_month = qp.get("year_month")

    if year_month and (not year_raw or not month_raw):
        try:
            ys, ms = year_month.split("-", 1)
            year_raw = ys
            month_raw = ms
        except Exception:
            raise ValidationError({"year_month": 'Invalid. Use "YYYY-MM".'})

    year_int = month_int = None
    if year_raw is not None:
        try:
            year_int = int(year_raw)
        except Exception:
            raise ValidationError({"year": "Invalid year. Use an integer like 2026."})
    if month_raw is not None:
        try:
            month_int = int(month_raw)
        except Exception:
            raise ValidationError({"month": "Invalid month. Use an integer 1-12."})
        if month_int < 1 or month_int > 12:
            raise ValidationError({"month": "month must be between 1 and 12."})

    return year_int, month_int


def group_person_balance(group, person):
    return (
        SplitItem.objects
        .filter(
            transaction__split_groups__group=group,
            person=person
        )
        .aggregate(s=Sum("amount"))["s"] or 0
    )


def group_summary(group):
    data = []

    for person in group.members.all():
        amt = group_person_balance(group, person)
        data.append({
            "person": person.name,
            "owes": amt
        })

    return data