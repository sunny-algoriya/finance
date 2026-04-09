from decimal import Decimal
import os, hashlib
import logging
from datetime import datetime
import uuid
from django.db import models
from django.db import transaction as db_transaction
from decimal import ROUND_DOWN
from django.conf import settings
from django.core.exceptions import ValidationError
from dateutil import parser
from accounts.models import Account
from people.models import Person
from category.models import Category
from django.db.models import Sum

logger = logging.getLogger(__name__)


def _to_decimal(value):
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def validate_excel_file(file):
    ext = os.path.splitext(file.name)[1]
    if ext.lower() != ".xlsx":
        raise ValidationError("Only .xlsx allowed")

def generate_hash(txn_date, description, credit, debit, ref):
    raw = f"{txn_date}|{description}|{credit}|{debit}|{ref}"
    return hashlib.md5(raw.encode()).hexdigest()

class Transaction(models.Model):
    class TransactionType(models.TextChoices):
        INCOME = "income"
        EXPENSE = "expense"
        TRANSFER = "transfer"
        LOAN_GIVEN = "loan_given"
        LOAN_TAKEN = "loan_taken"
        REPAYMENT_IN = "repayment_in"
        REPAYMENT_OUT = "repayment_out"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transactions"
    )

    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="transactions"
    )

    person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    txn_type = models.CharField(
        max_length=20,
        choices=TransactionType.choices,
        default=TransactionType.EXPENSE
    )

    txn_date = models.DateField()
    description = models.TextField()
    remark = models.TextField(blank=True, null=True)

    ref_no_or_cheque_no = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )
    hidden = models.BooleanField(default=False)

    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    running_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    hash = models.CharField(max_length=32, unique=True)

    class Meta:
        ordering = ["txn_date", "id"]

    def clean(self):
        # basic validity
        if self.credit > 0 and self.debit > 0:
            raise ValidationError("Invalid txn: both credit and debit set")

        if self.credit == 0 and self.debit == 0:
            raise ValidationError("Empty txn")

        # direction enforcement
        if self.txn_type in [
            self.TransactionType.INCOME,
            self.TransactionType.LOAN_TAKEN,
            self.TransactionType.REPAYMENT_IN,
        ] and self.credit == 0:
            raise ValidationError("Credit required")

        if self.txn_type in [
            self.TransactionType.EXPENSE,
            self.TransactionType.LOAN_GIVEN,
            self.TransactionType.REPAYMENT_OUT,
        ] and self.debit == 0:
            raise ValidationError("Debit required")

        # person enforcement for debt
        if self.txn_type in [
            self.TransactionType.LOAN_GIVEN,
            self.TransactionType.LOAN_TAKEN,
            self.TransactionType.REPAYMENT_IN,
            self.TransactionType.REPAYMENT_OUT,
        ] and not self.person:
            raise ValidationError("Person required for debt transactions")

    def save(self, *args, **kwargs):
        # hash
        self.hash = generate_hash(
            self.txn_date,
            self.description,
            self.credit,
            self.debit,
            self.ref_no_or_cheque_no,
        )

        # running balance
        last_txn = (
            Transaction.objects.filter(account=self.account)
            .exclude(pk=self.pk)
            .order_by("-txn_date", "-id")
            .first()
        )

        prev_balance = last_txn.running_balance if last_txn else Decimal("0")
        # amount must be Decimal (upload/API may pass float before field coercion)
        self.running_balance = prev_balance + _to_decimal(self.amount)

        super().save(*args, **kwargs)

    @property
    def amount(self):
        c = _to_decimal(self.credit)
        d = _to_decimal(self.debit)
        return c if c > 0 else -d

    @property
    def is_debt(self):
        return self.txn_type in [
            self.TransactionType.LOAN_GIVEN,
            self.TransactionType.LOAN_TAKEN,
            self.TransactionType.REPAYMENT_IN,
            self.TransactionType.REPAYMENT_OUT,
        ]


# -------------------------
# Aggregation (person level)
# -------------------------
def get_person_balance(person):
    qs = Transaction.objects.filter(person=person)

    given = qs.filter(
        txn_type=Transaction.TransactionType.LOAN_GIVEN
    ).aggregate(s=Sum("debit"))["s"] or Decimal("0")

    taken = qs.filter(
        txn_type=Transaction.TransactionType.LOAN_TAKEN
    ).aggregate(s=Sum("credit"))["s"] or Decimal("0")

    repaid_in = qs.filter(
        txn_type=Transaction.TransactionType.REPAYMENT_IN
    ).aggregate(s=Sum("credit"))["s"] or Decimal("0")

    repaid_out = qs.filter(
        txn_type=Transaction.TransactionType.REPAYMENT_OUT
    ).aggregate(s=Sum("debit"))["s"] or Decimal("0")

    they_owe = given - repaid_in
    you_owe = taken - repaid_out

    return {
        "they_owe_you": they_owe,
        "you_owe_them": you_owe,
        "net": they_owe - you_owe,
    }
    
class TransactionUpload(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="uploads")

    file = models.FileField(upload_to="transaction_uploads/", validators=[validate_excel_file])
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="uploads")

    uploaded_at = models.DateTimeField(auto_now_add=True)

    total_rows = models.IntegerField(default=0)
    created_count = models.IntegerField(default=0)
    duplicate_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    processed = models.BooleanField(default=False)
    processing_errors = models.TextField(blank=True, default="")

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)

        if is_new and not self.processed:
            upload_pk = self.pk

            def run_process():
                try:
                    TransactionUpload.objects.get(pk=upload_pk).process_file()
                except TransactionUpload.DoesNotExist:
                    pass

            db_transaction.on_commit(run_process)

    def process_file(self):
        import openpyxl

        def safe_decimal(value):
            try:
                if value in (None, "", " "):
                    return Decimal("0")
                return _to_decimal(value)
            except Exception:
                return Decimal("0")

        def parse_date(raw_date):
            if isinstance(raw_date, datetime):
                return raw_date.date()

            if isinstance(raw_date, str):
                raw_date = raw_date.strip()
                for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                    try:
                        return datetime.strptime(raw_date, fmt).date()
                    except Exception:
                        pass
                return parser.parse(raw_date).date()

            raise ValueError("Invalid date")

        def cell(row_data, *header_names):
            """First non-empty match for any of the given header names (exact sheet header)."""
            for name in header_names:
                if name not in row_data:
                    continue
                val = row_data[name]
                if val is None:
                    continue
                s = str(val).strip()
                if s != "":
                    return val
            return None

        def ref_from_row(row_data):
            raw = cell(
                row_data,
                "Ref No./Cheque No.",
                "Ref No./Cheque No",
                "Ref No",
                "Ref",
                "Reference",
                "Cheque No",
                "Cheque No.",
            )
            return str(raw).strip() if raw is not None else ""

        wb = openpyxl.load_workbook(self.file)
        sheet = wb.active
        headers = [str(c.value).strip() if c.value is not None else "" for c in sheet[1]]

        total = created = duplicate = error = 0
        error_lines = []

        for row in sheet.iter_rows(min_row=2, values_only=True):
            total += 1
            row_data = dict(zip(headers, row))

            try:
                txn_raw = cell(row_data, "Txn Date", "Txn date", "Date", "Transaction Date")
                if txn_raw is None:
                    raise ValueError("Missing date column (expected e.g. 'Txn Date')")

                txn_date = parse_date(txn_raw)
                desc_raw = cell(row_data, "Description", "description")
                description = " ".join(str(desc_raw or "").split()).lower()
                credit = safe_decimal(cell(row_data, "Credit", "credit"))
                debit = safe_decimal(cell(row_data, "Debit", "debit"))
                ref = ref_from_row(row_data)

                txn_hash = generate_hash(txn_date, description, credit, debit, ref)

                # Savepoint per row so IntegrityError / DB errors do not abort the whole batch.
                with db_transaction.atomic():
                    if Transaction.objects.filter(hash=txn_hash).exists():
                        duplicate += 1
                    else:
                        Transaction.objects.create(
                            user=self.user,
                            account=self.account,
                            txn_date=txn_date,
                            description=description,
                            ref_no_or_cheque_no=ref or None,
                            credit=credit,
                            debit=debit,
                            hash=txn_hash,
                        )
                        created += 1

            except Exception as e:
                error += 1
                line = f"Row {total} (sheet row {total + 1}): {type(e).__name__}: {e}"
                if len(error_lines) < 100:
                    error_lines.append(line)
                logger.warning(
                    "TransactionUpload id=%s failed row %s: %s",
                    self.pk,
                    total,
                    e,
                    exc_info=error <= 5,
                )

        errors_text = "\n".join(error_lines)
        if len(errors_text) > 20000:
            errors_text = errors_text[:20000] + "\n... (truncated)"

        TransactionUpload.objects.filter(id=self.id).update(
            total_rows=total,
            created_count=created,
            duplicate_count=duplicate,
            error_count=error,
            processed=True,
            processing_errors=errors_text,
        )

class SplitGroup(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    members = models.ManyToManyField("people.Person", related_name="split_groups")
    start_date = models.DateField()
    end_date = models.DateField()

    def __str__(self):
        return self.name


class SplitGroupTransaction(models.Model):
    group = models.ForeignKey(
        SplitGroup,
        on_delete=models.CASCADE,
        related_name="transactions"
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        on_delete=models.CASCADE,
        related_name="split_groups"
    )

    class Meta:
        unique_together = ("group", "transaction")
        indexes = [
            models.Index(fields=["group"]),
            models.Index(fields=["transaction"]),
        ]

    def clean(self):
        if self.transaction.debit <= 0:
            raise ValidationError("Only debit transactions can be split")

    def save(self, *args, **kwargs):
        with db_transaction.atomic():
            self.full_clean()
            is_new = self.pk is None
            super().save(*args, **kwargs)

            # When a group transaction is first created, create SplitItem rows
            # for every member in the group. Amount defaults to an equal split
            # of the transaction debit (with remainder added to first member).
            if is_new:
                members = list(self.group.members.all())
                count = len(members)
                if count == 0:
                    return

                # Only debit transactions are valid for splitting (enforced by clean()).
                base = (self.transaction.debit / count).quantize(
                    Decimal("0.01"),
                    rounding=ROUND_DOWN,
                )
                remainder = self.transaction.debit - (base * count)

                for i, member in enumerate(members):
                    amt = base + (remainder if i == 0 else Decimal("0"))
                    SplitItem.objects.get_or_create(
                        transaction=self.transaction,
                        person=member,
                        defaults={"amount": amt},
                    )


class SplitItem(models.Model):
    transaction = models.ForeignKey(
        "transactions.Transaction",
        on_delete=models.CASCADE,
        related_name="split_items"
    )

    person = models.ForeignKey(
        "people.Person",
        on_delete=models.CASCADE
    )

    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ("transaction", "person")
        indexes = [
            models.Index(fields=["transaction"]),
            models.Index(fields=["person"]),
        ]

    def clean(self):
        total = (
            SplitItem.objects
            .filter(transaction=self.transaction)
            .exclude(pk=self.pk)
            .aggregate(s=Sum("amount"))["s"] or 0
        )

        if total + self.amount > self.transaction.debit:
            raise ValidationError("Split exceeds transaction amount")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)