from decimal import Decimal

from rest_flex_fields import FlexFieldsModelSerializer
from rest_framework import serializers

from text_utils import normalize_name
from transactions.models import get_person_balance

from .models import Person


def _money_str(d: Decimal) -> str:
    return format(d.quantize(Decimal("0.01")), "f")


class PersonSerializer(FlexFieldsModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    personal_summary = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = ["id", "user", "name", "personal_summary"]

    def validate_name(self, value: str) -> str:
        return normalize_name(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        n = data.get("name")
        if n:
            data["name"] = normalize_name(n)
        return data

    def get_personal_summary(self, obj):
        b = get_person_balance(obj)
        return {k: _money_str(v) for k, v in b.items()}

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return Person.objects.create(**validated_data)

