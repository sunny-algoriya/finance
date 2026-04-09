from django.db.models.functions import Lower
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated

from base_viewsets import BaseModelViewSet

from .models import Category
from .serializers import CategorySerializer


class CategoryViewSet(BaseModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["name"]
    search_fields = ["name"]

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user).order_by(Lower("name"), "name")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
