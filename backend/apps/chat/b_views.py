import json
import logging

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
from rag.f_chains import answer_question, answer_question_stream, generate_followup_suggestions

logger = logging.getLogger(__name__)

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
            # 0-based, straight off the PDF loader; the UI adds one before it
            # shows a page number to a reader.
            "page": s.metadata.get("page"),
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
        question = serializer.validated_data.get('question', '')

        if not question:
            return Response({'error': 'question is required'}, status=status.HTTP_400_BAD_REQUEST)

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
        question = serializer.validated_data.get('question', '')
        regenerate = serializer.validated_data.get('regenerate', False)

        session, error_response = _resolve_session(session_id, session_token)
        if error_response:
            return error_response

        if regenerate:
            # [assistant, user], most-recent-first: the turn being redone.
            recent = list(session.messages.order_by('-created_at')[:2])
            if len(recent) < 2 or recent[0].role != 'assistant' or recent[1].role != 'user':
                return Response(
                    {'error': 'Nothing to regenerate for this session.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            stale_assistant, last_user = recent
            question = last_user.content
            stale_assistant.delete()
            # Drop the trailing entry (last_user, now the most recent DB row)
            # so history matches the normal-send shape exactly: the current
            # question lives only in `question`, never duplicated in `history`.
            prior_messages = _prior_messages(session)[:-1]
        else:
            if not question:
                return Response({'error': 'question is required'}, status=status.HTTP_400_BAD_REQUEST)
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

            suggestions = []
            if full_answer:
                try:
                    suggestions = generate_followup_suggestions(question, full_answer, prior_messages)
                except Exception:
                    logger.exception("Follow-up suggestion generation raised unexpectedly")

            yield json.dumps({"type": "suggestions", "suggestions": suggestions}) + "\n"

            yield json.dumps({
                "type": "done",
                "session_id": session.id,
                "session_token": signing.dumps(session.id, salt=SESSION_SALT),
            }) + "\n"

        response = StreamingHttpResponse(event_stream(), content_type="application/x-ndjson")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
