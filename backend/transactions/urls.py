from django.urls import path

from .views import TransactionViewSet, TransactionUploadView, TransactionUploadListView

urlpatterns = [
    path("", TransactionViewSet.as_view()),
    path("upload/", TransactionUploadView.as_view(), name="transaction-upload"),
    path("upload/list/", TransactionUploadListView.as_view(), name="transaction-upload-list"),
]

