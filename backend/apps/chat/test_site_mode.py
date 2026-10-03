"""Site mode: the portfolio widget's end of the chat stream."""
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from langchain_core.documents import Document

from .a_serializers import ChatRequestSerializer

CONTEXT = {"page": "home", "section": "about"}
HELP = Document(
    page_content="Download the résumé\n\nSelect the Resume card.",
    metadata={"source_type": "help", "source_id": "help:resume", "title": "Download the résumé",
              "url": "index.html#about", "page": "home", "section": "about",
              "actions": [{"type": "scroll", "target": "about"}, {"type": "highlight", "target": "resume"}]},
)


class SiteContextValidationTests(TestCase):
    def test_site_mode_requires_context(self):
        serializer = ChatRequestSerializer(data={"question": "hi", "mode": "site"})
        assert not serializer.is_valid()
        assert "context" in serializer.errors

    def test_context_is_ids_only(self):
        for bad in [
            {"page": "admin", "section": "about"},
            {"page": "home", "section": "About Me"},
            {"page": "home", "section": "about", "item": "<script>"},
        ]:
            serializer = ChatRequestSerializer(data={"question": "hi", "mode": "site", "context": bad})
            assert not serializer.is_valid(), bad

    def test_valid_site_request(self):
        serializer = ChatRequestSerializer(data={"question": "hi", "mode": "site", "context": dict(CONTEXT, item="aixia")})
        assert serializer.is_valid(), serializer.errors


@patch("chat.b_views.generate_title")
@patch("chat.b_views.generate_site_suggestions", return_value=["What's on the résumé?"])
@patch("chat.b_views.answer_site_stream")
@patch("chat.b_views.get_vectorstore")
class SiteModeStreamTests(TestCase):
    def setUp(self):
        cache.clear()

    def _post(self, **body):
        body = {"question": "How do I download the résumé?", "mode": "site", "context": CONTEXT, **body}
        response = self.client.post("/api/chat/stream/", data=json.dumps(body), content_type="application/json")
        return response

    def _events(self, response):
        content = b"".join(response.streaming_content).decode("utf-8")
        return [json.loads(line) for line in content.splitlines() if line.strip()]

    def test_streams_sources_with_links_then_actions_for_the_cited_how_to(self, _store, mock_site, _suggest, mock_title):
        mock_site.return_value = ([HELP], iter(["Select the Resume card [1]."]), "On About.")

        events = self._events(self._post())
        kinds = [e["type"] for e in events]

        assert kinds[0] == "sources"
        assert events[0]["sources"][0]["url"] == "index.html#about"
        assert events[0]["sources"][0]["source_type"] == "help"
        actions = next(e for e in events if e["type"] == "actions")
        assert actions["actions"][0]["label"] == "Download the résumé"
        assert kinds.index("actions") > kinds.index("token")
        assert kinds[-1] == "done"
        mock_title.assert_not_called()

    def test_no_actions_event_when_no_how_to_is_cited(self, _store, mock_site, *_):
        mock_site.return_value = ([HELP], iter(["Vince studied at UE."]), "On About.")
        kinds = [e["type"] for e in self._events(self._post())]
        assert "actions" not in kinds

    def test_passes_the_validated_context_through(self, store, mock_site, *_):
        mock_site.return_value = ([], iter(["ok"]), "On About.")
        b"".join(self._post(context=dict(CONTEXT, item="aixia")).streaming_content)
        assert mock_site.call_args.args[3] == {"page": "home", "section": "about", "item": "aixia"}

    def test_is_rate_limited_per_visitor(self, _store, mock_site, *_):
        for _ in range(20):
            mock_site.return_value = ([], iter(["ok"]), "On About.")
            response = self._post()
            b"".join(response.streaming_content)
            assert response.status_code == 200
        assert self._post().status_code == 429
