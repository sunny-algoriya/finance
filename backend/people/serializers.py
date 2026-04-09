from rest_flex_fields import FlexFieldsModelSerializer
from rest_framework import serializers

from text_utils import normalize_name

from .models import Person


class PersonSerializer(FlexFieldsModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Person
        fields = ["id", "user", "name"]

    def validate_name(self, value: str) -> str:
        return normalize_name(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        n = data.get("name")
        if n:
            data["name"] = normalize_name(n)
        return data

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return Person.objects.create(**validated_data)

