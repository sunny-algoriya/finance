from decimal import Decimal

from django.db.models import Count, Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.response import Response

from transactions.models import Transaction

from .models import Person
from .serializers import PersonSerializer
from base_viewsets import BaseModelViewSet
from transactions.query_helpers import parse_year_month_query_params


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
                    "description": t.description,
                    "credit": str(t.credit),
                    "debit": str(t.debit),
                    "amount": str(t.credit if t.credit > 0 else t.debit),
                    "type": "credit" if t.credit > 0 else "debit",
                    "account": t.account_id,
                    "account_name": t.account.name,
                }
                for t in qs.select_related("account").order_by("txn_date", "id")
            ]
        else:
            payload["transactions"] = []

        return Response(payload)
