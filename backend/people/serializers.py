from rest_flex_fields import FlexFieldsModelSerializer
from rest_framework import serializers

from .models import Person


class PersonSerializer(FlexFieldsModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Person
        fields = ["id", "user", "name"]

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return Person.objects.create(**validated_data)

