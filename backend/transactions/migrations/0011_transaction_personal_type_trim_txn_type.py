# Generated manually: personal_type + migrate legacy loan_* txn_types

from django.db import migrations, models


def forwards_migrate_loan_types(apps, schema_editor):
    Transaction = apps.get_model("transactions", "Transaction")
    mapping = (
        ("loan_given", "expense", "gave"),
        ("loan_taken", "income", "got"),
        ("repayment_in", "income", "settle"),
        ("repayment_out", "expense", "settle"),
    )
    for old_tt, new_tt, pt in mapping:
        Transaction.objects.filter(txn_type=old_tt).update(
            txn_type=new_tt,
            personal_type=pt,
        )


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("transactions", "0010_transaction_remark"),
    ]

    operations = [
        migrations.AddField(
            model_name="transaction",
            name="personal_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("gave", "Gave"),
                    ("got", "Got"),
                    ("settle", "Settle"),
                ],
                max_length=10,
                null=True,
            ),
        ),
        migrations.RunPython(forwards_migrate_loan_types, backwards_noop),
        migrations.AlterField(
            model_name="transaction",
            name="txn_type",
            field=models.CharField(
                choices=[
                    ("income", "Income"),
                    ("expense", "Expense"),
                    ("transfer", "Transfer"),
                ],
                default="expense",
                max_length=20,
            ),
        ),
    ]
