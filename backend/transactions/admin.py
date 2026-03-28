from django.contrib import admin

from .models import (
    Transaction,
    TransactionUpload,
    SplitGroup,
    SplitGroupTransaction,
    SplitItem,
)


@admin.register(TransactionUpload)
class TransactionUploadAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "account",
        "uploaded_at",
        "total_rows",
        "created_count",
        "duplicate_count",
        "error_count",
        "processed",
    )
    readonly_fields = (
        "uploaded_at",
        "total_rows",
        "created_count",
        "duplicate_count",
        "error_count",
        "processed",
        "processing_errors",
    )


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "account",
        "txn_date",
        "description",
    )
    
admin.site.register(SplitGroup)
admin.site.register(SplitGroupTransaction)
admin.site.register(SplitItem)