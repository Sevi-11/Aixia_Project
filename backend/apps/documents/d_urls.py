from django.urls import path
from .c_views import DocumentUploadView, DocumentIngestView

urlpatterns = [
    path('upload/', DocumentUploadView.as_view(), name='document-upload'),
    path('<int:document_id>/ingest/', DocumentIngestView.as_view(), name='document-ingest'),
]

