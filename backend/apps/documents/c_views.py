import hmac
import logging
import os
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from .models import Document
from .a_serializers import DocumentSerializer
from .b_services import ingest_document
from .f_knowledge import InvalidEntries, clean_entries, run_sync

ALLOWED_EXTENSIONS = {'.pdf'}
# Serverless hosts cap the request body well below what a Django process on a
# VM would accept -- Vercel's limit is 4.5 MB -- and a request over that limit
# is rejected by the platform before Django sees it, producing an opaque error
# instead of this view's clear one. Staying under the platform ceiling means
# the app owns the rejection and can explain it.
MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024  # 4 MB

logger = logging.getLogger(__name__)


def stored_filename(name):
    """Fit a filename to Document.original_filename, keeping its extension.

    Postgres refuses an over-long value outright, so an upload with a long
    name used to fail as a 500 instead of being saved.
    """
    limit = Document._meta.get_field('original_filename').max_length
    if len(name) <= limit:
        return name
    stem, ext = os.path.splitext(name)
    return stem[:limit - len(ext)] + ext

class DocumentUploadView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAdminUser]

    def post(self, request):
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return Response({'error': 'Only PDF files are supported'}, status=status.HTTP_400_BAD_REQUEST)

        if uploaded_file.size > MAX_UPLOAD_SIZE_BYTES:
            return Response({'error': 'File exceeds the 4MB upload limit'}, status=status.HTTP_400_BAD_REQUEST)

        document = Document.objects.create(
            file = uploaded_file,
            original_filename = stored_filename(uploaded_file.name)
        )

        serializer = DocumentSerializer(document)
        return Response(serializer.data, status = status.HTTP_201_CREATED)

class DocumentIngestView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, document_id):
        document = get_object_or_404(Document, id=document_id)

        if document.is_ingested:
            return Response({"message": "Document already ingested"})

        try:
            chunk_count = ingest_document(document)
        except Exception:
            logger.exception('Failed to ingest document %s', document_id)
            return Response(
                {'error': 'Failed to ingest document. The server log has the details.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        return Response({
            "message":f"Ingested Document {document_id}",
            "chunks_created": chunk_count
        })


class KnowledgeSyncView(APIView):
    """Replace the website knowledge in the index with what the portfolio sends.

    Called by the portfolio repo's GitHub Action, not by people, so it uses a
    shared bearer token instead of a Django login. No session authentication
    means no CSRF check either, which is right for a machine caller.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        expected = settings.KNOWLEDGE_SYNC_TOKEN
        if not expected:
            return Response({'error': 'Knowledge sync is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        supplied = request.headers.get('Authorization', '')
        # Constant-time, so response timing reveals nothing about the token.
        if not hmac.compare_digest(supplied.encode(), f'Bearer {expected}'.encode()):
            return Response({'error': 'Invalid sync token.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            entries = clean_entries(request.data)
        except InvalidEntries as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = run_sync(entries)
        except Exception:
            logger.exception('Knowledge sync failed')
            return Response(
                {'error': 'Sync failed. The server log has the details.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(result)
