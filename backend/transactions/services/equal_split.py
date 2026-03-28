from decimal import Decimal
from transactions.models import SplitItem, SplitGroupTransaction

def auto_split_group_transactions(group):
    members = list(group.members.all())
    count = len(members)

    if count == 0:
        return

    split_items = []

    group_txns = SplitGroupTransaction.objects.select_related("transaction").filter(group=group)

    for gtxn in group_txns:
        txn = gtxn.transaction

        # skip if already split
        if txn.split_items.exists():
            continue

        share = (txn.debit / count).quantize(Decimal("0.01"))

        for person in members:
            split_items.append(
                SplitItem(
                    transaction=txn,
                    person=person,
                    amount=share
                )
            )

    SplitItem.objects.bulk_create(split_items)