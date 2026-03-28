from django.contrib import admin
from django.urls import path, include

from rest_framework.routers import DefaultRouter

from accounts.views import AccountViewSet
from people.views import PersonViewSet
from category.views import CategoryViewSet
from transactions.views import (
    TransactionViewSet,
    TransactionUploadView,
    TransactionUploadListView,
    SplitGroupViewSet,
    SplitGroupTransactionViewSet,
    SplitItemViewSet,
)
from users.views import UserViewSet, LoginView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
]

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"accounts", AccountViewSet, basename="account")
router.register(r"people", PersonViewSet, basename="person")
router.register(r"category", CategoryViewSet, basename="category")
router.register(r"transactions", TransactionViewSet, basename="transaction")
router.register(r"split-groups", SplitGroupViewSet, basename="split-group")
router.register(r"split-group-transactions", SplitGroupTransactionViewSet, basename="split-group-transaction")
router.register(r"split-items", SplitItemViewSet, basename="split-item")

urlpatterns += [
    path("api/users/login/", LoginView.as_view()),
    path("api/transactions/upload/", TransactionUploadView.as_view(), name="transaction-upload"),
    path("api/transactions/upload/list/", TransactionUploadListView.as_view(), name="transaction-upload-list"),
    path("api/", include(router.urls)),
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
