import json
from unittest.mock import patch

from django.core import signing
from django.test import TestCase

from .b_views import SESSION_SALT
from .models import ChatSession, ChatMessage


class FakeDoc:
    def __init__(self, content, document_id, filename):
        self.page_content = content
        self.metadata = {"document_id": document_id, "original_filename": filename}


class ChatStreamViewTests(TestCase):
    def _ndjson_events(self, response):
        content = b"".join(response.streaming_content).decode("utf-8")
        return [json.loads(line) for line in content.splitlines() if line.strip()]

    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.generate_followup_suggestions")
    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_streams_sources_then_tokens_then_suggestions_then_done(
        self, mock_get_embeddings, mock_load_vectorstore, mock_answer_stream, mock_suggestions, mock_title
    ):
        mock_get_embeddings.return_value = object()
        mock_load_vectorstore.return_value = object()
        docs = [FakeDoc("Sean has ML experience.", 1, "cv.pdf")]
        mock_answer_stream.return_value = (docs, iter(["Hello", " world"]))
        mock_suggestions.return_value = ["What else has Sean built?"]
        mock_title.return_value = "Machine learning experience"

        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({"question": "What is Sean's ML experience?"}),
            content_type="application/json",
        )

        events = self._ndjson_events(response)

        assert events[0]["type"] == "sources"
        assert events[0]["sources"][0]["original_filename"] == "cv.pdf"

        token_events = [e for e in events if e["type"] == "token"]
        assert [e["content"] for e in token_events] == ["Hello", " world"]

        suggestion_events = [e for e in events if e["type"] == "suggestions"]
        assert len(suggestion_events) == 1
        assert suggestion_events[0]["suggestions"] == ["What else has Sean built?"]

        assert events[-1]["type"] == "done"
        assert "session_id" in events[-1]
        assert "session_token" in events[-1]
        # suggestions must land after every token and before "done"
        assert events.index(suggestion_events[0]) > events.index(token_events[-1])
        assert events.index(suggestion_events[0]) < len(events) - 1

        session = ChatSession.objects.get(id=events[-1]["session_id"])
        messages = list(session.messages.order_by("created_at"))
        assert [m.role for m in messages] == ["user", "assistant"]
        assert messages[-1].content == "Hello world"

    def test_rejects_an_invalid_session_token_before_streaming(self):
        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({
                "session_id": 999,
                "session_token": "not-a-real-token",
                "question": "Anything",
            }),
            content_type="application/json",
        )

        assert response.status_code == 403
        assert not hasattr(response, "streaming_content")

    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.generate_followup_suggestions")
    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_regenerate_replaces_last_answer_without_duplicating_the_question(
        self, mock_get_embeddings, mock_load_vectorstore, mock_answer_stream, mock_suggestions, mock_title
    ):
        mock_get_embeddings.return_value = object()
        mock_load_vectorstore.return_value = object()
        mock_answer_stream.return_value = ([], iter(["New", " answer"]))
        mock_suggestions.return_value = []
        mock_title.return_value = ""

        session = ChatSession.objects.create()
        ChatMessage.objects.create(session=session, role="user", content="What is Sean's degree?")
        ChatMessage.objects.create(session=session, role="assistant", content="He has a CS degree.")

        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({
                "session_id": session.id,
                "session_token": signing.dumps(session.id, salt=SESSION_SALT),
                "regenerate": True,
            }),
            content_type="application/json",
        )

        events = self._ndjson_events(response)
        assert events[-1]["type"] == "done"

        messages = list(session.messages.order_by("created_at"))
        assert [m.role for m in messages] == ["user", "assistant"]
        assert messages[0].content == "What is Sean's degree?"
        assert messages[-1].content == "New answer"

        # The stale answer must not have been fed back into the LLM's history.
        _, call_kwargs = mock_answer_stream.call_args
        assert call_kwargs["history"] == []
        assert mock_answer_stream.call_args.args[1] == "What is Sean's degree?"

    def test_regenerate_400s_when_last_turn_has_no_answer_yet(self):
        session = ChatSession.objects.create()
        ChatMessage.objects.create(session=session, role="user", content="Pending question")

        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({
                "session_id": session.id,
                "session_token": signing.dumps(session.id, salt=SESSION_SALT),
                "regenerate": True,
            }),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_regenerate_400s_on_a_session_with_no_messages(self):
        session = ChatSession.objects.create()

        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({
                "session_id": session.id,
                "session_token": signing.dumps(session.id, salt=SESSION_SALT),
                "regenerate": True,
            }),
            content_type="application/json",
        )

        assert response.status_code == 400


class ChatStreamTitleTests(TestCase):
    def _ndjson_events(self, response):
        content = b"".join(response.streaming_content).decode("utf-8")
        return [json.loads(line) for line in content.splitlines() if line.strip()]

    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.generate_followup_suggestions")
    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_emits_a_title_on_the_opening_turn_only(
        self, mock_embeddings, mock_store, mock_stream, mock_suggestions, mock_title
    ):
        mock_embeddings.return_value = object()
        mock_store.return_value = object()
        mock_suggestions.return_value = []
        mock_title.return_value = "Machine learning experience"

        mock_stream.return_value = ([], iter(["Sean has ML experience."]))
        first = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({"question": "What is Sean's ML experience?"}),
            content_type="application/json",
        )
        events = self._ndjson_events(first)
        titles = [e for e in events if e["type"] == "title"]
        assert len(titles) == 1
        assert titles[0]["title"] == "Machine learning experience"
        # The title must not delay the answer: it lands after the last token.
        assert events.index(titles[0]) > max(
            i for i, e in enumerate(events) if e["type"] == "token"
        )
        assert events[-1]["type"] == "done"

        session_id = events[-1]["session_id"]
        token = signing.dumps(session_id, salt=SESSION_SALT)

        # Second turn on the same session: the conversation already has a name.
        mock_stream.return_value = ([], iter(["He also builds embedded systems."]))
        second = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({
                "session_id": session_id,
                "session_token": token,
                "question": "What about embedded systems?",
            }),
            content_type="application/json",
        )
        assert not [e for e in self._ndjson_events(second) if e["type"] == "title"]
        assert mock_title.call_count == 1

    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.generate_followup_suggestions")
    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_omits_the_title_event_when_generation_yields_nothing(
        self, mock_embeddings, mock_store, mock_stream, mock_suggestions, mock_title
    ):
        mock_embeddings.return_value = object()
        mock_store.return_value = object()
        mock_suggestions.return_value = []
        mock_title.return_value = ""      # model failed, or returned junk
        mock_stream.return_value = ([], iter(["An answer."]))

        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({"question": "Anything at all?"}),
            content_type="application/json",
        )
        events = self._ndjson_events(response)
        assert not [e for e in events if e["type"] == "title"]
        assert events[-1]["type"] == "done"
