"""Website knowledge sync: validation, the diff, and the endpoint's guard."""
import json
from unittest.mock import patch

import pytest
from django.test import SimpleTestCase, override_settings

from .f_knowledge import InvalidEntries, clean_entries, plan_sync


def _entry(**overrides):
    entry = {
        "id": "site:projects:aixia",
        "type": "site",
        "page": "home",
        "section": "projects",
        "item": "aixia",
        "url": "index.html#projects",
        "title": "AIxia",
        "text": "A full-stack RAG assistant.",
    }
    entry.update(overrides)
    return entry


class CleanEntriesTests(SimpleTestCase):
    def test_valid_entries_get_a_stable_hash(self):
        first = clean_entries({"entries": [_entry()]})[0]
        second = clean_entries({"entries": [_entry()]})[0]
        assert first["hash"] == second["hash"]
        assert clean_entries({"entries": [_entry(text="Changed.")]})[0]["hash"] != first["hash"]

    def test_rejects_links_off_the_site(self):
        for url in ["https://evil.example", "javascript:alert(1)", "/etc/passwd", "index.html#a b"]:
            with pytest.raises(InvalidEntries):
                clean_entries({"entries": [_entry(url=url)]})

    def test_rejects_bad_ids_types_and_duplicates(self):
        for bad in [_entry(id="Has Spaces"), _entry(type="script"), _entry(page="admin"), _entry(section="../x")]:
            with pytest.raises(InvalidEntries):
                clean_entries({"entries": [bad]})
        with pytest.raises(InvalidEntries):
            clean_entries({"entries": [_entry(), _entry()]})

    def test_only_help_entries_may_carry_allowlisted_actions(self):
        action = [{"type": "scroll", "target": "about"}]
        help_entry = _entry(id="help:resume", type="help", section="about", item=None, actions=action)
        assert clean_entries({"entries": [help_entry]})[0]["actions"] == action
        with pytest.raises(InvalidEntries):
            clean_entries({"entries": [_entry(actions=action)]})
        with pytest.raises(InvalidEntries):
            clean_entries({"entries": [dict(help_entry, actions=[{"type": "eval", "target": "x"}])]})


class PlanSyncTests(SimpleTestCase):
    def test_only_new_and_changed_entries_are_embedded(self):
        same, changed, new = (clean_entries({"entries": [e]})[0] for e in [
            _entry(id="site:a"), _entry(id="site:b", text="New text."), _entry(id="site:c"),
        ])
        existing = {"site:a": same["hash"], "site:b": "old-hash", "site:gone": "x"}

        plan = plan_sync(existing, [same, changed, new])

        assert [e["id"] for e in plan["add"]] == ["site:b", "site:c"]
        assert plan["changed"] == ["site:b"]
        assert plan["gone"] == ["site:gone"]
        assert plan["unchanged"] == 1

    def test_a_repeat_sync_does_nothing(self):
        entries = clean_entries({"entries": [_entry()]})
        plan = plan_sync({entries[0]["id"]: entries[0]["hash"]}, entries)
        assert plan["add"] == [] and plan["gone"] == [] and plan["unchanged"] == 1


class SyncEndpointTests(SimpleTestCase):
    url = "/api/knowledge/sync/"

    def _post(self, token=None, body=None):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
        return self.client.post(self.url, data=json.dumps(body or {"entries": [_entry()]}),
                                content_type="application/json", **headers)

    @override_settings(KNOWLEDGE_SYNC_TOKEN="")
    def test_disabled_without_a_configured_token(self):
        assert self._post(token="anything").status_code == 503

    @override_settings(KNOWLEDGE_SYNC_TOKEN="right")
    def test_rejects_a_missing_or_wrong_token(self):
        assert self._post().status_code == 401
        assert self._post(token="wrong").status_code == 401

    @override_settings(KNOWLEDGE_SYNC_TOKEN="right")
    def test_rejects_invalid_entries_before_touching_the_index(self):
        with patch("documents.c_views.run_sync") as run_sync:
            response = self._post(token="right", body={"entries": [_entry(url="https://evil.example")]})
        assert response.status_code == 400
        run_sync.assert_not_called()

    @override_settings(KNOWLEDGE_SYNC_TOKEN="right")
    def test_runs_the_sync_with_cleaned_entries(self):
        with patch("documents.c_views.run_sync", return_value={"added": 1}) as run_sync:
            response = self._post(token="right")
        assert response.status_code == 200
        assert response.json() == {"added": 1}
        assert run_sync.call_args.args[0][0]["id"] == "site:projects:aixia"
