import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import AnonRateThrottle
from django.core import signing
from django.http import StreamingHttpResponse

from .models import ChatSession, ChatMessage
from .a_serializers import ChatRequestSerializer, ChatMessageSerializer

from rag.c_embeddings import get_embeddings
from rag.d_vectorstore import load_vectorstore
from rag.f_chains import answer_question, answer_question_stream

MAX_HISTORY_MESSAGES = 20
SESSION_SALT = 'aixia-chat-session'
SESSION_TOKEN_MAX_AGE = 60 * 60 * 24 * 30


def _resolve_session(session_id, session_token):
    """Returns (session, error_response). error_response is None on success."""
    if not session_id:
        return ChatSession.objects.create(), None

    if not session_token:
        return None, Response({'error': 'Session token required'}, status=status.HTTP_403_FORBIDDEN)
    try:
        signed_session_id = signing.loads(session_token, salt=SESSION_SALT, max_age=SESSION_TOKEN_MAX_AGE)
    except signing.BadSignature:
        return None, Response({'error': 'Invalid session token'}, status=status.HTTP_403_FORBIDDEN)
    if signed_session_id != session_id:
        return None, Response({'error': 'Invalid session token'}, status=status.HTTP_403_FORBIDDEN)
    session = ChatSession.objects.filter(id=session_id).first()
    if not session:
        return None, Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
    return session, None


def _prior_messages(session):
    messages = list(
        session.messages.order_by('-created_at').values('role', 'content')[:MAX_HISTORY_MESSAGES]
    )
    messages.reverse()
    return messages


def _serialize_sources(sources):
    return [
        {
            "content": s.page_content,
            "document_id": s.metadata.get("document_id"),
            "original_filename": s.metadata.get("original_filename"),
        }
        for s in sources
    ]


class ChatView(APIView):
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        return Response(
            {'error': 'Chat history requires authenticated ownership.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session_id = serializer.validated_data.get('session_id')
        session_token = serializer.validated_data.get('session_token')
        question = serializer.validated_data['question']

        session, error_response = _resolve_session(session_id, session_token)
        if error_response:
            return error_response

        prior_messages = _prior_messages(session)

        ChatMessage.objects.create(session=session, role='user', content=question)

        embedder = get_embeddings()
        vectorstore = load_vectorstore(embedder)
        answer, sources = answer_question(vectorstore, question, history=prior_messages)

        ChatMessage.objects.create(session = session, role ='assistant', content = answer)

        return Response({
            "session_id": session.id,
            "session_token": signing.dumps(session.id, salt=SESSION_SALT),
            "answer": answer,
            "sources": _serialize_sources(sources),
        }, status=status.HTTP_200_OK)


class ChatStreamView(APIView):
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session_id = serializer.validated_data.get('session_id')
        session_token = serializer.validated_data.get('session_token')
        question = serializer.validated_data['question']

        session, error_response = _resolve_session(session_id, session_token)
        if error_response:
            return error_response

        prior_messages = _prior_messages(session)

        ChatMessage.objects.create(session=session, role='user', content=question)

        embedder = get_embeddings()
        vectorstore = load_vectorstore(embedder)
        retrieved_docs, token_stream = answer_question_stream(vectorstore, question, history=prior_messages)

        def event_stream():
            yield json.dumps({"type": "sources", "sources": _serialize_sources(retrieved_docs)}) + "\n"

            answer_parts = []
            try:
                for token in token_stream:
                    answer_parts.append(token)
                    yield json.dumps({"type": "token", "content": token}) + "\n"
            except Exception as exc:
                yield json.dumps({"type": "error", "message": str(exc)}) + "\n"
            finally:
                full_answer = "".join(answer_parts)
                if full_answer:
                    ChatMessage.objects.create(session=session, role='assistant', content=full_answer)

            yield json.dumps({
                "type": "done",
                "session_id": session.id,
                "session_token": signing.dumps(session.id, salt=SESSION_SALT),
            }) + "\n"

        response = StreamingHttpResponse(event_stream(), content_type="application/x-ndjson")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
