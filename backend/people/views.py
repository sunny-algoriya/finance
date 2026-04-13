from decimal import Decimal

from django.http import HttpResponse
from django.db.models import Count, F, Sum
from django.db.models.functions import Lower
from category.models import Category
from django_filters.rest_framework import DjangoFilterBackend
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.response import Response

from transactions.ledger_grouping import group_ledger_rows_by_year_month
from transactions.models import Transaction, get_person_balance
from transactions.serializers import TransactionSerializer

from .models import Person
from .serializers import PersonSerializer
from base_viewsets import BaseModelViewSet
from transactions.query_helpers import parse_year_month_query_params


PERSONAL_REPORT_TYPES = {c[0] for c in Transaction.PersonalType.choices}


def _personal_totals_for_qs(qs):
    """Same rules as get_person_balance but on a filtered queryset."""
    gave = (
        qs.filter(personal_type=Transaction.PersonalType.GAVE).aggregate(s=Sum("debit"))["s"]
        or Decimal("0")
    )
    got = (
        qs.filter(personal_type=Transaction.PersonalType.GOT).aggregate(s=Sum("credit"))["s"]
        or Decimal("0")
    )
    settled = (
        qs.filter(personal_type=Transaction.PersonalType.SETTLE).aggregate(
            s=Sum(F("credit") + F("debit"))
        )["s"]
        or Decimal("0")
    )
    balance = got - gave - settled
    return {
        "gave": gave,
        "got": got,
        "settled": settled,
        "balance": balance,
    }


def _money_str(d: Decimal) -> str:
    return format(d.quantize(Decimal("0.01")), "f")


def _ledger_category_breakdown(qs_base, user):
    """
    Distinct categories in qs_base with counts and credit/debit totals.
    Uncategorized rows use id/name null.
    """
    rows = (
        qs_base.values("category_id")
        .annotate(
            transaction_count=Count("id"),
            total_credit=Sum("credit"),
            total_debit=Sum("debit"),
        )
    )
    out = []
    for row in rows:
        cid = row["category_id"]
        tc = row["total_credit"] or Decimal("0")
        td = row["total_debit"] or Decimal("0")
        name = None
        if cid is not None:
            cat = Category.objects.filter(pk=cid, user=user).only("name").first()
            name = cat.name if cat else None
        out.append(
            {
                "id": cid,
                "name": name,
                "transaction_count": row["transaction_count"],
                "total_credit": _money_str(tc),
                "total_debit": _money_str(td),
                "net": _money_str(tc - td),
            }
        )
    out.sort(key=lambda x: (x["name"] is None, (x["name"] or "").lower()))
    return out


def _ledger_txn_row_dict(t):
    return {
        "id": t.id,
        "txn_date": t.txn_date,
        "remark": t.remark,
        "description": t.description,
        "credit": str(t.credit),
        "debit": str(t.debit),
        "amount": str(t.credit if t.credit > 0 else t.debit),
        "type": "credit" if t.credit > 0 else "debit",
        "account": t.account_id,
        "account_name": t.account.name,
        "category": t.category_id,
        "category_name": t.category.name if t.category_id else None,
    }


def _parse_bool_flag(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes")


class PersonViewSet(BaseModelViewSet):
    serializer_class = PersonSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["name"]
    search_fields = ["name"]

    def get_queryset(self):
        return Person.objects.filter(user=self.request.user).order_by(Lower("name"), "name")

    def _build_ledger_payload(self, request, person):
        qp = request.query_params
        year_int, month_int = parse_year_month_query_params(qp)

        include_entries = str(qp.get("include_entries", "true")).lower() not in {
            "0",
            "false",
            "no",
        }

        qs = Transaction.objects.filter(user=request.user, person=person)
        account_id_raw = qp.get("account")
        account_id_parsed = None
        if account_id_raw is not None:
            try:
                account_id_parsed = int(account_id_raw)
            except (TypeError, ValueError):
                raise ValidationError({"account": "Invalid account id."})
            qs = qs.filter(account_id=account_id_parsed)

        if year_int is not None:
            qs = qs.filter(txn_date__year=year_int)
        if month_int is not None:
            qs = qs.filter(txn_date__month=month_int)

        qs_base = qs
        categories_breakdown = _ledger_category_breakdown(qs_base, request.user)

        category_raw = qp.get("category")
        category_filter_echo = None
        if category_raw is not None and str(category_raw).strip() != "":
            s = str(category_raw).strip().lower()
            if s in ("none", "null", "uncategorized"):
                qs = qs_base.filter(category__isnull=True)
                category_filter_echo = "none"
            else:
                try:
                    cid = int(category_raw)
                except (TypeError, ValueError):
                    raise ValidationError(
                        {
                            "category": 'Invalid. Use a category id, or "none" for uncategorized.',
                        }
                    )
                qs = qs_base.filter(category_id=cid)
                category_filter_echo = cid

        agg = qs.aggregate(
            total_credit=Sum("credit"),
            total_debit=Sum("debit"),
            txn_count=Count("id"),
        )
        tc = agg["total_credit"] or Decimal("0")
        td = agg["total_debit"] or Decimal("0")
        gross = tc + td

        group_by_category = _parse_bool_flag(qp.get("group_by_category"), default=False)

        payload = {
            "person": person.id,
            "person_name": person.name,
            "year": year_int,
            "month": month_int,
            "account": account_id_parsed,
            "category": category_filter_echo,
            "total_credit": str(tc),
            "total_debit": str(td),
            "net": str(tc - td),
            "gross_total": str(gross),
            "transaction_count": agg["txn_count"],
            "categories": categories_breakdown,
        }

        if group_by_category and include_entries:
            for block in payload["categories"]:
                cid = block["id"]
                if cid is None:
                    sub = qs_base.filter(category__isnull=True)
                else:
                    sub = qs_base.filter(category_id=cid)
                block["transactions"] = [
                    _ledger_txn_row_dict(t)
                    for t in sub.select_related("account", "category").order_by(
                        "-txn_date", "-id"
                    )
                ]

        if include_entries:
            payload["transactions"] = [
                _ledger_txn_row_dict(t)
                for t in qs.select_related("account", "category").order_by("-txn_date", "-id")
            ]
            payload["by_year_month"] = group_ledger_rows_by_year_month(payload["transactions"])
        else:
            payload["transactions"] = []
            payload["by_year_month"] = []
        return payload

    @action(detail=True, methods=["get"], url_path="ledger")
    def ledger(self, request, pk=None):
        """
        Credit/debit ledger for this person across your transactions.

        Query: year, month, year_month=YYYY-MM, account=<account_id> (all optional)
        Optional: category=<id> or category=none (uncategorized) to filter rows and totals.
        Optional: group_by_category=true to include a transactions list under each entry in
        categories (distinct categories for the period; still uses category filter for top-level
        transactions and totals).
        Optional: include_entries=false to return totals only (no transaction lines).

        Response includes ``by_year_month``: years (desc), each with months (desc) and
        ``transactions`` lists (same rows as top-level ``transactions``, grouped).

        Totals ``total_credit``, ``total_debit``, ``net``, and ``gross_total`` (credit + debit)
        are computed on the same filtered queryset as ``transactions`` (year, month, category,
        account filters).
        """
        person = self.get_object()
        payload = self._build_ledger_payload(request, person)
        return Response(payload)

    @action(detail=True, methods=["get"], url_path="ledger-pdf")
    def ledger_pdf(self, request, pk=None):
        person = self.get_object()
        payload = self._build_ledger_payload(request, person)

        response = HttpResponse(content_type="application/pdf")
        safe_name = "".join(ch if ch.isalnum() else "_" for ch in person.name).strip("_")
        if not safe_name:
            safe_name = f"person_{person.id}"
        response["Content-Disposition"] = f'attachment; filename="ledger_{safe_name}.pdf"'

        p = canvas.Canvas(response, pagesize=A4)
        _, height = A4
        x = 40
        y = height - 50

        def write_line(text, step=16, font="Helvetica", size=10):
            nonlocal y
            if y <= 40:
                p.showPage()
                y = height - 50
            p.setFont(font, size)
            p.drawString(x, y, str(text))
            y -= step

        write_line("Person Ledger Report", step=20, font="Helvetica-Bold", size=14)
        write_line(f"Person: {payload['person_name']}", font="Helvetica-Bold")
        write_line(
            f"Filters: year={payload['year'] or 'all'}, month={payload['month'] or 'all'}, "
            f"account={payload['account'] or 'all'}, category={payload['category'] or 'all'}",
            step=14,
        )
        write_line("", step=8)
        write_line(f"Total credit: {payload['total_credit']}")
        write_line(f"Total debit: {payload['total_debit']}")
        write_line(f"Net: {payload['net']}")
        write_line(f"Gross total: {payload['gross_total']}")
        write_line(f"Transaction count: {payload['transaction_count']}")
        write_line("", step=10)
        write_line("Transactions", font="Helvetica-Bold")

        transactions = payload.get("transactions", [])
        if not transactions:
            write_line("No transactions for selected filters.")
        else:
            for idx, row in enumerate(transactions, start=1):
                category_name = row.get("category_name") or "Uncategorized"
                write_line(
                    f"{idx}. {row.get('txn_date')} | {row.get('type', '').upper()} | "
                    f"{row.get('amount')} | {row.get('account_name')} | {category_name}",
                    step=12,
                    size=9,
                )
                description = row.get("description") or ""
                remark = row.get("remark") or ""
                if description:
                    write_line(f"   Desc: {description}", step=11, size=9)
                if remark:
                    write_line(f"   Remark: {remark}", step=11, size=9)
                write_line("", step=6)

        p.save()
        return response

    @action(detail=True, methods=["get"], url_path="ledger-xlsx")
    def ledger_xlsx(self, request, pk=None):
        person = self.get_object()
        payload = self._build_ledger_payload(request, person)

        wb = Workbook()
        ws = wb.active
        ws.title = "Ledger"

        ws.append(["Person Ledger Report"])
        ws.append(["Person", payload["person_name"]])
        ws.append(
            [
                "Filters",
                f"year={payload['year'] or 'all'}, month={payload['month'] or 'all'}, "
                f"account={payload['account'] or 'all'}, category={payload['category'] or 'all'}",
            ]
        )
        ws.append([])
        ws.append(["Total credit", payload["total_credit"]])
        ws.append(["Total debit", payload["total_debit"]])
        ws.append(["Net", payload["net"]])
        ws.append(["Gross total", payload["gross_total"]])
        ws.append(["Transaction count", payload["transaction_count"]])
        ws.append([])
        ws.append(
            [
                "Txn Date",
                "Type",
                "Credit",
                "Debit",
                "Amount",
                "Account",
                "Category",
                "Description",
                "Remark",
            ]
        )

        for row in payload.get("transactions", []):
            ws.append(
                [
                    str(row.get("txn_date") or ""),
                    str(row.get("type") or ""),
                    str(row.get("credit") or "0"),
                    str(row.get("debit") or "0"),
                    str(row.get("amount") or "0"),
                    str(row.get("account_name") or ""),
                    str(row.get("category_name") or "Uncategorized"),
                    str(row.get("description") or ""),
                    str(row.get("remark") or ""),
                ]
            )

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        safe_name = "".join(ch if ch.isalnum() else "_" for ch in person.name).strip("_")
        if not safe_name:
            safe_name = f"person_{person.id}"
        response["Content-Disposition"] = f'attachment; filename="ledger_{safe_name}.xlsx"'
        wb.save(response)
        return response

    @action(detail=True, methods=["get"], url_path="loan-report")
    def loan_report(self, request, pk=None):
        """
        Personal-type activity for this person (requires `person` on each transaction).

        Types (personal_type):
        - gave — you paid for them / lent (debit)
        - got — they paid you / you borrowed (credit)
        - settle — repayment (either side)

        Query:
        - types=comma-separated list or `all` (default all three), e.g. types=gave,got
        - year, month, year_month — filter txn_date
        - account=<id> — filter account

        Response:
        - balance_lifetime: gave / got / settled / balance (all rows with personal_type for this person)
        - balance_period: same metrics for rows matching filters
        - totals_by_type: sums and counts per personal_type (filtered queryset)
        - by_type: full transaction payloads grouped by personal_type
        """
        person = self.get_object()
        qp = request.query_params
        year_int, month_int = parse_year_month_query_params(qp)

        types_raw = (qp.get("types") or qp.get("personal_type") or "all").strip().lower()
        allowed = PERSONAL_REPORT_TYPES
        if types_raw == "all":
            selected = sorted(allowed)
        else:
            selected = []
            for part in types_raw.split(","):
                p = part.strip()
                if not p:
                    continue
                if p not in allowed:
                    raise ValidationError(
                        {
                            "types": f'Invalid "{p}". Use: {", ".join(sorted(allowed))}, or all.'
                        }
                    )
                if p not in selected:
                    selected.append(p)
            if not selected:
                selected = sorted(allowed)

        qs = Transaction.objects.filter(
            user=request.user,
            person=person,
            personal_type__isnull=False,
            personal_type__in=selected,
        )

        account_id_raw = qp.get("account")
        if account_id_raw is not None:
            try:
                qs = qs.filter(account_id=int(account_id_raw))
            except (TypeError, ValueError):
                raise ValidationError({"account": "Invalid account id."})

        if year_int is not None:
            qs = qs.filter(txn_date__year=year_int)
        if month_int is not None:
            qs = qs.filter(txn_date__month=month_int)

        qs = qs.select_related("account", "category").order_by("-txn_date", "-id")

        bal_life = get_person_balance(person)
        bal_period = _personal_totals_for_qs(qs)

        totals_by_type = {}

        for pt in selected:
            sub = qs.filter(personal_type=pt)
            cnt = sub.count()
            if pt == Transaction.PersonalType.GAVE:
                s = sub.aggregate(x=Sum("debit"))["x"] or Decimal("0")
                totals_by_type[pt] = {
                    "side": "debit",
                    "sum": _money_str(s),
                    "count": cnt,
                }
            elif pt == Transaction.PersonalType.GOT:
                s = sub.aggregate(x=Sum("credit"))["x"] or Decimal("0")
                totals_by_type[pt] = {
                    "side": "credit",
                    "sum": _money_str(s),
                    "count": cnt,
                }
            else:
                s = sub.aggregate(x=Sum(F("credit") + F("debit")))["x"] or Decimal("0")
                totals_by_type[pt] = {
                    "side": "settle",
                    "sum": _money_str(s),
                    "count": cnt,
                }

        ctx = {"request": request}
        by_type = {}
        for pt in selected:
            by_type[pt] = TransactionSerializer(
                qs.filter(personal_type=pt).order_by("-txn_date", "-id"),
                many=True,
                context=ctx,
            ).data

        return Response(
            {
                "person": PersonSerializer(person, context=ctx).data,
                "filters": {
                    "year": year_int,
                    "month": month_int,
                    "types": selected,
                    "account": qp.get("account"),
                },
                "summary": {
                    "balance_lifetime": {k: _money_str(v) for k, v in bal_life.items()},
                    "balance_period": {k: _money_str(v) for k, v in bal_period.items()},
                    "totals_by_type": totals_by_type,
                },
                "by_type": by_type,
            }
        )
