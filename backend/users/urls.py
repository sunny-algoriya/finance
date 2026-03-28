from django.urls import path
from .views import UserListView, RegisterView

urlpatterns = [
    path("", UserListView.as_view()),
    path("register/", RegisterView.as_view()),
]