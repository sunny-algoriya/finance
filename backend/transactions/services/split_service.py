from decimal import Decimal, ROUND_DOWN
from django.db import transaction as db_txn
from django.db.models import Sum
from django.core.exceptions import ValidationError

from transactions.models import Transaction
from transactions.models import SplitGroupTransaction, SplitItem


def attach_transactions_to_group(group, txn_ids):
    txns = Transaction.objects.filter(id__in=txn_ids, debit__gt=0)

    objs = [
        SplitGroupTransaction(group=group, transaction=txn)
        for txn in txns
    ]

    SplitGroupTransaction.objects.bulk_create(objs, ignore_conflicts=True)


def auto_split_group_transactions(group):
    members = list(group.members.all())
    count = len(members)

    if count == 0:
        return

    split_items = []

    group_txns = (
        SplitGroupTransaction.objects
        .select_related("transaction")
        .filter(group=group)
    )

    for gtxn in group_txns:
        txn = gtxn.transaction

        if txn.split_items.exists():
            continue

        base = (txn.debit / count).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
        remainder = txn.debit - (base * count)

        for i, person in enumerate(members):
            amt = base
            if i == 0:
                amt += remainder

            split_items.append(
                SplitItem(
                    transaction=txn,
                    person=person,
                    amount=amt
                )
            )

    SplitItem.objects.bulk_create(split_items)

    # strict validation after bulk
    for gtxn in group_txns:
        validate_transaction_split(gtxn.transaction)


def validate_transaction_split(transaction):
    total = (
        transaction.split_items.aggregate(s=Sum("amount"))["s"] or 0
    )

    if total != transaction.debit:
        raise ValidationError("Split total mismatch")


@db_txn.atomic
def create_group_and_split(group, txn_ids):
    attach_transactions_to_group(group, txn_ids)
    auto_split_group_transactions(group)