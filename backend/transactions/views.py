import re
from collections import OrderedDict
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError

from .models import Transaction, TransactionUpload, SplitGroup, SplitGroupTransaction, SplitItem
from .query_helpers import parse_year_month_query_params
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


# Standalone numeric tokens (word boundaries — avoids "s1x" → "1").
_DESC_QUERY_NUM_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def _is_pure_numeric_desc_query(desc_s: str) -> bool:
    """True when the whole query is only a number (e.g. "600" or "12.50")."""
    s = str(desc_s).strip()
    if not s:
        return False
    try:
        Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return False
    return True


def _decimal_amounts_in_description_query(desc_s: str):
    """Unique Decimal amounts (2dp) for standalone numeric tokens in the search string."""
    seen = set()
    out = []
    for m in _DESC_QUERY_NUM_RE.finditer(desc_s):
        try:
            amt = Decimal(m.group()).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            continue
        if amt not in seen:
            seen.add(amt)
            out.append(amt)
    return out


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

        # Description substring (not remark). e.g. ?description=lunch
        # - Pure number (?description=600): match description contains "600" OR that amount.
        # - Text + number (?description=paytm.s1x+25): require BOTH description contains
        #   the full query AND credit/debit equals that amount (no unrelated amount-only rows).
        desc_q = qp.get("description") or qp.get("filter[description]")
        if desc_q is not None and str(desc_q).strip():
            desc_s = str(desc_q).strip()
            amounts = _decimal_amounts_in_description_query(desc_s)
            if _is_pure_numeric_desc_query(desc_s):
                try:
                    only_amt = Decimal(desc_s).quantize(Decimal("0.01"))
                except (InvalidOperation, ValueError):
                    desc_filter = Q(description__icontains=desc_s)
                else:
                    desc_filter = Q(description__icontains=desc_s) | (
                        Q(credit=only_amt) | Q(debit=only_amt)
                    )
            elif amounts:
                amount_q = Q()
                for amt in amounts:
                    amount_q |= Q(credit=amt) | Q(debit=amt)
                desc_filter = Q(description__icontains=desc_s) & amount_q
            else:
                desc_filter = Q(description__icontains=desc_s)
            qs = qs.filter(desc_filter)

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
        amount_exact_raw = (
            qp.get("amount")
            or qp.get("filter_amount")
            or qp.get("filter[amount]")
            or qp.get("exact_amount")
        )
        account_id = qp.get("account")
        person_id = qp.get("person")
        type_raw = qp.get("type")
        txn_type_raw = qp.get("txn_type")

        if account_id is not None:
            qs = qs.filter(account_id=account_id)

        if person_id is not None:
            qs = qs.filter(person_id=person_id)

        # Person linked vs unlinked: ?ispersonthere=linked|unlinked|all (omit = all)
        ispersonthere_raw = (
            qp.get("ispersonthere")
            or qp.get("filter_ispersonthere")
            or qp.get("filter[ispersonthere]")
        )
        if ispersonthere_raw is not None and str(ispersonthere_raw).strip():
            ip = str(ispersonthere_raw).strip().lower()
            if ip in {"all", "both", "any"}:
                pass
            elif ip in {"linked", "true", "1", "yes"}:
                qs = qs.filter(person__isnull=False)
            elif ip in {"unlinked", "false", "0", "no"}:
                qs = qs.filter(person__isnull=True)
            else:
                raise ValidationError(
                    {
                        "ispersonthere": 'Invalid. Use "linked", "unlinked", or "all".',
                    }
                )

        # Remark present vs empty: ?isremarkthere=linked|unlinked|all
        isremarkthere_raw = (
            qp.get("isremarkthere")
            or qp.get("filter_isremarkthere")
            or qp.get("filter[isremarkthere]")
        )
        if isremarkthere_raw is not None and str(isremarkthere_raw).strip():
            ir = str(isremarkthere_raw).strip().lower()
            if ir in {"all", "both", "any"}:
                pass
            elif ir in {"linked", "true", "1", "yes"}:
                qs = qs.exclude(remark__isnull=True).exclude(remark="")
            elif ir in {"unlinked", "false", "0", "no"}:
                qs = qs.filter(Q(remark__isnull=True) | Q(remark=""))
            else:
                raise ValidationError(
                    {
                        "isremarkthere": 'Invalid. Use "linked", "unlinked", or "all".',
                    }
                )

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

        if txn_type_raw is not None and str(txn_type_raw).strip():
            tt = str(txn_type_raw).strip()
            allowed = {c[0] for c in Transaction.TransactionType.choices}
            if tt not in allowed:
                raise ValidationError(
                    {
                        "txn_type": f'Invalid txn_type. Use one of: {", ".join(sorted(allowed))}.',
                    }
                )
            qs = qs.filter(txn_type=tt)

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

        if amount_exact_raw is not None and str(amount_exact_raw).strip():
            try:
                amt_exact = Decimal(str(amount_exact_raw).strip()).quantize(Decimal("0.01"))
            except (InvalidOperation, ValueError):
                raise ValidationError({"amount": "Invalid amount. Use a numeric value for exact match."})
            qs = qs.filter(Q(credit=amt_exact) | Q(debit=amt_exact))

        return qs.order_by("-txn_date", "-id")

    def _aggregate_totals_money_strings(self, queryset):
        agg = queryset.aggregate(
            total_credit=Sum("credit"),
            total_debit=Sum("debit"),
        )
        tc = agg["total_credit"] or Decimal("0")
        td = agg["total_debit"] or Decimal("0")

        def _money_str(d: Decimal) -> str:
            q = d.quantize(Decimal("0.01"))
            return format(q, "f")

        return _money_str(tc), _money_str(td)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        total_credit, total_debit = self._aggregate_totals_money_strings(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            paginated = self.get_paginated_response(serializer.data)
            d = paginated.data
            return Response(
                OrderedDict(
                    [
                        ("count", d["count"]),
                        ("next", d["next"]),
                        ("previous", d["previous"]),
                        ("total_credit", total_credit),
                        ("total_debit", total_debit),
                        ("results", d["results"]),
                    ]
                )
            )

        serializer = self.get_serializer(queryset, many=True)
        return Response(
            OrderedDict(
                [
                    ("total_credit", total_credit),
                    ("total_debit", total_debit),
                    ("results", serializer.data),
                ]
            )
        )

    @action(detail=False, methods=["post"], url_path="bulk-update")
    def bulk_update(self, request):
        """
        Bulk update selected transactions for current user.
        Body:
          {
            "ids": [1,2,3],
            "person": <person_id|null>,      # optional
            "category": <category_id|null>,  # optional
            "txn_type": <string>             # optional
          }
        """
        raw_ids = request.data.get("ids")
        if not isinstance(raw_ids, list) or len(raw_ids) == 0:
            raise ValidationError({"ids": "Provide a non-empty ids array."})

        ids = [str(v) for v in raw_ids]
        qs = Transaction.objects.filter(user=request.user, id__in=ids)
        found_ids = {str(x) for x in qs.values_list("id", flat=True)}
        missing = [v for v in ids if v not in found_ids]
        if missing:
            raise ValidationError({"ids": f"Some ids are invalid for this user: {missing}"})

        updates = {}
        if "person" in request.data:
            updates["person"] = request.data.get("person")
        if "category" in request.data:
            updates["category"] = request.data.get("category")
        if "txn_type" in request.data:
            updates["txn_type"] = request.data.get("txn_type")
        if not updates:
            raise ValidationError({"detail": "Provide at least one field: person, category, or txn_type."})

        updated = []
        for txn in qs:
            serializer = self.get_serializer(
                txn,
                data=updates,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            updated.append(serializer.save())

        return Response(
            self.get_serializer(updated, many=True, context={"request": request}).data
        )

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Bulk delete selected transactions for current user.
        Body: { "ids": [1,2,3] }
        """
        raw_ids = request.data.get("ids")
        if not isinstance(raw_ids, list) or len(raw_ids) == 0:
            raise ValidationError({"ids": "Provide a non-empty ids array."})

        ids = [str(v) for v in raw_ids]
        qs = Transaction.objects.filter(user=request.user, id__in=ids)
        found_ids = {str(x) for x in qs.values_list("id", flat=True)}
        missing = [v for v in ids if v not in found_ids]
        if missing:
            raise ValidationError({"ids": f"Some ids are invalid for this user: {missing}"})

        deleted_count, _ = qs.delete()
        return Response({"deleted": deleted_count})

    @action(detail=False, methods=["get"], url_path="self-transfer")
    def self_transfer(self, request):
        """
        List internal transfers: pairs where one account has a debit and another has
        a credit for the same amount on the same date (same user, different accounts).

        Optional: year, month, year_month (filter txn_date), show / include_hidden.
        Optional: strict_transfer=true — only rows with txn_type=transfer.
        """
        user = request.user
        qp = request.query_params
        qs_base = Transaction.objects.filter(user=user)
        qs_base = _filter_by_hidden_visibility(qs_base, qp)

        year_int, month_int = parse_year_month_query_params(qp)
        if year_int is not None:
            qs_base = qs_base.filter(txn_date__year=year_int)
        if month_int is not None:
            qs_base = qs_base.filter(txn_date__month=month_int)

        strict = _truthy_query_param(qp, "strict_transfer")

        debits = list(
            qs_base.filter(credit=0, debit__gt=0)
            .select_related("account")
            .order_by("txn_date", "id")
        )
        credits = list(
            qs_base.filter(debit=0, credit__gt=0)
            .select_related("account")
            .order_by("txn_date", "id")
        )

        used_credit_ids = set()
        pairs = []
        ctx = {"request": request}

        for d in debits:
            for c in credits:
                if c.id in used_credit_ids:
                    continue
                if d.txn_date != c.txn_date:
                    continue
                if d.account_id == c.account_id:
                    continue
                da = d.debit.quantize(Decimal("0.01"))
                ca = c.credit.quantize(Decimal("0.01"))
                if da != ca:
                    continue
                if strict:
                    tt = Transaction.TransactionType.TRANSFER
                    if d.txn_type != tt or c.txn_type != tt:
                        continue

                used_credit_ids.add(c.id)
                pairs.append(
                    {
                        "txn_date": d.txn_date,
                        "amount": format(da, "f"),
                        "from_account": d.account_id,
                        "from_account_name": d.account.name,
                        "to_account": c.account_id,
                        "to_account_name": c.account.name,
                        "debit_transaction": TransactionSerializer(d, context=ctx).data,
                        "credit_transaction": TransactionSerializer(c, context=ctx).data,
                    }
                )
                break

        # Newest pairs first (by date then by debit id)
        pairs.sort(key=lambda p: (p["txn_date"], p["debit_transaction"]["id"]), reverse=True)

        return Response({"count": len(pairs), "results": pairs})

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

