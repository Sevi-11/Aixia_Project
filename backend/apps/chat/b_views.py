from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import ChatSession, ChatMessage
from .a_serializers import ChatRequestSerializer, ChatMessageSerializer

from rag.c_embeddings import get_embeddings
from rag.d_vectorstore import load_vectorstore
from rag.f_chains import answer_question

class ChatView(APIView):
    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session_id = serializer.validated_data.get('session_id')
        question = serializer.validated_data['question']

        if session_id:
            session = ChatSession.objects.filter(id=session_id).first()
            if not session:
                return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

        else:
            session = ChatSession.objects.create()

        prior_messages = list(
            session.messages.order_by('created_at').values('role', 'content')
        )

        ChatMessage.objects.create(session=session, role='user', content=question)

        embedder = get_embeddings()
        vectorstore = load_vectorstore(embedder)
        answer, sources = answer_question(vectorstore, question, history=prior_messages)

        ChatMessage.objects.create(session = session, role ='assistant', content = answer)

        return Response({
            "session_id": session.id,
            "answer": answer,
            "sources": [
                {
                "content": s.page_content,
                "document_id" : s.metadata.get("document_id"),
                "original_filename": s.metadata.get("original_filename")
                }
                for s in sources
            ]

        }, status=status.HTTP_200_OK)