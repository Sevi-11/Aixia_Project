import json
from unittest.mock import patch

from django.test import TestCase

from .models import ChatSession


class FakeDoc:
    def __init__(self, content, document_id, filename):
        self.page_content = content
        self.metadata = {"document_id": document_id, "original_filename": filename}


class ChatStreamViewTests(TestCase):
    def _ndjson_events(self, response):
        content = b"".join(response.streaming_content).decode("utf-8")
        return [json.loads(line) for line in content.splitlines() if line.strip()]

    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_streams_sources_then_tokens_then_done(
        self, mock_get_embeddings, mock_load_vectorstore, mock_answer_stream
    ):
        mock_get_embeddings.return_value = object()
        mock_load_vectorstore.return_value = object()
        docs = [FakeDoc("Sean has ML experience.", 1, "cv.pdf")]
        mock_answer_stream.return_value = (docs, iter(["Hello", " world"]))

        response = self.client.post(
            "/api/chat/stream/",
            data=json.dumps({"question": "What is Sean's ML experience?"}),
            content_type="application/json",
        )

        events = self._ndjson_events(response)

        assert events[0]["type"] == "sources"
        assert events[0]["sources"][0]["original_filename"] == "cv.pdf"
        assert [e["content"] for e in events[1:-1]] == ["Hello", " world"]
        assert events[-1]["type"] == "done"
        assert "session_id" in events[-1]
        assert "session_token" in events[-1]

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
