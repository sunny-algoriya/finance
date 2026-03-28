from django.db import models
from django.conf import settings


class Person(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="persons")
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name