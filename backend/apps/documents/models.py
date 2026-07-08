from django.db import models

class Document(models.Model):
    file = models.FileField(upload_to='upload/')
    original_filename = models.CharField(max_length=120)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_ingested = models.BooleanField(default=False)

    def __str__(self):
        return self.original_filename