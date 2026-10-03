"""The limits that keep the public chat endpoint affordable and quiet.

Each test here guards a hole that was open before: a client-chosen throttle
identity, an unbounded question, a single shared quota with no ceiling, and
provider error text streamed straight to the browser.
"""
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase

from .a_serializers import MAX_QUESTION_LENGTH, ChatRequestSerializer
from .b_views import STREAM_ERROR_MESSAGE
from .d_throttles import GeneralChatDailyThrottle


class StreamTestCase(TestCase):
    def setUp(self):
        cache.clear()

    def _post(self, headers=None, **body):
        return self.client.post(
            "/api/chat/stream/",
            data=json.dumps(body),
            content_type="application/json",
            **(headers or {}),
        )

    def _events(self, response):
        content = b"".join(response.streaming_content).decode("utf-8")
        return [json.loads(line) for line in content.splitlines() if line.strip()]


class QuestionLengthTests(TestCase):
    def test_question_at_the_limit_is_accepted(self):
        serializer = ChatRequestSerializer(data={"question": "x" * MAX_QUESTION_LENGTH})
        assert serializer.is_valid(), serializer.errors

    def test_question_over_the_limit_is_rejected(self):
        serializer = ChatRequestSerializer(data={"question": "x" * (MAX_QUESTION_LENGTH + 1)})
        assert not serializer.is_valid()
        assert "question" in serializer.errors


@patch("chat.b_views.get_general_llm")
@patch("chat.b_views.generate_title", return_value="A title")
@patch("chat.b_views.answer_general_stream")
class GeneralModeThrottleIdentityTests(StreamTestCase):
    def test_a_spoofed_forwarded_for_does_not_buy_a_fresh_bucket(self, mock_general, *_):
        """The proxy appends the real address last; that is what gets counted.

        Before NUM_PROXIES was set, DRF keyed the throttle on the whole header,
        so varying its client-written prefix reset the limit every request.
        """
        for i in range(10):
            mock_general.return_value = iter(["ok"])
            response = self._post(
                headers={"HTTP_X_FORWARDED_FOR": f"10.0.0.{i}, 203.0.113.7"},
                question="Hello",
                mode="general",
            )
            b"".join(response.streaming_content)
            assert response.status_code == 200

        throttled = self._post(
            headers={"HTTP_X_FORWARDED_FOR": "10.0.0.99, 203.0.113.7"},
            question="Hello",
            mode="general",
        )
        assert throttled.status_code == 429

    def test_the_daily_ceiling_is_shared_by_every_client(self, mock_general, *_):
        rates = {**GeneralChatDailyThrottle.THROTTLE_RATES, "general_chat_daily": "3/day"}
        with patch.object(GeneralChatDailyThrottle, "THROTTLE_RATES", rates):
            for i in range(3):
                mock_general.return_value = iter(["ok"])
                response = self._post(
                    headers={"HTTP_X_FORWARDED_FOR": f"198.51.100.{i}"},
                    question="Hello",
                    mode="general",
                )
                b"".join(response.streaming_content)
                assert response.status_code == 200

            throttled = self._post(
                headers={"HTTP_X_FORWARDED_FOR": "198.51.100.200"},
                question="Hello",
                mode="general",
            )
            assert throttled.status_code == 429


class StreamErrorTests(StreamTestCase):
    @patch("chat.b_views.generate_title", return_value="")
    @patch("chat.b_views.generate_followup_suggestions", return_value=[])
    @patch("chat.b_views.answer_question_stream")
    @patch("chat.b_views.get_vectorstore")
    def test_provider_errors_are_logged_not_streamed(self, mock_store, mock_stream, *_):
        def failing_tokens():
            yield "Partial"
            raise RuntimeError("401 invalid api key gsk_secret for org-123")

        mock_stream.return_value = ([], failing_tokens())

        with self.assertLogs("chat.b_views", level="ERROR") as logs:
            events = self._events(self._post(question="What has he built?"))

        errors = [e for e in events if e["type"] == "error"]
        assert errors == [{"type": "error", "message": STREAM_ERROR_MESSAGE}]
        assert "gsk_secret" not in json.dumps(events)
        assert "gsk_secret" in "\n".join(logs.output)
