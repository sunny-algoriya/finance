from django.contrib.auth.models import AbstractUser
from django.db import models


class BaseUser(AbstractUser):
    class Meta:
        abstract = True


class User(BaseUser):
    email = models.EmailField(unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email