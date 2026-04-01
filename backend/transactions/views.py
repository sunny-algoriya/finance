from datetime import date
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError

from .models import Transaction, TransactionUpload, SplitGroup, SplitGroupTransaction, SplitItem
from .serializers import (
    TransactionSerializer,
    TransactionUploadSerializer,
    SplitGroupSerializer,
    SplitGroupTransactionSerializer,
    SplitGroupTransactionBulkSerializer,
    SplitItemSerializer,
)
from base_viewsets import BaseModelViewSet
from rest_framework.permissions import IsAuthenticated


def _truthy_query_param(qp, name):
    return str(qp.get(name, "")).lower() in {"1", "true", "yes"}


def _filter_by_hidden_visibility(qs, qp):
    """
    Control which transactions appear based on `hidden` flag.

    Query params (first match wins):
    - show=visible  — only non-hidden (default)
    - show=hidden   — only hidden
    - show=all      — both
    - include_hidden=true — same as show=all (backward compatible)
    """
    show = (qp.get("show") or "").strip().lower()
    if show in ("all", "both", "any"):
        return qs
    if _truthy_query_param(qp, "include_hidden"):
        return qs
    if show in ("hidden", "only_hidden", "true", "1"):
        return qs.filter(hidden=True)
    if show in ("visible", "default", "false", "0", ""):
        return qs.filter(hidden=False)
    raise ValidationError(
        {
            "show": 'Invalid value. Use "visible", "hidden", or "all". '
            'Or use include_hidden=true for all.'
        }
    )


class TransactionViewSet(BaseModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer

    def get_queryset(self):
        qs = Transaction.objects.filter(user=self.request.user)

        qp = self.request.query_params
        qs = _filter_by_hidden_visibility(qs, qp)

        # Description substring (case-insensitive), e.g. ?search=vapi
        desc_q = (
            qp.get("description")
            or qp.get("search")
            or qp.get("q")
            or qp.get("filter[description]")
        )
        if desc_q is not None and str(desc_q).strip():
            qs = qs.filter(description__icontains=str(desc_q).strip())

        # Supported filter params (any of these styles):
        # - ?year=2026&month=3
        # - ?filter_year=2026&filter_month=3
        # - ?filter[year]=2026&filter[month]=3
        # - ?year_month=2026-03  (also supported)
        # - ?start_date=2026-03-01&end_date=2026-03-31
        # - ?filter_start_date=...&filter_end_date=...
        # - ?filter[start_date]=...&filter[end_date]=...
        year_raw = qp.get("year") or qp.get("filter_year") or qp.get("filter[year]")
        month_raw = qp.get("month") or qp.get("filter_month") or qp.get("filter[month]")
        year_month = qp.get("year_month")
        start_date_raw = qp.get("start_date") or qp.get("filter_start_date") or qp.get("filter[start_date]")
        end_date_raw = qp.get("end_date") or qp.get("filter_end_date") or qp.get("filter[end_date]")
        amount_min_raw = qp.get("amount_min") or qp.get("filter_amount_min") or qp.get("filter[amount_min]") or qp.get("min_amount")
        amount_max_raw = qp.get("amount_max") or qp.get("filter_amount_max") or qp.get("filter[amount_max]") or qp.get("max_amount")
        account_id = qp.get("account")
        person_id = qp.get("person")
        type_raw = qp.get("type")
        txn_type = qp.get("txn_type")
        

        if account_id is not None:
            qs = qs.filter(account_id=account_id)

        if person_id is not None:
            qs = qs.filter(person_id=person_id)

        if type_raw is not None and str(type_raw).strip():
            type_value = str(type_raw).strip().lower()
            if type_value in {"all", "both", "any"}:
                pass
            elif type_value in {"credit", "crdit"}:
                qs = qs.filter(credit__gt=0)
            elif type_value == "debit":
                qs = qs.filter(debit__gt=0)
            else:
                raise ValidationError({"type": 'Invalid type. Use "credit", "debit", or "all".'})

        if year_month and (not year_raw or not month_raw):
            # Expect YYYY-MM
            try:
                year_str, month_str = year_month.split("-", 1)
                year_raw = year_str
                month_raw = month_str
            except Exception:
                raise ValidationError({"year_month": 'Invalid. Use "YYYY-MM".'})

        if year_raw is not None:
            try:
                year_int = int(year_raw)
            except Exception:
                raise ValidationError({"year": "Invalid year. Use an integer like 2026."})
            qs = qs.filter(txn_date__year=year_int)

        if month_raw is not None:
            try:
                month_int = int(month_raw)
            except Exception:
                raise ValidationError({"month": "Invalid month. Use an integer 1-12."})
            if month_int < 1 or month_int > 12:
                raise ValidationError({"month": "month must be between 1 and 12."})
            qs = qs.filter(txn_date__month=month_int)

        start_date_obj = None
        if start_date_raw is not None and str(start_date_raw).strip():
            try:
                start_date_obj = date.fromisoformat(str(start_date_raw).strip())
            except Exception:
                raise ValidationError({"start_date": 'Invalid start_date. Use "YYYY-MM-DD".'})
            qs = qs.filter(txn_date__gte=start_date_obj)

        end_date_obj = None
        if end_date_raw is not None and str(end_date_raw).strip():
            try:
                end_date_obj = date.fromisoformat(str(end_date_raw).strip())
            except Exception:
                raise ValidationError({"end_date": 'Invalid end_date. Use "YYYY-MM-DD".'})
            qs = qs.filter(txn_date__lte=end_date_obj)

        if start_date_obj and end_date_obj and start_date_obj > end_date_obj:
            raise ValidationError({"end_date": "end_date must be >= start_date."})

        amount_min = None
        if amount_min_raw is not None and str(amount_min_raw).strip():
            try:
                amount_min = Decimal(str(amount_min_raw).strip())
            except (InvalidOperation, ValueError):
                raise ValidationError({"amount_min": "Invalid amount_min. Use a numeric value."})
            qs = qs.filter(Q(credit__gte=amount_min) | Q(debit__gte=amount_min))

        amount_max = None
        if amount_max_raw is not None and str(amount_max_raw).strip():
            try:
                amount_max = Decimal(str(amount_max_raw).strip())
            except (InvalidOperation, ValueError):
                raise ValidationError({"amount_max": "Invalid amount_max. Use a numeric value."})
            qs = qs.filter(Q(credit__lte=amount_max) | Q(debit__lte=amount_max))

        if amount_min is not None and amount_max is not None and amount_min > amount_max:
            raise ValidationError({"amount_max": "amount_max must be >= amount_min."})

        return qs.order_by("-txn_date", "-id")

    @action(detail=False, methods=["get"], url_path="year-month")
    def year_month(self, request):
        """
        Returns distinct transaction years for the authenticated user.
        """
        qs = Transaction.objects.filter(user=request.user)
        qs = _filter_by_hidden_visibility(qs, request.query_params)
        qs = qs.values("txn_date__year").distinct().order_by("-txn_date__year")

        years = [row["txn_date__year"] for row in qs]
        return Response(years)
        
class TransactionUploadView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        serializer = TransactionUploadSerializer(
            data=request.data,
            context={"request": request}   # required
        )

        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=201)

        return Response(serializer.errors, status=400)


class TransactionUploadListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        uploads = TransactionUpload.objects.filter(user=request.user).order_by("-uploaded_at")
        serializer = TransactionUploadSerializer(uploads, many=True, context={"request": request})
        return Response(serializer.data)


class SplitGroupViewSet(BaseModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SplitGroupSerializer

    def get_queryset(self):
        return SplitGroup.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["get"], url_path="debit-transactions")
    def debit_transactions(self, request, pk=None):
        group = self.get_object()

        # Returns transactions for selection within this group's date range.
        # Default excludes transactions already linked to this group.
        include_added = str(request.query_params.get("include_added", "")).lower() in {
            "1",
            "true",
            "yes",
        }

        qs = Transaction.objects.filter(
            user=request.user,
            debit__gt=0,
            txn_date__gte=group.start_date,
            txn_date__lte=group.end_date,
        )
        qs = _filter_by_hidden_visibility(qs, request.query_params)

        if not include_added:
            qs = qs.exclude(split_groups__group=group)

        qs = qs.distinct().order_by("-txn_date", "-id")

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = TransactionSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)

        serializer = TransactionSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    


class SplitGroupTransactionViewSet(BaseModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SplitGroupTransactionSerializer

    def get_queryset(self):
        return SplitGroupTransaction.objects.filter(group__user=self.request.user).order_by("-id")

    @action(detail=False, methods=["post"], url_path="bulk-add")
    def bulk_add(self, request):
        serializer = SplitGroupTransactionBulkSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        group = serializer.validated_data["group"]
        transactions = serializer.validated_data["transactions"]

        created = []
        for txn in transactions:
            obj, _ = SplitGroupTransaction.objects.get_or_create(group=group, transaction=txn)
            created.append(obj)

        data = SplitGroupTransactionSerializer(
            created,
            many=True,
            context={"request": request},
        ).data
        return Response(data, status=201)


class SplitItemViewSet(BaseModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SplitItemSerializer

    def get_queryset(self):
        qs = SplitItem.objects.filter(transaction__user=self.request.user).order_by("-id")

        # Optional filters:
        # - ?transaction=<transaction_id>
        # - ?group=<split_group_id>  (only items for transactions attached to that group)
        transaction_id = self.request.query_params.get("transaction")
        group_id = self.request.query_params.get("group")

        if transaction_id:
            qs = qs.filter(transaction_id=transaction_id)

        if group_id:
            qs = qs.filter(transaction__split_groups__group_id=group_id)

        return qs.distinct()

