from rest_flex_fields import FlexFieldsModelSerializer
from rest_framework import serializers

from .models import Account


class AccountSerializer(FlexFieldsModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Account
        fields = ["id", "user", "name", "account_type"]

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return Account.objects.create(**validated_data)

