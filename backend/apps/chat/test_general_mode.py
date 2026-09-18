"""General mode: the second chat mode, and the limits that keep it affordable.

The regressions worth guarding here are not about the answers -- they are about
the boundary. Grounded mode must stay the default for a client that says
nothing, general mode must not retrieve, and the open endpoint must be
rate limited per visitor.
"""
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase

from .a_serializers import ChatRequestSerializer


class ChatRequestSerializerModeTests(TestCase):
    def test_mode_defaults_to_grounded_when_absent(self):
        """An old client sends no mode. It must not get ungrounded answers."""
        serializer = ChatRequestSerializer(data={"question": "hi"})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["mode"] == "grounded"

    def test_mode_accepts_general(self):
        serializer = ChatRequestSerializer(data={"question": "hi", "mode": "general"})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["mode"] == "general"

    def test_unknown_mode_is_rejected(self):
        serializer = ChatRequestSerializer(data={"question": "hi", "mode": "ungrounded"})
        assert not serializer.is_valid()
        assert "mode" in serializer.errors


class GeneralModeStreamTests(TestCase):
    def setUp(self):
        # Throttle history lives in the cache and would otherwise leak between
        # tests -- and from the grounded tests into the throttling one.
        cache.clear()

    def _events(self, response):
        content = b"".join(response.streaming_content).decode("utf-8")
        return [json.loads(line) for line in content.splitlines() if line.strip()]

    def _post(self, **body):
        return self.client.post(
            "/api/chat/stream/",
            data=json.dumps(body),
            content_type="application/json",
        )

    @patch("chat.b_views.get_general_llm")
    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.answer_general_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_general_mode_skips_retrieval_and_emits_empty_sources(
        self, mock_embeddings, mock_vectorstore, mock_general, mock_title, mock_general_llm
    ):
        mock_general.return_value = iter(["A vector database ", "stores embeddings."])
        mock_title.return_value = "Vector databases"

        events = self._events(self._post(question="What is a vector DB?", mode="general"))

        # The sources event is still emitted, empty: one event contract serves
        # both modes so the client needs no branch.
        assert events[0]["type"] == "sources"
        assert events[0]["sources"] == []

        # Nothing was retrieved. Embedding a query costs quota of its own, so
        # this asserts the work was skipped, not merely that it went unused.
        mock_embeddings.assert_not_called()
        mock_vectorstore.assert_not_called()

        tokens = [e["content"] for e in events if e["type"] == "token"]
        assert tokens == ["A vector database ", "stores embeddings."]
        assert events[-1]["type"] == "done"

    @patch("chat.b_views.get_general_llm")
    @patch("chat.b_views.generate_followup_suggestions")
    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.answer_general_stream")
    def test_general_mode_offers_no_followups(
        self, mock_general, mock_title, mock_suggestions, mock_general_llm
    ):
        mock_general.return_value = iter(["Sure."])
        mock_title.return_value = "A title"

        events = self._events(self._post(question="Hello", mode="general"))

        # suggestions_prompt asks for follow-ups about Vince's background --
        # exactly what this mode declines to answer.
        mock_suggestions.assert_not_called()
        suggestions = [e for e in events if e["type"] == "suggestions"]
        assert len(suggestions) == 1
        assert suggestions[0]["suggestions"] == []

    @patch("chat.b_views.get_general_llm")
    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.answer_general_stream")
    def test_general_mode_is_rate_limited_per_client(
        self, mock_general, mock_title, mock_general_llm
    ):
        mock_title.return_value = "A title"

        # The configured rate is 10/hour. Spend it, then expect a refusal.
        for _ in range(10):
            mock_general.return_value = iter(["ok"])
            response = self._post(question="Hello", mode="general")
            # StreamingHttpResponse must be consumed or the generator never runs.
            b"".join(response.streaming_content)
            assert response.status_code == 200

        mock_general.return_value = iter(["ok"])
        throttled = self._post(question="Hello", mode="general")
        assert throttled.status_code == 429

    @patch("chat.b_views.generate_title")
    @patch("chat.b_views.generate_followup_suggestions")
    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.load_vectorstore")
    @patch("chat.b_views.get_embeddings")
    def test_grounded_mode_is_not_caught_by_the_general_throttle(
        self, mock_embeddings, mock_vectorstore, mock_answer, mock_suggestions, mock_title
    ):
        """The general limit must not become a limit on the app's real purpose."""
        mock_embeddings.return_value = object()
        mock_vectorstore.return_value = object()
        mock_suggestions.return_value = []
        mock_title.return_value = "A title"

        for _ in range(12):
            mock_answer.return_value = ([], iter(["ok"]))
            response = self._post(question="What has he built?")
            b"".join(response.streaming_content)
            assert response.status_code == 200
