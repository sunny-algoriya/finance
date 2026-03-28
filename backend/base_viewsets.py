from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet


class BaseModelViewSet(ModelViewSet):
    """
    Abstract base ViewSet: share common defaults across all CRUD endpoints.
    """

    permission_classes = [IsAuthenticated]

