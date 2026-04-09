from decimal import Decimal

from django.db.models import Count, Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.response import Response

from transactions.models import Transaction, get_person_balance
from transactions.serializers import TransactionSerializer

from .models import Person
from .serializers import PersonSerializer
from base_viewsets import BaseModelViewSet
from transactions.query_helpers import parse_year_month_query_params


LOAN_REPORT_TYPES = (
    Transaction.TransactionType.LOAN_GIVEN,
    Transaction.TransactionType.LOAN_TAKEN,
    Transaction.TransactionType.REPAYMENT_IN,
    Transaction.TransactionType.REPAYMENT_OUT,
)


def _debt_totals_for_qs(qs):
    """Same rules as get_person_balance but on a queryset."""
    given = (
        qs.filter(txn_type=Transaction.TransactionType.LOAN_GIVEN).aggregate(s=Sum("debit"))["s"]
        or Decimal("0")
    )
    taken = (
        qs.filter(txn_type=Transaction.TransactionType.LOAN_TAKEN).aggregate(s=Sum("credit"))["s"]
        or Decimal("0")
    )
    repaid_in = (
        qs.filter(txn_type=Transaction.TransactionType.REPAYMENT_IN).aggregate(s=Sum("credit"))["s"]
        or Decimal("0")
    )
    repaid_out = (
        qs.filter(txn_type=Transaction.TransactionType.REPAYMENT_OUT).aggregate(s=Sum("debit"))["s"]
        or Decimal("0")
    )
    they_owe = given - repaid_in
    you_owe = taken - repaid_out
    return {
        "they_owe_you": they_owe,
        "you_owe_them": you_owe,
        "net": they_owe - you_owe,
    }


def _money_str(d: Decimal) -> str:
    return format(d.quantize(Decimal("0.01")), "f")


class PersonViewSet(BaseModelViewSet):
    serializer_class = PersonSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["name"]
    search_fields = ["name"]

    def get_queryset(self):
        return Person.objects.filter(user=self.request.user)

    @action(detail=True, methods=["get"], url_path="ledger")
    def ledger(self, request, pk=None):
        """
        Credit/debit ledger for this person across your transactions.

        Query: year, month, year_month=YYYY-MM, account=<account_id> (all optional)
        Optional: include_entries=false to return totals only (no transaction lines).
        """
        person = self.get_object()
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

        agg = qs.aggregate(
            total_credit=Sum("credit"),
            total_debit=Sum("debit"),
            txn_count=Count("id"),
        )
        tc = agg["total_credit"] or Decimal("0")
        td = agg["total_debit"] or Decimal("0")

        payload = {
            "person": person.id,
            "person_name": person.name,
            "year": year_int,
            "month": month_int,
            "account": account_id_parsed,
            "total_credit": str(tc),
            "total_debit": str(td),
            "net": str(tc - td),
            "transaction_count": agg["txn_count"],
        }

        if include_entries:
            payload["transactions"] = [
                {
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
                }
                for t in qs.select_related("account").order_by("-txn_date", "-id")
            ]
        else:
            payload["transactions"] = []

        return Response(payload)

    @action(detail=True, methods=["get"], url_path="loan-report")
    def loan_report(self, request, pk=None):
        """
        Loan / debt activity for this person (requires `person` on each transaction).

        Types (txn_type):
        - loan_given — you lent (debit)
        - loan_taken — you borrowed (credit)
        - repayment_in — they repaid you (credit)
        - repayment_out — you repaid them (debit)

        Query:
        - types=comma-separated list or `all` (default all four), e.g. types=loan_given,loan_taken
        - year, month, year_month — filter txn_date
        - account=<id> — filter account

        Response:
        - balance_lifetime: they_owe_you / you_owe_them / net (all debt txns for this person)
        - balance_period: same metrics but only for rows matching filters (if any filter applied)
        - totals_by_type: debit/credit sums and counts per type (filtered queryset)
        - by_type: full transaction payloads grouped by txn_type
        """
        person = self.get_object()
        qp = request.query_params
        year_int, month_int = parse_year_month_query_params(qp)

        types_raw = (qp.get("types") or qp.get("txn_type") or "all").strip().lower()
        allowed = {t.value for t in LOAN_REPORT_TYPES}
        if types_raw == "all":
            selected = list(allowed)
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
                selected = list(allowed)

        qs = Transaction.objects.filter(
            user=request.user,
            person=person,
            txn_type__in=selected,
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
        bal_period = _debt_totals_for_qs(qs)

        totals_by_type = {}
        for tt in selected:
            sub = qs.filter(txn_type=tt)
            cnt = sub.count()
            if tt in (
                Transaction.TransactionType.LOAN_GIVEN,
                Transaction.TransactionType.REPAYMENT_OUT,
            ):
                s = sub.aggregate(x=Sum("debit"))["x"] or Decimal("0")
                totals_by_type[tt] = {
                    "side": "debit",
                    "sum": _money_str(s),
                    "count": cnt,
                }
            else:
                s = sub.aggregate(x=Sum("credit"))["x"] or Decimal("0")
                totals_by_type[tt] = {
                    "side": "credit",
                    "sum": _money_str(s),
                    "count": cnt,
                }

        ctx = {"request": request}
        by_type = {}
        for tt in selected:
            by_type[tt] = TransactionSerializer(
                qs.filter(txn_type=tt).order_by("-txn_date", "-id"),
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
