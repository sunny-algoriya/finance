from rest_framework import serializers

from text_utils import normalize_name

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "user", "name", "created_at"]
        read_only_fields = ["id", "user", "created_at"]

    def validate_name(self, value: str) -> str:
        return normalize_name(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        n = data.get("name")
        if n:
            data["name"] = normalize_name(n)
        return data
