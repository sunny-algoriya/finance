from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework.decorators import action
from rest_framework.response import Response

from transactions.ledger_grouping import group_ledger_rows_by_year_month
from transactions.models import Transaction
from transactions.query_helpers import parse_year_month_query_params

from .models import Account
from .serializers import AccountSerializer
from base_viewsets import BaseModelViewSet


class AccountViewSet(BaseModelViewSet):
    serializer_class = AccountSerializer

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user)

    @action(detail=True, methods=["get"], url_path="ledger")
    def ledger(self, request, pk=None):
        """
        Credit/debit ledger for this account (all transactions on the account).

        Query: year, month, year_month=YYYY-MM (optional filters on txn_date)
        Optional: include_entries=false for totals only (no transaction lines).

        Response includes ``by_year_month``: years (desc), months (desc), each with
        ``transactions`` for that month (same rows as flat ``transactions``, grouped).
        """
        account = self.get_object()
        qp = request.query_params
        year_int, month_int = parse_year_month_query_params(qp)

        include_entries = str(qp.get("include_entries", "true")).lower() not in {
            "0",
            "false",
            "no",
        }

        qs = Transaction.objects.filter(user=request.user, account=account)

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
            "account": account.id,
            "account_name": account.name,
            "year": year_int,
            "month": month_int,
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
                    "person": t.person_id,
                    "person_name": t.person.name if t.person_id else "",
                    "account": t.account_id,
                    "account_name": account.name,
                }
                for t in qs.select_related("person", "account").order_by("-txn_date", "-id")
            ]
            payload["by_year_month"] = group_ledger_rows_by_year_month(payload["transactions"])
        else:
            payload["transactions"] = []
            payload["by_year_month"] = []

        return Response(payload)
