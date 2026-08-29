import os
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from .models import Document
from .a_serializers import DocumentSerializer
from .b_services import ingest_document

ALLOWED_EXTENSIONS = {'.pdf'}
MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB

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
            return Response({'error': 'File exceeds the 20MB upload limit'}, status=status.HTTP_400_BAD_REQUEST)

        document = Document.objects.create(
            file = uploaded_file,
            original_filename = uploaded_file.name
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
        except Exception as exc:
            return Response(
                {'error': f'Failed to ingest document: {exc}'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        return Response({
            "message":f"Ingested Document {document_id}",
            "chunks_created": chunk_count
        })