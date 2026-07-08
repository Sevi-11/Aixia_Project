from rest_framework import serializers
from .models import Document

class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ['id', 'file', 'original_filename', 'uploaded_at', 'is_ingested']
        read_only_fields = ['id', 'uploaded_at', 'is_ingested']