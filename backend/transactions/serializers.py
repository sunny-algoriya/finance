from rest_flex_fields import FlexFieldsModelSerializer
from rest_framework import serializers
from decimal import Decimal

from .models import (
    Transaction,
    TransactionUpload,
    SplitGroup,
    SplitGroupTransaction,
    SplitItem,
)
from accounts.models import Account
from people.models import Person
from people.serializers import PersonSerializer
from category.models import Category


class TransactionSerializer(FlexFieldsModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all())
    person = serializers.PrimaryKeyRelatedField(
        queryset=Person.objects.all(), allow_null=True, required=False
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), allow_null=True, required=False
    )
    hash = serializers.CharField(read_only=True)
    credit = serializers.DecimalField(max_digits=12, decimal_places=2, write_only=True, required=False)
    debit = serializers.DecimalField(max_digits=12, decimal_places=2, write_only=True, required=False)
    amount = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    split_items = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "user",
            "account",
            "person",
            "category",
            "txn_date",
            "description",
            "credit",
            "debit",
            "hash",
            "amount",
            "type",
            "txn_type",
            "split_items",
            "hidden",
        ]
        expandable_fields = {
            "split_items": ("transactions.serializers.SplitItemSerializer", {"many": True}),
        }

    def get_amount(self, obj):
        return obj.credit if obj.credit > 0 else obj.debit

    def get_type(self, obj):
        return "credit" if obj.credit > 0 else "debit"

    def validate(self, attrs):
        # Allow PATCH/POST using either:
        # - {credit, debit}
        # - {amount, type} where type in {"credit","debit"}
        raw_amount = self.initial_data.get("amount") if hasattr(self, "initial_data") else None
        raw_type = self.initial_data.get("type") if hasattr(self, "initial_data") else None

        if raw_amount is not None or raw_type is not None:
            if raw_amount is None or raw_type is None:
                raise serializers.ValidationError(
                    {"amount": "When using amount/type, you must provide both fields."}
                )

            try:
                amount = Decimal(str(raw_amount))
            except Exception:
                raise serializers.ValidationError({"amount": "Invalid amount."})

            txn_type = str(raw_type).strip().lower()
            if txn_type not in {"credit", "debit"}:
                raise serializers.ValidationError({"type": 'Type must be "credit" or "debit".'})

            if amount <= 0:
                raise serializers.ValidationError({"amount": "Amount must be greater than 0."})

            if txn_type == "credit":
                attrs["credit"] = amount
                attrs["debit"] = Decimal("0")
            else:
                attrs["debit"] = amount
                attrs["credit"] = Decimal("0")

        # Support partial updates by falling back to instance values.
        credit = attrs.get("credit", getattr(self.instance, "credit", Decimal("0")))
        debit = attrs.get("debit", getattr(self.instance, "debit", Decimal("0")))

        credit_positive = credit > 0
        debit_positive = debit > 0

        if credit_positive == debit_positive:
            raise serializers.ValidationError(
                {"amount": "Provide exactly one of credit or debit with a value greater than 0."}
            )

        return attrs

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return Transaction.objects.create(**validated_data)

    def validate_account(self, account):
        request_user = self.context["request"].user
        if account.user_id != request_user.id:
            raise serializers.ValidationError("Invalid account")
        return account

    def validate_person(self, person):
        if person is None:
            return person
        request_user = self.context["request"].user
        if person.user_id != request_user.id:
            raise serializers.ValidationError("Invalid person")
        return person

    def validate_category(self, category):
        if category is None:
            return category
        request_user = self.context["request"].user
        if category.user_id != request_user.id:
            raise serializers.ValidationError("Invalid category")
        return category


class TransactionUploadSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = TransactionUpload
        fields = [
            "id",
            "file",
            "account",
            "uploaded_at",
            "total_rows",
            "created_count",
            "duplicate_count",
            "error_count",
            "processed",
        ]
        read_only_fields = [
            "uploaded_at",
            "total_rows",
            "created_count",
            "duplicate_count",
            "error_count",
            "processed",
        ]

    def validate_account(self, account):
        if account.user != self.context["request"].user:
            raise serializers.ValidationError("Invalid account")
        return account


class SplitGroupSerializer(FlexFieldsModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    members = serializers.PrimaryKeyRelatedField(queryset=Person.objects.all(), many=True)

    class Meta:
        model = SplitGroup
        fields = ["id", "user", "name", "members", "start_date", "end_date"]
        expandable_fields = {
            "members": (PersonSerializer, {"many": True}),
        }

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "end_date must be >= start_date."})
        return attrs

    def validate_members(self, members):
        request_user = self.context["request"].user
        invalid = [member.id for member in members if member.user_id != request_user.id]
        if invalid:
            raise serializers.ValidationError("All members must belong to the logged-in user.")
        return members


class SplitGroupTransactionSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = SplitGroupTransaction
        fields = ["id", "group", "transaction"]
        expandable_fields = {
            "group": (SplitGroupSerializer, {"many": False}),
            "transaction": (TransactionSerializer, {"many": False}),
        }

    def validate_group(self, group):
        request_user = self.context["request"].user
        if group.user_id != request_user.id:
            raise serializers.ValidationError("Invalid group")
        return group

    def validate_transaction(self, transaction):
        request_user = self.context["request"].user
        if transaction.user_id != request_user.id:
            raise serializers.ValidationError("Invalid transaction")
        return transaction
    



class SplitGroupTransactionBulkSerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=SplitGroup.objects.all())
    transactions = serializers.PrimaryKeyRelatedField(
        queryset=Transaction.objects.all(),
        many=True,
        allow_empty=False,
    )

    def validate_group(self, group):
        request_user = self.context["request"].user
        if group.user_id != request_user.id:
            raise serializers.ValidationError("Invalid group")
        return group

    def validate_transactions(self, transactions):
        request_user = self.context["request"].user
        invalid_user = [txn.id for txn in transactions if txn.user_id != request_user.id]
        if invalid_user:
            raise serializers.ValidationError("Some transactions do not belong to this user.")

        non_debit = [txn.id for txn in transactions if txn.debit <= 0]
        if non_debit:
            raise serializers.ValidationError("Only debit transactions can be added.")

        return transactions


class SplitItemSerializer(FlexFieldsModelSerializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=Decimal("0.00"),
    )

    class Meta:
        model = SplitItem
        fields = ["id", "transaction", "person", "amount"]
        expandable_fields = {
            "person": (PersonSerializer, {"many": False}),
        }

