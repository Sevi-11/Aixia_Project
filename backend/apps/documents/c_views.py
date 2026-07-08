from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework import status
from .models import Document
from .a_serializers import DocumentSerializer
from .b_services import ingest_document

class DocumentUploadView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        document = Document.objects.create(
            file = uploaded_file,
            original_filename = uploaded_file.name
        )

        serializer = DocumentSerializer(document)
        return Response(serializer.data, status = status.HTTP_201_CREATED)

class DocumentIngestView(APIView):
    def post(self, request, document_id):
        document = get_object_or_404(Document, id=document_id)

        if document.is_ingested:
            return Response({"message", "Document already ingested"})

        chunk_count = ingest_document(document)
        return Response({
            "message":f"Ingested Document {document_id}",
            "chunks_created": chunk_count
        })